const crypto = require('crypto');
const UnisonNode = require('../models/UnisonNode');
const UnisonFrame = require('../models/UnisonFrame');
const entriesUtil = require('./entries');

// The single write funnel for Unison content, mirroring utils/entries.js and
// utils/oasGames.js: REST routes and sockets (M1+) are thin wrappers over these
// functions — nothing else writes UnisonNode / UnisonFrame.
//
// M0 scope (private map only): create root, create child, marry (synthesis
// node with two parents), reparent, publish/unpublish, and frame dedupe. The
// CYCLE GUARD and the same-owner parentIds invariant are enforced here and
// only here. Networking (publish feed, respond/borrow) is M1; promote is M2
// (wired into editContent, see promoteIfBorrowed below); the LLM is M3+.
//
// ── Node model (settled 2026-07-24) ────────────────────────────────────────
// Two node KINDS. `topic` is a hub (a label many thoughts attach to as DAG
// children); `thought` carries a one-sentence claim + prose context as a pair
// and owns 1–2 axes. A PUBLISHED THOUGHT is the post: the reply/borrow target.
// axisFrameIds live on thoughts; topic hubs have none. `topicId` denormalizes a
// thought's nearest topic-hub ancestor so "thoughts under hub X" is one query.
//
// ── Store injection (why this funnel takes `{ store }`) ─────────────────────
// Every funnel fn accepts an optional `store` (defaults to the Mongoose-backed
// `mongoStore`). The store is the ONLY data-access surface — getById, insert,
// save, findFrames, createFrame. This keeps the genuinely risky logic (the
// ancestor-walk cycle guard, the same-owner invariant) verifiable against an
// in-memory store with no live MongoDB. Production always uses mongoStore.

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

// ── Live broadcast (M1) — mirrors utils/oasGames.js's setIO/emitToGame. The
// funnel, not the routes, owns broadcasts: a write and its notification stay
// in one place. Per-community room `unison:<instanceId>` (see sockets/unison.js).
let io = null;
function setIO(ioInstance) { io = ioInstance; }
function emitToCommunity(instanceId, event, payload) {
  if (io && instanceId) io.to(`unison:${instanceId}`).emit(event, payload);
}

// ── LLM embedding-index refresh hooks (M3) ──────────────────────────────────
// The funnel notifies the index when the PUBLISHED corpus changes — on publish,
// on a content edit / promote of a published node, and on a public reply. The
// hook module is injected (setIndex, from websocket-server.js) so the funnel
// stays decoupled and its unit tests run with no LLM wired. Calls are
// fire-and-forget and fully swallowed: a slow or unconfigured embeddings API
// must NEVER block or fail a write. When no index is registered (tests), this
// is a no-op.
let indexHooks = null;
function setIndex(hooks) { indexHooks = hooks; }
function fireIndex(method, ...args) {
  if (!indexHooks || typeof indexHooks[method] !== 'function') return;
  Promise.resolve()
    .then(() => indexHooks[method](...args))
    .catch(err => console.error('[unison-index]', method, err && err.message));
}

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async getNode(id) {
    return UnisonNode.findOne({ id });
  },
  async insertNode(fields) {
    return UnisonNode.create(fields);
  },
  async saveNode(node) {
    return node.save();
  },
  async findFrames(instanceId) {
    return UnisonFrame.find({ instanceId });
  },
  async getFrame(id, instanceId) {
    return UnisonFrame.findOne({ id, instanceId });
  },
  async createFrame(fields) {
    return UnisonFrame.create(fields);
  },
  // ── M1 (networking) reads ──────────────────────────────────────────────
  // The responder's own topic hubs — the candidate set for structure-mirroring
  // reuse (D8). Match happens in code (label, trimmed + case-insensitive).
  async findOwnerTopicHubs(instanceId, ownerId) {
    return UnisonNode.find({ instanceId, ownerId, kind: 'topic' });
  },
  // The responder's existing borrowed node for a given source — so a
  // re-response upserts (never duplicates) it. (instanceId, ownerId,
  // sourceNodeId) is effectively unique: one borrow per member per post.
  async findBorrowedNode({ instanceId, ownerId, sourceNodeId }) {
    return UnisonNode.findOne({ instanceId, ownerId, sourceNodeId });
  },
  // The community feed / LLM corpus: published thoughts (the posts), recency
  // first. Never returns private/unpublished nodes.
  async findPublishedThoughts(instanceId) {
    return UnisonNode
      .find({ instanceId, kind: 'thought', visibility: 'published' })
      .sort({ publishedAt: -1 });
  },
};

