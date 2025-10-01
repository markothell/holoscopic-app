const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Generate short custom ID for users
function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

// POST /api/auth/signup - Register new user
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new user
    const user = new User({
      id: generateUserId(),
      email,
      password,
      name: name || ''
    });

    await user.save();

    // Return user data (password excluded by toJSON)
    res.status(201).json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account'
    });
  }
});

// POST /api/auth/login - Authenticate user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is disabled'
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Return user data
    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// POST /api/auth/migrate - Link legacy localStorage ID to user account
router.post('/migrate', async (req, res) => {
  try {
    const { userId, legacyUserId } = req.body;

    if (!userId || !legacyUserId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and legacy ID are required'
      });
    }

    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Add legacy ID if not already present
    if (!user.legacyUserIds.includes(legacyUserId)) {
      user.legacyUserIds.push(legacyUserId);
      await user.save();
    }

    res.json({
      success: true,
      message: 'Legacy account linked successfully'
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed'
    });
  }
});

// GET /api/auth/user/:id - Get user profile
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findByCustomId(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// PUT /api/auth/user/:id - Update user profile
router.put('/user/:id', async (req, res) => {
  try {
    const { name, bio, profileVisibility } = req.body;

    const user = await User.findByCustomId(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update allowed fields
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (profileVisibility !== undefined) user.profileVisibility = profileVisibility;

    await user.save();

    res.json({
      success: true,
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

module.exports = router;
