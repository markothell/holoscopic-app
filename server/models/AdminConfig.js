const mongoose = require('mongoose');

// Singleton config document — always upsert with key: 'global'
const adminConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  // Linked activities for each tier
  topicsActivityId: { type: String, default: null },

  holons: {
    startingStake: { type: Number, default: 100 },
    nominationCost: { type: Number, default: 10 },
    supportCost: { type: Number, default: 5 },
    algorithmPublishCost: { type: Number, default: 150 },
    sessionHostReward: { type: Number, default: 30 },
    sessionParticipantReward: { type: Number, default: 15 },
    topicQuorumReward: { type: Number, default: 25 },
    algorithmRoyaltyPercent: { type: Number, default: 10 }, // % of pool per adoption
    forkRoyaltyDecayPercent: { type: Number, default: 50 }, // each fork level halves the royalty
    forkDepthCap: { type: Number, default: 3 },
  },
  quorum: {
    topicSupportThreshold: { type: Number, default: 5 },
    topicWindowHours: { type: Number, default: 24 },
    inquiryMinParticipants: { type: Number, default: 3 },
    frameVoteThreshold: { type: Number, default: 3 },
    algorithmSessionQuorum: { type: Number, default: 3 },
    algorithmProposalWindowHours: { type: Number, default: 48 },
  },
  updatedAt: { type: Date, default: Date.now },
});

adminConfigSchema.statics.get = async function () {
  let config = await this.findOne({ key: 'global' });
  if (!config) config = await this.create({ key: 'global' });
  return config;
};

module.exports = mongoose.model('AdminConfig', adminConfigSchema);
