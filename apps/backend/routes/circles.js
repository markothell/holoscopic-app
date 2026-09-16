const express = require('express');
const circles = require('../utils/circles');
// Requiring gather registers the 'gather' activity module (code/docs/plan/PRIMITIVES.md §9)
// before startJobs() arms the tick — same load-order contract as threshold.
const gather = require('../utils/gather');
const gatherTranscribe = require('../utils/gatherTranscribe');
const Circle = require('../models/Circle');
const User = require('../models/User');

// /api/circles — the ACTIVITY-AGNOSTIC circle surface (code/docs/plan/PLATFORM.md M8's
// promotion, pulled forward by consumer #2: the circles app at
// circles.holoscopic.io). Everything here is generic over the activity a
// circle runs: the snapshot delegates per-activity content to the module's
// snapshotExtras/participation hooks, so a new activity changes nothing in
// this file — which is the invariant (§2) applied to routing.
//
// What does NOT live here: Threshold's own verbs (telling, sorting —
// /api/threshold), circle creation (the platform admin and Threshold's /new,
// deliberately — hosting is invitation-only per P15), and the notification
// surfaces (unmoved until a second consumer needs them). What DOES: the
// generic seed verbs (post/support/advance — the machine validates through
// the seed's own module) and the gather activity's verbs (respond/react),
// since gather is the platform's activity rather than any one app's.
//
// There IS an own-app gate, below. The instance-scoped lookups make it
// unnecessary for safety — a request that fell through to the default instance
// finds no circle and 404s cleanly, with nothing to misattribute and nothing
// to pollute — but they make every misroute look like a typo. The gate exists
// to tell the two apart, and it becomes load-bearing the day a route is added
// whose lookup is not instance-scoped.
//
// Mounted behind enforceVerifiedUser: circles are member spaces and every
// caller has an account (P18 — accounts are Holoscopic accounts).

const router = express.Router();
const store = circles.mongoStore;

// Which tenants own circles. `threshold` is the instance Threshold has always
// run on; `circles` is the one circles.holoscopic.io moves to when it stops
// borrowing Threshold's.
const CIRCLE_APPS = ['threshold', 'circles'];

// resolveInstance never fails: a request with no x-instance-id, or an
// unrecognised one, lands on getDefault() — an interView edition. Without this
// the router then ran against interView, found no circle because every lookup
// is (instanceId, key)-scoped, and returned a bare "Circle not found" — the
// same answer a genuine typo gets, so a misrouted deployment was
// indistinguishable from a wrong address and diagnosable only from the
// database. Answering here says which of the two it is.
//
// The Deepgram callback is mounted as its own router at /api/circles/hooks and
// never reaches this one — it arrives from Deepgram with none of our headers,
// so it could not satisfy this check.
router.use((req, res, next) => {
  if (!CIRCLE_APPS.includes(req.instance?.app)) {
    console.warn(
      `[circles] ${req.method} ${req.originalUrl} resolved to instance `
      + `${req.instanceId} (app=${req.instance?.app}) — no x-instance-id, or an `
      + 'unrecognised one, and this instance does not serve circles.',
    );
    return res.status(404).json({ error: 'This address does not serve circles' });
  }
  next();
});

// attachVerifiedUser leaves x-user-id holding the proven id or nothing, so the
// header fallback only ever matters on a dev server with no token secret.
function userIdOf(req) {
  return req.authedUserId || req.headers['x-user-id'] || null;
}

/**
 * The account's own address, whether it is confirmed, and what it may host.
 *
 * An invitation is matched against THIS, never an address in the request body.
 * The join form used to ask "email your invitation went to" and check whatever
 * was typed, so knowing one invited address was enough to take that seat.
 *
 * `role` and `plan` come along because the host limit reads both (utils/plans.js
 * — admin is uncapped, and an absent `plan` means free). Selecting neither is
 * how every account would silently read as free.
 */
async function accountOf(req) {
  const id = userIdOf(req);
  if (!id) return null;
  return User.findOne({ id }).select('id email emailVerified role plan').lean();
}

// An invitation-only circle admits a confirmed address only: an unconfirmed one
// is an address anybody could have typed at signup.
function unconfirmedForInvitation(res, circle, account) {
  const alreadyIn = circle.members.some(m => m.userId === account.id);
  if (!circle.requireInvitation || alreadyIn || account.emailVerified) return false;
  res.status(403).json({
    error: 'Confirm your email address first. Invitations are matched to it.',
    code: 'email_unverified',
    email: account.email,
  });
  return true;
}

