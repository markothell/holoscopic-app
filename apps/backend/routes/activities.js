const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');
const FrameOfReference = require('../models/FrameOfReference');
const { transact, spend } = require('../utils/holons');
const { notify } = require('../utils/notify');

// Settle the stake pool when an activity closes:
// Each staker's holons are distributed to comment authors proportional to their votes.
// Unattributed stake (no votes cast, or leftover fraction) returns to the staker.
// Returns a per-user summary { userId: { received, returned } } for visible payouts.
async function settleActivityStakes(activity, instanceId) {
  const summary = {};
  const add = (userId, key, amount) => {
    if (!summary[userId]) summary[userId] = { received: 0, returned: 0 };
    summary[userId][key] += amount;
  };
  const unsettledStakes = (activity.stakes || []).filter(s => !s.settled);
  if (!unsettledStakes.length) return summary;

  // Build a map of userId → commentAuthorId for comments they voted on
  const commentById = {};
  for (const c of activity.comments || []) {
    commentById[c.id] = c.userId;
  }

  for (const stake of unsettledStakes) {
    // Find which comments this staker voted on
    const votedCommentAuthorIds = [];
    for (const c of activity.comments || []) {
      if ((c.votes || []).some(v => v.userId === stake.userId)) {
        votedCommentAuthorIds.push(c.userId);
      }
    }

    const totalVotes = votedCommentAuthorIds.length;
    if (totalVotes === 0) {
      // No votes cast — full stake returned
      await transact({ userId: stake.userId, instanceId: stake.instanceId || instanceId, type: 'activity_stake_return', amount: stake.amount, refType: 'activity', refId: activity.id });
      add(stake.userId, 'returned', stake.amount);
    } else {
      // Attribute stake equally across voted authors
      const perVote = stake.amount / totalVotes;
      // Group by author to aggregate
      const authorTotals = {};
      for (const authorId of votedCommentAuthorIds) {
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

      // Return rounding remainder to staker
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

function isComplete(activity) {
  if (!activity.maxEntries || activity.maxEntries === 0) return false;
  const participants = activity.participants || [];
  if (participants.length < activity.maxEntries) return false;
  for (const p of participants) {
    const entered = (activity.ratings || []).some(r => r.userId === p.id);
    const voted = (activity.comments || []).some(c => (c.votes || []).some(v => v.userId === p.id));
    if (!entered || !voted) return false;
  }
  return true;
}

async function closeAndSettle(activity, instanceId, reason) {
  activity.status = 'completed';
  const summary = await settleActivityStakes(activity, instanceId);
  await activity.save();
  // The payout is the payoff — tell every affected player what happened
  for (const [userId, s] of Object.entries(summary)) {
    const parts = [];
    if (s.received > 0) parts.push(`received ◈${s.received} from votes on your comments`);
    if (s.returned > 0) parts.push(`◈${s.returned} of your stake returned`);
    if (!parts.length) continue;
    try {
      await notify({ userId, type: 'activity_closed', message: `"${activity.title}" closed (${reason}) — ${parts.join(', ')}.`, refType: 'activity', refId: activity.id });
    } catch (e) { console.error('[activities] close notify error:', e.message); }
  }
  console.log(`[activities] closed "${activity.title}" (${reason}), settled ${Object.keys(summary).length} players`);
}

async function sweepExpiredActivities(req) {
  const hours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
  const topicsActivityId = req.instance?.config?.topicsActivityId || null;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const expired = await Activity.find({
    status: 'active',
    isDraft: { $ne: true },
    maxEntries: { $gt: 0 },
    createdAt: { $lte: cutoff },
    ...(topicsActivityId ? { id: { $ne: topicsActivityId } } : {}),
  });
  if (!expired.length) return 0;
  // Maps inside an active pattern session follow the session's pace,
  // not the standalone window — never force-settle them mid-session.
  const activeSeqs = await Sequence.find({ status: 'active' }).select('activities').lean();
  const inSession = new Set(activeSeqs.flatMap(s => (s.activities || []).map(a => a.activityId)));
  for (const activity of expired) {
    if (inSession.has(activity.id)) continue;
    try { await closeAndSettle(activity, req.instanceId, 'time window ended'); }
    catch (e) { console.error('[activities] sweep close error:', e.message); }
  }
  return expired.length;
}

module.exports = function(io) {
  const router = express.Router();

  // Helper to check if activity is in solo tracker mode
  const isSoloTrackerMode = (activity) => activity.maxEntries === 0;

  // Helper to check if user is the activity creator
  const isActivityCreator = (activity, userId) => {
    return activity.author?.userId && activity.author.userId === userId;
  };

// Get all activities (admin endpoint - includes drafts)
// Optional ?createdBy=userId to scope to a specific creator
router.get('/admin', async (req, res) => {
  try {
    const query = {};
    if (req.query.createdBy) {
      query['author.userId'] = req.query.createdBy;
    }
    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .select('-__v');

    // Use the custom id field, not MongoDB's _id
    const transformedActivities = activities.map(activity => {
      const activityObj = activity.toObject();
      return {
        ...activityObj,
        // Keep the custom id field if it exists, otherwise fallback to _id
        id: activityObj.id || activity._id.toString(),
        // Ensure isDraft field exists with default false for existing activities
        isDraft: activityObj.isDraft !== undefined ? activityObj.isDraft : false
      };
    });
    
    res.json({
      success: true,
      data: {
        activities: transformedActivities
      }
    });
  } catch (error) {
    console.error('Error fetching admin activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities'
    });
  }
});

// Get all activities (public endpoint - excludes drafts)
router.get('/', async (req, res) => {
  try {
    // Settle any maps whose time window has ended (sweep-on-read, like quorum)
    await sweepExpiredActivities(req);

    const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
    const baseFilter = { $or: [{ isDraft: { $ne: true } }, { isDraft: { $exists: false } }] };
    if (req.query.topicId) baseFilter.topicId = req.query.topicId;
    if (req.query.frameId) baseFilter.frameId = req.query.frameId;
    // Only show non-draft activities to public (treat missing isDraft as false)
    const activities = await Activity.find(baseFilter)
      .sort({ createdAt: -1 })
      .select('-__v');

    // Use the custom id field, not MongoDB's _id
    const transformedActivities = activities.map(activity => {
      const activityObj = activity.toObject();
      return {
        ...activityObj,
        // Keep the custom id field if it exists, otherwise fallback to _id
        id: activityObj.id || activity._id.toString(),
        // Ensure isDraft field exists with default false for existing activities
        isDraft: activityObj.isDraft !== undefined ? activityObj.isDraft : false,
        // When this map settles (window from creation) — null for solo trackers
        closesAt: activityObj.status === 'active' && activityObj.maxEntries > 0 && activityObj.createdAt
          ? new Date(new Date(activityObj.createdAt).getTime() + windowHours * 60 * 60 * 1000)
          : null
      };
    });

    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        total: transformedActivities.length
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activities'
    });
  }
});

// Get activity by URL name
router.get('/by-url/:urlName', async (req, res) => {
  try {
    const activity = await Activity.findOne({ urlName: req.params.urlName }).select('-__v');

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Settle on read if this map's window has ended
    const windowHours = req.instance?.config?.quorum?.activityWindowHours ?? 168;
    const topicsActivityId = req.instance?.config?.topicsActivityId || null;
    if (
      activity.status === 'active' && !activity.isDraft && activity.maxEntries > 0 &&
      activity.id !== topicsActivityId && activity.createdAt &&
      Date.now() - new Date(activity.createdAt).getTime() > windowHours * 60 * 60 * 1000
    ) {
      await closeAndSettle(activity, req.instanceId, 'time window ended');
    }

    // Use the custom id field, not MongoDB's _id
    const activityObj = activity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || activity._id.toString(), // Fallback to _id if custom id doesn't exist
      closesAt: activityObj.status === 'active' && activityObj.maxEntries > 0 && activityObj.createdAt
        ? new Date(new Date(activityObj.createdAt).getTime() + windowHours * 60 * 60 * 1000)
        : null
    };

    console.log('=== FETCHING ACTIVITY BY URL ===');
    console.log('URL name:', req.params.urlName);
    console.log('Activity ID:', transformedActivity.id);
    console.log('Activity Type:', transformedActivity.activityType);
    console.log('Activity Title:', transformedActivity.title);

    res.json({
      success: true,
      data: transformedActivity
    });
  } catch (error) {
    console.error('Error fetching activity by URL name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity'
    });
  }
});

