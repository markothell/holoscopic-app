const mongoose = require('mongoose');

// Share — the PRIMITIVE voice/text contribution (PLATFORM.md P8, PRIMITIVES.md
// §4.3): one member's response on one seed, owned by the primitive rather than
// by any activity. First writer is the 'gather' module (the builder's
// single-round activities); the next activity that shares this shape writes
// the same collection. Per-activity models (ThresholdShare, Memory, SynNode)
// stay put — migration is opportunistic or never.
//
// All writes go through utils/gather.js (or a future primitive funnel). The
// visibility rules (open wall vs sealed-then-revealed), the audio host
// allowlist, and the post-close editing rules live there, never here.
//
// `slot` is the per-activity discriminator inside the unique key, because a
// unique key IS the cardinality rule (PRIMITIVES.md §4.3): gather's "one
// response per member" is slot '', and an activity wanting one-per-pole would
// use the pole as the slot.

// Mirrors ThresholdShare.audio / Memory.body.audio so @hs/audio serves all of
// them with one wire shape.
const audioSchema = new mongoose.Schema({
  url:         { type: String, required: true },
  // The blob key, stored rather than derived — scripts/restore-blobs.js
  // re-uploads at the SAME pathname and rewrites the url.
  pathname:    { type: String, default: '' },
  contentType: { type: String, default: '' },
  // The CLIENT times the recording (iOS MP4 carries no duration metadata).
  durationMs:  { type: Number, default: 0 },
  peaks:       { type: [Number], default: () => [] },
  sizeBytes:   { type: Number, default: 0 },
}, { _id: false, id: false });

const shareSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true },
  // Denormalized ancestry, so a seed's shares are one flat indexed query.
  circleId:   { type: String, required: true, index: true },
  seedId:     { type: String, required: true, index: true },

  userId:   { type: String, required: true },
  username: { type: String, required: true, trim: true, maxlength: 40 },

  // Part of the unique key; the writing activity decides what it means.
  slot: { type: String, default: '' },

  title: { type: String, default: '', trim: true, maxlength: 80 },
  text:  { type: String, default: '', trim: true, maxlength: 5000 },

  audio: { type: audioSchema, default: null },
  transcript: {
    status: { type: String, enum: ['skipped', 'pending', 'ready', 'failed'], default: 'skipped' },
    text:   { type: String, default: '' },
  },

  // Vocabulary ids this response picked (the words shape, PRIMITIVES.md §9) —
  // the application side of the Vocabulary primitive, the same move as
  // Memory's tag arrays. Empty on every other shape.
  wordIds: { type: [String], default: () => [] },

  // Reactions (PRIMITIVES.md §9: free, toggled, no self-react). Ids rather
  // than a count, so a reaction can be taken back and nobody reacts twice.
  reactedIds: { type: [String], default: () => [] },
}, {
  timestamps: true,
  id: false,
});

// The cardinality rule AND the upsert key.
shareSchema.index({ seedId: 1, userId: 1, slot: 1 }, { unique: true });
// The reveal payload: every share for a seed, in a stable order.
shareSchema.index({ seedId: 1, createdAt: 1 });

module.exports = mongoose.model('Share', shareSchema);
