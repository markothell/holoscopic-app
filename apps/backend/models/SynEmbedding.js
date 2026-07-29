const mongoose = require('mongoose');

// SynEmbedding — the vector index for the collective "Ask the Group" LLM
// (PLAN §6). One document per indexed chunk of the community's PUBLISHED
// corpus: a published thought node, or a public reply Entry. Scoped to the
// community Instance like every other multi-tenant document.
//
// PRIVACY CONTRACT (PLAN §8): only PUBLISHED, group-visible content is ever
// written here. Private/unpublished nodes — including still-borrowed drafts —
// are never embedded, so they can never be retrieved. `visibility` is
// denormalized onto the row so retrieval can defensively re-filter even if a
// removal hook were ever missed. Enforced server-side in utils/synIndex.js.
//
// v1 storage is in-Mongo cosine over a small corpus (≤50 people → thousands of
// chunks). The vector lives inline as an array of numbers; retrieval loads the
// instance's rows and ranks in JS. Graduating to a dedicated vector store is a
// swap behind utils/synIndex.js, not a data-model change here.
const synthesisEmbeddingSchema = new mongoose.Schema({
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

  // What this chunk cites back to.
  kind:  { type: String, enum: ['node', 'reply'], required: true },
  // The citation target's id: the SynNode.id for a node, the Entry.id for a
  // reply. Unique per (instanceId, kind, refId) — one row per chunk, upserted.
  refId: { type: String, required: true },

  // The post this chunk hangs off, for deep-linking:
  //   node  → the node itself (nodeId === refId)
  //   reply → the published thought the reply was left on
  nodeId:      { type: String, required: true },
  ownerHandle: { type: String, required: true }, // attribution, always by handle

  // The embedded text (topic+thought+context for a node; stance+context for a
  // reply). Kept for prompt assembly and debugging.
  text: { type: String, default: '' },

  vector: { type: [Number], default: [] },
  dim:    { type: Number, default: 0 },
  model:  { type: String, default: '' }, // embedding model id that produced the vector

  // Denormalized guard — always 'published' for rows that exist here.
  visibility: { type: String, default: 'published' },
}, {
  timestamps: true,
  id: false,
});

// The per-community index scan (retrieval loads all rows for the instance) is
// served by `index: true` on the instanceId field above and by the compound
// index's instanceId prefix below — no separate single-field index needed.
// The upsert / removal key — one row per chunk.
synthesisEmbeddingSchema.index({ instanceId: 1, kind: 1, refId: 1 }, { unique: true });
// Reindex/removal of everything hanging off a post.
synthesisEmbeddingSchema.index({ instanceId: 1, nodeId: 1 });

module.exports = mongoose.model('SynEmbedding', synthesisEmbeddingSchema);
