const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');

// Get user profile with privacy checks
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { viewerId } = req.query;

    // Find the user
    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy permissions
    const canView = await checkProfileViewPermission(userId, viewerId);
    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view this profile' });
    }

    // Get user's sequences and activities
    const joinedSequences = await user.getJoinedSequences();
    const participatedActivities = await user.getParticipatedActivities();

    // For each activity, get user's specific entries
    const activitiesWithEntries = await Promise.all(
      participatedActivities.map(async (activity) => {
        const fullActivity = await Activity.findOne({ id: activity.id });
        const userEntries = [];

        // Get all ratings for this user across all slots
        const userRatings = fullActivity.ratings.filter(r => r.userId === userId);

        for (const rating of userRatings) {
          // Find corresponding comment
          const comment = fullActivity.comments.find(
            c => c.userId === userId && c.slotNumber === rating.slotNumber
          );

          // Find participant entry for object name
          const participant = fullActivity.participants.find(
            p => p.userId === userId && p.slotNumber === rating.slotNumber
          );

          userEntries.push({
            slotNumber: rating.slotNumber,
            objectName: participant?.objectName || 'Unknown',
            x: rating.position?.x,
            y: rating.position?.y,
            comment: comment?.text || ''
          });
        }

        return {
          id: activity.id,
          title: activity.title,
          urlName: activity.urlName,
          xAxisLabel: activity.xAxisLabel,
          yAxisLabel: activity.yAxisLabel,
          updatedAt: activity.updatedAt,
          userEntries
        };
      })
    );

    // Return profile data
    const profileData = {
      id: user.id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      createdAt: user.createdAt,
      joinedSequences: joinedSequences.map(seq => ({
        id: seq.id,
        title: seq.title,
        urlName: seq.urlName,
        description: seq.description
      })),
      participatedActivities: activitiesWithEntries
    };

    res.json(profileData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Update user profile
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { bio } = req.body;

    // Find and update user
    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields
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

// Helper function to check if viewer can see this profile
async function checkProfileViewPermission(targetUserId, viewerUserId) {
  // User can always view their own profile
  if (targetUserId === viewerUserId) {
    return true;
  }

  // Anonymous users cannot view profiles
  if (!viewerUserId || viewerUserId.startsWith('anon_')) {
    return false;
  }

  // Check if users share a sequence
  const targetUser = await User.findByCustomId(targetUserId);
  const viewerUser = await User.findByCustomId(viewerUserId);

  if (!targetUser || !viewerUser) {
    return false;
  }

  const targetSequences = await targetUser.getJoinedSequences();
  const viewerSequences = await viewerUser.getJoinedSequences();

  const targetSequenceIds = targetSequences.map(s => s.id);
  const viewerSequenceIds = viewerSequences.map(s => s.id);

  // Check if there's any overlap in sequences
  const sharedSequences = targetSequenceIds.filter(id => viewerSequenceIds.includes(id));

  return sharedSequences.length > 0;
}

module.exports = router;
