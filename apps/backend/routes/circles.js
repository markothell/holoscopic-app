const express = require('express');
const circles = require('../utils/circles');
const Circle = require('../models/Circle');
const User = require('../models/User');

// /api/circles — the ACTIVITY-AGNOSTIC circle surface (PLATFORM.md M8's
// promotion, pulled forward by consumer #2: the circles app at
// circles.holoscopic.io). Everything here is generic over the activity a
// circle runs: the snapshot delegates per-activity content to the module's
// snapshotExtras/participation hooks, so a new activity changes nothing in
// this file — which is the invariant (§2) applied to routing.
//
// What does NOT live here: activity verbs (telling, sorting, revealing —
// /api/threshold), circle creation (the platform admin and Threshold's /new,
// deliberately — hosting is invitation-only per P15), and the notification
// surfaces (unmoved until a second consumer needs them).
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

module.exports = router;
