const mongoose = require('mongoose');

// OasNomination — one stake-backed proposal inside an On a Spectrum game.
// Two kinds share the model and the quorum mechanic:
//   subtopic — round 1: a node in the brainstorm web around the game topic
//   map      — rounds 2–4: "map this confirmed subtopic through this round's
//              theme" as a 1D or 2D spectrum activity
//
// A confirmed map nomination runs its own mini state machine (mapState):
// gather (submit items + nominate/vote spectra) → rank (drag-order the
// frozen items along the winning spectra) → done/closed. Its content lives
// in the Entry collection with THIS document duck-typed as the activity
// (entries.js reads id, topicId, votesPerUser, maxEntries) — no Activity
// document is involved.
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

const winningAxisSchema = new mongoose.Schema({
  entryId: { type: String, required: true },
  label:   { type: String, required: true },
}, { _id: false, id: false });

const itemSchema = new mongoose.Schema({
  entryId:  { type: String, required: true },
  index:    { type: Number, required: true, min: 1 }, // Entry.slotNumber ≥ 1
  label:    { type: String, required: true },
  authorId: { type: String, required: true },
}, { _id: false, id: false });

const rankingDoneSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  axis:   { type: String, enum: ['x', 'y'], required: true },
}, { _id: false, id: false });

const mapStateSchema = new mongoose.Schema({
  stage: {
    type: String,
    enum: ['gather', 'rank', 'done', 'closed'],
    default: 'gather',
  },
  // Server-authoritative gather deadline: a proportional slice of the time
  // left in the game round when the map went live.
  stageDeadline: { type: Date, default: null },
  // Resolved at gather→rank: [0] = x axis, plus [1] = y axis for 2D maps.
  winningAxes: [winningAxisSchema],
  // The item roster frozen at gather→rank; rankings address items by index.
  items: [itemSchema],
  // Which (player, axis) rankings are complete.
  rankingDone: [rankingDoneSchema],
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

  // kind 'subtopic': the subtopic this one branches off, forming the round-1
  // tree. null = a top-level facet of the game topic. Children can outlive an
  // expired parent (each node stands on its own quorum).
  parentSubtopicId: { type: String, default: null },

  // kind 'map': the confirmed round-1 subtopic this map is about.
  subtopicId: { type: String, default: null },

  // kind 'map': one spectrum or two — the nominator's call, visible before
  // supporters stake.
  dimensions: { type: Number, enum: [1, 2], default: 2 },

  // kind 'map': the live activity's state machine; null until confirmed.
  mapState: { type: mapStateSchema, default: null },

  nominatedBy:     { type: String, required: true },
  nominatedByName: { type: String, required: true },

  stakes: [stakeSchema],

  // Snapshot of the game's quorum at creation, so a mid-game config change
  // can never retro-confirm or orphan existing nominations.
  quorumThreshold: { type: Number, required: true, min: 1 },

  status: { type: String, enum: ['nominated', 'confirmed', 'expired'], default: 'nominated' },
}, {
  timestamps: true,
  id: false,
});

oasNominationSchema.index({ gameId: 1, round: 1, status: 1 });

module.exports = mongoose.model('OasNomination', oasNominationSchema);
