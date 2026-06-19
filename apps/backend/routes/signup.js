const express = require('express');
const router = express.Router();
const Signup = require('../models/Signup');

// POST /api/signup — general interest capture (notify-me). Anonymous.
router.post('/', async (req, res) => {
  try {
    const { email, source } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const src = (source || 'start-your-own').trim().slice(0, 64);

    // Upsert: ignore if already signed up from this source.
    await Signup.findOneAndUpdate(
      { email: email.trim().toLowerCase(), source: src },
      { email: email.trim().toLowerCase(), source: src },
      { upsert: true, new: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
