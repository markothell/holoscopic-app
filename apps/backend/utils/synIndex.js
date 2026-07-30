const SynEmbedding = require('../models/SynEmbedding');

// The embedding index for the collective LLM (PLAN §6). Mirrors the funnel
// pattern of utils/synNodes.js: every function takes an injectable `store`
// (Mongoose-backed by default) and a `model` (a ChatModel — the ONLY LLM shape
// the app knows). This keeps the genuinely load-bearing logic — the
// private-leak guard, cosine ranking, instanceId scoping — verifiable against
// an in-memory store + fake model with no live MongoDB and no network.
//
// PRIVACY (PLAN §8), enforced HERE and only here:
//   • indexNode refuses anything that is not a PUBLISHED thought. Topic hubs
//     (private scaffold) and private/borrowed drafts are never embedded.
//   • indexReply only runs for replies on a published post.
//   • retrieve() re-filters to instanceId AND visibility:'published' — so even
//     a stale row (published → unpublished with a missed removal) can't leak.
// Private content is therefore never indexed and never retrievable.

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

// Index (or refresh) a published thought. Returns null (a no-op) for anything
// that must never enter the corpus: a private/unpublished node, a topic hub,
// or an empty chunk. This is the primary private-leak guard.
async function indexNode({ store = mongoStore, model, node, topicLabel = '' }) {
  if (!model || !model.embedConfigured) return null;
  if (!node || node.kind !== 'thought' || node.visibility !== 'published') return null;
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
    visibility: 'published',
  });
}

// Index (or refresh) a public reply Entry on a published post.
async function indexReply({ store = mongoStore, model, entry, post }) {
  if (!model || !model.embedConfigured) return null;
  if (!entry || !post || post.visibility !== 'published') return null;
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
    visibility: 'published',
  });
}

// Refresh a node's corpus presence to match its current state: index it if it
// is a published thought, otherwise remove any row (covers unpublish and edits
// that hide it). Idempotent.
async function refreshNode({ store = mongoStore, model, node, topicLabel = '' }) {
  if (!node) return;
  if (node.kind === 'thought' && node.visibility === 'published') {
    await indexNode({ store, model, node, topicLabel });
  } else {
    await store.remove({ instanceId: node.instanceId, kind: 'node', refId: node.id });
  }
}

async function removeNode({ store = mongoStore, instanceId, nodeId }) {
  await store.remove({ instanceId, kind: 'node', refId: nodeId });
}

// ── Retrieval ───────────────────────────────────────────────────────────────
// Top-k cosine over the community's published corpus, instanceId-scoped. Never
// returns private content: the store only holds published rows, and we filter
// on visibility again defensively. Returns hits enriched for citation assembly.
async function retrieve({ store = mongoStore, model, instanceId, queryText, k = 6 }) {
  if (!model || !model.embedConfigured) throw new Error('LLM not configured');
  if (!instanceId) throw new Error('instanceId is required');
  const q = String(queryText || '').trim();
  if (!q) return [];

  const rows = (await store.list(instanceId)).filter(
    r => r.instanceId === instanceId && r.visibility === 'published' && Array.isArray(r.vector) && r.vector.length,
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
