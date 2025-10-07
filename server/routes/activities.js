const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Activity = require('../models/Activity');

module.exports = function(io) {
  const router = express.Router();

// Get all activities (admin endpoint - includes drafts)
router.get('/admin', async (req, res) => {
  try {
    const activities = await Activity.find({})
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
    // Only show non-draft activities to public (treat missing isDraft as false)
    const activities = await Activity.find({ $or: [{ isDraft: { $ne: true } }, { isDraft: { $exists: false } }] })
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
    
    // Use the custom id field, not MongoDB's _id
    const activityObj = activity.toObject();
    const transformedActivity = {
      ...activityObj,
      id: activityObj.id || activity._id.toString() // Fallback to _id if custom id doesn't exist
    };

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
    console.log('Fetched activity by ID - wikiLink:', transformedActivity.wikiLink);

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
      urlName,
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
      showProfileLinks
    } = req.body;

    console.log('Create activity - preamble:', preamble);
    console.log('Create activity - wikiLink:', wikiLink);

    // Validate required fields
    if (!title || !urlName || !mapQuestion || !commentQuestion) {
      return res.status(400).json({
        success: false,
        error: 'Title, URL name, map question, and comment question are required'
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
      urlName: urlName.trim(),
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
      maxEntries: maxEntries && [1, 2, 4].includes(Number(maxEntries)) ? Number(maxEntries) : 1,
      showProfileLinks: showProfileLinks !== undefined ? showProfileLinks : true,
      status: 'active',
      participants: [],
      ratings: [],
      comments: []
    });
    
    const savedActivity = await activity.save();
    
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
    const allowedUpdates = ['title', 'urlName', 'mapQuestion', 'mapQuestion2', 'xAxis', 'yAxis', 'commentQuestion', 'objectNameQuestion', 'preamble', 'wikiLink', 'starterData', 'votesPerUser', 'maxEntries', 'status', 'isPublic', 'showProfileLinks'];
    const updates = {};

    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        // Validate maxEntries if present
        if (key === 'maxEntries') {
          const value = Number(req.body[key]);
          if ([1, 2, 4].includes(value)) {
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
    console.log('WikiLink in request:', req.body.wikiLink);
    console.log('Activity before update:', activity.toObject());
    
    // Apply updates
    Object.assign(activity, updates);
    console.log('Activity after Object.assign:', activity.toObject());
    
    // If quadrants were updated, update quadrantName in existing comments
    if (updates.quadrants) {
      activity.comments.forEach(comment => {
        if (comment.quadrant) {
          comment.quadrantName = activity.quadrants[comment.quadrant];
        }
      });
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
    const { userId, username } = req.body;
    
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
  const startTime = Date.now();
  console.log(`📊 [RATING] Request received - Activity: ${req.params.id}, User: ${req.body.userId}, Slot: ${req.body.slotNumber}`);

  try {
    const { userId, position, objectName, slotNumber = 1 } = req.body;

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

    // Validate slotNumber
    if (slotNumber < 1 || slotNumber > 4 || !Number.isInteger(slotNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Slot number must be an integer between 1 and 4'
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

    // Validate slot number against activity's maxEntries
    if (slotNumber > (activity.maxEntries || 1)) {
      return res.status(400).json({
        success: false,
        error: `This activity only allows ${activity.maxEntries || 1} entry slot(s)`
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

    console.log(`📊 [RATING] Saving to DB...`);
    const dbStart = Date.now();
    const updatedActivity = await activity.addRating(userId, participant.username, position, objectName, slotNumber);
    console.log(`📊 [RATING] DB save took ${Date.now() - dbStart}ms`);

    // Return the new rating
    const newRating = updatedActivity.ratings.find(r => r.userId === userId && r.slotNumber === slotNumber);

    // Broadcast to WebSocket clients
    if (io && newRating) {
      console.log(`📊 [RATING] Broadcasting to room ${req.params.id}`);
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
    } else {
      console.log(`⚠️ [RATING] WebSocket broadcast skipped - io: ${!!io}, newRating: ${!!newRating}`);
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ [RATING] Complete in ${totalTime}ms`);

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
    const { userId, text, objectName, slotNumber = 1 } = req.body;

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

    // Validate slotNumber
    if (slotNumber < 1 || slotNumber > 4 || !Number.isInteger(slotNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Slot number must be an integer between 1 and 4'
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

    // Validate slot number against activity's maxEntries
    if (slotNumber > (activity.maxEntries || 1)) {
      return res.status(400).json({
        success: false,
        error: `This activity only allows ${activity.maxEntries || 1} entry slot(s)`
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

    console.log(`💬 [COMMENT] Saving to DB...`);
    const dbStart = Date.now();
    await activity.addComment(userId, participant.username, text.trim(), objectName || participant.objectName, slotNumber);
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
    
    res.json({
      success: true,
      data: updatedComment
    });
  } catch (error) {
    console.error('Error voting on comment:', error);

    // Check if it's a vote limit error
    if (error.message && error.message.includes('Vote limit reached')) {
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

  return router;
};