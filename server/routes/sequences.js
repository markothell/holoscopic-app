const express = require('express');
const router = express.Router();
const Sequence = require('../models/Sequence');
const Activity = require('../models/Activity');
const User = require('../models/User');

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

// Get public sequences (excludes invitation-only sequences)
router.get('/public', async (req, res) => {
  try {
    const sequences = await Sequence.find({
      status: { $in: ['active'] }, // Only active sequences in public listing
      $or: [
        { requireInvitation: false },
        { requireInvitation: { $exists: false } }
      ]
    }).sort({ createdAt: -1 });

    // Populate activity details for each sequence
    const sequencesWithActivities = await Promise.all(
      sequences.map(async (sequence) => {
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

        return {
          ...sequence.toObject(),
          activities: activitiesWithDetails
        };
      })
    );

    res.json(sequencesWithActivities);
  } catch (error) {
    console.error('Error fetching public sequences:', error);
    res.status(500).json({ error: 'Failed to fetch public sequences' });
  }
});

// Get sequences for a user (only shows sequences they're enrolled in)
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

// Get sequence by URL name
router.get('/by-url/:urlName', async (req, res) => {
  try {
    const { urlName } = req.params;
    const sequence = await Sequence.findOne({ urlName });

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
            status: activity.status
          } : null
        };
      })
    );

    res.json({
      ...sequence.toObject(),
      activities: activitiesWithDetails
    });
  } catch (error) {
    console.error('Error fetching sequence by URL:', error);
    res.status(500).json({ error: 'Failed to fetch sequence' });
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
    const { title, urlName, description, welcomePage, activities } = req.body;

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
      welcomePage: welcomePage || {
        enabled: false,
        requestName: false,
        welcomeText: '',
        referenceLink: ''
      },
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
    if (updates.welcomePage !== undefined) sequence.welcomePage = updates.welcomePage;
    if (updates.activities) sequence.activities = updates.activities;
    if (updates.invitedEmails !== undefined) sequence.invitedEmails = updates.invitedEmails;
    if (updates.requireInvitation !== undefined) sequence.requireInvitation = updates.requireInvitation;
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
    const { userId, email } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Check invitation requirement
    if (sequence.requireInvitation && email) {
      if (!sequence.isEmailInvited(email)) {
        return res.status(403).json({ error: 'Email not invited to this sequence' });
      }
    }

    await sequence.addMember(userId, email);
    res.json(sequence);
  } catch (error) {
    console.error('Error adding member:', error);
    if (error.message === 'Email not invited to this sequence') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Enroll in sequence (user self-enrollment)
router.post('/:id/enroll', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, email, displayName } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    // Check invitation requirement
    if (sequence.requireInvitation && email) {
      if (!sequence.isEmailInvited(email)) {
        return res.status(403).json({ error: 'Email not invited to this sequence' });
      }
    }

    await sequence.addMember(userId, email);
    res.json({ success: true, sequence });
  } catch (error) {
    console.error('Error enrolling in sequence:', error);
    if (error.message === 'Email not invited to this sequence') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User already enrolled in this sequence') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to enroll in sequence' });
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
    const { activityId, order, autoClose, duration } = req.body;

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

    await sequence.addActivity(activityId, order, autoClose || false, duration || null);
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

