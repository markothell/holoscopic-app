const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true, index: true },
  userId:       { type: String, required: true, index: true },
  instanceId:   { type: String, required: true, index: true },
  role:         { type: String, enum: ['member', 'admin'], default: 'member' },
  holonBalance: { type: Number, default: 0 },
  joinedAt:     { type: Date, default: Date.now },
  // Daily/UBI faucet bookkeeping — last day the recurring bonus was claimed
  lastDailyBonusAt: { type: Date, default: null },
}, { id: false });

membershipSchema.index({ userId: 1, instanceId: 1 }, { unique: true });

// First touch of an instance seeds that instance's startingStake (logged as
// a join_bonus), so every game is playable on arrival. Previously only
// signup granted the stake — existing users entered new instances at 0.
membershipSchema.statics.getOrCreate = async function (userId, instanceId, _retried = false) {
  let m = await this.findOne({ userId, instanceId });
  if (!m) {
    const Instance = require('./Instance');
    const HolonTransaction = require('./HolonTransaction');
    const instance = await Instance.findOne({ id: instanceId });
    const stake = instance?.config?.holons?.startingStake ?? 100;
    const id = Math.random().toString(36).substring(2, 10);
    try {
      m = await this.create({ id, userId, instanceId, holonBalance: stake });
    } catch (err) {
      // Concurrent first touch — the other request created it; reread once.
      if (err.code === 11000 && !_retried) return this.getOrCreate(userId, instanceId, true);
      throw err;
    }
    if (stake > 0) {
      await HolonTransaction.create({
        id: Math.random().toString(36).substring(2, 10),
        userId,
        instanceId,
        type: 'join_bonus',
        amount: stake,
        balanceAfter: stake,
        refType: null,
        refId: null,
      });
    }
  }
  return m;
};

module.exports = mongoose.model('InstanceMembership', membershipSchema);
