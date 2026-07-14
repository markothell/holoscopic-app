const mongoose = require('mongoose');

// OasGame — one room of "On a Spectrum": a group brainstorms a web of
// subtopics around an overarching topic (round 1), then maps the surviving
// subtopics through three creator-set themes (rounds 2–4), revises the game
// structure itself (revise), and ends on an invitation list of proposed
// variations (complete).
//
// The document holds configuration, membership, and phase-machine state
// only. Nominations (and each live map's own state machine) live in
// OasNomination; map content lives in the Entry collection with the
// nomination duck-typed as the activity. Each game owns a dedicated
// Instance (parentInstanceId set), so token balances ride
// InstanceMembership per room via utils/holons.js.
const participantSchema = new mongoose.Schema({
  id:       { type: String, required: true },              // User.id
  name:     { type: String, required: true, trim: true, maxlength: 40 },
  joinedAt: { type: Date, default: Date.now },
  isHost:   { type: Boolean, default: false },
}, { _id: false, id: false });

const mapRefSchema = new mongoose.Schema({
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

// Per-player slice of a completed game's rollup — feeds the (self-only)
// /me history. Never surfaced on instance-wide reads.
const participantSummarySchema = new mongoose.Schema({
  userId:         { type: String, required: true },
  items:          { type: Number, default: 0 },
  axesRanked:     { type: Number, default: 0 },
  mapsCompleted:  { type: Number, default: 0 }, // stake claimed back
  framesProposed: { type: Number, default: 0 },
  hosted:         { type: Boolean, default: false },
}, { _id: false, id: false });

// Immutable rollup computed once when a game completes (lazily, on first
// read — old games backfill themselves). Everything the history/pulse
// surfaces sort on lives here so they never re-scan nominations/entries.
const summarySchema = new mongoose.Schema({
  computedAt:         { type: Date, required: true },
  players:            { type: Number, default: 0 },
  subtopicsNominated: { type: Number, default: 0 },
  subtopicsConfirmed: { type: Number, default: 0 },
  mapsProposed:       { type: Number, default: 0 },
  mapsRevealed:       { type: Number, default: 0 },
  items:              { type: Number, default: 0 },
  spectrums:          { type: Number, default: 0 }, // distinct frames on slates
  // Mean rater disagreement across every revealed map's items (0 =
  // consensus, 0.5 = maximal split) — the "nuance" sort.
  spread:             { type: Number, default: null },
  perParticipant:     [participantSummarySchema],
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

  // The deployment this room belongs to (e.g. the `spectrum` instance) —
  // denormalized from the room Instance so cross-game reads (history, pulse)
  // are one indexed query. Lazily backfilled on old docs.
  parentInstanceId: { type: String, default: null, index: true },

  // The thread this game belongs to: the first ancestor with no parent
  // (self for a fresh game). Conversations on the pulse page group by this.
  rootGameId: { type: String, default: null, index: true },

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
    // 'manual': no phaseDeadline is ever set — the host advances each round
    // by hand (POST /games/:code/advance) instead of a clock.
    roundMode: { type: String, enum: ['timed', 'manual'], default: 'timed' },
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

  // Set once, on first read after the game completes. Null while running.
  summary: { type: summarySchema, default: null },
}, {
  timestamps: true,
  id: false,
});

// "Games this user played" — multikey, same pattern as Entry.voterIds.
oasGameSchema.index({ 'participants.id': 1 });

module.exports = mongoose.model('OasGame', oasGameSchema);
