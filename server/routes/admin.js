const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');

// All routes require admin role
router.use(requireAdmin);

// GET /api/admin/stats — platform-wide aggregation
router.get('/stats', async (req, res) => {
  try {
    const [userCount, activityCount, sequenceCount, activityAgg] = await Promise.all([
      User.countDocuments(),
      Activity.countDocuments(),
      Sequence.countDocuments(),
      Activity.aggregate([
        {
          $group: {
            _id: null,
            participants: { $sum: { $size: '$participants' } },
            comments: { $sum: { $size: '$comments' } },
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
      ])
    ]);

    const agg = activityAgg[0] || { participants: 0, comments: 0, votes: 0 };

    res.json({
      users: userCount,
      activities: activityCount,
      sequences: sequenceCount,
      participants: agg.participants,
      comments: agg.comments,
      votes: agg.votes
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users?search= — list all users (limit 200)
router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    const users = await User.find(query)
      .select('id name email role isActive lastLoginAt createdAt')
      .limit(200)
      .sort({ createdAt: -1 });

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /api/admin/users/:userId/role — set role
router.patch('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (userId === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await User.findOne({ id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = role;
    await user.save();

    res.json({ success: true, user: { id: user.id, role: user.role } });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// PATCH /api/admin/users/:userId/status — toggle isActive
router.patch('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    if (userId === req.adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own status' });
    }

    const user = await User.findOne({ id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isActive = isActive;
    await user.save();

    res.json({ success: true, user: { id: user.id, isActive: user.isActive } });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