// ── Serializer ──────────────────────────────────────────────────────────────
// Wire shape for the client. Never redacted — the community is pseudonymous
// and every node is attributed to its owner's handle (D3). Private nodes are
// gated by the caller (owner-only read paths), not by this serializer.
function toClient(node) {
  return {
    id: node.id,
    instanceId: node.instanceId,
    ownerId: node.ownerId,
    ownerHandle: node.ownerHandle,
    kind: node.kind,
    content: {
      topic: (node.content && node.content.topic) || '',
      thought: (node.content && node.content.thought) || '',
      context: (node.content && node.content.context) || '',
    },
    axisFrameIds: [...(node.axisFrameIds || [])],
    topicId: node.topicId || null,
    parentIds: [...(node.parentIds || [])],
    edgeKind: node.edgeKind,
    origin: node.origin,
    sourceNodeId: node.sourceNodeId || null,
    sourceEntryId: node.sourceEntryId || null,
    sourceOwnerHandle: node.sourceOwnerHandle || null,
    visibility: node.visibility,
    publishedAt: node.publishedAt || null,
    promotedAt: node.promotedAt || null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

// ── Pure graph guards (unit-testable, no DB) ────────────────────────────────

// Reject an edge that would close a loop. Walks the ancestors of the proposed
// parents (upward via parentIds); if `childId` is reachable, adding
// childId → parent closes a cycle. Also rejects self-parenting. `getNode` is an
// async (id) => node|null so the same walk serves the DB and in-memory stores.
// Visited-set guards against revisiting shared ancestors in a diamond DAG.
async function assertAcyclic({ childId, parentIds, getNode }) {
  const parents = [...new Set(parentIds || [])];
  if (parents.includes(childId)) {
    throw new Error('A node cannot be its own parent');
  }
  const visited = new Set();
  const stack = [...parents];
  while (stack.length) {
    const id = stack.pop();
    if (id === childId) {
      throw new Error('That edge would create a cycle in the map');
    }
    if (visited.has(id)) continue;
    visited.add(id);
    const node = await getNode(id);
    if (node && Array.isArray(node.parentIds)) {
      for (const p of node.parentIds) stack.push(p);
    }
  }
}

// parentIds must reference only nodes the SAME owner owns — the DAG is
// intra-map. Cross-map relationships are the sourceNodeId link, never parentIds.
function assertSameOwner(ownerId, parents) {
  for (const p of parents) {
    if (!p) throw new Error('Parent not found');
    if (p.ownerId !== ownerId) {
      throw new Error('parentIds must reference nodes owned by the same author');
    }
  }
}

// A thought's home hub = nearest topic-kind ancestor. A topic node is its own
// hub context (topicId stays null). A thought inherits its parent's topicId, or
// takes the parent itself when the parent is the topic hub.
function deriveTopicId(kind, parentDocs) {
  if (kind === 'topic') return null;
  for (const p of parentDocs) {
    if (!p) continue;
    if (p.kind === 'topic') return p.id;
    if (p.topicId) return p.topicId;
  }
  return null;
}

// ── Node creation ───────────────────────────────────────────────────────────

function normContent(kind, content = {}) {
  if (kind === 'topic') {
    return { topic: String(content.topic || '').trim(), thought: '', context: '' };
  }
  return {
    topic: '',
    thought: String(content.thought || '').trim(),
    context: String(content.context || ''),
  };
}

function validateKind(kind) {
  if (kind !== 'topic' && kind !== 'thought') {
    throw new Error("kind must be 'topic' or 'thought'");
  }
}

// axisFrameIds only make sense on thoughts; 0–2 of them.
function normAxisFrameIds(kind, axisFrameIds) {
  if (kind !== 'thought') return [];
  const ids = [...new Set(axisFrameIds || [])];
  if (ids.length > 2) throw new Error('A thought carries at most two axes');
  return ids;
}

async function loadParents(store, parentIds) {
  const docs = [];
  for (const id of parentIds) {
    const node = await store.getNode(id);
    if (!node) throw new Error('Parent not found');
    docs.push(node);
  }
  return docs;
}

// Shared build+persist for root / child / marriage. `edgeKind` and the parent
// checks are the only things that differ between them.
async function createNode({
  store = mongoStore,
  instanceId, ownerId, ownerHandle,
  kind, content, axisFrameIds = [],
  parentIds = [], edgeKind,
  origin = 'own', sourceNodeId = null, sourceEntryId = null, sourceOwnerHandle = null,
}) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!ownerId || !ownerHandle) throw new Error('owner is required');
  validateKind(kind);

  const parents = [...new Set(parentIds)];
  const parentDocs = await loadParents(store, parents);
  assertSameOwner(ownerId, parentDocs);

  const id = newId();
  // New node has no descendants yet, so a create can't itself close a loop —
  // but we run the guard uniformly (it also covers a malicious/self parent id).
  await assertAcyclic({ childId: id, parentIds: parents, getNode: store.getNode });

  const fields = {
    id,
    instanceId,
    ownerId,
    ownerHandle,
    kind,
    content: normContent(kind, content),
    axisFrameIds: normAxisFrameIds(kind, axisFrameIds),
    topicId: deriveTopicId(kind, parentDocs),
    parentIds: parents,
    edgeKind,
    origin,
    sourceNodeId,
    sourceEntryId,
    sourceOwnerHandle,
    visibility: 'private',
    publishedAt: null,
    promotedAt: null,
  };
  return store.insertNode(fields);
}

