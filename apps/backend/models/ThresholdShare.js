const mongoose = require('mongoose');

// ThresholdShare — one person's story about one seed, on one side of that
// seed's polarity.
//
// This is not an Entry, deliberately (apps/threshold/PLAN.md §5, D8):
// Entry.position is {x,y} with both required and Threshold has no 2D position
// at all, and a share carries audio, a transcript and a pole choice that Entry
// has none of. Chorus's Memory set the precedent — a product whose
// participation is not a map gets its own model.
//
// All writes go through utils/threshold.js. Never write this collection
// anywhere else: the phase gate, the upsert key and the blob host allowlist
// all live there.

// Mirrors Memory.body.audio, so packages/audio (M2) serves both without a
// second wire shape. Written in M3; the field exists now because the allowlist
// check that guards it is a security control and should not be retrofitted.
const audioSchema = new mongoose.Schema({
  url:         { type: String, required: true },
  // The blob key, stored rather than derived. scripts/restore-blobs.js
  // re-uploads at the SAME pathname and rewrites the url — the store id is
  // baked into the hostname, so a restore into a new store leaves every
  // document pointing at the old one unless this is on hand.
  pathname:    { type: String, default: '' },
  contentType: { type: String, default: '' },
  // The CLIENT times the recording. iOS writes MP4 with no duration metadata,
  // which surfaces as Infinity in every player and an un-scrubbable track, so
  // this stored number is what the player measures against — never the file.
  durationMs:  { type: Number, default: 0 },
  peaks:       { type: [Number], default: () => [] },
  sizeBytes:   { type: Number, default: 0 },
}, { _id: false, id: false });

const thresholdShareSchema = new mongoose.Schema({
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

  // Which end of the polarity this story is about. There is no third value:
  // the threshold is discovered from disagreement BETWEEN rankers, never
  // declared by one of them (PLAN §1).
  pole: { type: String, enum: ['A', 'B'], required: true },

  // What the ranking surface shows on the card. Derived from the opening of
  // `text` when the author does not write one.
  title: { type: String, default: '', trim: true, maxlength: 80 },
  text:  { type: String, default: '', trim: true, maxlength: 2000 },

  audio: { type: audioSchema, default: null },
  transcript: {
    status: { type: String, enum: ['skipped', 'pending', 'ready', 'failed'], default: 'skipped' },
    text:   { type: String, default: '' },
  },
}, {
  timestamps: true,
  id: false,
});

// D10: one share per pole, so at most two per member per seed. This IS the
// upsert key — resubmitting your liberating story replaces it rather than
// adding a second.
thresholdShareSchema.index({ seedId: 1, userId: 1, pole: 1 }, { unique: true });
// The ranking payload: every share for a seed, in a stable order.
thresholdShareSchema.index({ seedId: 1, createdAt: 1 });

module.exports = mongoose.model('ThresholdShare', thresholdShareSchema);
