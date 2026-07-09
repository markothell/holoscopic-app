const mongoose = require('mongoose');

// OasGame — one room of "On a Spectrum": a group brainstorms a web of
// subtopics around an overarching topic (round 1), then maps the surviving
// subtopics through three creator-set themes (rounds 2–4), revises the game
// structure itself (revise), and ends on an invitation list of proposed
// variations (complete).
//
// The document holds configuration, membership, and phase-machine state
// only. Nominations live in OasNomination; map content (positions, comments,
// votes) lives in the Entry collection under real Activity documents spawned
// at quorum. Each game owns a dedicated Instance (parentInstanceId set), so
// token balances ride InstanceMembership per room via utils/holons.js.
const participantSchema = new mongoose.Schema({
  id:       { type: String, required: true },              // User.id
  name:     { type: String, required: true, trim: true, maxlength: 40 },
  joinedAt: { type: Date, default: Date.now },
  isHost:   { type: Boolean, default: false },
}, { _id: false, id: false });

const mapRefSchema = new mongoose.Schema({
  activityId:   { type: String, required: true },
  nominationId: { type: String, required: true },
  subtopicId:   { type: String, required: true },
  round:        { type: Number, required: true, min: 2, max: 4 },
  themeIndex:   { type: Number, required: true, min: 0, max: 2 },
}, { _id: false, id: false });

const proposalSchema = new mongoose.Schema({
  id:             { type: String, required: true },
  proposedBy:     { type: String, required: true },
  proposedByName: { type: String, required: true },
  topic:          { type: String, required: true, trim: true, maxlength: 80 },
  themes:         { type: [String], required: true },
  // Lazily created on first join — the proposal's own lobby.
  childGameId:    { type: String, default: null },
  createdAt:      { type: Date, default: Date.now },
}, { _id: false, id: false });

const oasGameSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  // The room's OWN Instance.id (not the parent's) — all entries, activities,
  // and token balances for this game are scoped to it.
  instanceId: { type: String, required: true, index: true },

  // Shareable room code — what players type or carry in the /g/[code] URL.
  code: { type: String, required: true, unique: true, index: true, uppercase: true },

  phase: {
    type: String,
    enum: ['lobby', 'round1', 'round2', 'round3', 'round4', 'revise', 'complete'],
    default: 'lobby',
  },
  // Server-authoritative deadline; set for every timed phase (round1–revise).
  phaseDeadline: { type: Date, default: null },

  hostId: { type: String, required: true },               // User.id
  participants: [participantSchema],

  topic:  { type: String, required: true, trim: true, maxlength: 80 },
  // Exactly three mapping themes, one per round 2/3/4.
  themes: {
    type: [String],
    validate: [arr => arr.length === 3, 'themes must have exactly 3 entries'],
    default: ['Experiences', 'Intentions', 'Actions'],
  },

  config: {
    roundSeconds: {
      round1: { type: Number, default: 300, min: 60, max: 86400 },
      round2: { type: Number, default: 300, min: 60, max: 86400 },
      round3: { type: Number, default: 300, min: 60, max: 86400 },
      round4: { type: Number, default: 300, min: 60, max: 86400 },
      revise: { type: Number, default: 300, min: 60, max: 86400 },
    },
    // Mirrored into the room Instance's config.holons.startingStake so
    // InstanceMembership.getOrCreate grants it on first touch.
    startingTokens: { type: Number, default: 4, min: 1 },
    // Distinct stakers (nominator included) to confirm a nomination.
    quorum:       { type: Number, default: 3, min: 1 },
    votesPerUser: { type: Number, default: 3, min: 1 },
    maxPlayers:   { type: Number, default: 40, min: 2 },
  },

  // Index of maps spawned at quorum in rounds 2–4.
  maps: [mapRefSchema],

  // Alternate game structures submitted during revise; the complete screen's
  // invitation list.
  proposals: [proposalSchema],

  // Set when this game was spawned from another game's proposal.
  parentGameId: { type: String, default: null },
}, {
  timestamps: true,
  id: false,
});

module.exports = mongoose.model('OasGame', oasGameSchema);