// Get activities for a specific user (activities they've participated in)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find all activities where user is a participant
    const activities = await Activity.find({
      'participants.id': userId,
      $or: [{ isDraft: { $ne: true } }, { isDraft: { $exists: false } }]
    })
      .sort({ createdAt: -1 })
      .select('-__v');

    // Transform activities to use custom id field
    const transformedActivities = activities.map(activity => {
      const activityObj = activity.toObject();
      return {
        ...activityObj,
        id: activityObj.id || activity._id.toString(),
        isDraft: activityObj.isDraft !== undefined ? activityObj.isDraft : false
      };
    });

    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        total: transformedActivities.length
      }
    });
  } catch (error) {
    console.error('Error fetching user activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activities'
    });
  }
});

// Get single activity
router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id }).select('-__v');

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Use the custom id field, not MongoDB's _id
    const activityObj = activity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || activity._id.toString() // Fallback to _id if custom id doesn't exist
    };

    console.log('Fetched activity by ID - preamble:', transformedActivity.preamble);
    console.log('Fetched activity by ID - referenceLink:', transformedActivity.wikiLink);

    res.json({
      success: true,
      data: transformedActivity
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity'
    });
  }
});

// Create new activity
router.post('/', async (req, res) => {
  try {
    console.log('=== CREATE ACTIVITY REQUEST RECEIVED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const {
      title,
      urlName,
      activityType,
      mapQuestion,
      mapQuestion2,
      xAxis,
      yAxis,
      commentQuestion,
      objectNameQuestion,
      preamble,
      wikiLink,
      starterData,
      votesPerUser,
      maxEntries,
      showProfileLinks,
      showAxisLabels,
      author,
      frameId,
      topicId,
      isPublic,
      isDraft,
      // Snapshot-specific
      snapshotQuestions,
      xAxisPoints,
      yAxisPoints,
      xAxisLabels,
      yAxisLabels
    } = req.body;

    console.log('Create activity - activityType:', activityType);
    console.log('Create activity - preamble:', preamble);
    console.log('Create activity - referenceLink:', wikiLink);

    // Validate required fields
    if (!title || !urlName || !mapQuestion || !commentQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Title, URL name, map question, and comment question are required'
      });
    }

    // Validate axis configuration (required for all activity types)
    if (!xAxis || !xAxis.label || !xAxis.min || !xAxis.max) {
      return res.status(400).json({
        success: false,
        error: 'X-axis configuration is required'
      });
    }

    if (!yAxis || !yAxis.label || !yAxis.min || !yAxis.max) {
      return res.status(400).json({
        success: false,
        error: 'Y-axis configuration is required'
      });
    }
    
    // Create new activity
    const activity = new Activity({
      title: title.trim(),
      urlName: urlName.trim(),
      activityType: activityType || 'holoscopic',
      mapQuestion: mapQuestion.trim(),
      mapQuestion2: mapQuestion2 ? mapQuestion2.trim() : '',
      xAxis: {
        label: xAxis.label.trim(),
        min: xAxis.min.trim(),
        max: xAxis.max.trim()
      },
      yAxis: {
        label: yAxis.label.trim(),
        min: yAxis.min.trim(),
        max: yAxis.max.trim()
      },
      commentQuestion: commentQuestion.trim(),
      objectNameQuestion: objectNameQuestion ? objectNameQuestion.trim() : 'Name something that represents your perspective',
      preamble: preamble ? preamble.trim() : '',
      wikiLink: wikiLink ? wikiLink.trim() : '',
      starterData: starterData ? starterData.trim() : '',
      votesPerUser: votesPerUser !== null && votesPerUser !== undefined ? Number(votesPerUser) : null,
      // maxEntries: 0 = unlimited (solo tracker mode), 1/2/4 = standard entry slots
      maxEntries: maxEntries !== undefined && [0, 1, 2, 4].includes(Number(maxEntries)) ? Number(maxEntries) : 1,
      showProfileLinks: showProfileLinks !== undefined ? showProfileLinks : true,
      showAxisLabels: showAxisLabels !== undefined ? showAxisLabels : true,
      // Snapshot-specific fields
      ...(activityType === 'snapshot' && {
        snapshotQuestions: snapshotQuestions || [],
        xAxisPoints: xAxisPoints || 2,
        yAxisPoints: yAxisPoints || 2,
        xAxisLabels: xAxisLabels || [],
        yAxisLabels: yAxisLabels || [],
      }),
      // Auto-set author if provided (for solo tracker mode especially)
      author: author ? {
        userId: author.userId,
        name: author.name
      } : undefined,
      frameId: frameId || null,
      topicId: topicId || null,
      // Game-created maps go live immediately (isDraft: false from the client);
      // admin-created activities keep the draft-then-publish default.
      isDraft: isDraft !== undefined ? !!isDraft : true,
      isPublic: isPublic !== undefined ? !!isPublic : false,
      status: 'active',
      participants: [],
      ratings: [],
      comments: [],
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

    // Process starter data if provided
    if (starterData && starterData.trim()) {
      try {
        const parsed = JSON.parse(starterData);
        if (Array.isArray(parsed)) {
          // Add each starter data item as a rating and comment
          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (item && typeof item === 'object' && 
                typeof item.x === 'number' && typeof item.y === 'number' &&
                item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1 &&
                item.objectName && item.comment) {
              
              const starterUserId = `starter_${savedActivity._id}_${i}`;
              const starterUsername = 'Example Data';  // Clear indicator this is seed data
              
              // Add as participant
              await savedActivity.addParticipant(starterUserId, starterUsername);
              
              // Add rating with position
              await savedActivity.addRating(starterUserId, starterUsername, 
                { x: item.x, y: item.y }, item.objectName);
              
              // Add comment
              await savedActivity.addComment(starterUserId, starterUsername, 
                item.comment, item.objectName);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to process starter data:', e);
      }
    }

    // Use the custom id field
    const activityObj = savedActivity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || savedActivity._id.toString()
    };

    res.status(201).json({
      success: true,
      data: transformedActivity
    });
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create activity'
    });
  }
});

