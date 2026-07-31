const mongoose = require('mongoose');

// MemoryTag — one chip in a Chorus memorial's tag vocabulary.
//
// TWO VOCABULARIES, THREE STORAGE SLOTS (PLAN §2.1, D4, D12):
//   • role       — answers "Who was <Name> in this story?", and historically
//                  also filled "I was ___". One shared word list, deliberately.
//   • experience — answers "What was this an experience of?".
//
// The shared `role` list is the good accident: filtering on "stubborn"
// surfaces every story where *somebody* was stubborn, whichever side of it the
// sharer was on. Don't split it into two vocabularies later without
// understanding that's the feature you're removing.
//
// `useCount` IS NOW LOAD-BEARING IN THE UI, not just an ordering hint: the
// compose form shows the head of each vocabulary on the form itself, so the
// most-used words are the ones a contributor sees before opening anything.
// A wrong delta here is visible on the first screen of the app.
//
// SEEDED BY THE CURATOR, EXTENDED BY CONTRIBUTORS. A contributed tag becomes
// visible to everyone on first use, and `useCount` orders the picker, so the
// vocabulary self-organizes toward what people actually say about this
// person. That emergent shared language is the point of the mechanic, not a
// side effect.
//
// DEDUPE ON `key`, the normalized label — the same move as SynFrame and
// OasFrame. Two people typing "In Over My Head" and "in over my head" get one
// tag and stay comparable, which is what makes the tag portrait (size ∝
// useCount) meaningful rather than a pile of near-duplicates.
const memoryTagSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // the memorial

  set: { type: String, enum: ['role', 'experience'], required: true },

  // As typed, for display: "In over my head"
  label: { type: String, required: true, trim: true, maxlength: 24 },
  // Normalized, for dedupe: "in over my head"
  key:   { type: String, required: true },

  origin: { type: String, enum: ['seeded', 'contributed'], default: 'contributed' },

  // Drives picker order AND the tag-portrait weighting. Maintained by the
  // funnel on every memory create/edit — never incremented from a route.
  useCount: { type: Number, default: 0 },

  // The curator's own ordering, from the position of the word in the seed list.
  // It breaks ties BELOW useCount, which makes it matter in exactly the case
  // that used to look broken: a memorial with no memories yet has every count
  // at 0, so the picker fell back to sorting by label and showed the curator's
  // list alphabetized. The compose form only shows the first few words, so
  // alphabetical order silently decided which of them anyone ever saw.
  //
  // High default so a contributed word never outranks a deliberately-placed
  // seeded one at the same count.
  seedRank: { type: Number, default: 9999 },

  // Curator can retire a tag: it disappears from pickers and filters, but
  // memories keep it in their arrays and simply stop rendering it. Retiring is
  // reversible; deleting would orphan references.
  hidden: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
}, { id: false });

// The dedupe axis. Per memorial, per vocabulary — so two memorials never
// collide, which is the whole of what multi-collection needs here (PLAN §11).
memoryTagSchema.index({ instanceId: 1, set: 1, key: 1 }, { unique: true });
// Picker + portrait: most-used first within a vocabulary.
memoryTagSchema.index({ instanceId: 1, set: 1, useCount: -1 });

module.exports = mongoose.models.MemoryTag || mongoose.model('MemoryTag', memoryTagSchema);
