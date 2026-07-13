const mongoose = require('mongoose');

// OasFrame — a spectrum with a durable identity inside an On a Spectrum
// game: two poles a group can rank things between ("strict — lenient").
//
// Frames are created the moment someone proposes one on a map nomination's
// frame slate and live for the whole game as the room's shared lens
// vocabulary: the nomination sheet offers them for reuse on later maps, and
// two maps that share a frameId are directly comparable (same lens,
// different subtopic). Votes do NOT live here — a frame's support is a
// per-map contest, so voterIds sit on the nomination's frameSlate entries.
//
// Scoped to the room instance like every other OaS document. Identity is
// deduped at creation (case-insensitive pole match within the game), never
// mutated after: pole text is frozen so a reused frame means the same thing
// on every map that cites it.
const oasFrameSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // room instance
  gameId:     { type: String, required: true, index: true },

  // The deployment this frame's game belongs to — denormalized so the pulse
  // page's cross-game spectrum roll-up is one indexed query. Lazily
  // backfilled on old docs.
  parentInstanceId: { type: String, default: null, index: true },

  poleA: { type: String, required: true, trim: true, maxlength: 40 },
  poleB: { type: String, required: true, trim: true, maxlength: 40 },

  // Orientation-free identity across games: sorted lowercase poles. Two
  // games coining "calm—heated" and "heated—calm" share a key — the same
  // rule the in-game dedupe applies. Set at creation; lazily backfilled.
  key: { type: String, default: null, index: true },

  createdBy:     { type: String, required: true },
  createdByName: { type: String, required: true },
}, {
  timestamps: true,
  id: false,
});

module.exports = mongoose.model('OasFrame', oasFrameSchema);
