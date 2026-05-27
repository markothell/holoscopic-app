const express = require('express');
const router = express.Router();
const User = require('../models/User');
const HolonTransaction = require('../models/HolonTransaction');

// GET /api/holons/balance — get current user's balance
router.get('/balance', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await User.findOne({ id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ balance: user.holonBalance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// GET /api/holons/transactions — get current user's transaction history
router.get('/transactions', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const transactions = await HolonTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