// Get user profile within sequence context
router.get('/:sequenceId/profile/:userId', async (req, res) => {
  try {
    const { sequenceId, userId } = req.params;
    const { viewerId } = req.query;

    console.log(`📋 Profile request - Sequence: ${sequenceId}, Target: ${userId}, Viewer: ${viewerId}`);

    // Find the sequence
    const sequence = await Sequence.findOne({ id: sequenceId });
    if (!sequence) {
      console.log(`❌ Sequence ${sequenceId} not found`);
      return res.status(404).json({ error: 'Sequence not found' });
    }

    console.log(`✅ Found sequence: ${sequence.title}, Members: ${sequence.members.length}`);
    console.log(`📝 Member user IDs:`, sequence.members.map(m => m.userId));

    // Check if target user is a member of this sequence
    const targetMember = sequence.members.find(m => m.userId === userId);
    if (!targetMember) {
      console.log(`❌ Target user ${userId} not found in sequence members`);
      console.log(`📝 Available members:`, sequence.members);
      return res.status(404).json({ error: 'User not found in this sequence' });
    }

    // Fetch user's name from User model
    const user = await User.findByCustomId(userId);
    const name = user ? (user.name || 'Anonymous') : 'Anonymous';

    console.log(`✅ Target user found: ${name}`);

    // Check if viewer is a member of this sequence (only if viewerId provided and different from target)
    if (viewerId && viewerId !== userId) {
      const viewerMember = sequence.members.find(m => m.userId === viewerId);
      if (!viewerMember) {
        console.log(`❌ Viewer ${viewerId} not a member of sequence`);
        return res.status(403).json({ error: 'You must be a member of this sequence to view profiles' });
      }
      console.log(`✅ Viewer ${viewerId} authorized`);
    } else if (!viewerId) {
      console.log(`⚠️ No viewerId provided - allowing view (own profile)`);
    }

    // Get only activities that belong to this sequence
    const Activity = require('../models/Activity');

    console.log(`📋 Sequence activities:`, sequence.activities);

    if (!sequence.activities || sequence.activities.length === 0) {
      console.log(`⚠️ Sequence has no activities`);
      return res.json({
        id: userId,
        name: name,
        sequenceId: sequence.id,
        sequenceUrlName: sequence.urlName,
        sequenceTitle: sequence.title,
        joinedAt: targetMember.joinedAt,
        participatedActivities: []
      });
    }

    const sequenceActivityIds = sequence.activities.map(a => a.activityId);

    console.log(`🔍 Looking for activities with IDs: ${sequenceActivityIds.join(', ')}`);

    // Find activities from this sequence where user participated
    const participatedActivities = await Activity.find({
      id: { $in: sequenceActivityIds },
      $or: [
        { 'participants.userId': userId },
        { 'ratings.userId': userId },
        { 'comments.userId': userId }
      ]
    }).select('id title urlName xAxis yAxis updatedAt ratings comments');

    console.log(`📊 Found ${participatedActivities.length} activities where user participated`);

    // For each activity, get user's entries
    const activitiesWithEntries = await Promise.all(
      participatedActivities.map(async (activity) => {
        const userEntries = [];

        // Get all ratings for this user across all slots (with safety check)
        const userRatings = (activity.ratings || []).filter(r => r.userId === userId);

        for (const rating of userRatings) {
          // Find corresponding comment (with safety check)
          const comment = (activity.comments || []).find(
            c => c.userId === userId && (c.slotNumber || 1) === (rating.slotNumber || 1)
          );

          userEntries.push({
            slotNumber: rating.slotNumber || 1,
            objectName: rating.objectName || 'Unknown',
            x: rating.position?.x,
            y: rating.position?.y,
            comment: comment?.text || ''
          });
        }

        return {
          id: activity.id,
          title: activity.title,
          urlName: activity.urlName,
          xAxisLabel: activity.xAxis?.label || '',
          yAxisLabel: activity.yAxis?.label || '',
          updatedAt: activity.updatedAt,
          userEntries
        };
      })
    );

    // Return sequence-scoped profile
    const profileData = {
      id: userId,
      name: name,
      sequenceId: sequence.id,
      sequenceUrlName: sequence.urlName,
      sequenceTitle: sequence.title,
      joinedAt: targetMember.joinedAt,
      participatedActivities: activitiesWithEntries
    };

    console.log(`✅ Successfully built profile for ${name} with ${activitiesWithEntries.length} activities`);
    res.json(profileData);
  } catch (error) {
    console.error('❌ Error fetching sequence profile:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
});

// Check if email is invited to a sequence
router.post('/:id/check-invitation', async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    const isInvited = sequence.isEmailInvited(email);
    res.json({
      isInvited,
      requireInvitation: sequence.requireInvitation || false
    });
  } catch (error) {
    console.error('Error checking invitation:', error);
    res.status(500).json({ error: 'Failed to check invitation' });
  }
});

// Add emails to invitation list (admin endpoint)
router.post('/:id/invite', async (req, res) => {
  try {
    const { id } = req.params;
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails array is required' });
    }

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.addInvitedEmails(emails);
    res.json(sequence);
  } catch (error) {
    console.error('Error adding invited emails:', error);
    res.status(500).json({ error: 'Failed to add invited emails' });
  }
});

// Remove email from invitation list (admin endpoint)
router.delete('/:id/invite/:email', async (req, res) => {
  try {
    const { id, email } = req.params;

    const sequence = await Sequence.findOne({ id });
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }

    await sequence.removeInvitedEmail(email);
    res.json(sequence);
  } catch (error) {
    console.error('Error removing invited email:', error);
    res.status(500).json({ error: 'Failed to remove invited email' });
  }
});

module.exports = router;