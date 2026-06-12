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

membershipSchema.statics.getOrCreate = async function (userId, instanceId) {
  let m = await this.findOne({ userId, instanceId });
  if (!m) {
    const id = Math.random().toString(36).substring(2, 10);
    m = await this.create({ id, userId, instanceId, holonBalance: 0 });
  }
  return m;
};

module.exports = mongoose.model('InstanceMembership', membershipSchema);
