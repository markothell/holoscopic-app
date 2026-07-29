const express = require('express');
const Activity = require('../models/Activity');
const Entry = require('../models/Entry');
const Sequence = require('../models/Sequence');
const FrameOfReference = require('../models/FrameOfReference');
const entries = require('../utils/entries');
const { transact, spend } = require('../utils/holons');
const { notify } = require('../utils/notify');

// ─── Serialization ────────────────────────────────────────────────────────────

function closesAt(activityObj, windowHours) {
  return activityObj.status === 'active' && activityObj.maxEntries > 0 && activityObj.createdAt
    ? new Date(new Date(activityObj.createdAt).getTime() + windowHours * 60 * 60 * 1000)
    : null;
}

function serializeActivity(activity, { entryDocs, windowHours = 168 } = {}) {
  const obj = activity.toObject ? activity.toObject() : { ...activity };
  delete obj._id;
  delete obj.__v;
  return {
    ...obj,
    closesAt: closesAt(obj, windowHours),
    ...(entryDocs ? { entries: entryDocs.map(entries.toClient) } : {}),
  };
}

// ─── Stake settlement ─────────────────────────────────────────────────────────
// Each staker's holons are distributed to entry authors proportional to the
// staker's votes. Unattributed stake (no votes, or leftover fraction) returns
// to the staker. Returns { userId: { received, returned } } for payout notices.

async function settleActivityStakes(activity, activityEntries, instanceId) {
  const summary = {};
  const add = (userId, key, amount) => {
    if (!summary[userId]) summary[userId] = { received: 0, returned: 0 };
    summary[userId][key] += amount;
  };
  const unsettledStakes = (activity.stakes || []).filter(s => !s.settled);
  if (!unsettledStakes.length) return summary;

  for (const stake of unsettledStakes) {
    // Entry authors this staker voted for
    const votedAuthorIds = activityEntries
      .filter(e => (e.voterIds || []).includes(stake.userId))
      .map(e => e.userId);

    const totalVotes = votedAuthorIds.length;
    if (totalVotes === 0) {
      await transact({ userId: stake.userId, instanceId: stake.instanceId || instanceId, type: 'activity_stake_return', amount: stake.amount, refType: 'activity', refId: activity.id });
      add(stake.userId, 'returned', stake.amount);
    } else {
      const perVote = stake.amount / totalVotes;
      const authorTotals = {};
      for (const authorId of votedAuthorIds) {
        authorTotals[authorId] = (authorTotals[authorId] || 0) + perVote;
      }

      let distributed = 0;
      for (const [authorId, amount] of Object.entries(authorTotals)) {
        const rounded = Math.floor(amount);
        if (rounded > 0) {
          await transact({ userId: authorId, instanceId: stake.instanceId || instanceId, type: 'comment_attribution', amount: rounded, refType: 'activity', refId: activity.id });
          distributed += rounded;
          add(authorId, 'received', rounded);
        }
      }

      const remainder = stake.amount - distributed;
      if (remainder > 0) {
        await transact({ userId: stake.userId, instanceId: stake.instanceId || instanceId, type: 'activity_stake_return', amount: remainder, refType: 'activity', refId: activity.id });
        add(stake.userId, 'returned', remainder);
      }
    }

    stake.settled = true;
  }
  return summary;
}

// ─── Close rule ───────────────────────────────────────────────────────────────
// A map settles at the earliest of:
//  (a) complete — all slots filled AND every participant entered and voted
//  (b) activityWindowHours after creation (sweep-on-read, like topic quorum)
// Solo trackers (maxEntries 0) and the instance's topics activity never auto-close.

function isComplete(activity, activityEntries) {
  if (!activity.maxEntries || activity.maxEntries === 0) return false;
  const participants = activity.participants || [];
  if (participants.length < activity.maxEntries) return false;
  for (const p of participants) {
    const entered = activityEntries.some(e => e.userId === p.id && e.position);
    const voted = activityEntries.some(e => (e.voterIds || []).includes(p.id));
    if (!entered || !voted) return false;
  }
  return true;
}