// Update activity
router.patch('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'urlName', 'mapQuestion', 'mapQuestion2', 'xAxis', 'yAxis', 'commentQuestion', 'objectNameQuestion', 'preamble', 'wikiLink', 'starterData', 'votesPerUser', 'maxEntries', 'status', 'isPublic', 'showProfileLinks', 'showAxisLabels', 'author', 'snapshotQuestions', 'xAxisPoints', 'yAxisPoints', 'xAxisLabels', 'yAxisLabels', 'frameId', 'topicId'];
    const updates = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        // Validate maxEntries if present (0 = unlimited/solo tracker, 1/2/4 = standard)
        if (key === 'maxEntries') {
          const value = Number(req.body[key]);
          if ([0, 1, 2, 4].includes(value)) {
            updates[key] = value;
          }
        } else {
          updates[key] = req.body[key];
        }
      }
    }
    
    console.log('Update request body:', req.body);
    console.log('Updates to apply:', updates);
    console.log('Preamble in request:', req.body.preamble);
    console.log('ReferenceLink in request:', req.body.wikiLink);
    console.log('Activity before update:', activity.toObject());
    
    // Apply updates
    Object.assign(activity, updates);
    console.log('Activity after Object.assign:', activity.toObject());

    // Settle activity stake pool when transitioning to completed
    if (updates.status === 'completed' && activity.stakes?.length) {
      try {
        await settleActivityStakes(activity, req.instanceId);
      } catch (e) {
        console.error('[activities] stake settlement error:', e.message);
      }
    }

    const updatedActivity = await activity.save();
    console.log('Activity after save:', updatedActivity.toObject());

    // Use the custom id field
    const activityObj = updatedActivity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || updatedActivity._id.toString()
    };

    res.json({
      success: true,
      data: transformedActivity
    });
  } catch (error) {
    console.error('Error updating activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update activity'
    });
  }
});

