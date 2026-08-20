const express = require('express');
const circles = require('../utils/circles');
// Requiring gather registers the 'gather' activity module (PRIMITIVES.md §9)
// before startJobs() arms the tick — same load-order contract as threshold.
const gather = require('../utils/gather');
const gatherTranscribe = require('../utils/gatherTranscribe');
const Circle = require('../models/Circle');
const User = require('../models/User');

// /api/circles — the ACTIVITY-AGNOSTIC circle surface (PLATFORM.md M8's
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
// There is deliberately NO assertOwnApp gate. resolveInstance never fails,
// but every read and write here resolves through an (instanceId, key) lookup,
// so a request that fell through to the default instance finds no circle and
// 404s cleanly — nothing to misattribute and nothing to pollute. Revisit if a
// route is ever added whose lookup is not instance-scoped.
//
// Mounted behind enforceVerifiedUser: circles are member spaces and every
// caller has an account (P18 — accounts are Holoscopic accounts).

const router = express.Router();
const store = circles.mongoStore;

function userIdOf(req) {
  return req.verifiedUserId || req.headers['x-user-id'] || null;
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
    const after = await circles.joinCircle({
      store, circleId: circle.id, userId: userIdOf(req),
      username: await displayNameFor(req), email: req.body.email || '',
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

// --- Generic seed verbs (activity-agnostic: the machine validates through the
// --- seed's own module, so these serve threshold topics and gather asks alike)

// Post an activity/topic into the circle's queue. `activity` names the module
// for THIS seed (PRIMITIVES.md §9 — a circle runs mixed activities); omitted,
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

// --- Gather verbs (the builder's single-round activity — PRIMITIVES.md §9)

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