async function closeAndSettle(activity, activityEntries, instanceId, reason) {
  // Claim the activity before paying anything out. The status flip is the
  // claim: it matches only while the activity is still active, so of several
  // concurrent triggers — the periodic sweep, a final vote completing the
  // table, a settle-on-read — exactly one proceeds to settlement.
  //
  // Previously this assigned `status` in memory and saved afterwards, so two
  // triggers could both read 'active', both settle, and both pay.
  const claimed = await Activity.findOneAndUpdate(
    { id: activity.id, status: 'active' },
    { $set: { status: 'completed' } },
    { new: true },
  );
  if (!claimed) return false; // already closed by someone else

  // Settle against the claimed document so stake.settled flags are written on
  // the copy that won, not on a stale in-memory one.
  const summary = await settleActivityStakes(claimed, activityEntries, instanceId);
  await claimed.save();
  // Keep the caller's object consistent with what was persisted.
  activity.status = 'completed';
  // The payout is the payoff — tell every affected player what happened
  for (const [userId, s] of Object.entries(summary)) {
    const parts = [];
    if (s.received > 0) parts.push(`received ◈${s.received} from votes on your entries`);
    if (s.returned > 0) parts.push(`◈${s.returned} of your stake returned`);
    if (!parts.length) continue;
    try {
      await notify({ userId, type: 'activity_closed', message: `"${activity.title}" closed (${reason}) — ${parts.join(', ')}.`, refType: 'activity', refId: activity.id });
    } catch (e) { console.error('[activities] close notify error:', e.message); }
  }
  console.log(`[activities] closed "${activity.title}" (${reason}), settled ${Object.keys(summary).length} players`);
  return true;
}

// sweepExpiredActivities moved to utils/sweeps.js — it is now driven by the
// interval runner rather than by whoever happens to load the activity list.

