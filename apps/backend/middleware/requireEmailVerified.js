const User = require('../models/User');

// Gate for entering a space that belongs to a group of named people.
//
// "Membership" was the first word for this and it was the wrong one: FOUR
// different code paths create an InstanceMembership, including simply reading a
// holon balance, so membership is not a deliberate act and cannot be the line.
// The line is joining or owning a room, and it is drawn per route:
//
//   GATED
//     POST /sequences/:id/enroll        enrolling in a cohort
//     POST /oas/games                   creating an On a Spectrum room
//     POST /synthesis/ideas             creating an idea
//     POST /synthesis/ideas/:code/join  joining an idea
//
//   DELIBERATELY OPEN
//     POST /oas/games/:code/join        a Spectrum room is joined by people
//                                       standing together passing a code; an
//                                       unopened confirmation email must not
//                                       be what stops somebody joining the
//                                       game in front of them. Only the host,
//                                       who names and runs the room, is gated.
//     POST /activities/:id/participants THIS IS public interView play. You
//                                       must be a participant to submit an
//                                       entry, so gating it would gate the
//                                       open map — the exact thing the policy
//                                       protects.
//     everything inside a space you    entries, votes, topics, nominations,
//     are already in                   stakes, replies.
//
// `Instance.access.mode` ('public' | 'invite') looks like it should decide this
// and does not: it is declared on the model, returned by toPublicJSON, and
// enforced nowhere. Do not reach for it as a signal without making it real
// first.
//
// NOT the same thing as middleware/verifyUser.js, despite the names being one
// word apart. That one asks "is this request really from the user it claims to
// be" (a signed token). This one asks "has that user proved they own their
// email address". A request can pass either and fail the other, and the two
// must never be conflated — `enforceVerifiedUser` is about identity spoofing,
// `requireEmailVerified` is about reachability.
//
// Accounts predating verification are stamped emailVerified by
// scripts/backfill-email-verified.js. Without that backfill this middleware
// locks out every existing user the moment it ships, which is the classic way
// a verification feature becomes an outage.
async function requireEmailVerified(req, res, next) {
  try {
    // enforceVerifiedUser has already normalised these to a proven value on
    // any mutating route it guards; the fallbacks are for routes it does not.
    const userId = req.authedUserId
      || req.headers['x-user-id']
      || (req.body && req.body.userId);

    if (!userId) return res.status(401).json({ error: 'Sign in required' });

    const user = await User.findOne({ id: userId }).select('emailVerified email isActive').lean();
    if (!user) return res.status(401).json({ error: 'Sign in required' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is disabled' });

    if (!user.emailVerified) {
      // 403 with a machine-readable code, because the client's response to
      // this is a specific offer — "resend the confirmation to <address>" —
      // rather than the generic error any other 403 gets.
      return res.status(403).json({
        error: 'Confirm your email address before joining. Check your inbox for the link we sent.',
        code: 'email_unverified',
        email: user.email,
      });
    }

    next();
  } catch (err) {
    console.error('[requireEmailVerified] error:', err);
    res.status(500).json({ error: 'Failed to check account status' });
  }
}

module.exports = requireEmailVerified;
