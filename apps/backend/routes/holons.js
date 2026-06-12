const express = require('express');
const router = express.Router();
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');
const { transact } = require('../utils/holons');

// UBI / daily-login faucet: mint once per UTC day on first touch.
// Atomic claim via lastDailyBonusAt guard — concurrent requests can't double-mint.
async function claimDailyBonus(userId, instanceId, config) {
  const amount = config?.holons?.dailyBonus ?? 0;
  if (amount <= 0) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const claimed = await InstanceMembership.findOneAndUpdate(
    {
      userId, instanceId,
      $or: [{ lastDailyBonusAt: null }, { lastDailyBonusAt: { $lt: todayStart } }],
    },
    { $set: { lastDailyBonusAt: new Date() } },
  );
  if (!claimed) return false;
  await transact({ userId, instanceId, type: 'daily_bonus', amount, refType: null, refId: null });
  return true;
}

// GET /api/holons/balance — current user's balance for this instance
router.get('/balance', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let membership = await InstanceMembership.getOrCreate(userId, req.instanceId);
    const minted = await claimDailyBonus(userId, req.instanceId, req.instance?.config);
    if (minted) membership = await InstanceMembership.findOne({ userId, instanceId: req.instanceId });
    res.json({ balance: membership.holonBalance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Reputation ≠ currency: standing is lifetime CONNECTION earnings, not balance.
// Participation mints (join/daily bonus, signup reward) and escrow refunds
// don't count — farming rewards never buys rank.
const REPUTATION_TYPES = [
  'comment_attribution',
  'frame_use_reward',
  'entry_seed_reward',
  'pattern_activity_reward',
  'algorithm_royalty',
  'session_host_reward',
];

// GET /api/holons/leaderboard — public standings for this instance
router.get('/leaderboard', async (req, res) => {
  try {
    const rows = await HolonTransaction.aggregate([
      { $match: { instanceId: req.instanceId, type: { $in: REPUTATION_TYPES }, amount: { $gt: 0 } } },
      { $group: { _id: '$userId', earned: { $sum: '$amount' }, events: { $sum: 1 } } },
      { $sort: { earned: -1 } },
      { $limit: 50 },
    ]);
    const User = require('../models/User');
    const users = await User.find({ id: { $in: rows.map(r => r._id) } }).select('id name').lean();
    const nameMap = Object.fromEntries(users.map(u => [u.id, u.name]));
    res.json({
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        userId: r._id,
        name: nameMap[r._id] || 'Unknown',
        earned: r.earned,
        events: r.events,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/holons/transactions — current user's transaction history for this instance
router.get('/transactions', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const transactions = await HolonTransaction.find({ userId, instanceId: req.instanceId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
