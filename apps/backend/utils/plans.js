// What an account's plan permits.
//
// TWO plans (BUSINESS.md §5, revised 2026-09-16 down from four): 'free' hosts
// a few circles, 'host' lifts the limit and covers what the table used to split
// into Facilitator and Practice/Org. Self-host is not a plan — the MIT licence
// is a fact about the substrate, not a row in a pricing table.
//
// The plan is named for the act it pays for, which is also the billing unit
// (§5: price on circles, not seats). So the only thing a plan governs today is
// how many circles you may HOLD THE SEAT for at once.
//
// Nothing bills against this yet. Stripe is Stage 1 (Oct–Dec) and manual
// provisioning is explicitly fine until then; this file is the seam it writes
// to, and the limits below are the only place the numbers live.

const PLANS = ['free', 'host'];

// Free's number is deliberate rather than derived. BUSINESS.md §5 says one
// circle; §10 decision #5 ("does the free tier stay one circle forever?") is
// still open, and MO's call on 2026-09-16 was three while Stage 0 is about
// strangers succeeding unaided. Loosening a limit later is painless and
// tightening it is not, so this number is worth revisiting before there are
// enough free accounts to make it expensive.
const CIRCLE_LIMITS = {
  free: 3,
  host: Infinity,
};

/**
 * The plan on an account, treating an absent value as free.
 *
 * ALWAYS read through this, and NEVER query `{ plan: 'free' }`: a Mongoose
 * default is a Mongoose-layer fiction, so every account written before the
 * field existed has no `plan` in MongoDB and such a query matches none of them
 * (the Instance.app lesson, models/User.js).
 */
function planOf(user) {
  const plan = user && user.plan;
  return PLANS.includes(plan) ? plan : 'free';
}

/**
 * How many circles this account may host at once.
 *
 * An admin is uncapped. That is an operator's exemption, not a tier: the people
 * running the platform should never be told to close a circle to make room, and
 * routes/admin.js already reads `role` from the User row on every call.
 */
function circleLimitFor(user) {
  if (user && user.role === 'admin') return Infinity;
  return CIRCLE_LIMITS[planOf(user)];
}

module.exports = { PLANS, CIRCLE_LIMITS, planOf, circleLimitFor };
