const mongoose = require('mongoose');

// Placement — the PRIMITIVE "opinion located against a structure" (PLATFORM.md
// P8, PRIMITIVES.md §4.3): a position on 1–2 axes, a bucket choice, or a rank
// order, keyed so one member holds one placement per (seed, target, axis).
// First writer is the 'gather' module (kind 'position'); bucket and rank
// variants arrive with the next activity that needs them.
//
// All writes go through the owning primitive funnel (utils/gather.js today).
// Whether a placement may still change — draft vs committed, frozen at the
// close (PRIMITIVES.md §9 B5) — is enforced there, never here.

const placementSchema = new mongoose.Schema({
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
  circleId:   { type: String, required: true, index: true },
  seedId:     { type: String, required: true, index: true },

  userId:   { type: String, required: true },
  username: { type: String, required: true, trim: true, maxlength: 40 },

  // What kind of structure the value speaks against.
  kind: { type: String, enum: ['position', 'bucket', 'rank'], required: true },

  // What is being placed. '' = the member's own response (gather's case);
  // an id when placing someone else's contribution (Threshold-style sorting).
  targetId: { type: String, default: '' },
  // Which axis, for activities ranking the same targets on several. '' when
  // the seed's axes are one structure (gather stores {x,y} in one row).
  axis: { type: String, default: '' },

  // kind 'position': both in [0,1]; y is 0.5 on a one-axis seed.
  position: {
    x: { type: Number, default: null, min: 0, max: 1 },
    y: { type: Number, default: null, min: 0, max: 1 },
  },
  // kind 'bucket'.
  bucket: { type: String, default: '' },
  // kind 'rank': target ids, best first.
  order: { type: [String], default: () => [] },

  // null = draft. Only committed placements reach any aggregate; whether a
  // committed one may still move is the funnel's per-phase rule.
  committedAt: { type: Date, default: null },
}, {
  timestamps: true,
  id: false,
});

// The cardinality rule AND the upsert key.
placementSchema.index({ seedId: 1, userId: 1, kind: 1, targetId: 1, axis: 1 }, { unique: true });
// The aggregate reads a seed's committed placements flat.
placementSchema.index({ seedId: 1, committedAt: 1 });

module.exports = mongoose.model('Placement', placementSchema);