// A root: a top-level facet of the member's map (no parents).
async function createRoot({ store, instanceId, ownerId, ownerHandle, kind, content, axisFrameIds }) {
  return createNode({
    store, instanceId, ownerId, ownerHandle, kind, content, axisFrameIds,
    parentIds: [], edgeKind: 'root',
  });
}

// A child: hangs off exactly one parent (a thought under a topic hub, a
// sub-thought under a thought, etc.). Unlimited depth and fan-out.
async function createChild({ store = mongoStore, instanceId, ownerId, ownerHandle, kind, content, axisFrameIds, parentId }) {
  if (!parentId) throw new Error('createChild needs a parentId');
  return createNode({
    store, instanceId, ownerId, ownerHandle, kind, content, axisFrameIds,
    parentIds: [parentId], edgeKind: 'child',
  });
}

// A marriage: the one structural break from a tree. Mints a NEW synthesis node
// with two parents — two lines of thought converging into a combined idea.
// Defaults to a thought (a marriage yields a new claim); caller may override.
async function marry({ store = mongoStore, instanceId, ownerId, ownerHandle, kind = 'thought', content, axisFrameIds, parentIds }) {
  if (!Array.isArray(parentIds) || parentIds.length !== 2) {
    throw new Error('marry needs exactly two parents');
  }
  if (parentIds[0] === parentIds[1]) {
    throw new Error('A marriage needs two distinct parents');
  }
  return createNode({
    store, instanceId, ownerId, ownerHandle, kind, content, axisFrameIds,
    parentIds, edgeKind: 'marriage',
  });
}

// Re-file a node under new parent(s) — where a cycle can actually form, so the
// guard earns its keep here. Keeps edgeKind consistent with the new arity.
async function reparent({ store = mongoStore, nodeId, newParentIds }) {
  const node = await store.getNode(nodeId);
  if (!node) throw new Error('Node not found');
  const parents = [...new Set(newParentIds || [])];
  if (parents.length > 2) throw new Error('A node has at most two parents');

  const parentDocs = await loadParents(store, parents);
  assertSameOwner(node.ownerId, parentDocs);
  await assertAcyclic({ childId: node.id, parentIds: parents, getNode: store.getNode });

  node.parentIds = parents;
  node.edgeKind = parents.length === 0 ? 'root' : parents.length === 1 ? 'child' : 'marriage';
  node.topicId = deriveTopicId(node.kind, parentDocs);
  return store.saveNode(node);
}

// ── Edit content / set axes (M0: authoring an existing node) ────────────────
// Ownership is the caller's concern (routes/unison.js checks node.ownerId
// against the verified request identity before ever reaching here) — these
// two just apply the same normalization createNode used at build time.

