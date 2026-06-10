const mongoose = require('mongoose');

const instanceConfigSchema = new mongoose.Schema({
  topicsActivityId: { type: String, default: null },
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
  },
}, { _id: false });

const instanceSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true, index: true },
  name:     { type: String, required: true, trim: true },
  slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  domains:  [{ type: String, lowercase: true, trim: true }],
  gameType: { type: String, default: 'holoscopic-game' },

  access: {
    mode:        { type: String, enum: ['public', 'invite'], default: 'public' },
    inviteCodes: [{ type: String }],
  },

  active:      { type: Boolean, default: true },
  startDate:   { type: Date, default: null },
  endDate:     { type: Date, default: null },
  adminUserId: { type: String, default: null },

  config: { type: instanceConfigSchema, default: () => ({}) },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

instanceSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Find by domain (strips protocol, handles port variants)
instanceSchema.statics.findByDomain = async function (rawDomain) {
  const host = rawDomain.replace(/^https?:\/\//, '').split('/')[0];
  return this.findOne({ domains: host, active: true });
};

// Get or create the default instance (always exists)
instanceSchema.statics.getDefault = async function () {
  let inst = await this.findOne({ id: 'default' });
  if (!inst) {
    inst = await this.create({
      id: 'default',
      name: 'Holoscopic',
      slug: 'default',
      domains: ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'],
      gameType: 'holoscopic-game',
      active: true,
    });
    console.log('✅ Default instance created');
  }
  return inst;
};

module.exports = mongoose.model('Instance', instanceSchema);
