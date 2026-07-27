const mongoose = require('mongoose');

// UnisonFrame — an OasFrame-shaped "spectrum": two poles a thought's readers
// position their response between ("concrete — abstract"). A thought node
// carries 1 (ranked line) or 2 (2x2 grid) of these as its axisFrameIds; they
// define the coordinate space the resolve composer places a stance in.
//
// Frames are the community's reusable axis vocabulary: created the moment an
// author coins a pole pair, deduped per community so two thoughts coining the
// same lens share one frame id (and are directly comparable). Pole text is
// frozen at creation, never mutated — a reused frame means the same thing on
// every thought that cites it.
//
// Scoped to the community Instance (a Unison community = a child Instance),
// mirroring OasFrame's instance scoping. Unlike OasFrame there is no gameId:
// the community instance IS the dedupe boundary.
const unisonFrameSchema = new mongoose.Schema({
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

  // The deployment this community belongs to (the `unison` parent instance) —
  // denormalized for any future cross-community spectrum roll-up. Lazily
  // backfilled on old docs.
  parentInstanceId: { type: String, default: null, index: true },

  // poleA = the "most" end (filled dot; right on x, top on y) — identical
  // orientation rules to OasFrame so the spectrum glyph logic carries over.
  poleA: { type: String, required: true, trim: true, maxlength: 40 },
  poleB: { type: String, required: true, trim: true, maxlength: 40 },

  // Orientation-free identity within a community: sorted lowercase poles. Two
  // authors coining "concrete—abstract" and "abstract—concrete" share a key.
  // Set at creation; lazily backfilled.
  key: { type: String, default: null, index: true },

  createdBy:     { type: String, required: true },
  createdByName: { type: String, required: true },
}, {
  timestamps: true,
  id: false,
});

module.exports = mongoose.model('UnisonFrame', unisonFrameSchema);
