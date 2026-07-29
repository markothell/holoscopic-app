const mongoose = require('mongoose');

const instanceConfigSchema = new mongoose.Schema({
  // 'explore' turns the holon economy off entirely: no costs, no rewards,
  // and creation is instant (topics auto-confirm, sessions form solo). The
  // stored holon/quorum numbers below are left intact and simply bypassed,
  // so flipping back to 'normal' restores the exact prior economy.
  mode: { type: String, enum: ['normal', 'explore'], default: 'normal' },
  holons: {
    startingStake:           { type: Number, default: 100 },
    nominationCost:          { type: Number, default: 10 },
    supportCost:             { type: Number, default: 5 },
    algorithmPublishCost:    { type: Number, default: 150 },
    sessionHostReward:       { type: Number, default: 30 },
    sessionParticipantReward:{ type: Number, default: 15 },
    topicQuorumReward:       { type: Number, default: 25 },
    algorithmRoyaltyPercent: { type: Number, default: 10 },
    forkRoyaltyDecayPercent: { type: Number, default: 50 },
    forkDepthCap:            { type: Number, default: 3 },
    // Activity stake model
    activityStakeAmount:     { type: Number, default: 5 },
    frameUseReward:          { type: Number, default: 5 },
    // UBI-style recurring faucet: minted once per UTC day on the player's
    // first touch (daily-login style). 0 = off. An inflationary dial that
    // rewards showing up rather than box-filling.
    dailyBonus:              { type: Number, default: 0 },
    entrySeedReward:         { type: Number, default: 8 },
    patternActivityReward:   { type: Number, default: 3 },
  },
  quorum: {
    topicSupportThreshold:        { type: Number, default: 5 },
    topicWindowHours:             { type: Number, default: 24 },
    inquiryMinParticipants:       { type: Number, default: 3 },
    frameVoteThreshold:           { type: Number, default: 3 },
    algorithmSessionQuorum:       { type: Number, default: 3 },
    algorithmProposalWindowHours: { type: Number, default: 48 },
    // Map lifetime: settles at the earliest of (a) complete — full + everyone
    // entered & voted, (b) this window from creation, (c) edition end.
    // Festival editions: 24. Ongoing async: 168.
    activityWindowHours:          { type: Number, default: 168 },
  },
  // On a Spectrum room defaults. Read by utils/oasGames.js#createGame off the
  // `spectrum` parent instance whenever a new room doesn't explicitly
  // override a value — irrelevant to interView editions.
  oas: {
    startingTokens: { type: Number, default: 4, min: 1 },
    quorum:         { type: Number, default: 3, min: 1 },
    votesPerUser:   { type: Number, default: 3, min: 1 },
    maxPlayers:     { type: Number, default: 40, min: 2 },
  },
  // Chorus memorial config — everything the app needs to know about the person
  // it collects memories for. One Chorus instance is one memorial for one
  // subject, and ALL of that subject's data lives here rather than in env vars
  // or a frontend build constant. That's deliberate and it's cheap: it means
  // the same deployed frontend can serve any memorial, so the eventual
  // multi-collection version is a routing change, not a data migration
  // (apps/chorus/PLAN.md §11, D11). Curator edits these in the platform admin
  // instance config tab — Chorus ships no admin surface of its own.
  //
  // Chorus runs with `mode: 'explore'` — it is the first app in this repo with
  // NO holon economy and no quorum, so the holons/quorum blocks above are
  // present but bypassed entirely.
  memorial: {
    subjectName:     { type: String, default: '' },   // "Ellen"
    subjectPhotoUrl: { type: String, default: '' },
    blurb:           { type: String, default: '' },   // a few lines under the name
    lifespan:        { type: String, default: '' },   // free text — "1941 – 2024"
    // Placeholders {name} / {role} / {experience}; {role} appears twice.
    promptTemplate: {
      type: String,
      default: 'This is a story where {name} was {role} and I was {role} having an experience of {experience}.',
    },
    // Curator preloads. Materialized into MemoryTag docs (origin 'seeded') by
    // utils/memories.js#syncSeedTags — contributors extend the vocabulary from
    // there.
    seedRoleTags:       { type: [String], default: [] },
    seedExperienceTags: { type: [String], default: [] },
    allowCustomTags: { type: Boolean, default: true },
    audioMaxSeconds: { type: Number,  default: 180 },
    // Moderation authenticates with this key in a URL (/curate?k=…) and
    // nothing else, so the link can be texted to a family member who has no
    // holoscopic account (D10). Minted at setup; never returned by a public
    // read path.
    curatorKey: { type: String, default: '' },
    accent:     { type: String, default: '' },  // one CSS accent colour
  },
  // Synthesis idea config. In Synthesis a child Instance IS an idea — a thought
  // space, named by its title, that collaborators map their thinking into. The
  // fields below are the whole of what makes an idea more than a bare Instance,
  // and they live here (rather than on a model of their own) for the same
  // reason OaS rooms do: instance scoping then comes free on every SynNode /
  // SynFrame / SynMembership read.
  //
  // Like Chorus, Synthesis runs with NO holon economy (PLAN.md D1) — the
  // holons/quorum blocks above are present but bypassed.
  synthesis: {
    // D13. A public idea is listed in the browse directory and any signed-in
    // account may join it; a private one is reachable by invite code alone.
    // The MEMBER_CAP applies either way.
    visibility: { type: String, enum: ['public', 'private'], default: 'private' },
    // D12. The share of collaborators that must vote for one statement before
    // the group has reached Synthesis. Per-idea so it can be tuned without a
    // migration; ⅔ is the default bar.
    synthesisThreshold: { type: Number, default: 2 / 3, min: 0.5, max: 1 },
    // D14. How many statement slots each collaborator holds at once — authoring
    // and voting draw on the same budget.
    statementSlots: { type: Number, default: 3, min: 1 },
    // Set once a statement clears the bar. Their presence IS the "this group
    // reached Synthesis" flag; utils/synStatements.js owns both writes.
    synthesisStatementId: { type: String, default: null },
    synthesisReachedAt:   { type: Date,   default: null },
  },
}, { _id: false });

const instanceSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true, index: true },
  name:     { type: String, required: true, trim: true },
  slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  domains:  [{ type: String, lowercase: true, trim: true }],
  access: {
    mode:        { type: String, enum: ['public', 'invite'], default: 'public' },
    inviteCodes: [{ type: String }],
  },

  active:      { type: Boolean, default: true },
  startDate:   { type: Date, default: null },
  endDate:     { type: Date, default: null },
  adminUserId: { type: String, default: null },

  gameVersion: { type: String, default: '1.0' },
  gameNumber:  { type: Number, default: null },

  // Set on per-room instances (e.g. On a Spectrum game rooms) so they can be
  // excluded from edition lists and admin views. Rooms also keep
  // gameNumber null, which already bars them from getDefault().
  parentInstanceId: { type: String, default: null, index: true },

  config: { type: instanceConfigSchema, default: () => ({}) },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { id: false });

instanceSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Find by domain (strips protocol, handles port variants)
instanceSchema.statics.findByDomain = async function (rawDomain) {
  const host = rawDomain.replace(/^https?:\/\//, '').split('/')[0];
  return this.findOne({ domains: host });
};

// True once the instance has been deactivated or its endDate has passed
instanceSchema.methods.isEnded = function () {
  return !this.active || (this.endDate && this.endDate < new Date());
};

// Get or create the default instance (always exists).
// Holoscopic is the platform, never an instance; instances are games.
// Default = the lowest-numbered active game, falling back to any instance.
// Instances without a gameNumber (e.g. spectrum) are never the default —
// null sorts before numbers in Mongo, so they must be excluded explicitly.
instanceSchema.statics.getDefault = async function () {
  let inst = await this.findOne({ active: true, gameNumber: { $ne: null } }).sort({ gameNumber: 1, createdAt: 1 })
          || await this.findOne({ active: true }).sort({ createdAt: 1 })
          || await this.findOne({}).sort({ createdAt: 1 });
  if (!inst) {
    inst = await this.create({
      id: require('crypto').randomUUID().substring(0, 8),
      name: 'interView',
      slug: 'g1',
      gameNumber: 1,
      domains: ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'],
      active: true,
    });
    console.log('✅ Default game instance created (g1)');
  }
  return inst;
};

// The shape an Instance takes on a public read path.
//
// This is an ALLOW-LIST and must stay one. The previous public read returned
// `config` and `access` wholesale, which shipped two secrets to anyone who
// asked: config.memorial.curatorKey (authorizes hiding/removing any Chorus
// memory — see the comment on that field) and access.inviteCodes (grants
// entry to invite-only instances). A delete-list would re-leak both the next
// time somebody adds a field.
instanceSchema.methods.toPublicJSON = function () {
  const c = this.config || {};
  return {
    id: this.id,
    name: this.name,
    slug: this.slug,
    gameNumber: this.gameNumber,
    gameVersion: this.gameVersion,
    active: this.active,
    startDate: this.startDate,
    endDate: this.endDate,
    // mode only — never inviteCodes
    access: { mode: this.access?.mode },
    config: {
      mode: c.mode,
      topicsActivityId: c.topicsActivityId,
      holons: c.holons,
      quorum: c.quorum,
      memorial: {
        accent: c.memorial?.accent,
        promptTemplate: c.memorial?.promptTemplate,
        seedRoleTags: c.memorial?.seedRoleTags,
        seedExperienceTags: c.memorial?.seedExperienceTags,
        allowCustomTags: c.memorial?.allowCustomTags,
        audioMaxSeconds: c.memorial?.audioMaxSeconds,
        // curatorKey is deliberately absent.
      },
      synthesis: {
        visibility: c.synthesis?.visibility,
        synthesisThreshold: c.synthesis?.synthesisThreshold,
        statementSlots: c.synthesis?.statementSlots,
        synthesisStatementId: c.synthesis?.synthesisStatementId,
        synthesisReachedAt: c.synthesis?.synthesisReachedAt,
      },
    },
  };
};

// Both of these are on the hot path: middleware/resolveInstance.js runs on
// EVERY /api request, falling through to findByDomain and then getDefault.
// Instances grow with usage (one per OaS room, one per Synthesis idea), so
// without these every request pays a collection scan that gets slower as the
// platform succeeds.
instanceSchema.index({ domains: 1 });
instanceSchema.index({ active: 1, gameNumber: 1, createdAt: 1 });

module.exports = mongoose.model('Instance', instanceSchema);
