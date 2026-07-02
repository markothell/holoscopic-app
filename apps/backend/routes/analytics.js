const express = require('express');

module.exports = function() {
  const router = express.Router();

  const Activity = require('../models/Activity');
  const Entry = require('../models/Entry');

  // Per-activity rollup from the entries collection
  function entryStats() {
    return Entry.aggregate([
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

  // Get analytics stats for all activities
  router.get('/all-stats', async (req, res) => {
    try {
      const [activities, entryRows] = await Promise.all([
        Activity.find({}).select('id participants emails').lean(),
        entryStats(),
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

  // Get analytics stats for overall platform
  router.get('/stats', async (req, res) => {
    try {
      const [activityAgg, entryAgg] = await Promise.all([
        Activity.aggregate([
          {
            $group: {
              _id: null,
              participants: { $sum: { $size: { $ifNull: ['$participants', []] } } },
              emails: { $sum: { $size: { $ifNull: ['$emails', []] } } },
            }
          }
        ]),
        Entry.aggregate([
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
  router.get('/stats/:activityId', async (req, res) => {
    try {
      const activity = await Activity.findOne({ id: req.params.activityId }).lean();
      if (!activity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      const entries = await Entry.find({ activityId: activity.id }).lean();
      res.json({
        participants: (activity.participants || []).length,
        completedMappings: entries.filter(e => e.position).length,
        comments: entries.filter(e => e.text && e.text.trim()).length,
        emails: (activity.emails || []).length,
        votes: entries.reduce((total, e) => total + (e.voteCount || 0), 0),
      });
    } catch (error) {
      console.error('Error fetching activity analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  return router;
};
