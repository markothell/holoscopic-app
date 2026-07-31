const User = require('../models/User');

// Gate for actions that establish a MEMBERSHIP.
//
// The access policy, in one line: public activities are open to anyone signed
// in; joining something that has a membership needs a confirmed address. So
// this is deliberately NOT applied at a router mount — it goes on the specific
// routes where somebody asks to be let into a group.
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
