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
