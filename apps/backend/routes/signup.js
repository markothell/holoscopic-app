const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const Signup = require('../models/Signup');
const { sendEmail } = require('../utils/email');

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

// Unauthenticated, and now causes an outbound email.
const captureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  message: { error: 'Too many requests from here. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/signup — general interest capture (notify-me). Anonymous.
//
// The page that feeds this (/start) says "We'll be in touch when hosting
// opens". Nothing in the backend read the Signup collection — no admin tab, no
// route, no export — so every address landed in Mongo and stayed there, and
// that promise was one nobody was in a position to keep. The notice below is
// what makes it true: it does not answer the person, it tells you they asked.
router.post('/', captureLimiter, async (req, res) => {
  try {
    const { email, source } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const src = (source || 'start-your-own').trim().slice(0, 64);
    const cleanEmail = email.trim().toLowerCase();

    // Upsert: ignore if already signed up from this source.
    const before = await Signup.findOne({ email: cleanEmail, source: src });
    await Signup.findOneAndUpdate(
      { email: cleanEmail, source: src },
      { email: cleanEmail, source: src },
      { upsert: true, new: true }
    );

    // Only on the first submission — re-submitting the same address is a
    // person tapping twice, not news.
    if (!before) {
      const outcome = await sendEmail({
        to: ALERT_EMAIL,
        replyTo: cleanEmail,
        subject: `Holoscopic: ${cleanEmail} asked about "${src}"`,
        text: `${cleanEmail} signed up via ${src}.\n\nThey were told someone would be in touch.`,
      });
      if (outcome !== 'sent') {
        console.warn(`[signup] notice for ${cleanEmail} (${src}) not delivered: ${outcome}`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
