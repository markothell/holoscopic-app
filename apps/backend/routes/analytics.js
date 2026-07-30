const express = require('express');

module.exports = function() {
  const router = express.Router();

  const Activity = require('../models/Activity');
  const Entry = require('../models/Entry');

  // Per-activity rollup from the entries collection, scoped to one instance —
  // Entry carries a denormalized instanceId precisely so this stays an indexed
  // match instead of a full-collection group.
  function entryStats(instanceId, activityId) {
    const match = {};
    if (instanceId) match.instanceId = instanceId;
    if (activityId) match.activityId = activityId;
    return Entry.aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      {
        $group: {
          _id: '$activityId',
          completedMappings: { $sum: { $cond: [{ $ifNull: ['$position', false] }, 1, 0] } },
          comments: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$text', ''] } }, 0] }, 1, 0] } },
          votes: { $sum: { $ifNull: ['$voteCount', 0] } },
        }
      }
    ]);
  }

  // Signed-in and instance-scoped. Previously neither: an anonymous caller
  // could run `Activity.find({})` plus an unbounded aggregation over every
  // entry on the platform, across all tenants, as often as they liked — cost
  // growing with total platform usage, and `emails` counts are not public.
  //
  // requireVerified rather than requireAdmin: /create uses this, and creating
  // maps is not an admin activity. Scoping further to the caller's own
  // authored activities would be tighter still, but /create renders stats for
  // activities it lists rather than only ones the caller wrote.
  const { requireVerified } = require('../middleware/verifyUser');

  // Get analytics stats for all activities in this instance
  router.get('/all-stats', requireVerified, async (req, res) => {
    try {
      const [activities, entryRows] = await Promise.all([
        Activity.find({ instanceId: req.instanceId }).select('id participants emails').lean(),
        entryStats(req.instanceId),
      ]);
      const byActivity = Object.fromEntries(entryRows.map(r => [r._id, r]));

      const allStats = {};
      for (const activity of activities) {
        const e = byActivity[activity.id] || { completedMappings: 0, comments: 0, votes: 0 };
        allStats[activity.id] = {
          participants: (activity.participants || []).length,
          completedMappings: e.completedMappings,
          comments: e.comments,
          emails: (activity.emails || []).length,
          votes: e.votes,
        };
      }

      res.json(allStats);
    } catch (error) {
      console.error('Error fetching all analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Get analytics stats for this instance.
  // Was an unauthenticated aggregation over every activity and every entry on
  // the platform — both now match on instanceId first, which is indexed.
  router.get('/stats', requireVerified, async (req, res) => {
    try {
      const [activityAgg, entryAgg] = await Promise.all([
        Activity.aggregate([
          { $match: { instanceId: req.instanceId } },
          {
            $group: {
              _id: null,
              participants: { $sum: { $size: { $ifNull: ['$participants', []] } } },
              emails: { $sum: { $size: { $ifNull: ['$emails', []] } } },
            }
          }
        ]),
        Entry.aggregate([
          { $match: { instanceId: req.instanceId } },
          {
            $group: {
              _id: null,
              completedMappings: { $sum: { $cond: [{ $ifNull: ['$position', false] }, 1, 0] } },
              comments: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$text', ''] } }, 0] }, 1, 0] } },
              votes: { $sum: { $ifNull: ['$voteCount', 0] } },
            }
          }
        ]),
      ]);

      const a = activityAgg[0] || { participants: 0, emails: 0 };
      const e = entryAgg[0] || { completedMappings: 0, comments: 0, votes: 0 };

      res.json({
        participants: a.participants,
        completedMappings: e.completedMappings,
        comments: e.comments,
        emails: a.emails,
        votes: e.votes,
      });
    } catch (error) {
      console.error('Error fetching platform analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Get analytics stats for a specific activity
  router.get('/stats/:activityId', requireVerified, async (req, res) => {
    try {
      const activity = await Activity.findOne({
        id: req.params.activityId,
        instanceId: req.instanceId,
      }).lean();
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      // Aggregated in the database rather than by loading every entry document
      // into Node to compute four numbers — that was unbounded memory on a
      // large map, on an endpoint anyone could call.
      const rows = await entryStats(req.instanceId, activity.id);
      const e = rows[0] || { completedMappings: 0, comments: 0, votes: 0 };
      res.json({
        participants: (activity.participants || []).length,
        completedMappings: e.completedMappings,
        comments: e.comments,
        emails: (activity.emails || []).length,
        votes: e.votes,
      });
    } catch (error) {
      console.error('Error fetching activity analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  return router;
};
