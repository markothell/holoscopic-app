const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const ContactMessage = require('../models/ContactMessage');
const { sendEmail } = require('../utils/email');

// The way a visitor reaches a person.
//
// Until this existed there was none: the only address on the whole site was
// unlinked plain text at the end of an essay, and it was misspelled. Everything
// else that took an email address — /waitlist, /start — wrote it to a
// collection nobody was notified about.
//
// Two properties matter more than anything else here:
//   1. The message is SAVED before it is sent. A send can fail for reasons the
//      writer cannot see or fix; a row cannot.
//   2. Nothing the writer types is trusted into a header. The address goes into
//      reply_to only after passing the same validation as signup.

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254; // RFC 5321
const NAME_MAX = 80;
const MESSAGE_MAX = 5000;

// This endpoint is unauthenticated and causes an outbound email, so it is
// exactly the shape a spammer looks for. Per IP, generous enough that a person
// writing twice because they forgot something is never blocked.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 1000,
  message: { error: 'Too many messages from here. Try again later, or email mo@holoscopic.io directly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/contact
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail.length > EMAIL_MAX || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) {
      return res.status(400).json({ error: 'A message is required.' });
    }
    if (cleanMessage.length > MESSAGE_MAX) {
      return res.status(400).json({ error: `Please keep it under ${MESSAGE_MAX} characters.` });
    }

    const cleanName = String(name || '').trim().slice(0, NAME_MAX);

    // Saved first, deliberately — see the header comment.
    const saved = await ContactMessage.create({
      name: cleanName,
      email: cleanEmail,
      message: cleanMessage,
    });

    const outcome = await sendEmail({
      to: ALERT_EMAIL,
      // reply_to so hitting reply in your mail client answers the person who
      // wrote in, rather than the noreply sender.
      replyTo: cleanEmail,
      subject: `Holoscopic contact: ${cleanName || cleanEmail}`,
      text: [
        `${cleanName || '(no name given)'} <${cleanEmail}> wrote:`,
        ``,
        cleanMessage,
        ``,
        `—`,
        `Saved as contact message ${saved.id}.`,
      ].join('\n'),
    });

    saved.deliveryStatus = outcome;
    await saved.save();

    if (outcome !== 'sent') {
      console.warn(`[contact] message ${saved.id} from ${cleanEmail} not delivered: ${outcome}`);
    }

    // Success reports the SAVE, which is what actually happened. The writer
    // cannot act on a Resend failure and should not be asked to.
    res.json({ success: true });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again, or email mo@holoscopic.io.' });
  }
});

module.exports = router;
