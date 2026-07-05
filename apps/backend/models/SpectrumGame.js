const mongoose = require('mongoose');

// SpectrumGame — one round of "On the Spectrum": a room of guests who
// nominate characteristics under a countdown, rank each other along the
// top two, and meet on a 2x2 reveal grid.
//
// The document holds configuration, membership, and phase-machine state
// only. All participation content (nominations + votes, rankings, stories)
// lives in the Entry collection, written through utils/entries.js — the
// game duck-types as the "activity" (entries.js reads only id, topicId,
// votesPerUser, maxEntries).
const participantSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  name:     { type: String, required: true, trim: true, maxlength: 20 },
  joinedAt: { type: Date, default: Date.now },
  isHost:   { type: Boolean, default: false },
}, { _id: false, id: false });

const rosterMemberSchema = new mongoose.Schema({
  id:           { type: String, required: true },
  name:         { type: String, required: true },
  subjectIndex: { type: Number, required: true, min: 1 },
}, { _id: false, id: false });

const winningAxisSchema = new mongoose.Schema({
  entryId: { type: String, required: true },
  label:   { type: String, required: true },
}, { _id: false, id: false });

const rankingDoneSchema = new mongoose.Schema({
  playerId: { type: String, required: true },
  axis:     { type: String, enum: ['x', 'y'], required: true },
}, { _id: false, id: false });

const spectrumGameSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, default: 'default', index: true },

  // Shareable room code — what players type or carry in the /g/[code] URL.
  code: { type: String, required: true, unique: true, index: true, uppercase: true },

  phase: {
    type: String,
    enum: ['lobby', 'nominate', 'rank', 'reveal'],
    default: 'lobby',
  },
  // Server-authoritative countdown; only set while phase === 'nominate'.
  phaseDeadline: { type: Date, default: null },

  hostId: { type: String, required: true },
  participants: [participantSchema],

  // Frozen at nominate→rank; ranking entries address subjects by
  // subjectIndex (Entry.slotNumber must be >= 1).
  roster: [rosterMemberSchema],

  // Exactly two after nominate resolves: [0] = x axis, [1] = y axis.
  winningAxes: [winningAxisSchema],

  // Which (player, axis) rankings are complete; both axes for every roster
  // member → reveal.
  rankingDone: [rankingDoneSchema],

  config: {
    nominateSeconds:         { type: Number, default: 180 },
    votesPerUser:            { type: Number, default: 3 },
    maxNominationsPerPlayer: { type: Number, default: 3 },
    maxPlayers:              { type: Number, default: 12 },
  },

  // Duck-type fields read by utils/entries.js (voteEntry budget + self-vote
  // rule; upsertEntry ancestry). maxEntries deliberately absent (undefined
  // !== 0, so solo-tracker mode never triggers).
  votesPerUser: { type: Number, default: 3 },
  topicId:      { type: String, default: null },
}, {
  timestamps: true,
  id: false,
});

module.exports = mongoose.model('SpectrumGame', spectrumGameSchema);
