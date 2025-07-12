const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Activity = require('../models/Activity');

module.exports = function(io) {
  const router = express.Router();

// Get all activities
router.get('/', async (req, res) => {
  try {
    const activities = await Activity.find({})
      .sort({ createdAt: -1 })
      .select('-__v');
    
    // Transform _id to id for frontend compatibility
    const transformedActivities = activities.map(activity => ({
      ...activity.toObject(),
      id: activity._id.toString()
    }));
    
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

// Get single activity
router.get('/:id', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id).select('-__v');
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    // Transform _id to id for frontend compatibility
    const transformedActivity = {
      ...activity.toObject(),
      id: activity._id.toString()
    };
    
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
    const {
      title,
      mapQuestion,
      xAxis,
      yAxis,
      commentQuestion
    } = req.body;
    
    // Validate required fields
    if (!title || !mapQuestion || !commentQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Title, map question, and comment question are required'
      });
    }
    
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
      mapQuestion: mapQuestion.trim(),
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
      status: 'active',
      participants: [],
      ratings: [],
      comments: []
    });
    
    const savedActivity = await activity.save();
    
    // Transform _id to id for frontend compatibility
    const transformedActivity = {
      ...savedActivity.toObject(),
      id: savedActivity._id.toString()
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
    const activity = await Activity.findById(req.params.id);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'mapQuestion', 'xAxis', 'yAxis', 'commentQuestion', 'status'];
    const updates = {};
    
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    
    // Apply updates
    Object.assign(activity, updates);
    const updatedActivity = await activity.save();
    
    // Transform _id to id for frontend compatibility
    const transformedActivity = {
      ...updatedActivity.toObject(),
      id: updatedActivity._id.toString()
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

// Delete activity
router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    await Activity.findByIdAndDelete(req.params.id);
    
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

// Add participant to activity
router.post('/:id/participants', async (req, res) => {
  try {
    const { userId, username } = req.body;
    
    if (!userId || !username) {
      return res.status(400).json({
        success: false,
        error: 'User ID and username are required'
      });
    }
    
    const activity = await Activity.findById(req.params.id);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    await activity.addParticipant(userId, username);
    
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
    const { userId, position } = req.body;
    
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
    
    const activity = await Activity.findById(req.params.id);
    
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
    
    await activity.addRating(userId, participant.username, position);
    
    // Return the new rating
    const newRating = activity.ratings.find(r => r.userId === userId);
    
    // Broadcast to WebSocket clients
    if (io && newRating) {
      io.to(req.params.id).emit('rating_added', {
        rating: newRating
      });
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
  try {
    const { userId, text } = req.body;
    
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
    
    const activity = await Activity.findById(req.params.id);
    
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
    
    await activity.addComment(userId, participant.username, text.trim());
    
    // Return the new comment
    const newComment = activity.comments.find(c => c.userId === userId);
    
    // Broadcast to WebSocket clients
    if (io && newComment) {
      io.to(req.params.id).emit('comment_added', {
        comment: newComment
      });
    }
    
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
    
    const activity = await Activity.findById(req.params.id);
    
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
    
    res.json({
      success: true,
      data: updatedComment
    });
  } catch (error) {
    console.error('Error voting on comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to vote on comment'
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

  return router;
};