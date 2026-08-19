const mongoose = require('mongoose');

// Vocabulary — the PRIMITIVE participant-extendable shared word set (PLATFORM.md
// P8, PRIMITIVES.md §4.3): one word in one scope's vocabulary, seeded by a
// creator and extended by contributors. Generalizes Chorus's MemoryTag; first
// writer is the 'gather' module (the words shape: pick ≤k / coin ≤j), where the
// scope is the seed. MemoryTag stays put — migration is opportunistic or never.
//
// All writes go through the owning primitive funnel (utils/gather.js today).
// The coin cap, who may see a contributed word before the reveal, and the
// labels-on-the-wire resolution all live there, never here.
//
// DEDUPE ON `key`, the normalized label — MemoryTag's move, kept: two people
// typing "In Over My Head" and "in over my head" get one word and stay
// comparable, which is what makes a word portrait (size ∝ count) meaningful.
//
// `useCount` is part of the primitive's shape (§4.3) but gather does NOT
// maintain it — gather's counts are computed on read from the responses that
// picked each word (§9 gotcha 1), so there is no delta bookkeeping to drift.
// An activity that wants a maintained counter (Chorus's compose-form ordering)
// maintains it in its own funnel.

const vocabularySchema = new mongoose.Schema({
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
  // Denormalized ancestry, matching Share/Placement. '' when the scope is not
  // inside a circle.
  circleId: { type: String, default: '' },

  // What this word set belongs to — gather's case is the seed id. A future
  // Chorus migration would scope by the memorial's instanceId.
  scopeId: { type: String, required: true, index: true },
  // Which of the scope's word sets, for activities running more than one
  // (Chorus's role/experience split). Gather uses ''.
  set: { type: String, default: '' },

  // As typed, for display: "In over my head"
  label: { type: String, required: true, trim: true, maxlength: 24 },
  // Normalized, for dedupe: "in over my head"
  key: { type: String, required: true },

  origin: { type: String, enum: ['seeded', 'contributed'], default: 'contributed' },
  // Who coined a contributed word ('' for seeded) — the funnel's coin cap
  // (≤j per member) is a count over this field.
  createdBy: { type: String, default: '' },

  // §4.3's maintained counter — unused by gather (see header).
  useCount: { type: Number, default: 0 },

  // The creator's own ordering, from the position of the word in the seed
  // list. Orders the picker before any counts exist (MemoryTag's lesson: with
  // every count at zero, alphabetical order silently decided which words
  // anyone ever saw). High default so a contributed word never outranks a
  // deliberately-placed seeded one.
  seedRank: { type: Number, default: 9999 },

  // Retired words disappear from pickers and portraits; responses keep their
  // ids and simply stop rendering them. Reversible; deleting would orphan.
  hidden: { type: Boolean, default: false },
}, {
  timestamps: true,
  id: false,
});

// The dedupe axis AND the cardinality rule (one word per scope per set).
vocabularySchema.index({ scopeId: 1, set: 1, key: 1 }, { unique: true });

module.exports = mongoose.models.Vocabulary || mongoose.model('Vocabulary', vocabularySchema);