// Per-activity entry counts for list payloads (one indexed aggregation)
async function entryCounts(activityIds) {
  if (!activityIds.length) return {};
  const counts = await Entry.aggregate([
    { $match: { activityId: { $in: activityIds } } },
    { $group: { _id: '$activityId', n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(counts.map(c => [c._id, c.n]));
}

module.exports = function(io) {
  const router = express.Router();

  const isSoloTrackerMode = (activity) => activity.maxEntries === 0;
  const isActivityCreator = (activity, userId) =>
    activity.author?.userId && activity.author.userId === userId;

  // Shared slot validation for entry submission
  function slotError(activity, userId, slotNumber) {
    if (slotNumber < 1 || !Number.isInteger(slotNumber)) {
      return 'Slot number must be a positive integer';
    }
    if (isSoloTrackerMode(activity)) {
      if (!isActivityCreator(activity, userId)) {
        return 'Only the creator can add entries to this activity';
      }
      return null; // unlimited slots
    }
    // Snapshot uses slotNumber to distinguish questions, not extra entries
    if (activity.activityType !== 'snapshot' && slotNumber > (activity.maxEntries || 1)) {
      return `This activity only allows ${activity.maxEntries || 1} entry slot(s)`;
    }
    return null;
  }

  // Get all activities (admin endpoint - includes drafts)
  // Optional ?createdBy=userId to scope to a specific creator
  //
  // Was public despite the name: enforceVerifiedUser no-ops on GET, and the
  // global limiter used to skip any path containing '/admin', so this was an
  // unauthenticated *and* unthrottled read of every activity including drafts.
  router.get('/admin', require('../middleware/requireAdmin'), async (req, res) => {
    try {
      const query = { instanceId: req.instanceId };
      if (req.query.createdBy) {
        query['author.userId'] = req.query.createdBy;
      }
      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .select('-__v');

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      res.json({ activities: activities.map(a => serializeActivity(a, { windowHours })) });
    } catch (error) {
      console.error('Error fetching admin activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Get all activities (public endpoint - excludes drafts)
  router.get('/', async (req, res) => {
    try {
      // No sweep here. Expiry settlement runs on an interval (jobs/index.js);
      // this used to scan and settle inline on every list request.
      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      const baseFilter = { instanceId: req.instanceId, isDraft: { $ne: true } };
      if (req.query.topicId) baseFilter.topicId = req.query.topicId;
      if (req.query.frameId) baseFilter.frameId = req.query.frameId;
      const activities = await Activity.find(baseFilter)
        .sort({ createdAt: -1 })
        .select('-__v');

      const counts = await entryCounts(activities.map(a => a.id));
      const serialized = activities.map(a => ({
        ...serializeActivity(a, { windowHours }),
        entryCount: counts[a.id] ?? 0,
      }));

      res.json({ activities: serialized, total: serialized.length });
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Get activity by URL name (includes entries — this is the play payload)
  router.get('/by-url/:urlName', async (req, res) => {
    try {
      const activity = await Activity.findOne({ urlName: req.params.urlName }).select('-__v');
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      const topicsActivityId = req.instance?.config?.topicsActivityId || null;
      const entryDocs = await entries.listByActivity(activity.id);

      // Deliberately kept as settle-on-read, unlike the list sweep that moved
      // to jobs/index.js. This one is O(1) — a timestamp comparison on the one
      // activity already loaded — and closeAndSettle now claims atomically, so
      // neither of the reasons the other sweeps were removed applies. It earns
      // its place by making the play page show a settled map immediately
      // instead of up to a sweep interval late.
      if (
        activity.status === 'active' && !activity.isDraft && activity.maxEntries > 0 &&
        activity.id !== topicsActivityId && activity.createdAt &&
        Date.now() - new Date(activity.createdAt).getTime() > windowHours * 60 * 60 * 1000
      ) {
        await closeAndSettle(activity, entryDocs, activity.instanceId, 'time window ended');
      }

      res.json({ activity: serializeActivity(activity, { entryDocs, windowHours }) });
    } catch (error) {
      console.error('Error fetching activity by URL name:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });

  // Get activities a user has participated in.
  // Each activity carries commentCount plus the caller's filled slots
  // (mySlots) so dashboards don't need full entry payloads.
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const activities = await Activity.find({
        instanceId: req.instanceId,
        'participants.id': userId,
        isDraft: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .select('-__v');

      const activityIds = activities.map(a => a.id);
      const [commentRows, myEntries] = await Promise.all([
        activityIds.length
          ? Entry.aggregate([
              { $match: { activityId: { $in: activityIds }, text: { $nin: [null, ''] } } },
              { $group: { _id: '$activityId', n: { $sum: 1 } } },
            ])
          : [],
        activityIds.length
          ? Entry.find({ activityId: { $in: activityIds }, userId, position: { $ne: null } })
              .select('activityId slotNumber').lean()
          : [],
      ]);
      const commentCounts = Object.fromEntries(commentRows.map(r => [r._id, r.n]));
      const slotsByActivity = {};
      for (const e of myEntries) {
        (slotsByActivity[e.activityId] ||= new Set()).add(e.slotNumber ?? 1);
      }

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      res.json({
        activities: activities.map(a => ({
          ...serializeActivity(a, { windowHours }),
          commentCount: commentCounts[a.id] ?? 0,
          mySlots: [...(slotsByActivity[a.id] ?? [])].sort((x, y) => x - y),
        })),
        total: activities.length,
      });
    } catch (error) {
      console.error('Error fetching user activities:', error);
      res.status(500).json({ error: 'Failed to fetch user activities' });
    }
  });

  // Get single activity (includes entries — this is the play payload)
  router.get('/:id', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id }).select('-__v');
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      const entryDocs = await entries.listByActivity(activity.id);
      res.json({ activity: serializeActivity(activity, { entryDocs, windowHours }) });
    } catch (error) {
      console.error('Error fetching activity:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });

  // Create new activity
  router.post('/', async (req, res) => {
    try {
      const {
        title, urlName, activityType,
        mapQuestion, mapQuestion2, xAxis, yAxis,
        commentQuestion, objectNameQuestion,
        preamble, wikiLink, starterData,
        votesPerUser, maxEntries,
        showProfileLinks, showAxisLabels,
        author, frameId, topicId, isPublic, isDraft,
        snapshotQuestions, xAxisPoints, yAxisPoints, xAxisLabels, yAxisLabels,
      } = req.body;

      if (!title || !urlName || !mapQuestion || !commentQuestion) {
        return res.status(400).json({ error: 'Title, URL name, map question, and comment question are required' });
      }
      if (!xAxis || !xAxis.label || !xAxis.min || !xAxis.max) {
        return res.status(400).json({ error: 'X-axis configuration is required' });
      }
      if (!yAxis || !yAxis.label || !yAxis.min || !yAxis.max) {
        return res.status(400).json({ error: 'Y-axis configuration is required' });
      }

      const activity = new Activity({
        instanceId: req.instanceId,
        title: title.trim(),
        urlName: urlName.trim(),
        activityType: activityType || 'dissolve',
        mapQuestion: mapQuestion.trim(),
        mapQuestion2: mapQuestion2 ? mapQuestion2.trim() : '',
        xAxis: { label: xAxis.label.trim(), min: xAxis.min.trim(), max: xAxis.max.trim() },
        yAxis: { label: yAxis.label.trim(), min: yAxis.min.trim(), max: yAxis.max.trim() },
        commentQuestion: commentQuestion.trim(),
        objectNameQuestion: objectNameQuestion ? objectNameQuestion.trim() : 'Name something that represents your perspective',
        preamble: preamble ? preamble.trim() : '',
        wikiLink: wikiLink ? wikiLink.trim() : '',
        starterData: starterData ? starterData.trim() : '',
        votesPerUser: votesPerUser !== null && votesPerUser !== undefined ? Number(votesPerUser) : null,
        maxEntries: maxEntries !== undefined && [0, 1, 2, 4].includes(Number(maxEntries)) ? Number(maxEntries) : 1,
        showProfileLinks: showProfileLinks !== undefined ? showProfileLinks : true,
        showAxisLabels: showAxisLabels !== undefined ? showAxisLabels : true,
        ...(activityType === 'snapshot' && {
          snapshotQuestions: snapshotQuestions || [],
          xAxisPoints: xAxisPoints || 2,
          yAxisPoints: yAxisPoints || 2,
          xAxisLabels: xAxisLabels || [],
          yAxisLabels: yAxisLabels || [],
        }),
        author: author ? { userId: author.userId, name: author.name } : undefined,
        frameId: frameId || null,
        topicId: topicId || null,
        // Game-created maps go live immediately (isDraft: false from the client);
        // admin-created activities keep the draft-then-publish default.
        isDraft: isDraft !== undefined ? !!isDraft : true,
        isPublic: isPublic !== undefined ? !!isPublic : false,
        status: 'active',
        participants: [],
        stakes: [],
      });

      const savedActivity = await activity.save();

      // Reward frame creator when their frame is used
      if (frameId && req.instanceId && req.instance?.config?.holons) {
        try {
          const frame = await FrameOfReference.findOne({ id: frameId }).lean();
          if (frame && frame.createdBy) {
            const rewardAmount = req.instance.config.holons.frameUseReward ?? 5;
            if (rewardAmount > 0) {
              await transact({
                userId: frame.createdBy,
                instanceId: req.instanceId,
                type: 'frame_use_reward',
                amount: rewardAmount,
                refType: 'frame',
                refId: frameId,
              });
            }
          }
        } catch (e) {
          console.error('[activities] frame_use_reward error:', e.message);
        }
      }

      // Materialize seed entries from starter data
      if (savedActivity.starterData) {
        try { await entries.seedFromStarterData(savedActivity, req.instanceId); }
        catch (e) { console.warn('Failed to process starter data:', e.message); }
      }

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      const entryDocs = await entries.listByActivity(savedActivity.id);
      res.status(201).json({ activity: serializeActivity(savedActivity, { entryDocs, windowHours }) });
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({ error: 'Failed to create activity' });
    }
  });

  // Update activity
  router.patch('/:id', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const allowedUpdates = ['title', 'urlName', 'mapQuestion', 'mapQuestion2', 'xAxis', 'yAxis', 'commentQuestion', 'objectNameQuestion', 'preamble', 'wikiLink', 'starterData', 'votesPerUser', 'maxEntries', 'status', 'isPublic', 'showProfileLinks', 'showAxisLabels', 'author', 'snapshotQuestions', 'xAxisPoints', 'yAxisPoints', 'xAxisLabels', 'yAxisLabels', 'frameId', 'topicId'];
      const updates = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          if (key === 'maxEntries') {
            const value = Number(req.body[key]);
            if ([0, 1, 2, 4].includes(value)) updates[key] = value;
          } else {
            updates[key] = req.body[key];
          }
        }
      }

      Object.assign(activity, updates);

      // Settle activity stake pool when transitioning to completed
      if (updates.status === 'completed' && activity.stakes?.length) {
        try {
          const entryDocs = await entries.listByActivity(activity.id);
          await settleActivityStakes(activity, entryDocs, activity.instanceId);
        } catch (e) {
          console.error('[activities] stake settlement error:', e.message);
        }
      }

      const updatedActivity = await activity.save();
      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      res.json({ activity: serializeActivity(updatedActivity, { windowHours }) });
    } catch (error) {
      console.error('Error updating activity:', error);
      res.status(500).json({ error: 'Failed to update activity' });
    }
  });

  // Clear a slot (delete the entry for a specific user + slot)
  // IMPORTANT: Must be before generic DELETE /:id route
  router.delete('/:id/slot', async (req, res) => {
    try {
      const { userId, slotNumber } = req.query;
      if (!userId || !slotNumber) {
        return res.status(400).json({ error: 'User ID and slot number are required' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      await entries.clearSlot({ activityId: activity.id, userId, slotNumber: Number(slotNumber) });

      if (io) {
        io.to(req.params.id).emit('entries_cleared', { userId, slotNumber: Number(slotNumber) });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Error clearing slot:', error);
      res.status(500).json({ error: 'Failed to clear slot' });
    }
  });

  // Delete activity (creator or admin only)
  router.delete('/:id', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const userId = req.headers['x-user-id'];
      const User = require('../models/User');
      const user = userId ? await User.findOne({ id: userId }).lean() : null;
      const isCreator = activity.author?.userId && activity.author.userId === userId;
      if (!isCreator && user?.role !== 'admin') {
        return res.status(403).json({ error: 'Only the creator or an admin can delete this map' });
      }

      // Return all unsettled stakes in full — moderation deletes never
      // redistribute; escrowed holons go home.
      for (const stake of (activity.stakes || []).filter(s => !s.settled)) {
        try {
          await transact({ userId: stake.userId, instanceId: stake.instanceId || req.instanceId, type: 'activity_stake_return', amount: stake.amount, refType: 'activity', refId: activity.id });
        } catch (e) { console.error('[activities] delete refund error:', e.message); }
      }

      await entries.deleteByActivity(activity.id);
      await Activity.deleteOne({ id: req.params.id });

      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting activity:', error);
      res.status(500).json({ error: 'Failed to delete activity' });
    }
  });

  // Toggle draft status
  router.patch('/:id/draft', async (req, res) => {
    try {
      const { isDraft } = req.body;
      if (typeof isDraft !== 'boolean') {
        return res.status(400).json({ error: 'isDraft must be a boolean value' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      activity.isDraft = isDraft;
      const updatedActivity = await activity.save();
      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      res.json({ activity: serializeActivity(updatedActivity, { windowHours }) });
    } catch (error) {
      console.error('Error toggling draft status:', error);
      res.status(500).json({ error: 'Failed to toggle draft status' });
    }
  });

  // Join activity (adds membership + stakes holons into the pool)
  router.post('/:id/participants', async (req, res) => {
    try {
      const { userId, username, sequenceId } = req.body;
      if (!userId || !username) {
        return res.status(400).json({ error: 'User ID and username are required' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      let resolvedUsername = username;
      if (sequenceId) {
        const sequence = await Sequence.findOne({ id: sequenceId });
        if (sequence && sequence.requireInvitation) {
          const member = sequence.members.find(m => m.userId === userId);
          if (!member) {
            return res.status(403).json({ error: 'You must be enrolled in this sequence to participate' });
          }
          if (member.username) resolvedUsername = member.username;
        }
      }

      await activity.addParticipant(userId, resolvedUsername);

      // Stake holons into activity pool (skip if already staked or no instance config).
      // Explore mode has no economy — record no stake so nothing needs settling.
      const alreadyStaked = (activity.stakes || []).some(s => s.userId === userId);
      if (!alreadyStaked && req.instanceId && req.instance?.config?.holons && req.instance?.config?.mode !== 'explore') {
        const stakeAmount = req.instance.config.holons.activityStakeAmount ?? 0;
        if (stakeAmount > 0) {
          try {
            await spend({ userId, instanceId: req.instanceId, type: 'activity_stake', amount: stakeAmount, refType: 'activity', refId: activity.id });
            activity.stakes.push({ userId, instanceId: req.instanceId, amount: stakeAmount });
            await activity.save();
          } catch (e) {
            // Insufficient holons — allow join without stake (stake is optional participation mechanism)
            console.warn('[activities] activity_stake skipped for', userId, ':', e.message);
          }
        }
      }

      if (io) {
        io.to(req.params.id).emit('participant_joined', {
          participant: { id: userId, username: resolvedUsername, joinedAt: new Date() },
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Error adding participant:', error);
      res.status(500).json({ error: 'Failed to add participant' });
    }
  });

  // Submit an entry — position and/or text for a (user, slot, question).
  // The single write path for participation content; WebSocket submissions
  // funnel through the same utils/entries functions.
  router.post('/:id/entry', async (req, res) => {
    try {
      const { userId, slotNumber = 1, questionId = null, position, objectName, text } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      if (position !== undefined && position !== null) {
        if (typeof position.x !== 'number' || typeof position.y !== 'number' ||
            position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) {
          return res.status(400).json({ error: 'Position coordinates must be between 0 and 1' });
        }
      }
      if (text !== undefined && text !== null) {
        if (typeof text !== 'string' || text.length > 500) {
          return res.status(400).json({ error: 'Comment must be less than 500 characters' });
        }
      }
      if (position == null && (text == null || !String(text).trim())) {
        return res.status(400).json({ error: 'An entry needs a position or text' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }
      if (activity.status !== 'active') {
        return res.status(400).json({ error: 'Activity is not active' });
      }

      const slotProblem = slotError(activity, userId, slotNumber);
      if (slotProblem) {
        const status = slotProblem.startsWith('Only the creator') ? 403 : 400;
        return res.status(status).json({ error: slotProblem });
      }

      const participant = activity.participants.find(p => p.id === userId);
      if (!participant) {
        return res.status(400).json({ error: 'User is not a participant in this activity' });
      }

      const entry = await entries.upsertEntry({
        activity,
        instanceId: activity.instanceId || req.instanceId,
        userId,
        username: participant.username,
        slotNumber,
        questionId,
        position: position ?? undefined,
        objectName,
        text: text != null ? String(text).trim() : undefined,
      });

      if (io) {
        io.to(req.params.id).emit('entry_upserted', { entry: entries.toClient(entry) });
      }

      res.json({ entry: entries.toClient(entry) });
    } catch (error) {
      console.error('Error submitting entry:', error);
      res.status(500).json({ error: 'Failed to submit entry' });
    }
  });

  // Vote on an entry (toggle)
  router.post('/:id/entries/:entryId/vote', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }
      if (activity.status !== 'active') {
        return res.status(400).json({ error: 'Activity is not active' });
      }

      const participant = activity.participants.find(p => p.id === userId);
      if (!participant) {
        return res.status(400).json({ error: 'User is not a participant in this activity' });
      }

      const entry = await entries.voteEntry({ activity, entryId: req.params.entryId, userId });

      if (io) {
        io.to(req.params.id).emit('entry_voted', { entry: entries.toClient(entry) });
      }

      // Complete rule: full table + everyone entered and voted → settle now
      const entryDocs = await entries.listByActivity(activity.id);
      if (isComplete(activity, entryDocs)) {
        await closeAndSettle(activity, entryDocs, activity.instanceId, 'everyone has played');
        if (io) {
          const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
          io.to(req.params.id).emit('activity_updated', {
            activity: serializeActivity(activity, { entryDocs, windowHours }),
          });
        }
      }

      res.json({ entry: entries.toClient(entry) });
    } catch (error) {
      const businessLogicErrors = [
        'Vote limit reached',
        'Cannot vote on your own entry',
        'Entry not found',
      ];
      if (error.message && businessLogicErrors.some(msg => error.message.includes(msg))) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error voting on entry:', error);
      res.status(500).json({ error: error.message || 'Failed to vote on entry' });
    }
  });

  // Submit email
  router.post('/:id/email', async (req, res) => {
    try {
      const { email, userId } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email is required' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const existingEmail = activity.emails?.find(e => e.email === email.toLowerCase());
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already submitted for this activity' });
      }

      if (!activity.emails) activity.emails = [];
      activity.emails.push({
        email: email.toLowerCase().trim(),
        userId: userId || null,
        timestamp: new Date(),
      });
      await activity.save();

      res.json({ ok: true });
    } catch (error) {
      console.error('Error submitting email:', error);
      res.status(500).json({ error: 'Failed to submit email' });
    }
  });

  // Get analytics stats for a specific activity
  router.get('/:id/analytics', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const entryDocs = await entries.listByActivity(activity.id);
      res.json({
        participants: activity.participants.length,
        completedMappings: entryDocs.filter(e => e.position).length,
        comments: entryDocs.filter(e => e.text && e.text.trim()).length,
        emails: (activity.emails || []).length,
        votes: entryDocs.reduce((total, e) => total + (e.voteCount || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching activity analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Re-materialize seed entries from the activity's starterData
  router.post('/:id/sync-starter-data', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      try {
        await entries.seedFromStarterData(activity, activity.instanceId || req.instanceId);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }

      const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
      const entryDocs = await entries.listByActivity(activity.id);
      res.json({ activity: serializeActivity(activity, { entryDocs, windowHours }) });
    } catch (error) {
      console.error('Error syncing starter data:', error);
      res.status(500).json({ error: 'Failed to sync starter data' });
    }
  });

  // Remove an entry — moderation (admin only)
  const requireAdmin = require('../middleware/requireAdmin');
  router.delete('/:id/entries/:entryId', requireAdmin, async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.id });
      if (!activity) return res.status(404).json({ error: 'Activity not found' });

      const result = await Entry.deleteOne({ id: req.params.entryId, activityId: activity.id });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      if (io) io.to(req.params.id).emit('entry_removed', { entryId: req.params.entryId });
      console.log(`[activities] entry ${req.params.entryId} removed by admin ${req.adminUser.email}`);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

// Exported for the sweep runner (utils/sweeps.js), which is injected with it
// rather than importing it — utils/ must not depend on routes/.
module.exports.closeAndSettle = closeAndSettle;
