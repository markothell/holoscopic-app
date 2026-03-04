const express = require('express');
const router = express.Router();
const Waitlist = require('../models/Waitlist');
const Sequence = require('../models/Sequence');

// GET /api/waitlist/counts?sequenceIds=id1,id2 — signupcount per sequence
router.get('/counts', async (req, res) => {
  try {
    const { sequenceIds } = req.query;
    const ids = sequenceIds ? sequenceIds.split(',').filter(Boolean) : [];

    const counts = {};
    for (const sequenceId of ids) {
      counts[sequenceId] = await Waitlist.countDocuments({ sequenceId });
    }
    res.json({ counts });
  } catch (error) {
    console.error('Waitlist counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts.' });
  }
});

// POST /api/waitlist — submit signup for a specific sequence
router.post('/', async (req, res) => {
  try {
    const { email, sequenceId } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!sequenceId) {
      return res.status(400).json({ error: 'A sequence is required.' });
    }

    // Verify sequence exists and is in waitlist status
    const sequence = await Sequence.findOne({ id: sequenceId, status: 'waitlist' });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found or not accepting signups.' });
    }

    // Upsert: ignore if already signed up for this sequence
    await Waitlist.findOneAndUpdate(
      { email: email.trim().toLowerCase(), sequenceId },
      { email: email.trim().toLowerCase(), sequenceId },
      { upsert: true, new: true }
    );

    const count = await Waitlist.countDocuments({ sequenceId });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
