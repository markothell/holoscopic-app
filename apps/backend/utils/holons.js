const { v4: uuidv4 } = require('uuid');
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');

let _io = null;
function setIO(io) { _io = io; }

async function transact({ userId, instanceId, type, amount, refType = null, refId = null }) {
  if (!instanceId) throw new Error('instanceId is required for holon transactions');

  await InstanceMembership.getOrCreate(userId, instanceId);

  const membership = await InstanceMembership.findOneAndUpdate(
    { userId, instanceId },
    { $inc: { holonBalance: amount } },
    { new: true }
  );

  await HolonTransaction.create({
    id: uuidv4().replace(/-/g, '').slice(0, 8),
    userId,
    instanceId,
    type,
    amount,
    balanceAfter: membership.holonBalance,
    refType,
    refId,
  });

  // instanceId lets clients apply the update only when it belongs to the
  // instance they are currently viewing (balances are per-instance).
  if (_io) _io.to(`user:${userId}`).emit('holon_update', { balance: membership.holonBalance, instanceId });

  return membership.holonBalance;
}

/**
 * Deduct Holons from a membership, throwing if balance is insufficient.
 */
async function spend({ userId, instanceId, type, amount, refType, refId }) {
  if (!instanceId) throw new Error('instanceId is required for holon transactions');

  const membership = await InstanceMembership.getOrCreate(userId, instanceId);
  if (membership.holonBalance < amount) throw new Error('Insufficient Holons');
  return transact({ userId, instanceId, type, amount: -amount, refType, refId });
}

module.exports = { transact, spend, setIO };