// Clear a slot (delete rating and comment for specific user + slot)
// IMPORTANT: Must be before generic DELETE /:id route
router.delete('/:id/slot', async (req, res) => {
  try {
    const { userId, slotNumber } = req.query;

    if (!userId || !slotNumber) {
      return res.status(400).json({
        success: false,
        error: 'User ID and slot number are required'
      });
    }

    const slotNum = Number(slotNumber);

    const activity = await Activity.findOne({ id: req.params.id });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Remove rating for this user and slot
    activity.ratings = activity.ratings.filter(r =>
      !(r.userId === userId && (r.slotNumber || 1) === slotNum)
    );

    // Remove comment for this user and slot
    activity.comments = activity.comments.filter(c =>
      !(c.userId === userId && (c.slotNumber || 1) === slotNum)
    );

    await activity.save();

    // Broadcast update via WebSocket
    if (io) {
      io.to(req.params.id).emit('activity_updated', {
        activity: activity.toObject()
      });
    }

    res.json({
      success: true,
      message: 'Slot cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing slot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear slot'
    });
  }
});

// Delete activity
router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Creator or admin only — this endpoint previously had no guard at all
    const userId = req.headers['x-user-id'];
    const User = require('../models/User');
    const user = userId ? await User.findOne({ id: userId }).lean() : null;
    const isCreator = activity.author?.userId && activity.author.userId === userId;
    if (!isCreator && user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only the creator or an admin can delete this map' });
    }

    // Return all unsettled stakes in full — moderation deletes never
    // redistribute; escrowed holons go home.
    for (const stake of (activity.stakes || []).filter(s => !s.settled)) {
      try {
        await transact({ userId: stake.userId, instanceId: stake.instanceId || req.instanceId, type: 'activity_stake_return', amount: stake.amount, refType: 'activity', refId: activity.id });
      } catch (e) { console.error('[activities] delete refund error:', e.message); }
    }

    await Activity.deleteOne({ id: req.params.id });

    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete activity'
    });
  }
});