// Partial content update: only the fields present in `content` change. A
// topic keeps its `topic` label; a thought keeps `thought`/`context`
// independently editable.
async function editContent({ store = mongoStore, nodeId, content = {} }) {
  const node = await store.getNode(nodeId);
  if (!node) throw new Error('Node not found');
  const merged = {
    topic: content.topic !== undefined ? content.topic : node.content.topic,
    thought: content.thought !== undefined ? content.thought : node.content.thought,
    context: content.context !== undefined ? content.context : node.content.context,
  };
  node.content = normContent(node.kind, merged);
  promoteIfBorrowed(node);
  const saved = await store.saveNode(node);
  // A content edit / promote of a PUBLISHED thought must refresh its embedding
  // (refreshNode no-ops for private nodes, so private edits stay uncorpused).
  fireIndex('onNodeChanged', saved);
  return saved;
}

// ── Promote (M2) — the single "make it mine" gesture ────────────────────────
// D2/plan §3: adding your OWN thought/context to a borrowed node promotes it —
// there is no separate "adopt" step. Wired into editContent (the one content-
// edit funnel) rather than as a standalone route: an owner editing a borrowed
// node's content IS the promotion gesture. Flips origin in place and stamps
// promotedAt; provenance (sourceNodeId/sourceEntryId/sourceOwnerHandle) is
// RETAINED, never cleared — the node still remembers where it came from.
// Idempotent: a node that's already 'own' just edits, promotedAt doesn't move.
// Ownership is the caller's concern (routes/unison.js's loadOwnedNode 404s a
// non-owner before this ever runs — see PATCH /nodes/:id), so there is no
// owner check here; only the owner can ever reach an editContent() call for
// their own node in the first place.
function promoteIfBorrowed(node) {
  if (node.origin === 'borrowed') {
    node.origin = 'own';
    node.promotedAt = new Date();
  }
}

// axisFrameIds only make sense on a thought (a topic hub has none) — this is
// a full replace (0-2 ids), matching how a picker re-submits the whole set.
async function setAxes({ store = mongoStore, nodeId, axisFrameIds }) {
  const node = await store.getNode(nodeId);
  if (!node) throw new Error('Node not found');
  if (node.kind !== 'thought') throw new Error('Only thoughts carry axes');
  node.axisFrameIds = normAxisFrameIds(node.kind, axisFrameIds);
  return store.saveNode(node);
}

// ── Publish / unpublish (the visibility gate; content, not identity) ─────────
async function publish({ store = mongoStore, nodeId }) {
  const node = await store.getNode(nodeId);
  if (!node) throw new Error('Node not found');
  if (node.visibility !== 'published') {
    node.visibility = 'published';
    node.publishedAt = new Date();
    await store.saveNode(node);
    // The post entered the feed — the reader-side of the loop wakes here.
    emitToCommunity(node.instanceId, 'node_published', { node: toClient(node) });
    // A published thought joins the LLM corpus (M3).
    fireIndex('onNodeChanged', node);
  }
  return node;
}

async function unpublish({ store = mongoStore, nodeId }) {
  const node = await store.getNode(nodeId);
  if (!node) throw new Error('Node not found');
  if (node.visibility !== 'private') {
    node.visibility = 'private';
    node.publishedAt = null;
    await store.saveNode(node);
    // Left the feed — drop it from the LLM corpus (M3).
    fireIndex('onNodeChanged', node);
  }
  return node;
}

// ── Frames — the community's reusable axis vocabulary, deduped per community.
const POLE_MAX = 40;

function normPole(raw) {
  return String(raw || '').trim().slice(0, POLE_MAX);
}

function samePoles(a, b, c, d) {
  return a.toLowerCase() === c.toLowerCase() && b.toLowerCase() === d.toLowerCase();
}

// Orientation-free identity within a community: sorted lowercase poles.
function frameKey(poleA, poleB) {
  return JSON.stringify([poleA, poleB].map(p => p.toLowerCase().trim()).sort());
}

// Resolve one frame spec — {frameId} borrows an existing lens, {poleA, poleB}
// coins one. Coining dedupes against the community's frames in either
// orientation, so "concrete—abstract" can't sneak in beside "abstract—concrete".
async function resolveFrame({ store = mongoStore, instanceId, parentInstanceId = null, spec, userId, username }) {
  if (spec && spec.frameId) {
    const frame = await store.getFrame(spec.frameId, instanceId);
    if (!frame) throw new Error('Spectrum not found');
    return frame;
  }
  const poleA = normPole(spec && spec.poleA);
  const poleB = normPole(spec && spec.poleB);
  if (!poleA || !poleB) throw new Error('A spectrum needs both poles');
  if (poleA.toLowerCase() === poleB.toLowerCase()) {
    throw new Error('The poles must differ');
  }
  const existing = (await store.findFrames(instanceId)).find(f =>
    samePoles(f.poleA, f.poleB, poleA, poleB) || samePoles(f.poleA, f.poleB, poleB, poleA));
  if (existing) return existing;
  return store.createFrame({
    id: newId(),
    instanceId,
    parentInstanceId,
    poleA,
    poleB,
    key: frameKey(poleA, poleB),
    createdBy: userId,
    createdByName: username,
  });
}

