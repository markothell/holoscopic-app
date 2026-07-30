const mongoose = require('mongoose');

// SynNode — the one content model for Synthesis, a networked group blog. Each
// member privately grows a DAG of nodes on their own map; publishing a node
// makes it a community-visible "post." There is no separate reply record in
// M0; replies (M1) are Entries duck-typing a published node as their activity.
//
// TWO NODE KINDS (settled UI correction, 2026-07-24):
//   • topic  — a HUB. A short word-ish label that many thoughts attach to.
//              Thoughts hang off it as DAG children. A topic has no axes and
//              is not itself the reply target.
//   • thought — carries its CONTEXT as a pair: a one-sentence claim plus prose
//              context (revealed by clicking the thought — an interView-style
//              popup, not a third shape). A thought owns 1–2 axes (SynFrame
//              ids) that define the coordinate space a reader positions their
//              response in. **A published thought IS the post** — the unit that
//              enters the feed, is read-only to others, is replied to, is
//              mirrored by a borrowed node, and is pointed at by sourceNodeId.
//
// So "many thoughts attached to a topic" is literal DAG structure: a thought
// node's parent is a topic node (edgeKind 'child'). `topicId` denormalizes the
// nearest topic-hub ancestor so "thoughts under hub X" is one indexed query.
//
// TOPOLOGY is a DAG, not a tree: `marry` mints a join node with two
// parents. Cross-map provenance (the network) is NOT parentIds — it is the
// sourceNodeId link a borrowed node holds back to the published thought it
// mirrors. Both DAG edges and cross-map links are enforced only in
// utils/synNodes.js (the single write funnel), never client-side.
//
// Scoped to the community Instance like every other multi-tenant document.
const contentSchema = {
  // Hub label — meaningful when kind === 'topic'.
  topic:   { type: String, trim: true, maxlength: 120, default: '' },
  // One-sentence claim — meaningful when kind === 'thought'.
  thought: { type: String, trim: true, maxlength: 280, default: '' },
  // Prose context with internal/external link markup — the click-to-reveal
  // pair for a thought. Meaningful when kind === 'thought'.
  context: { type: String, default: '' },
};

const synthesisNodeSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // community

  // Pseudonymous author of THIS node. Handle is denormalized so every read,
  // feed row, and citation attributes without a User lookup. No anonymization.
  ownerId:     { type: String, required: true },
  ownerHandle: { type: String, required: true },

  kind: { type: String, enum: ['topic', 'thought'], required: true, index: true },

  content: contentSchema,

  // 1 (ranked line) or 2 (2x2 grid) SynFrame ids — the response grid a
  // reader positions their stance in. Meaningful only on thought nodes.
  axisFrameIds: { type: [String], default: [] },

  // Nearest topic-hub ancestor (a SynNode.id of kind 'topic'), denormalized
  // at write time so "thoughts attached to hub X" is one indexed scan. null on
  // topic nodes (they ARE the hub) and on root thoughts with no hub above them.
  topicId: { type: String, default: null },

  // ---- Same-map DAG topology (intra-map; parents share this node's owner) ----
  // 0 parents = root, 1 = child, 2 = marriage (a join node).
  parentIds: { type: [String], default: [] },

  // The idea's own title hub, seeded onto every collaborator's map when they
  // draft or join (utils/synIdeas.js -> synNodes.js#seedHomeHub). Exactly one
  // per (instanceId, ownerId): it is the centre the whole map hangs off, and
  // the client draws it with the offset ring reserved for notable nodes. An
  // idea is defined by its thought space, and this node is where that space
  // starts.
  isHome: { type: Boolean, default: false },
  edgeKind: {
    type: String,
    enum: ['root', 'child', 'marriage'],
    default: 'root',
  },

  // ---- Origin / cross-map provenance (the network; M1+) ----
  origin: { type: String, enum: ['own', 'borrowed'], default: 'own' },
  sourceNodeId:      { type: String, default: null }, // the published thought this responds to
  sourceEntryId:     { type: String, default: null }, // the reply Entry this node was born from
  sourceOwnerHandle: { type: String, default: null }, // denormalized "from elsewhere"

  // ---- Visibility (private-first; the one privacy contract) ----
  visibility:  { type: String, enum: ['private', 'published'], default: 'private', index: true },
  publishedAt: { type: Date, default: null },
  promotedAt:  { type: Date, default: null }, // when origin went borrowed -> own (M2)
}, {
  timestamps: true,
  id: false,
});

// My map (owner scan) and the feed / LLM corpus (published scan).
synthesisNodeSchema.index({ instanceId: 1, ownerId: 1 });
synthesisNodeSchema.index({ instanceId: 1, visibility: 1 });
// utils/synNodes.js:97 and utils/synUnion.js:153 — the published feed, and the
// corpus read on every synthesis generation. Sorted by publishedAt, which the
// index above does not cover.
synthesisNodeSchema.index({ instanceId: 1, visibility: 1, publishedAt: -1 });
// Thoughts attached to a topic hub — the "topic is a hub" relationship.
synthesisNodeSchema.index({ instanceId: 1, topicId: 1 });
// DAG edge walks (cycle guard, children-of) — multikey over parent ids.
synthesisNodeSchema.index({ parentIds: 1 });
// The cross-map network graph — who borrowed from a given post.
synthesisNodeSchema.index({ sourceNodeId: 1 });

module.exports = mongoose.model('SynNode', synthesisNodeSchema);
