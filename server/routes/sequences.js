const express = require('express');
const router = express.Router();
const Sequence = require('../models/Sequence');
const Activity = require('../models/Activity');

// Get all sequences (admin)
router.get('/admin', async (req, res) => {
  try {
    const sequences = await Sequence.find().sort({ createdAt: -1 });
    res.json(sequences);
  } catch (error) {
    console.error('Error fetching sequences:', error);
    res.status(500).json({ error: 'Failed to fetch sequences' });
  }
});

// Get sequences for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const sequences = await Sequence.find({
      'members.userId': userId,
      status: { $in: ['active', 'completed'] }
    }).sort({ createdAt: -1 });

    // Populate activity details for each sequence
    const sequencesWithActivities = await Promise.all(
      sequences.map(async (sequence) => {
        const activitiesWithDetails = await Promise.all(
          sequence.activities.map(async (seqActivity) => {
            const activity = await Activity.findOne({ id: seqActivity.activityId });

            // Check if user has participated
            const hasParticipated = activity ?
              activity.participants.some(p => p.id === userId && p.hasSubmitted) :
              false;

            return {
              ...seqActivity.toObject(),
              activity: activity ? {
                id: activity.id,
                title: activity.title,
                urlName: activity.urlName,
                status: activity.status
              } : null,
              hasParticipated
            };
          })
        );

        return {
          ...sequence.toObject(),
          activities: activitiesWithDetails
        };
      })
    );

    res.json(sequencesWithActivities);
  } catch (error) {
    console.error('Error fetching user sequences:', error);
    res.status(500).json({ error: 'Failed to fetch user sequences' });
  }
});

// Get single sequence by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sequence = await Sequence.findOne({ id });

    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Populate activity details
    const activitiesWithDetails = await Promise.all(
      sequence.activities.map(async (seqActivity) => {
        const activity = await Activity.findOne({ id: seqActivity.activityId });
        return {
          ...seqActivity.toObject(),
          activity: activity ? {
            id: activity.id,
            title: activity.title,
            urlName: activity.urlName,
            status: activity.status,
            isDraft: activity.isDraft,
            participants: activity.participants.length,
            completedMappings: activity.ratings.length
          } : null
        };
      })
    );

    res.json({
      ...sequence.toObject(),
      activities: activitiesWithDetails
    });
  } catch (error) {
    console.error('Error fetching sequence:', error);
    res.status(500).json({ error: 'Failed to fetch sequence' });
  }
});

// Get sequence by urlName
router.get('/url/:urlName', async (req, res) => {
  try {
    const { urlName } = req.params;
    const { userId } = req.query;
    const sequence = await Sequence.findOne({ urlName });

    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Populate activity details
    const activitiesWithDetails = await Promise.all(
      sequence.activities.map(async (seqActivity) => {
        const activity = await Activity.findOne({ id: seqActivity.activityId });

        // Check if user has participated (if userId provided)
        const hasParticipated = (userId && activity) ?
          activity.participants.some(p => p.id === userId && p.hasSubmitted) :
          false;

        return {
          ...seqActivity.toObject(),
          activity: activity ? {
            id: activity.id,
            title: activity.title,
            urlName: activity.urlName,
            status: activity.status,
            isDraft: activity.isDraft,
            participants: activity.participants.length,
            completedMappings: activity.ratings.length
          } : null,
          hasParticipated
        };
      })
    );

    res.json({
      ...sequence.toObject(),
      activities: activitiesWithDetails
    });
  } catch (error) {
    console.error('Error fetching sequence:', error);
    res.status(500).json({ error: 'Failed to fetch sequence' });
  }
});

// Create new sequence
router.post('/', async (req, res) => {
  try {
    const { title, urlName, description, activities } = req.body;

    // Validate required fields
    if (!title || !urlName) {
      return res.status(400).json({ error: 'Title and URL name are required' });
    }

    // Check if urlName is unique
    const existing = await Sequence.findOne({ urlName });
    if (existing) {
      return res.status(400).json({ error: 'URL name already exists' });
    }

    const sequence = new Sequence({
      title,
      urlName,
      description: description || '',
      activities: activities || [],
      members: [],
      status: 'draft'
    });

    await sequence.save();
    res.status(201).json(sequence);
  } catch (error) {
    console.error('Error creating sequence:', error);
    res.status(500).json({ error: 'Failed to create sequence' });
  }
});

// Update sequence
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Update allowed fields
    if (updates.title) sequence.title = updates.title;
    if (updates.description !== undefined) sequence.description = updates.description;
    if (updates.urlName && updates.urlName !== sequence.urlName) {
      // Check if new urlName is unique
      const existing = await Sequence.findOne({ urlName: updates.urlName });
      if (existing) {
        return res.status(400).json({ error: 'URL name already exists' });
      }
      sequence.urlName = updates.urlName;
    }
    if (updates.activities) sequence.activities = updates.activities;
    if (updates.status) sequence.status = updates.status;

    await sequence.save();
    res.json(sequence);
  } catch (error) {
    console.error('Error updating sequence:', error);
    res.status(500).json({ error: 'Failed to update sequence' });
  }
});

// Delete sequence
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Sequence.deleteOne({ id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    res.json({ message: 'Sequence deleted successfully' });
  } catch (error) {
    console.error('Error deleting sequence:', error);
    res.status(500).json({ error: 'Failed to delete sequence' });
  }
});

// Add member to sequence
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.addMember(userId);
    res.json(sequence);
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member from sequence
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.removeMember(userId);
    res.json(sequence);
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Add activity to sequence
router.post('/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;
    const { activityId, order, duration } = req.body;

    if (!activityId || order === undefined) {
      return res.status(400).json({ error: 'Activity ID and order are required' });
    }

    // Verify activity exists
    const activity = await Activity.findOne({ id: activityId });
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.addActivity(activityId, order, duration || 7);
    res.json(sequence);
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

// Remove activity from sequence
router.delete('/:id/activities/:activityId', async (req, res) => {
  try {
    const { id, activityId } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.removeActivity(activityId);
    res.json(sequence);
  } catch (error) {
    console.error('Error removing activity:', error);
    res.status(500).json({ error: 'Failed to remove activity' });
  }
});

// Start sequence
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    if (sequence.status !== 'draft') {
      return res.status(400).json({ error: 'Sequence already started' });
    }

    await sequence.startSequence();
    res.json(sequence);
  } catch (error) {
    console.error('Error starting sequence:', error);
    res.status(500).json({ error: 'Failed to start sequence' });
  }
});

// Open next activity
router.post('/:id/next', async (req, res) => {
  try {
    const { id } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.openNextActivity();
    res.json(sequence);
  } catch (error) {
    console.error('Error opening next activity:', error);
    res.status(500).json({ error: 'Failed to open next activity' });
  }
});

// Complete sequence
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.completeSequence();
    res.json(sequence);
  } catch (error) {
    console.error('Error completing sequence:', error);
    res.status(500).json({ error: 'Failed to complete sequence' });
  }
});

module.exports = router;