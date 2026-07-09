const mongoose = require('mongoose');

// OasNomination — one stake-backed proposal inside an On a Spectrum game.
// Two kinds share the model and the quorum mechanic:
//   subtopic — round 1: a node in the brainstorm web around the game topic
//   map      — rounds 2–4: "map this confirmed subtopic through this round's
//              theme", with the nominator-authored X/Y axes
//
// stakes[] is the token ledger for this nomination: 1 token per staker,
// locked on stake and returned on map completion, no-quorum expiry, or the
// round-end sweep (returned flag makes refunds idempotent). Tokens move only
// through utils/holons.js against the room's Instance.
const stakeSchema = new mongoose.Schema({
  userId:     { type: String, required: true },
  amount:     { type: Number, required: true, default: 1 },
  stakedAt:   { type: Date, default: Date.now },
  returned:   { type: Boolean, default: false },
  returnedAt: { type: Date, default: null },
}, { _id: false, id: false });

const axisSchema = new mongoose.Schema({
  min: { type: String, required: true, trim: true, maxlength: 30 },
  max: { type: String, required: true, trim: true, maxlength: 30 },
}, { _id: false, id: false });

const oasNominationSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true },  // room instance
  gameId:     { type: String, required: true, index: true },

  kind:  { type: String, enum: ['subtopic', 'map'], required: true },
  round: { type: Number, required: true, min: 1, max: 4 },
  // 0..2 for kind 'map' (which theme lens), null for subtopics.
  themeIndex: { type: Number, default: null, min: 0, max: 2 },

  // Subtopic title, copied onto map nominations for display.
  title: { type: String, required: true, trim: true, maxlength: 80 },

  // kind 'map': the confirmed round-1 subtopic this map is about.
  subtopicId: { type: String, default: null },

  // kind 'map': nominator-authored axes, visible before supporters stake.
  axes: {
    type: new mongoose.Schema({ x: axisSchema, y: axisSchema }, { _id: false, id: false }),
    default: null,
  },

  nominatedBy:     { type: String, required: true },
  nominatedByName: { type: String, required: true },

  stakes: [stakeSchema],

  // Snapshot of the game's quorum at creation, so a mid-game config change
  // can never retro-confirm or orphan existing nominations.
  quorumThreshold: { type: Number, required: true, min: 1 },

  status: { type: String, enum: ['nominated', 'confirmed', 'expired'], default: 'nominated' },

  // kind 'map': set when quorum spawns the live Activity.
  activityId: { type: String, default: null },
}, {
  timestamps: true,
  id: false,
});

oasNominationSchema.index({ gameId: 1, round: 1, status: 1 });

module.exports = mongoose.model('OasNomination', oasNominationSchema);
