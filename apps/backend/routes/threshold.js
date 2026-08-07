const express = require('express');
const circles = require('../utils/circles');
// Requiring this registers the 'threshold' activity module (see the bottom of
// utils/threshold.js). This router is mounted inside loadAPIRoutes() BEFORE
// startJobs() runs, which is what guarantees the round ticker can never reach
// a threshold circle whose module is missing.
const threshold = require('../utils/threshold');
const thresholdTranscribe = require('../utils/thresholdTranscribe');
const Circle = require('../models/Circle');

// Threshold — REST surface. Thin wrappers over utils/circles.js (the generic
// round machine) and utils/threshold.js (the activity: shares, rankings, the
// gradient). Design in apps/threshold/PLAN.md §8.
//
// Mounted behind resolveInstance + attachVerifiedUser + enforceVerifiedUser:
// every identity-bearing write carries a verified account token whose sub
// matches x-user-id. Unlike Chorus, this app has accounts by design (D6) —
// asynchronous rounds need an identity that persists and an address to notify.
//
// No realtime in v1 (D14). Nothing here is synchronous; the snapshot re-fetched
// on focus is enough, and there are no socket rooms.

const router = express.Router();

const store = threshold.mongoStore;

function userIdOf(req) {
  return req.verifiedUserId || req.headers['x-user-id'] || null;
}

function usernameOf(req) {
  return req.body?.username || req.verifiedUsername || 'Member';
}

