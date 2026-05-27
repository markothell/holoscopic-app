const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const HolonTransaction = require('../models/HolonTransaction');

/**
 * Record a Holon transaction and update the user's balance atomically.
 * amount: positive = earn, negative = spend
 * Returns the updated balance.
 */
async function transact({ userId, type, amount, refType = null, refId = null }) {
  // Atomically increment balance and get new value
  const user = await User.findOneAndUpdate(
    { id: userId },
    { $inc: { holonBalance: amount } },
    { new: true }
  );
  if (!user) throw new Error(`User ${userId} not found`);

  await HolonTransaction.create({
    id: uuidv4().replace(/-/g, '').slice(0, 8),
    userId,
    type,
    amount,
    balanceAfter: user.holonBalance,
    refType,
    refId,
  });

  return user.holonBalance;
}

/**
 * Deduct Holons from a user, throwing if balance is insufficient.
 */
async function spend({ userId, type, amount, refType, refId }) {
  const user = await User.findOne({ id: userId });
  if (!user) throw new Error('User not found');
  if (user.holonBalance < amount) throw new Error('Insufficient Holons');
  return transact({ userId, type, amount: -amount, refType, refId });
}

module.exports = { transact, spend };
