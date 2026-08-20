const SynEmbedding = require('../models/SynEmbedding');

// The embedding index for the collective LLM (PLAN §6). Mirrors the funnel
// pattern of utils/synNodes.js: every function takes an injectable `store`
// (Mongoose-backed by default) and a `model` (a ChatModel — the ONLY LLM shape
// the app knows). This keeps the genuinely load-bearing logic — the
// private-leak guard, cosine ranking, instanceId scoping — verifiable against
// an in-memory store + fake model with no live MongoDB and no network.
//
// PRIVACY (PLAN §8, rewritten 2026-08-20). The per-node gate is gone: an idea
// is the boundary, and everything in one is corpus for that one idea. So the
// guard that matters here is the ONE that was always doing the real work —
//   • every row is stamped with its idea's instanceId, and retrieve() is
//     instanceId-scoped, so one idea's corpus can never answer another's.
// Who may read an idea at all is decided upstream, before anything reaches
// this file. The old `visibility` re-filter guarded a distinction that no
// longer exists and was removed with it; do not reintroduce it as reassurance.

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async upsert(doc) {
    return SynEmbedding.findOneAndUpdate(
      { instanceId: doc.instanceId, kind: doc.kind, refId: doc.refId },
      { $set: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },
  async remove({ instanceId, kind, refId }) {
    return SynEmbedding.deleteOne({ instanceId, kind, refId });
  },
  async removeByNode({ instanceId, nodeId }) {
    return SynEmbedding.deleteMany({ instanceId, nodeId });
  },
  async list(instanceId) {
    return SynEmbedding.find({ instanceId });
  },
};

// ── Chunk builders — what text represents each citable unit ─────────────────
// A published thought: its topic label (if any), the one-sentence claim, and
// its prose context, as one chunk. Attribution stays by handle.
function nodeChunkText(node, topicLabel = '') {
  const c = node.content || {};
  const parts = [];
  if (topicLabel) parts.push(`Topic: ${topicLabel}`);
  if (c.thought) parts.push(c.thought);
  if (c.context) parts.push(c.context);
  return parts.join('\n').trim();
}

// A public reply: the responder's context prose on the post. The stance
// (position) is a coordinate, not language, so only the text is embedded.
function replyChunkText(entry) {
  return String((entry && entry.text) || '').trim();
}

// ── Vector math ─────────────────────────────────────────────────────────────
function cosine(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Indexing ────────────────────────────────────────────────────────────────

// Index (or refresh) a thought. Returns null (a no-op) for anything that does
// not belong in the corpus: a topic hub, an empty chunk, or a BORROWED node —
// a borrow mirrors someone else's thought, and its text is already indexed at
// its source, so indexing it too would let one sentence answer twice. Once a
// borrow is promoted (origin flips to 'own') it carries the owner's own words
// and joins the corpus like anything else.
//
// The per-node visibility gate is gone (2026-08-20): an idea is the boundary,
// and every row here is scoped to one. Who may read an idea is decided before
// anything reaches this file.
async function indexNode({ store = mongoStore, model, node, topicLabel = '' }) {
  if (!model || !model.embedConfigured) return null;
  if (!node || node.kind !== 'thought' || node.origin === 'borrowed') return null;
  const text = nodeChunkText(node, topicLabel);
  if (!text) return null;
  const [vector] = await model.embed([text]);
  return store.upsert({
    instanceId: node.instanceId,
    kind: 'node',
    refId: node.id,
    nodeId: node.id,
    ownerHandle: node.ownerHandle,
    text,
    vector,
    dim: vector ? vector.length : 0,
    model: model.info && model.info.embed ? model.info.embed.modelId : '',
  });
}

// Index (or refresh) a public reply Entry on a post.
async function indexReply({ store = mongoStore, model, entry, post }) {
  if (!model || !model.embedConfigured) return null;
  if (!entry || !post) return null;
  const text = replyChunkText(entry);
  if (!text) {
    // A reply with no prose (pure stance) carries no retrievable language —
    // drop any prior row so it can't linger.
    await store.remove({ instanceId: post.instanceId, kind: 'reply', refId: entry.id });
    return null;
  }
  const [vector] = await model.embed([text]);
  return store.upsert({
    instanceId: post.instanceId,
    kind: 'reply',
    refId: entry.id,
    nodeId: post.id,
    ownerHandle: entry.username,
    text,
    vector,
    dim: vector ? vector.length : 0,
    model: model.info && model.info.embed ? model.info.embed.modelId : '',
  });
}

// Refresh a node's corpus presence to match its current state: index it if it
// is an own thought, otherwise remove any row (covers a hub, and a node that
// is still a borrow). Idempotent.
async function refreshNode({ store = mongoStore, model, node, topicLabel = '' }) {
  if (!node) return;
  if (node.kind === 'thought' && node.origin !== 'borrowed') {
    await indexNode({ store, model, node, topicLabel });
  } else {
    await store.remove({ instanceId: node.instanceId, kind: 'node', refId: node.id });
  }
}

async function removeNode({ store = mongoStore, instanceId, nodeId }) {
  await store.remove({ instanceId, kind: 'node', refId: nodeId });
}

// ── Retrieval ───────────────────────────────────────────────────────────────
// Top-k cosine over one idea's corpus, instanceId-scoped. That scoping is the
// whole guard — see the header. Returns hits enriched for citation assembly.
async function retrieve({ store = mongoStore, model, instanceId, queryText, k = 6 }) {
  if (!model || !model.embedConfigured) throw new Error('LLM not configured');
  if (!instanceId) throw new Error('instanceId is required');
  const q = String(queryText || '').trim();
  if (!q) return [];

  const rows = (await store.list(instanceId)).filter(
    r => r.instanceId === instanceId && Array.isArray(r.vector) && r.vector.length,
  );
  if (rows.length === 0) return [];

  const [qvec] = await model.embed([q]);
  const scored = rows.map(r => ({
    score: cosine(qvec, r.vector),
    kind: r.kind,
    nodeId: r.nodeId,
    refId: r.refId,
    ownerHandle: r.ownerHandle,
    text: r.text,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k));
}

module.exports = {
  mongoStore,
  nodeChunkText,
  replyChunkText,
  cosine,
  indexNode,
  indexReply,
  refreshNode,
  removeNode,
  retrieve,
};
