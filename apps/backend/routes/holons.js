const express = require('express');
const router = express.Router();
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');

// GET /api/holons/balance — current user's balance for this instance
router.get('/balance', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const membership = await InstanceMembership.getOrCreate(userId, req.instanceId);
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