// Toggle draft status
router.patch('/:id/draft', async (req, res) => {
  try {
    const { isDraft } = req.body;
    
    if (typeof isDraft !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isDraft must be a boolean value'
      });
    }
    
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    activity.isDraft = isDraft;
    const updatedActivity = await activity.save();

    // Use the custom id field
    const activityObj = updatedActivity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || updatedActivity._id.toString()
    };

    res.json({
      success: true,
      data: transformedActivity
    });
  } catch (error) {
    console.error('Error toggling draft status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle draft status'
    });
  }
});

// Add participant to activity
router.post('/:id/participants', async (req, res) => {
  try {
    const { userId, username, sequenceId } = req.body;

    if (!userId || !username) {
      return res.status(400).json({
        success: false,
        error: 'User ID and username are required'
      });
    }

    const activity = await Activity.findOne({ id: req.params.id });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    let resolvedUsername = username;

    if (sequenceId) {
      const sequence = await Sequence.findOne({ id: sequenceId });
      if (sequence && sequence.requireInvitation) {
        const member = sequence.members.find(m => m.userId === userId);
        if (!member) {
          return res.status(403).json({
            success: false,
            error: 'You must be enrolled in this sequence to participate'
          });
        }
        if (member.username) resolvedUsername = member.username;
      }
    }

    await activity.addParticipant(userId, resolvedUsername);

    // Stake holons into activity pool (skip if already staked or no instance config)
    const alreadyStaked = (activity.stakes || []).some(s => s.userId === userId);
    if (!alreadyStaked && req.instanceId && req.instance?.config?.holons) {
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

    res.json({
      success: true,
      message: 'Participant added successfully'
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add participant'
    });
  }
});

// Submit rating
router.post('/:id/rating', async (req, res) => {
  try {
    const { userId, position, objectName, slotNumber = 1, questionId = null } = req.body;

    if (!userId || !position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'User ID and valid position are required'
      });
    }

    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) {
      return res.status(400).json({
        success: false,
        error: 'Position coordinates must be between 0 and 1'
      });
    }

    // Basic slotNumber validation (must be positive integer)
    if (slotNumber < 1 || !Number.isInteger(slotNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Slot number must be a positive integer'
      });
    }

    const activity = await Activity.findOne({ id: req.params.id });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    if (activity.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Activity is not active'
      });
    }

    // Solo Tracker Mode: maxEntries === 0 means unlimited entries but creator-only
    if (isSoloTrackerMode(activity)) {
      if (!isActivityCreator(activity, userId)) {
        return res.status(403).json({
          success: false,
          error: 'Only the creator can add entries to this activity'
        });
      }
      // No slot limit for unlimited mode - any positive integer is valid
    } else if (activity.activityType !== 'snapshot') {
      // Standard mode: Validate slot number against activity's maxEntries
      // Snapshot uses slotNumber to distinguish questions, not extra entries per user
      if (slotNumber > (activity.maxEntries || 1)) {
        return res.status(400).json({
          success: false,
          error: `This activity only allows ${activity.maxEntries || 1} entry slot(s)`
        });
      }
    }

    // Find participant to get username
    const participant = activity.participants.find(p => p.id === userId);
    if (!participant) {
      return res.status(400).json({
        success: false,
        error: 'User is not a participant in this activity'
      });
    }

    const updatedActivity = await activity.addRating(userId, participant.username, position, objectName, slotNumber, questionId);

    // Return the new rating
    const newRating = updatedActivity.ratings.find(r => r.userId === userId && r.slotNumber === slotNumber);

    // Broadcast to WebSocket clients
    if (io && newRating) {
      io.to(req.params.id).emit('rating_added', {
        rating: newRating
      });

      // Also broadcast updated comment if user has one for this slot
      const updatedComment = updatedActivity.comments.find(c => c.userId === userId && c.slotNumber === slotNumber);
      if (updatedComment) {
        io.to(req.params.id).emit('comment_updated', {
          comment: updatedComment
        });
      }
    }

    res.json({
      success: true,
      data: newRating
    });
  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit rating'
    });
  }
});

