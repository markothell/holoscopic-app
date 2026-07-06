const mongoose = require('mongoose');

const instanceConfigSchema = new mongoose.Schema({
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

module.exports = mongoose.model('Instance', instanceSchema);