/** The name a circle knows somebody by, from their ACCOUNT — never the body
 *  (routes/threshold.js#displayNameFor has the history). */
async function displayNameFor(req) {
  const id = userIdOf(req);
  if (!id) return 'Member';
  const user = await User.findOne({ id }).select('name').lean();
  return String(user?.name || '').trim().slice(0, 80) || 'Member';
}

// 404 rather than 403 for absence, so an absent circle and one you are not in
// look the same from outside.
function fail(res, err) {
  const message = err.message || 'Something went wrong';
  if (/not found/i.test(message)) return res.status(404).json({ error: message });
  if (/Not a member|invitation only|Only the/i.test(message)) return res.status(403).json({ error: message });
  return res.status(400).json({ error: message });
}

// The machine's write funnels answer with either the circle or { circle },
// depending on how a transition settled. Threshold's router carries the same
// helper for the same reason: answering with the pre-write copy means the
// response to "open this circle" is the circle as it stood before it opened.
function fresh(result, fallback) {
  if (!result) return fallback;
  return result.circle || (result.id ? result : fallback);
}

// How many circles one account may hold the seat for at once. The numbers live
// in utils/plans.js and nowhere else; this sits beside its only consumers.
const { circleLimitFor, planOf } = require('../utils/plans');

/**
 * How many circles this account still holds the seat for, against what its plan
 * allows. Two routes ask — starting a circle and taking a vacant seat — and
 * they must ask identically, or one becomes a way around the other.
 */
async function hostingStanding(req, account) {
  const limit = circleLimitFor(account);
  const open = await Circle.countDocuments({
    instanceId: req.instanceId,
    ...circles.hostedByQuery(account.id),
    phase: { $ne: 'closed' },
  });
  return { limit, open, atLimit: open >= limit };
}

// 409 rather than 402: nothing has been charged and nothing is owed. The answer
// names the limit and the plan so the client can offer the upgrade without
// having to know either number.
function refuseOverLimit(res, account, standing) {
  return res.status(409).json({
    error: `You are hosting ${standing.open} circles already. Leave or close one, or move to the Host plan.`,
    code: 'host_limit',
    limit: standing.limit,
    plan: planOf(account),
  });
}

/**
 * Start a circle. **Any verified account may host** (P15 rung 2, revised
 * 2026-09-16) — rung 2 read "host-initiated only: MO starts one", and Q6
 * parked the surface in the platform admin, where it was specified and never
 * built. So the only circle creation that existed was Threshold's /new, which
 * hardcodes `activity: 'threshold'` and makes one-off sessions.
 *
 * Born running `gather`: the + builder's asks are what this app makes, and a
 * seed may still name another module per seed, so nothing is closed off.
 *
 * Born in DRAFT, deliberately. A circle arrives named, with nobody in it but
 * its host — opening it is a second act on the circle page. That gap is what
 * lets a host invite people and watch them take their seats before the machine
 * starts and before anyone is mailed.
 */
router.post('/', async (req, res) => {
  try {
    const account = await accountOf(req);
    if (!account) return res.status(401).json({ error: 'Sign in required' });

    // HOSTING is what a plan limits, and 'closed' is the only ending a circle
    // has (D29) — so every circle whose seat this account still holds counts,
    // drafts included. The way out is not always an ending: leaving vacates the
    // seat and frees the slot while the circle carries on without you.
    const standing = await hostingStanding(req, account);
    if (standing.atLimit) return refuseOverLimit(res, account, standing);

    const circle = await circles.createCircle({
      store,
      instanceId: req.instanceId,
      activity: 'gather',
      title: req.body.title,
      urlName: req.body.urlName,
      createdBy: account.id,
      creatorName: await displayNameFor(req),
      // The host's own address on their member row — where this circle's mail
      // reaches them. Taken from the ACCOUNT, never the body.
      creatorEmail: account.email || '',
      mode: 'circle',
      // Three asks may run at once (PRIMITIVES §9 B1). Set at creation because
      // nothing edits `config` afterwards — there is no route that does.
      config: { maxLive: 3 },
      invitedEmails: Array.isArray(req.body.invitedEmails) ? req.body.invitedEmails : [],
      requireInvitation: req.body.requireInvitation !== false,
    });

    res.status(201).json({ circle: circles.toClient(circle, { userId: account.id }) });
  } catch (err) {
    fail(res, err);
  }
});

