const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const Signup = require('../models/Signup');
const { sendEmail } = require('../utils/email');

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';

// The reply-to on the welcome letter, and the address the letter names. A real
// mailbox has to answer here — the letter says "email me directly."
const MO_EMAIL = process.env.MO_EMAIL || 'mo@holoscopic.io';

// The From on the welcome letter. The local part is the one already proven to
// send (utils/email.js: the verified sender is the SUBDOMAIN, and an apex
// address is a send that never happens); only the display name changes, so a
// personal letter arrives with a person's name on it. Changing the local part
// is safe on the verified domain but should be test-sent first.
const WELCOME_FROM = process.env.WELCOME_FROM
  || 'Mark Othell <noreply@notifications.holoscopic.io>';

// Which captures get the welcome letter. The letter opens on "your request to
// be included in Circles", so it answers the Circles capture and nothing else
// — a /start signup asking about hosting would be told about something it did
// not ask for. Add a source here when a surface earns this letter.
const WELCOMED_SOURCES = new Set(['first-gathering']);

// The welcome letter. Plain text on purpose: utils/email.js sends no HTML, and
// that constraint protects the password-reset mail sharing this domain. The one
// emphasis the letter wants — "together" — is carried by em dashes, which is
// the plain-text way to stress a word and reads as a letter rather than as
// marketing.
//
// Paragraphs are unwrapped so the recipient's client wraps to their own width;
// hard-wrapping at 72 columns is what makes a letter look ragged on a phone.
const WELCOME_SUBJECT = 'Can we \u2018get it\u2019 together?';

const WELCOME_BODY = [
  'Greetings, Mark Othell here,',

  'We received your request to be included in Circles (thanks!) and I wanted to share a quick note on what I\u2019m working on here at Holoscopic.',

  'Sometimes I feel a drop in optimism and find myself asking if we can get it together as a species. Can we hit our stride, or will we spiral into tribal conflict? But I realize that even the question bears a kind of internal division, and I thought (as this is what our tools are for) I\u2019d take a moment to name the split and clarify what I\u2019m truly desiring.',

  'One version of \u2018getting it together\u2019 is about cleaning up messes. It feels like getting rid of old thinking, finding the final solution. And I realize this bears the marks of that tribal battle. The idea that \u201Cthe solution\u201D is something I could hold instead of an eternal process. I see the ways this thinking creates conflict in my home relationships, echoing our battles for power and authority at a global scale.',

  'Another version of \u2018getting it\u2019 feels like pulling together fractured pieces and making something that works. The compass didn\u2019t map the world; it let sailors leave sight of land and come back. The first engineers built the steam engine with a theory of heat that turned out to be wrong. The science came from studying engines that already ran, and then it went back and produced engines nobody would have reached by tinkering \u2014 and refrigeration, and power stations, and ways of thinking about the universe we still use. Practice and understanding kept handing things to each other.',

  'Human culture passes down tools. Ways to mark the passage of time, to prepare for transitions, to resolve conflict \u2014 the circle itself among them. Tools survive because they work. As I look at the turmoil of the world, I\u2019m asking myself whether we can \u2018get it\u2019 in this second way \u2014 together \u2014 as a global culture. Can we create systems that turn cultural differences into an engine of generative insights?',

  'Holoscopic\u2019s vision for how this happens is simple: better feedback loops. Human feedback loops. Tools that allow us to learn from each other as we navigate our varied relationships with life.',

  'I\u2019m thrilled to have you join us on that journey.',

  `I\u2019ll send out invites to join sharing circles on our platform as rooms fill up. Email me directly any time at ${MO_EMAIL}.`,

  'Best,\nMark Othell',
].join('\n\n');

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
    // person tapping twice, not news. That holds for both messages: nobody
    // should get the welcome letter twice for tapping the button twice.
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

      // And the person hears back. Until this existed the only mail a capture
      // produced went to the operator, so somebody who left an address got
      // silence — the promise on the page had nobody keeping it.
      if (WELCOMED_SOURCES.has(src)) {
        const welcome = await sendEmail({
          to: cleanEmail,
          from: WELCOME_FROM,
          replyTo: MO_EMAIL,
          subject: WELCOME_SUBJECT,
          text: WELCOME_BODY,
        });
        if (welcome !== 'sent') {
          console.warn(`[signup] welcome for ${cleanEmail} not delivered: ${welcome}`);
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
