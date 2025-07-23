const express = require('express');

module.exports = function() {
  const router = express.Router();
  
  // Activity model will be available when this function is called
  const Activity = require('../models/Activity');

// Get analytics stats for all activities
router.get('/all-stats', async (req, res) => {
  try {
    const activities = await Activity.find({});
    
    const allStats = {};
    
    activities.forEach(activity => {
      const stats = {
        participants: activity.participants.length,
        completedMappings: activity.ratings.length, 
        comments: activity.comments.length,
        votes: activity.comments.reduce((total, comment) => total + comment.votes.length, 0)
      };
      
      allStats[activity._id.toString()] = stats;
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
    const activities = await Activity.find({});
    
    const totalStats = {
      participants: 0,
      completedMappings: 0,
      comments: 0,
      votes: 0
    };
    
    activities.forEach(activity => {
      totalStats.participants += activity.participants.length;
      totalStats.completedMappings += activity.ratings.length;
      totalStats.comments += activity.comments.length;
      totalStats.votes += activity.comments.reduce((total, comment) => total + comment.votes.length, 0);
    });
    
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