// The holoscopic.io dashboard's one read: what is waiting on this account in
// each app, when it last used each, and how many invitations it has.
//
// One call rather than a client fan-out, because every per-app "mine" endpoint
// is scoped to its own instance and answers in its own shape — the dashboard
// would have needed seven requests and seven instance ids to draw one page.

const Circle = require('../models/Circle');
const OasGame = require('../models/OasGame');
const User = require('../models/User');
const circles = require('./circles');
const activities = require('./circleActivities');
const invites = require('./invites');
// Registering the modules is a side effect of requiring them; the server has
// already done it by the time this runs, but a script or test may not have.
require('./threshold');
require('./gather');

// The phases in which a live seed asks each member to DO something. Outside
// them notificationFor speaks for news — a reveal, an idle circle — which is
// worth an email but is not "waiting on you".
const ACTION_PHASES = {
  threshold: ['share', 'rank'],
  gather: ['respond'],
};

const ITEM_LIMIT = 10;
// A Spectrum room nobody has touched in this long is abandoned, not in progress.
const SPECTRUM_STALE_MS = 14 * 24 * 60 * 60 * 1000;

const APPS = ['circles', 'threshold', 'synthesis', 'spectrum', 'interview'];

/**
 * What a circle is waiting on this member for.
 *
 * Asks each live seed's own module, through the same hook that decides whether
 * to mail somebody (it returns null for anyone already done), so "waiting on
 * you" here and the email you were sent can never disagree.
 */
async function waitingInCircle(circle, userId) {
  const items = [];
  for (const seed of circles.liveSeeds(circle)) {
    const key = seed.activity || circle.activity;
    if (!(ACTION_PHASES[key] || []).includes(seed.phase)) continue;
    let mod;
    try {
      mod = activities.get(key);
    } catch {
      continue;
    }
    const msg = await mod.notificationFor({ circle, seed, phase: seed.phase, userId });
    if (msg) items.push({ title: msg.subject, path: invites.circlePath(circle) });
  }
  return items;
}

async function forUser(userId) {
  const apps = {};
  const add = (app, items) => {
    if (!items.length) return;
    if (!apps[app]) apps[app] = { count: 0, items: [] };
    apps[app].count += items.length;
    apps[app].items.push(...items);
  };

  const mine = await Circle.find({ 'members.userId': userId, phase: { $ne: 'closed' } })
    .sort({ updatedAt: -1 }).limit(50);
  for (const circle of mine) {
    add(invites.appForCircle(circle), await waitingInCircle(circle, userId));
  }

  // No per-player "done" flag exists for a Spectrum round, so a room still in
  // play is the honest signal: the game is going on and you are in it.
  const games = await OasGame.find({
    'participants.id': userId,
    phase: { $ne: 'complete' },
    updatedAt: { $gt: new Date(Date.now() - SPECTRUM_STALE_MS) },
  }).select('code topic').sort({ updatedAt: -1 }).limit(ITEM_LIMIT).lean();
  add('spectrum', games.map(g => ({ title: `“${g.topic}” is in progress`, path: `/g/${g.code}` })));

  for (const app of Object.keys(apps)) apps[app].items = apps[app].items.slice(0, ITEM_LIMIT);

  const user = await User.findOne({ id: userId }).select('lastUsed').lean();
  const lastUsed = {};
  for (const app of APPS) {
    const at = user?.lastUsed?.[app];
    if (at) lastUsed[app] = new Date(at).toISOString();
  }

  return { apps, lastUsed, invitations: await invites.countPending(userId) };
}

module.exports = { forUser, waitingInCircle, ACTION_PHASES };
