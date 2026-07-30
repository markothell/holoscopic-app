const express = require('express');
const router = express.Router();
const { requireSelf } = require('../middleware/verifyUser');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Entry = require('../models/Entry');
const Topic = require('../models/Topic');
const FrameOfReference = require('../models/FrameOfReference');
const Algorithm = require('../models/Algorithm');
const Instance = require('../models/Instance');
const InstanceMembership = require('../models/InstanceMembership');
const entries = require('../utils/entries');

// Profiles are game-scoped: a viewer may see another player's profile and
// personal map only inside a game they both belong to.
async function canViewInGame(targetUserId, viewerUserId, instanceId) {
  if (!viewerUserId || viewerUserId.startsWith('anon_')) return false;
  if (targetUserId === viewerUserId) return true;
  const [target, viewer] = await Promise.all([
    InstanceMembership.exists({ userId: targetUserId, instanceId }),
    InstanceMembership.exists({ userId: viewerUserId, instanceId }),
  ]);
  return !!(target && viewer);
}

// GET /api/users/:userId/games — player history across games.
// Each game links out to its collective map and this player's personal map.
router.get('/:userId/games', async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.headers['x-user-id'] || req.query.viewerId;

    const user = await User.findByCustomId(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const memberships = await InstanceMembership.find({ userId }).lean();
    if (!memberships.length) {
      return res.json({ user: { id: user.id, name: user.name }, games: [] });
    }

    const instanceIds = memberships.map(m => m.instanceId);
    const joinedAtByInstance = Object.fromEntries(memberships.map(m => [m.instanceId, m.joinedAt]));

    // Viewer sees only the games they share with the target (own profile sees all)
    let visibleIds = instanceIds;
    if (viewerId !== userId) {
      if (!viewerId || viewerId.startsWith('anon_')) {
        return res.status(403).json({ error: 'You do not have permission to view this profile' });
      }
      const shared = await InstanceMembership.find({ userId: viewerId, instanceId: { $in: instanceIds } }).lean();
      visibleIds = shared.map(m => m.instanceId);
      if (!visibleIds.length) {
        return res.status(403).json({ error: 'You do not share a game with this player' });
      }
    }

    const [instances, entryRows, voteRows, frameRows, patternRows] = await Promise.all([
      Instance.find({ id: { $in: visibleIds } }).lean(),
      Entry.aggregate([
        { $match: { instanceId: { $in: visibleIds }, userId, isSeed: { $ne: true } } },
        { $group: {
          _id: '$instanceId',
          entries: { $sum: 1 },
          activities: { $addToSet: '$activityId' },
          topics: { $addToSet: '$topicId' },
        } },
      ]),
      Entry.aggregate([
        { $match: { instanceId: { $in: visibleIds }, voterIds: userId } },
        { $group: { _id: '$instanceId', votesCast: { $sum: 1 } } },
      ]),
      FrameOfReference.aggregate([
        { $match: { instanceId: { $in: visibleIds }, createdBy: userId } },
        { $group: { _id: '$instanceId', frames: { $sum: 1 } } },
      ]),
      Algorithm.aggregate([
        { $match: { instanceId: { $in: visibleIds }, authorId: userId, status: 'published' } },
        { $group: { _id: '$instanceId', patterns: { $sum: 1 } } },
      ]),
    ]);

    const byInstance = (rows) => Object.fromEntries(rows.map(r => [r._id, r]));
    const e = byInstance(entryRows);
    const v = byInstance(voteRows);
    const f = byInstance(frameRows);
    const p = byInstance(patternRows);

    const games = instances
      .map(inst => ({
        instanceId: inst.id,
        name: inst.name,
        slug: inst.slug,
        // Lets the profile route each history row to the app that owns it.
        // Reads Instance.app; the parentInstanceId test is the pre-backfill
        // fallback for rows scripts/backfill-instance-app.js has not stamped.
        gameType: inst.app || (inst.parentInstanceId ? 'spectrum' : 'interview'),
        gameNumber: inst.gameNumber ?? null,
        active: inst.active !== false && !(inst.endDate && new Date(inst.endDate) < new Date()),
        startDate: inst.startDate,
        endDate: inst.endDate,
        joinedAt: joinedAtByInstance[inst.id] || null,
        stats: {
          entries: e[inst.id]?.entries ?? 0,
          activities: e[inst.id]?.activities?.length ?? 0,
          topics: (e[inst.id]?.topics || []).filter(Boolean).length,
          votesCast: v[inst.id]?.votesCast ?? 0,
          frames: f[inst.id]?.frames ?? 0,
          patterns: p[inst.id]?.patterns ?? 0,
        },
      }))
      .sort((a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0));

    res.json({ user: { id: user.id, name: user.name }, games });
  } catch (error) {
    console.error('Error fetching player games:', error);
    res.status(500).json({ error: 'Failed to fetch player games' });
  }
});

