const express = require('express');

module.exports = function() {
  const router = express.Router();
  
  // Activity model will be available when this function is called
  const Activity = require('../models/Activity');

// Get analytics stats for all activities
router.get('/all-stats', async (req, res) => {
  try {
    const results = await Activity.aggregate([
      {
        $project: {
          id: 1, // Include the custom id field
          participants: { $size: '$participants' },
          completedMappings: { $size: '$ratings' },
          comments: { $size: '$comments' },
          emails: { $size: { $ifNull: ['$emails', []] } },
          votes: {
            $sum: {
              $map: {
                input: '$comments',
                as: 'comment',
                in: { $size: '$$comment.votes' }
              }
            }
          }
        }
      }
    ]);

    const allStats = {};
    results.forEach(result => {
      // Use the custom id field instead of _id
      allStats[result.id] = {
        participants: result.participants,
        completedMappings: result.completedMappings,
        comments: result.comments,
        emails: result.emails,
        votes: result.votes
      };
    });

    res.json(allStats);
  } catch (error) {
    console.error('Error fetching all analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// Get analytics stats for overall platform
router.get('/stats', async (req, res) => {
  try {
    const results = await Activity.aggregate([
      {
        $group: {
          _id: null,
          participants: { $sum: { $size: '$participants' } },
          completedMappings: { $sum: { $size: '$ratings' } },
          comments: { $sum: { $size: '$comments' } },
          emails: { $sum: { $size: { $ifNull: ['$emails', []] } } },
          votes: {
            $sum: {
              $sum: {
                $map: {
                  input: '$comments',
                  as: 'comment',
                  in: { $size: '$$comment.votes' }
                }
              }
            }
          }
        }
      }
    ]);
    
    const totalStats = results[0] || {
      participants: 0,
      completedMappings: 0,
      comments: 0,
      emails: 0,
      votes: 0
    };
    
    // Remove the _id field from the response
    delete totalStats._id;
    
    res.json(totalStats);
  } catch (error) {
    console.error('Error fetching platform analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// Get analytics stats for a specific activity
router.get('/stats/:activityId', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.activityId);
    
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

  return router;
};