// ── M1: the networking loop — publish → borrow → (promote is M2) ────────────
// Responding to a published thought is the heart of Unison. It is a TWO-RECORD
// write (D2), kept in one call so the two halves can't drift apart:
//   1. a PUBLIC reply Entry on the post (via utils/entries.js — the only entry
//      writer), and
//   2. a BORROWED UnisonNode on the RESPONDER'S OWN map, structure-mirrored
//      under the source's topic (D8).
// The post's own nodes are never touched — an author's blog is read-only to
// others (§3). Failure modes guarded here, named:
//   • responding to a PRIVATE/unpublished thought (private-first, §8) → reject.
//   • responding to a topic hub (only thoughts are posts) → reject.
//   • a stance outside [0,1] (the coordinate contract) → reject.
//   • cross-community leak (source in another instance) → treated as not found.
//   • DUPLICATE borrows on a re-response → upsert the one borrowed node, don't
//     mint a second; and never clobber a node the owner has since PROMOTED.
//   • self-borrow (author replying to own post, D9) → write the reply, skip the
//     borrow (you don't borrow your own idea).

// A stance is a point in the source thought's [0,1]² coordinate space.
function normPosition(position) {
  const ok = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  if (!position || typeof position !== 'object' || !ok(position.x) || !ok(position.y)) {
    throw new Error('A response needs a stance in [0,1]');
  }
  return { x: position.x, y: position.y };
}

// Duck-typed activity: the published thought IS the activity (OaS pattern, no
// Activity doc). maxEntries !== 0 keeps self-upvotes blocked; votesPerUser null
// = unlimited free upvotes (D9, no economy).
function replyActivityFor(source) {
  return { id: source.id, topicId: null, maxEntries: 1, votesPerUser: null };
}

// Structure-mirroring (D8): a borrowed thought is filed under the source's
// TOPIC. Reuse the responder's own hub whose label matches the source topic
// (trimmed, case-insensitive); else create that hub. Returns the hub id, or
// null when the source thought has no topic (borrow lands as a root).
async function resolveMirrorHub({ store, source, responderId, responderHandle, instanceId }) {
  if (!source.topicId) return null;
  const sourceHub = await store.getNode(source.topicId);
  const label = sourceHub && sourceHub.content ? String(sourceHub.content.topic || '').trim() : '';
  if (!label) return null;

  const hubs = await store.findOwnerTopicHubs(instanceId, responderId);
  const match = (hubs || []).find(h =>
    String((h.content && h.content.topic) || '').trim().toLowerCase() === label.toLowerCase());
  if (match) return match.id;

  const created = await createRoot({
    store, instanceId, ownerId: responderId, ownerHandle: responderHandle,
    kind: 'topic', content: { topic: label },
  });
  return created.id;
}

// The borrowed-node half of respond(). Creates the mirror on first response;
// upserts it on a re-response (no duplicate). Mirrors the source thought's
// claim + context + axes (frames are community-scoped, so the ids carry over).
async function borrowNode({ store, source, reply, responderId, responderHandle, instanceId }) {
  const mirrored = {
    thought: (source.content && source.content.thought) || '',
    context: (source.content && source.content.context) || '',
  };

  const existing = await store.findBorrowedNode({ instanceId, ownerId: responderId, sourceNodeId: source.id });
  if (existing) {
    existing.sourceEntryId = reply.id;
    existing.sourceOwnerHandle = source.ownerHandle;
    // Refresh the mirror only while still borrowed — a PROMOTED node (M2) is
    // the owner's own and must not be overwritten by a re-response.
    if (existing.origin === 'borrowed') {
      existing.content = normContent('thought', mirrored);
    }
    return store.saveNode(existing);
  }

  const hubId = await resolveMirrorHub({ store, source, responderId, responderHandle, instanceId });
  // createNode runs the same-owner + cycle guards on the parent hub for free
  // (the hub is the responder's own, so both hold).
  return createNode({
    store, instanceId, ownerId: responderId, ownerHandle: responderHandle,
    kind: 'thought', content: mirrored, axisFrameIds: source.axisFrameIds || [],
    parentIds: hubId ? [hubId] : [], edgeKind: hubId ? 'child' : 'root',
    origin: 'borrowed',
    sourceNodeId: source.id,
    sourceEntryId: reply.id,
    sourceOwnerHandle: source.ownerHandle,
  });
}

