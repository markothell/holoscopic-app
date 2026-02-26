const express = require('express');
const router = express.Router();
const Waitlist = require('../models/Waitlist');

const VALID_TOPICS = ['Relationship', 'Intuition', 'Work', 'Sexuality'];
const MAX_PER_TOPIC = 25;

// GET /api/waitlist/counts — public topic counts (no emails)
router.get('/counts', async (req, res) => {
  try {
    const counts = {};
    for (const topic of VALID_TOPICS) {
      counts[topic] = await Waitlist.countDocuments({ topics: topic });
    }
    res.json({ counts });
  } catch (error) {
    console.error('Waitlist counts error:', error);
    res.status(500).json({ error: 'Failed to fetch counts.' });
  }
});

// POST /api/waitlist — submit signup
router.post('/', async (req, res) => {
  try {
    const { email, topics } = req.body;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    // Validate topics
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'Select at least one topic.' });
    }

    const validTopics = topics.filter(t => VALID_TOPICS.includes(t));
    if (validTopics.length === 0) {
      return res.status(400).json({ error: 'Invalid topic selection.' });
    }

    // Check capacity for selected topics
    for (const topic of validTopics) {
      const count = await Waitlist.countDocuments({ topics: topic });
      if (count >= MAX_PER_TOPIC) {
        return res.status(400).json({
          error: `The ${topic} cohort is full. Select a different topic or check back later.`,
        });
      }
    }

    // Upsert: merge topics if email already exists
    const existing = await Waitlist.findByEmail(email.trim());
    if (existing) {
      const merged = [...new Set([...existing.topics, ...validTopics])];
      existing.topics = merged;
      await existing.save();
    } else {
      await Waitlist.create({ email: email.trim(), topics: validTopics });
    }

    // Return updated counts
    const counts = {};
    for (const topic of VALID_TOPICS) {
      counts[topic] = await Waitlist.countDocuments({ topics: topic });
    }

    res.json({ success: true, counts });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