// Submit comment
router.post('/:id/comment', async (req, res) => {
  const startTime = Date.now();
  console.log(`💬 [COMMENT] Request received - Activity: ${req.params.id}, User: ${req.body.userId}, Slot: ${req.body.slotNumber}`);

  try {
    const { userId, text, objectName, slotNumber = 1, questionId = null } = req.body;

    if (!userId || !text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID and comment text are required'
      });
    }

    if (text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Comment text cannot be empty'
      });
    }

    if (text.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Comment must be less than 500 characters'
      });
    }

    // Basic slotNumber validation (must be positive integer)
    if (slotNumber < 1 || !Number.isInteger(slotNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Slot number must be a positive integer'
      });
    }

    const activity = await Activity.findOne({ id: req.params.id });

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    if (activity.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Activity is not active'
      });
    }

    // Solo Tracker Mode: maxEntries === 0 means unlimited entries but creator-only
    if (isSoloTrackerMode(activity)) {
      if (!isActivityCreator(activity, userId)) {
        return res.status(403).json({
          success: false,
          error: 'Only the creator can add entries to this activity'
        });
      }
      // No slot limit for unlimited mode
    } else if (activity.activityType !== 'snapshot') {
      // Standard mode: Validate slot number against activity's maxEntries
      // Snapshot uses slotNumber to distinguish questions, not extra entries per user
      if (slotNumber > (activity.maxEntries || 1)) {
        return res.status(400).json({
          success: false,
          error: `This activity only allows ${activity.maxEntries || 1} entry slot(s)`
        });
      }
    }

    // Find participant to get username
    const participant = activity.participants.find(p => p.id === userId);
    if (!participant) {
      return res.status(400).json({
        success: false,
        error: 'User is not a participant in this activity'
      });
    }

    console.log(`💬 [COMMENT] Saving to DB...`);
    const dbStart = Date.now();
    await activity.addComment(userId, participant.username, text.trim(), objectName || participant.objectName, slotNumber, questionId);
    console.log(`💬 [COMMENT] DB save took ${Date.now() - dbStart}ms`);

    // Return the new comment
    const newComment = activity.comments.find(c => c.userId === userId && c.slotNumber === slotNumber);

    // Broadcast to WebSocket clients
    if (io && newComment) {
      console.log(`💬 [COMMENT] Broadcasting to room ${req.params.id}`);
      io.to(req.params.id).emit('comment_added', {
        comment: newComment
      });
    } else {
      console.log(`⚠️ [COMMENT] WebSocket broadcast skipped - io: ${!!io}, newComment: ${!!newComment}`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ [COMMENT] Complete in ${totalTime}ms`);

    res.json({
      success: true,
      data: newComment
    });
  } catch (error) {
    console.error('Error submitting comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit comment'
    });
  }
});

// Vote on comment
router.post('/:id/comment/:commentId/vote', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    if (activity.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Activity is not active'
      });
    }
    
    // Find participant to get username
    const participant = activity.participants.find(p => p.id === userId);
    if (!participant) {
      return res.status(400).json({
        success: false,
        error: 'User is not a participant in this activity'
      });
    }
    
    await activity.voteComment(req.params.commentId, userId, participant.username);
    
    // Return the updated comment
    const updatedComment = activity.comments.find(c => c.id === req.params.commentId);
    
    // Broadcast to WebSocket clients
    if (io && updatedComment) {
      io.to(req.params.id).emit('comment_voted', {
        comment: updatedComment
      });
    }

    // Complete rule: full table + everyone entered and voted → settle now
    if (isComplete(activity)) {
      await closeAndSettle(activity, req.instanceId, 'everyone has played');
      if (io) {
        io.to(req.params.id).emit('activity_updated', { activity });
      }
    }

    res.json({
      success: true,
      data: updatedComment
    });
  } catch (error) {
    console.error('Error voting on comment:', error);

    // Return 400 for all known business logic errors
    const businessLogicErrors = [
      'Vote limit reached',
      'Cannot vote on your own comment',
      'Comment not found',
    ];
    if (error.message && businessLogicErrors.some(msg => error.message.includes(msg))) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to vote on comment'
    });
  }
});

// Submit email
router.post('/:id/email', async (req, res) => {
  try {
    const { email, userId } = req.body;
    
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    // Check if email already exists for this activity
    const existingEmail = activity.emails?.find(e => e.email === email.toLowerCase());
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email already submitted for this activity'
      });
    }
    
    // Initialize emails array if it doesn't exist
    if (!activity.emails) {
      activity.emails = [];
    }
    
    // Add email
    activity.emails.push({
      email: email.toLowerCase().trim(),
      userId: userId || null,
      timestamp: new Date()
    });
    
    await activity.save();
    
    res.json({
      success: true,
      message: 'Email submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit email'
    });
  }
});

// Analytics endpoints

// Get analytics stats for a specific activity
router.get('/:id/analytics', async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    const stats = {
      participants: activity.participants.length,
      completedMappings: activity.ratings.length,
      comments: activity.comments.length,
      emails: (activity.emails || []).length,
      votes: activity.comments.reduce((total, comment) => total + comment.votes.length, 0)
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching activity analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// Sync starter data to database
router.post('/:id/sync-starter-data', async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id });
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }

    // Remove existing starter data participants/ratings/comments
    // Filter by both ID pattern and username to catch all starter data
    activity.participants = activity.participants.filter(p => 
      !p.id.startsWith('starter_') && p.username !== 'Example Data'
    );
    activity.ratings = activity.ratings.filter(r => 
      !r.userId.startsWith('starter_') && r.username !== 'Example Data'
    );
    activity.comments = activity.comments.filter(c => 
      !c.userId.startsWith('starter_') && c.username !== 'Example Data'
    );

    // Process current starter data if it exists
    if (activity.starterData && activity.starterData.trim()) {
      try {
        const parsed = JSON.parse(activity.starterData);
        if (Array.isArray(parsed)) {
          // Add each starter data item as a rating and comment
          for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (item && typeof item === 'object' && 
                typeof item.x === 'number' && typeof item.y === 'number' &&
                item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1 &&
                item.objectName && item.comment) {
              
              const starterUserId = `starter_${activity._id}_${i}`;
              const starterUsername = 'Example Data';
              
              // Add as participant
              await activity.addParticipant(starterUserId, starterUsername);
              
              // Add rating with position
              await activity.addRating(starterUserId, starterUsername, 
                { x: item.x, y: item.y }, item.objectName);
              
              // Add comment
              await activity.addComment(starterUserId, starterUsername, 
                item.comment, item.objectName);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to process starter data:', e);
        return res.status(400).json({
          success: false,
          error: 'Invalid starter data format'
        });
      }
    }

    const updatedActivity = await activity.save();

    // Transform response
    const activityObj = updatedActivity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: updatedActivity._id.toString()
    };

    res.json({
      success: true,
      data: transformedActivity,
      message: 'Starter data synced successfully'
    });

  } catch (error) {
    console.error('Error syncing starter data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync starter data'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Activity service is healthy',
    timestamp: new Date().toISOString()
  });
});

// DELETE /api/activities/:id/comment/:commentId — moderation (admin only)
const requireAdmin = require('../middleware/requireAdmin');
router.delete('/:id/comment/:commentId', requireAdmin, async (req, res) => {
  try {
    const activity = await Activity.findOne({ id: req.params.id });
    if (!activity) return res.status(404).json({ success: false, error: 'Activity not found' });

    const before = activity.comments.length;
    activity.comments = activity.comments.filter(c => c.id !== req.params.commentId);
    if (activity.comments.length === before) {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    await activity.save();

    if (io) io.to(req.params.id).emit('activity_updated', { activity });
    console.log(`[activities] comment ${req.params.commentId} removed by admin ${req.adminUser.email}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

  return router;
};