// resolveInstance never fails — an unrecognised x-instance-id falls through to
// getDefault(), an interView edition. Every router whose data is meaningless
// outside its own app has to check for itself; routes/memorial.js learned this
// the hard way, by writing tag rows into whatever instance happened to answer.
function assertOwnApp(req, res) {
  if (req.instance?.app !== 'threshold') {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  return true;
}

// 404 rather than 403 throughout, so an absent circle and one you are not in
// look the same from outside.
function fail(res, err) {
  const message = err.message || 'Something went wrong';
  if (/not found/i.test(message)) return res.status(404).json({ error: message });
  if (/Not a member|invitation only|Only the/i.test(message)) return res.status(403).json({ error: message });
  return res.status(400).json({ error: message });
}

// Existence and instance scoping only. The document it returns is a DIFFERENT
// Mongoose instance from the one the funnel loads through the store, so it goes
// stale the moment a funnel call writes — see `fresh()`.
async function loadCircle(req, res) {
  const circle = await Circle.findOne({ id: req.params.id, instanceId: req.instanceId });
  if (!circle) {
    res.status(404).json({ error: 'Circle not found' });
    return null;
  }
  return circle;
}

/**
 * Serialize what the FUNNEL returned, never the document this route loaded.
 *
 * Every funnel call re-loads the circle through the store, mutates that copy and
 * saves it — so the copy `loadCircle` handed back never sees the write. Every
 * mutation route here used to answer with that copy, which meant the response to
 * "post a topic" was the circle as it stood before the topic, and the response
 * to "support this" carried the old count. Invisible wherever the client
 * re-fetches, and wrong the moment one trusts the answer.
 */
function fresh(result, fallback) {
  if (!result) return fallback;
  return result.circle || (result.id ? result : fallback);
}

// --- circles ---------------------------------------------------------------

router.post('/circles', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await circles.createCircle({
      store,
      instanceId: req.instanceId,
      activity: 'threshold',
      title: req.body.title,
      urlName: req.body.urlName,
      createdBy: userIdOf(req),
      creatorName: usernameOf(req),
      creatorEmail: req.body.email || '',
      mode: req.body.mode === 'single' ? 'single' : 'circle',
      config: req.body.config || {},
      seedPayload: req.body.seed || null,
      invitedEmails: req.body.invitedEmails || [],
      requireInvitation: req.body.requireInvitation !== false,
    });
    res.status(201).json({ circle: circles.toClient(circle, { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/circles/:urlName', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await Circle.findOne({ instanceId: req.instanceId, urlName: req.params.urlName });
    if (!circle) return res.status(404).json({ error: 'Circle not found' });

    // Sweep on read, as a fallback to the tick — not the primary path (§3.5),
    // but a page load should never show a phase the clock has already ended.
    await circles.evaluate({ store, circle });

    const userId = userIdOf(req);
    const payload = circles.toClient(circle, { userId });

    // The shell — title, phase, member count — stays readable to anyone signed
    // in, because somebody following an invitation has to be able to see what
    // they are being asked to join before they join it. The STORIES do not:
    // those need membership, and toClient carries no share content.
    const seed = circles.activeSeed(circle);
    if (seed && payload.isMember) {
      payload.shares = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: userId });
      const ranking = await store.findRanking(seed.id, userId);
      payload.myRanking = ranking
        ? { placements: ranking.placements, submittedAt: ranking.submittedAt }
        : null;

      // "What is waiting on me" — DERIVED, never stored (D32). The two lines
      // above already carry everything it needs, and the difference between
      // them is the answer. It is also why a member who joined in week six
      // needs no special handling: they have no ranking, so everything reads as
      // waiting. Do NOT add a per-share "heard it" flag to get this.
      //
      // Your own stories need no special case here: opening the rank phase
      // placed them (utils/threshold.js#preplaceOwnStories, D22), so they are
      // already in `placements` and drop out of this by themselves.
      const placed = new Set((ranking?.placements || []).map(p => p.shareId));
      payload.waitingShareIds = seed.phase === 'rank'
        ? payload.shares.filter(s => !placed.has(s.id)).map(s => s.id)
        : [];
    }
    res.json({ circle: payload });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/circles/:id/join', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const after = await circles.joinCircle({
      store, circleId: circle.id, userId: userIdOf(req),
      username: usernameOf(req), email: req.body.email || '',
    });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/circles/:id/start', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const result = await circles.startCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(result, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Manual advance — a first-class control, not a rescue hatch (§3.3, D16).
// Permission (creator, or the live seed's author) is enforced in the funnel.
router.post('/circles/:id/advance', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const after = await circles.advanceCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Drop the live topic and move to the next. Creator only, enforced in the
// funnel. A skipped topic reveals what it has (D30).
router.post('/circles/:id/skip', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const after = await circles.skipSeed({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// The only way a circle finishes (D29).
router.post('/circles/:id/close', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const after = await circles.closeCircle({ store, circleId: circle.id, userId: userIdOf(req) });
    res.json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Post a topic. Any member, any time — the queue never closes (D27), and an
// idle circle starts on whatever just arrived. `seedId` edits one of your own
// that has not run yet.
router.post('/circles/:id/seeds', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    const after = await circles.addSeed({
      store,
      circleId: circle.id,
      userId: userIdOf(req),
      payload: req.body.seed || req.body,
      seedId: req.body.seedId || null,
    });
    res.status(201).json({ circle: circles.toClient(fresh(after, circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

// Readable at ANY time (D29) — a record of the conversation so far, never a
// terminal state you unlock.
router.get('/circles/:id/result', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const circle = await loadCircle(req, res);
    if (!circle) return;
    threshold.assertMember(circle, userIdOf(req));
    res.json({ result: threshold.circleResult(circle) });
  } catch (err) {
    fail(res, err);
  }
});

// --- one seed's cycle -------------------------------------------------------

// A seed id is unique across circles, so these routes find the circle by it
// rather than making the client carry both.
async function loadSeed(req, res) {
  const circle = await Circle.findOne({ instanceId: req.instanceId, 'seeds.id': req.params.seedId });
  if (!circle) {
    res.status(404).json({ error: 'Topic not found' });
    return null;
  }
  return { circle, seed: circle.seeds.find(s => s.id === req.params.seedId) };
}

// Toggle my support for a queued topic. One per member, freely taken back —
// the count is what orders the queue (D27).
router.put('/seeds/:seedId/support', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const after = await circles.supportSeed({
      store, circleId: found.circle.id, seedId: found.seed.id, userId: userIdOf(req),
    });
    res.json({
      supported: after.supported,
      circle: circles.toClient(fresh(after, found.circle), { userId: userIdOf(req) }),
    });
  } catch (err) {
    fail(res, err);
  }
});

// Move a queued topic to the front, over the support order (D30). Creator only,
// enforced in the funnel.
router.post('/seeds/:seedId/promote', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const after = await circles.promoteSeed({
      store, circleId: found.circle.id, seedId: found.seed.id, userId: userIdOf(req),
    });
    res.json({ circle: circles.toClient(fresh(after, found.circle), { userId: userIdOf(req) }) });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/seeds/:seedId/shares', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const shares = await threshold.listShares({
      store, circle: found.circle, seedId: found.seed.id, viewerId: userIdOf(req),
    });
    res.json({ shares });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/seeds/:seedId/shares', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const share = await threshold.submitShare({
      store,
      circleId: found.circle.id,
      seedId: found.seed.id,
      userId: userIdOf(req),
      username: usernameOf(req),
      pole: req.body.pole,
      title: req.body.title || '',
      text: req.body.text || '',
      audio: req.body.audio || null,
    });
    res.status(201).json({ share: threshold.toClientShare(share, { viewerId: userIdOf(req), attributed: true }) });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/seeds/:seedId/shares/:pole', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    await threshold.deleteShare({
      store, circleId: found.circle.id, seedId: found.seed.id,
      userId: userIdOf(req), pole: req.params.pole,
    });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// Save progress while sorting. Partial is expected — this is what "sort as you
// listen" writes, and nothing here counts toward advancement.
router.put('/seeds/:seedId/ranking', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const ranking = await threshold.saveRankingDraft({
      store, circleId: found.circle.id, seedId: found.seed.id,
      userId: userIdOf(req), placements: req.body.placements,
    });
    res.json({ ranking: { placements: ranking.placements, submittedAt: ranking.submittedAt } });
  } catch (err) {
    fail(res, err);
  }
});

// The final submit. Complete or nothing (D11).
router.post('/seeds/:seedId/ranking', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    const ranking = await threshold.submitRanking({
      store, circleId: found.circle.id, seedId: found.seed.id,
      userId: userIdOf(req), placements: req.body.placements,
    });
    res.status(201).json({ ranking: { placements: ranking.placements, submittedAt: ranking.submittedAt } });
  } catch (err) {
    fail(res, err);
  }
});