// Respond to a published thought — the two-record write (D2). Returns both
// records; `borrowed` is null for a self-response.
async function respond({
  store = mongoStore, entries = entriesUtil,
  instanceId, responderId, responderHandle,
  sourceNodeId, position, text,
}) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!responderId || !responderHandle) throw new Error('owner is required');
  if (!sourceNodeId) throw new Error('sourceNodeId is required');
  const stance = normPosition(position);

  const source = await store.getNode(sourceNodeId);
  if (!source || source.instanceId !== instanceId) throw new Error('Node not found');
  if (source.visibility !== 'published') throw new Error('You can only respond to a published thought');
  if (source.kind !== 'thought') throw new Error('Only a published thought can be responded to');

  // 1) The public reply Entry — one re-editable reply per member per post via
  // the (activityId,userId,slot,questionId) upsert key.
  const reply = await entries.upsertEntry({
    activity: replyActivityFor(source), instanceId,
    userId: responderId, username: responderHandle,
    slotNumber: 1, questionId: 'context',
    position: stance, text: text || '',
  });

  // 2) The borrowed node — skipped for a self-response.
  let borrowed = null;
  if (responderId !== source.ownerId) {
    borrowed = await borrowNode({ store, source, reply, responderId, responderHandle, instanceId });
  }

  emitToCommunity(instanceId, 'reply_upserted', { postId: source.id, reply: entries.toClient(reply) });
  // A public reply joins the LLM corpus (M3).
  fireIndex('onReply', reply, source);
  return { reply, borrowed };
}

// Toggle a free upvote on a reply (D9). Reuses the Entry.voterIds/voteCount
// mechanic through utils/entries.js — no economy. Inherited rule (noted, not
// fought): re-positioning a reply resets others' upvotes on it.
async function upvoteReply({ store = mongoStore, entries = entriesUtil, instanceId, sourceNodeId, entryId, userId }) {
  const source = await store.getNode(sourceNodeId);
  if (!source || source.instanceId !== instanceId) throw new Error('Node not found');
  if (source.visibility !== 'published') throw new Error('You can only respond to a published thought');
  const entry = await entries.voteEntry({ activity: replyActivityFor(source), entryId, userId });
  emitToCommunity(instanceId, 'reply_upserted', { postId: source.id, reply: entries.toClient(entry) });
  return entry;
}

// The community feed (D10): published thoughts across the community, recency
// first, enriched with each author's topic-hub label so the frontend's
// switchable lenses (recency / topic / author) have their fields. Never leaks
// private nodes — the query is visibility:'published' only.
async function feed({ store = mongoStore, instanceId }) {
  const posts = await store.findPublishedThoughts(instanceId);
  const hubCache = new Map();
  const items = [];
  for (const p of posts) {
    let topicLabel = '';
    if (p.topicId) {
      if (!hubCache.has(p.topicId)) {
        const hub = await store.getNode(p.topicId);
        hubCache.set(p.topicId, hub && hub.content ? (hub.content.topic || '') : '');
      }
      topicLabel = hubCache.get(p.topicId);
    }
    items.push({ ...toClient(p), topicLabel });
  }
  return items;
}

module.exports = {
  // funnel
  createRoot,
  createChild,
  marry,
  reparent,
  editContent,
  setAxes,
  publish,
  unpublish,
  resolveFrame,
  // M1 networking loop
  respond,
  upvoteReply,
  feed,
  setIO,
  setIndex,
  // serializer
  toClient,
  // pure guards / helpers (exported for tests and reuse)
  assertAcyclic,
  assertSameOwner,
  deriveTopicId,
  promoteIfBorrowed,
  frameKey,
  newId,
  // default store (production); tests inject their own
  mongoStore,
};