// Declared before '/:urlName', which would otherwise swallow it — 'me' is a
// reserved word no circle urlName may claim usefully.
router.get('/me', async (req, res) => {
  try {
    const userId = userIdOf(req);
    const rows = await Circle.find({ instanceId: req.instanceId, 'members.userId': userId })
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json({ circles: rows.map(c => circles.toClient(c, { userId })) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/:urlName', async (req, res) => {
  try {
    const circle = await Circle.findOne({ instanceId: req.instanceId, urlName: req.params.urlName });
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    res.json({ circle: await circles.snapshot({ store, circle, viewerId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/join', async (req, res) => {
  try {
    const circle = await Circle.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!circle) return res.status(404).json({ error: 'Circle not found' });
    const account = await accountOf(req);
    if (!account) return res.status(401).json({ error: 'Sign in required' });
    if (unconfirmedForInvitation(res, circle, account)) return;
    const after = await circles.joinCircle({
      store, circleId: circle.id, userId: account.id,
      username: await displayNameFor(req), email: account.email || '',
    });
    res.json({ circle: circles.toClient(after, { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Finds the circle by id within the caller's instance, or 404s.
async function circleOr404(req, res) {
  const circle = await Circle.findOne({ id: req.params.id, instanceId: req.instanceId });
  if (!circle) {
    res.status(404).json({ error: 'Circle not found' });
    return null;
  }
  return circle;
}

// draft → running. Creator only, enforced in the funnel (so a 403 here comes
// from `fail`'s /Only the/ arm, not from a check this file repeats).
//
// A circle opened with an empty queue goes IDLE rather than waiting for a
// seeding round: the first ask anybody posts is the first cycle. Nothing waits
// for everybody.
router.post('/:id/start', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const result = await circles.startCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(result, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// --- Getting out from under it -------------------------------------------
//
// Three different acts, and the whole point is that they are not the same one:
//   leave  — you go, the circle stays. Vacates the seat if you held it.
//   close  — the circle ends, for everybody. The host's act, and terminal.
//   delete — the circle is erased, and only while nobody put anything in it.
//
// The cap is on HOSTING, so leaving is the ordinary way out from under it. A
// host must never have to end other people's circle to get a slot back.

router.post('/:id/leave', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const result = await circles.leaveCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({
      left: true,
      // The last member out: closed if it held anything, erased if it never
      // collected a thing. Both are reported so the client knows where to go.
      closed: Boolean(result.closed),
      deleted: Boolean(result.deleted),
      seatVacated: Boolean(result.seatVacated),
      circle: result.circle ? circles.toClient(result.circle, { userId: userIdOf(req) }) : null,
    });
  } catch (err) {
    fail(res, err);
  }
});

// The only way a circle finishes (D29). Host only, enforced in the funnel.
router.post('/:id/close', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const after = await circles.closeCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Erase it. Refused the moment anybody has put something in — that case is
// close, not delete. This exists for the circle made by mistake, which close
// cannot tidy up because a closed circle holds its urlName forever.
router.delete('/:id', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    res.json(await circles.deleteCircle({ store, circleId: circle.id, userId: userIdOf(req) }));
  } catch (err) {
    fail(res, err);
  }
});

// Take a vacant seat. The plan limit is checked HERE and not in the funnel,
// which has no User and no opinion about billing — and this is the honest
// moment to meet a limit, when somebody is actually taking on the work.
router.post('/:id/host', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const account = await accountOf(req);
    if (!account) return res.status(401).json({ error: 'Sign in required' });

    const standing = await hostingStanding(req, account);
    if (standing.atLimit) return refuseOverLimit(res, account, standing);

    const after = await circles.claimHost({ store, circleId: circle.id, userId: account.id });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: account.id }) });
  } catch (err) {
    fail(res, err);
  }
});

// --- Generic seed verbs (activity-agnostic: the machine validates through the
// --- seed's own module, so these serve threshold topics and gather asks alike)

// Post an activity/topic into the circle's queue. `activity` names the module
// for THIS seed (code/docs/plan/PRIMITIVES.md §9 — a circle runs mixed activities); omitted,
// the seed runs the circle's own. `seedId` edits your own pending seed.
router.post('/:id/seeds', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const { circle: after } = await circles.addSeed({
      store, circleId: circle.id, userId: userIdOf(req),
      payload: req.body.payload || {},
      seedId: req.body.seedId || null,
      activity: req.body.activity || null,
    });
    res.json({ circle: await circles.snapshot({ store, circle: after, viewerId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Toggle my support for a queued seed.
router.post('/:id/seeds/:seedId/support', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const { circle: after } = await circles.supportSeed({
      store, circleId: circle.id, seedId: req.params.seedId, userId: userIdOf(req),
    });
    res.json({ circle: circles.toClient(after, { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Manual advance — the facilitator's escape hatch (creator, or the seed's
// author). Names its seed, since maxLive > 1 runs several at once.
router.post('/:id/seeds/:seedId/advance', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const { circle: after } = await circles.advanceCircle({
      store, circleId: circle.id, userId: userIdOf(req), seedId: req.params.seedId,
    });
    res.json({ circle: await circles.snapshot({ store, circle: after, viewerId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// --- Gather verbs (the builder's single-round activity — code/docs/plan/PRIMITIVES.md §9)

// Submit or update my response. One per member, upserted; open after the
// reveal (B4); text-only once closed (B5).
router.post('/:id/seeds/:seedId/respond', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const { circle: after, share } = await gather.submitResponse({
      circleId: circle.id,
      seedId: req.params.seedId,
      userId: userIdOf(req),
      username: await displayNameFor(req),
      title: req.body.title || '',
      text: req.body.text || '',
      audio: req.body.audio || null,
      position: req.body.position || null,
      words: req.body.words || null,
    });
    res.json({
      share,
      circle: await circles.snapshot({ store, circle: after, viewerId: userIdOf(req) }),
    });
  } catch (err) {
    fail(res, err);
  }
});

// One gather seed's content, at any phase — the reveal surface's read, and
// the respond surface's refresh. The snapshot only carries extras for LIVE
// seeds (a revealed seed has left that set), so a done seed's wall/portrait
// is served here, threshold's /seeds/:seedId/result precedent. Visibility is
// the module's own (sealed = own-only until the close), so this route adds
// nothing but the member gate.
router.get('/:id/seeds/:seedId/responses', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const userId = userIdOf(req);
    circles.assertMember(circle, userId);
    const seed = circle.seeds.find(s => s.id === req.params.seedId);
    if (!seed) return res.status(404).json({ error: 'Topic not found in this circle' });
    // A queued seed (pending OR nominated) is still editable, and gather's
    // extras would materialize its vocabulary early — nothing to read yet.
    if (circles.notStarted(seed)) return res.status(404).json({ error: 'This activity has not started' });
    const mod = circles.modFor(circle, seed);
    if (!mod.snapshotExtras) return res.status(404).json({ error: 'This activity has no responses surface' });
    const extras = await mod.snapshotExtras({ circle, seed, viewerId: userId });
    res.json({ seed: circles.toClientSeed(seed, { userId }), ...extras });
  } catch (err) {
    fail(res, err);
  }
});

// Toggle my reaction on a response.
router.post('/:id/seeds/:seedId/responses/:shareId/react', async (req, res) => {
  try {
    const circle = await circleOr404(req, res);
    if (!circle) return;
    const { share } = await gather.reactToResponse({
      circleId: circle.id,
      seedId: req.params.seedId,
      shareId: req.params.shareId,
      userId: userIdOf(req),
    });
    res.json({ share });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;

// --- Vendor callbacks -------------------------------------------------------
//
// Mounted OUTSIDE enforceVerifiedUser (websocket-server.js puts this router at
// /api/circles/hooks ahead of the authenticated mount) — Deepgram has no
// account here. It authenticates on its own `?t=` HMAC and reads its share
// from `?s=`, never from req.instanceId. Same shape as threshold's hooks.

const hooks = express.Router();

hooks.post('/deepgram', async (req, res) => {
  const shareId = String(req.query.s || '');
  const token = String(req.query.t || '');
  if (!shareId || !gatherTranscribe.verifyCallbackToken(shareId, token)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const text = gatherTranscribe.extractTranscript(req.body);
    await gather.attachTranscript({ shareId, text });
    // Always 200 once authenticated: Deepgram retries on a failure status, and
    // an empty or unparseable transcript is not something a retry can improve.
    res.json({ ok: true });
  } catch (err) {
    console.error('[gather] transcript callback failed:', err.message);
    res.json({ ok: true });
  }
});

module.exports.hooks = hooks;