router.get('/seeds/:seedId/result', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
  try {
    const found = await loadSeed(req, res);
    if (!found) return;
    threshold.assertMember(found.circle, userIdOf(req));
    // A skipped topic is revealed too — it kept every story it had.
    if (!circles.DONE_PHASES.includes(found.seed.phase) || !found.seed.result) {
      return res.status(404).json({ error: 'This topic has not been revealed yet' });
    }
    const shares = await threshold.listShares({
      store, circle: found.circle, seedId: found.seed.id, viewerId: userIdOf(req),
    });
    res.json({ result: found.seed.result, shares, seed: circles.toClientSeed(found.seed) });
  } catch (err) {
    fail(res, err);
  }
});

// --- the Deepgram callback --------------------------------------------------
//
// Mounted OUTSIDE the app guard and outside enforceVerifiedUser (see the export
// at the bottom): Deepgram has no account here and sends none of our headers.
//
// It therefore reads its share from `?s=` and NEVER from req.instanceId —
// resolveInstance never fails, so it would fall through to the default interView
// edition and this handler would write a transcript into whatever answered.
// The `?t=` HMAC is the only thing authenticating the caller; without it anyone
// who learned the URL could rewrite what somebody said.
const hooks = express.Router();

hooks.post('/deepgram', async (req, res) => {
  const shareId = String(req.query.s || '');
  const token = String(req.query.t || '');
  if (!shareId || !thresholdTranscribe.verifyCallbackToken(shareId, token)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const text = thresholdTranscribe.extractTranscript(req.body);
    await threshold.attachTranscript({ store, shareId, text });
    // Always 200 once authenticated: Deepgram retries on a failure status, and
    // an empty or unparseable transcript is not something a retry can improve.
    res.json({ ok: true });
  } catch (err) {
    console.error('[threshold] transcript callback failed:', err.message);
    res.json({ ok: true });
  }
});

// --- mine -------------------------------------------------------------------

router.get('/me/circles', async (req, res) => {
  if (!assertOwnApp(req, res)) return;
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

// The router the app mounts behind enforceVerifiedUser, plus the webhook that
// must NOT sit behind it — Deepgram carries no account token.
module.exports = router;
module.exports.hooks = hooks;