// GET /api/users/:userId/game-map — a player's redacted personal map for the
// current game (instance resolved from the request). Their own entries carry
// authorship; entries they voted for are redacted server-side — the map shows
// what was voted for, never who else authored or voted.
router.get('/:userId/game-map', async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.headers['x-user-id'] || req.query.viewerId;
    const instanceId = req.instanceId;

    const user = await User.findByCustomId(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!(await canViewInGame(userId, viewerId, instanceId))) {
      return res.status(403).json({ error: 'You must share this game with the player to view their map' });
    }

    const [ownDocs, votedDocs, frames, patterns] = await Promise.all([
      Entry.find({ instanceId, userId, isSeed: { $ne: true } }).sort({ createdAt: 1 }).lean(),
      Entry.find({ instanceId, voterIds: userId }).sort({ createdAt: 1 }).lean(),
      FrameOfReference.find({ instanceId, createdBy: userId }).lean(),
      Algorithm.find({ instanceId, authorId: userId, status: 'published' })
        .select('id title thesis publishedAt sequenceId').lean(),
    ]);

    const activityIds = [...new Set([
      ...ownDocs.map(d => d.activityId),
      ...votedDocs.map(d => d.activityId),
    ])];
    const activities = activityIds.length
      ? await Activity.find({ id: { $in: activityIds } })
          .select('id title urlName activityType topicId frameId xAxis yAxis status maxEntries')
          .lean()
      : [];

    const topicIds = [...new Set([
      ...activities.map(a => a.topicId),
      ...ownDocs.map(d => d.topicId),
      ...votedDocs.map(d => d.topicId),
    ].filter(Boolean))];
    const topics = topicIds.length
      ? await Topic.find({ id: { $in: topicIds }, instanceId }).select('id title status').lean()
      : [];

    const instance = await Instance.findOne({ id: instanceId }).lean();

    res.json({
      user: { id: user.id, name: user.name },
      instance: instance
        ? {
            id: instance.id, name: instance.name, slug: instance.slug,
            gameType: instance.app || (instance.parentInstanceId ? 'spectrum' : 'interview'),
            gameNumber: instance.gameNumber ?? null,
          }
        : null,
      topics,
      activities: activities.map(a => ({ ...a, _id: undefined })),
      ownEntries: ownDocs.map(d => ({ ...entries.toClient(d), activityId: d.activityId })),
      votedEntries: votedDocs.map(d => ({ ...entries.toRedacted(d), activityId: d.activityId })),
      frames: frames.map(fr => ({
        id: fr.id, xLabel: fr.xLabel, xMin: fr.xMin, xMax: fr.xMax,
        yLabel: fr.yLabel, yMin: fr.yMin, yMax: fr.yMax, createdAt: fr.createdAt,
      })),
      patterns,
    });
  } catch (error) {
    console.error('Error fetching game map:', error);
    res.status(500).json({ error: 'Failed to fetch game map' });
  }
});

// GET /api/users/:userId — basic public identity (name only)
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findByCustomId(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, createdAt: user.createdAt });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user profile.
// requireSelf because the subject is a path param: the router-level
// enforceVerifiedUser only compares x-user-id / body.userId against the
// token, so a signed-in user sending their own header could target anyone
// else's :userId here.
router.put('/:userId', requireSelf('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { bio } = req.body;

    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (bio !== undefined) user.bio = bio;
    await user.save();

    res.json({
      id: user.id,
      name: user.name,
      bio: user.bio
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

// Get user settings
router.get('/:userId/settings', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      notifications: user.notifications || {
        newActivities: true,
        enrolledActivities: true
      }
    });
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// Update user settings (name, email, notifications).
// Same path-param exposure as above, and higher stakes: this one writes
// `email`, which is the login identifier — an unguarded version is an
// account-takeover primitive, not just a profile edit.
router.put('/:userId/settings', requireSelf('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, notifications } = req.body;

    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name !== undefined) {
      user.name = name;
    }

    if (email !== undefined) {
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      user.email = email;
    }

    if (notifications !== undefined) {
      user.notifications = {
        newActivities: notifications.newActivities !== undefined
          ? notifications.newActivities
          : user.notifications?.newActivities ?? true,
        enrolledActivities: notifications.enrolledActivities !== undefined
          ? notifications.enrolledActivities
          : user.notifications?.enrolledActivities ?? true
      };
    }

    await user.save();

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      notifications: user.notifications
    });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

module.exports = router;
