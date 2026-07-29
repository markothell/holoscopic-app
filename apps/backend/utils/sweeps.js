// Periodic settlement: topic quorum, topic expiry, activity window expiry.
//
// These used to run inline on GET /api/topics, GET /api/topics/:id and
// GET /api/activities — "sweep on read". Two problems with that:
//
//   1. Cost scaled with traffic, not with work. Every reader paid for the
//      sweep, and a topic expiring with 40 supporters cost ~160 round-trips
//      inside somebody's GET.
//   2. There was no lock and no conditional write. Concurrent readers all
//      matched `status: 'nominated'` before any of them wrote, so each one
//      issued the same payout. The holon economy could mint tokens under
//      nothing more exotic than two people loading a page together.
//
// The fix for (1) is the interval runner in jobs/index.js. The fix for (2) is
// here, and it is the important one: every state change below is a CONDITIONAL
// update that also serves as the claim. A payout happens only for the caller
// whose update actually matched. That holds whether one process is running or
// five, so scaling out later cannot reintroduce double payment — the lock is
// just an efficiency measure on top.
const Topic = require('../models/Topic');
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');
const Instance = require('../models/Instance');
const { transact } = require('./holons');
const { notify } = require('./notify');
const entries = require('./entries');

// Bounded work per tick, so a backlog drains steadily instead of arriving as
// one enormous burst of writes.
const INSTANCES_PER_TICK = 50;
const TOPICS_PER_TICK = 25;
const ACTIVITIES_PER_TICK = 25;

/**
 * Confirm topics that have reached the support threshold.
 * The status flip is the claim; only the winner pays the reward.
 */
async function sweepQuorum(instanceId, config) {
  const threshold = config?.quorum?.topicSupportThreshold;
  if (!threshold) return 0;

  const candidates = await Topic
    .find({ instanceId, status: 'nominated' })
    .limit(TOPICS_PER_TICK);

  let confirmed = 0;
  for (const topic of candidates) {
    if (topic.supporters.length < threshold) continue;

    const pool = config.holons.nominationCost
      + topic.supporters.reduce((sum, s) => sum + s.holonsWagered, 0);

    // Claim: matches only while still 'nominated'.
    const claimed = await Topic.findOneAndUpdate(
      { id: topic.id, status: 'nominated' },
      { $set: { status: 'confirmed', confirmedAt: new Date(), holonPool: pool } },
      { new: true },
    );
    if (!claimed) continue; // someone else confirmed it first

    confirmed++;
    await transact({
      userId: claimed.nominatedBy, instanceId,
      type: 'session_host_reward', amount: config.holons.topicQuorumReward,
      refType: 'topic', refId: claimed.id,
    });
    await notify({
      userId: claimed.nominatedBy, type: 'topic_confirmed',
      message: `Your topic "${claimed.title}" reached quorum. Create an activity to start mapping.`,
      refType: 'topic', refId: claimed.id,
    });
  }
  return confirmed;
}

/**
 * Expire topics past their deadline and refund every wager.
 */
async function sweepExpired(instanceId, config) {
  const candidates = await Topic
    .find({ instanceId, status: 'nominated', expiresAt: { $lte: new Date() } })
    .limit(TOPICS_PER_TICK);

  let expired = 0;
  for (const topic of candidates) {
    const claimed = await Topic.findOneAndUpdate(
      { id: topic.id, status: 'nominated' },
      { $set: { status: 'expired' } },
      { new: true },
    );
    if (!claimed) continue;

    expired++;
    await transact({
      userId: claimed.nominatedBy, instanceId,
      type: 'nomination_return', amount: config.holons.nominationCost,
      refType: 'topic', refId: claimed.id,
    });
    for (const s of claimed.supporters) {
      await transact({
        userId: s.userId, instanceId,
        type: 'support_return', amount: s.holonsWagered,
        refType: 'topic', refId: claimed.id,
      });
    }
  }
  return expired;
}

/**
 * Settle activities whose window has closed.
 *
 * `closeAndSettle` is injected rather than imported: it lives in
 * routes/activities.js alongside the stake-distribution rules, and importing
 * it here would make routes and utils mutually dependent.
 */
async function sweepActivities(instanceId, config, closeAndSettle) {
  if (!closeAndSettle) return 0;

  const hours = config?.quorum?.activityWindowHours ?? 168;
  const topicsActivityId = config?.topicsActivityId || null;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const candidates = await Activity.find({
    instanceId,
    status: 'active',
    isDraft: { $ne: true },
    maxEntries: { $gt: 0 },
    createdAt: { $lte: cutoff },
    ...(topicsActivityId ? { id: { $ne: topicsActivityId } } : {}),
  }).limit(ACTIVITIES_PER_TICK);

  if (!candidates.length) return 0;

  // Maps inside an active pattern session follow the session's pace, not the
  // standalone window — never force-settle them mid-session.
  const activeSeqs = await Sequence.find({ status: 'active' }).select('activities').lean();
  const inSession = new Set(activeSeqs.flatMap(s => (s.activities || []).map(a => a.activityId)));

  let closed = 0;
  for (const activity of candidates) {
    if (inSession.has(activity.id)) continue;
    try {
      const activityEntries = await entries.listByActivity(activity.id);
      // closeAndSettle claims the activity itself, so a concurrent vote-driven
      // close and this sweep cannot both settle it.
      const didClose = await closeAndSettle(
        activity, activityEntries, activity.instanceId, 'time window ended',
      );
      if (didClose !== false) closed++;
    } catch (e) {
      console.error(`[sweeps] activity ${activity.id}:`, e.message);
    }
  }
  return closed;
}

/**
 * One pass over every active instance.
 */
async function runSweeps({ closeAndSettle } = {}) {
  const instances = await Instance
    .find({ active: true })
    .select('id config')
    .limit(INSTANCES_PER_TICK)
    .lean();

  const totals = { confirmed: 0, expired: 0, closed: 0, instances: instances.length };

  for (const inst of instances) {
    const config = inst.config || {};
    try {
      // Explore-mode instances run with the economy off; the holon funnel
      // no-ops for them anyway, but skipping avoids pointless queries.
      if (config.mode === 'explore') continue;
      totals.expired += await sweepExpired(inst.id, config);
      totals.confirmed += await sweepQuorum(inst.id, config);
      totals.closed += await sweepActivities(inst.id, config, closeAndSettle);
    } catch (e) {
      console.error(`[sweeps] instance ${inst.id}:`, e.message);
    }
  }

  if (totals.confirmed || totals.expired || totals.closed) {
    console.log(
      `[sweeps] confirmed ${totals.confirmed}, expired ${totals.expired}, ` +
      `closed ${totals.closed} across ${totals.instances} instances`
    );
  }
  return totals;
}

module.exports = { runSweeps, sweepQuorum, sweepExpired, sweepActivities };
