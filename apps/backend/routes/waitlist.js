const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const Waitlist = require('../models/Waitlist');
const Sequence = require('../models/Sequence');
const { sendEmail } = require('../utils/email');

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

// Unauthenticated, and now causes an outbound email.
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 1000,
  message: { error: 'Too many requests from here. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// POST /api/waitlist — submit signup for a specific sequence.
//
// The page tells the visitor "we'll send you an invitation" when the sequence
// opens. Nothing sends it — these rows were readable only by an admin opening
// the Waitlist tab. The notice below does not make the invitation automatic;
// it makes the person's request visible to somebody who can send one.
router.post('/', waitlistLimiter, async (req, res) => {
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
    const cleanEmail = email.trim().toLowerCase();
    const before = await Waitlist.findOne({ email: cleanEmail, sequenceId });
    await Waitlist.findOneAndUpdate(
      { email: cleanEmail, sequenceId },
      { email: cleanEmail, sequenceId },
      { upsert: true, new: true }
    );

    const count = await Waitlist.countDocuments({ sequenceId });

    // First time only — the form lets you pick several sequences at once, so a
    // re-submission is usually somebody adding one, not news about this one.
    if (!before) {
      const outcome = await sendEmail({
        to: ALERT_EMAIL,
        replyTo: cleanEmail,
        subject: `Holoscopic waitlist: ${cleanEmail} → ${sequence.title}`,
        text: `${cleanEmail} joined the waitlist for "${sequence.title}".\n\nThat waitlist now holds ${count}.\nThey were told you'd send an invitation when it opens.`,
      });
      if (outcome !== 'sent') {
        console.warn(`[waitlist] notice for ${cleanEmail} not delivered: ${outcome}`);
      }
    }
    res.json({ success: true, count });
  } catch (error) {
    console.error('Waitlist signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
