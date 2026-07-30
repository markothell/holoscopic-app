const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const InstanceMembership = require('../models/InstanceMembership');
const { transact } = require('../utils/holons');
const { requireSelf, requireVerified } = require('../middleware/verifyUser');

const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;
const isProduction = process.env.NODE_ENV === 'production';

// Generate short custom ID for users
function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

// The only user shape that leaves this router for a caller who is not the
// user themselves or an admin. `User.toJSON()` merely deletes `password`, so
// returning it shipped bio, legacyUserIds, intakeResponses, holonBalance and
// lastLoginAt — into the NextAuth JWT on every login, and to anonymous
// callers on every profile read.
function sessionUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

// What a stranger may see. Deliberately no email and no role: `role` is what
// made the batch endpoint an admin-discovery oracle.
function publicUser(user) {
  const shaped = { id: user.id, name: user.name || '' };
  if (user.profileVisibility === 'public') shaped.bio = user.bio || '';
  return shaped;
}

// Credential endpoints need their own buckets. The global 100/min limiter in
// websocket-server.js is a traffic control, not a credential-stuffing
// defence — 100 password guesses per minute is an attack, not a user.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 1000,
  // Key on IP + email so one attacker cannot lock out an entire office NAT,
  // and so spraying one password across many accounts still gets throttled.
  //
  // ipKeyGenerator, not raw req.ip: an IPv6 client's /128 address is one of
  // 2^64+ inside a single allocation, so keying on it whole gave an attacker
  // `max` attempts PER ADDRESS — unlimited in practice. This truncates IPv6 to
  // its subnet so one allocation shares one bucket. Cheap here because the key
  // also carries the email: aggregating only collides for the same email from
  // the same subnet, which is the same person.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, error: 'Too many sign-in attempts. Try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 5 : 1000,
  message: { success: false, error: 'Too many accounts created from here. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254; // RFC 5321
const NAME_MAX = 80;

// POST /api/auth/signup - Register new user
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // The waitlist and signup routers already validate email shape; this one
    // did not, so anything containing no whitespace became a permanent unique
    // account key. Length is bounded because the field is unbounded in the
    // schema and body-parser's 100kb limit was the only ceiling.
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail.length > EMAIL_MAX || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: 'A valid email address is required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(cleanEmail);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Create new user
    const user = new User({
      id: generateUserId(),
      email: cleanEmail,
      password,
      name: String(name || '').trim().slice(0, NAME_MAX)
    });

    await user.save();

    // Membership for the signup instance. getOrCreate is the single grant
    // point for the starting stake + join_bonus ledger entry.
    const instanceId = req.instanceId || 'default';
    await InstanceMembership.getOrCreate(user.id, instanceId);

    res.status(201).json({
      success: true,
      user: sessionUser(user)
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
//
// The request and response contract here is load-bearing: three NextAuth
// authorize() callbacks (apps/{holoscopic-game,spectrum,synthesis}/src/lib/
// auth.ts) POST {email,password} and read data.success plus
// data.user.{id,email,name,role}. Do not change the envelope.
router.post('/login', loginLimiter, async (req, res) => {
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
      user: sessionUser(user)
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// POST /api/auth/admin-token - Credential exchange for the platform admin UI.
//
// apps/platform has no NextAuth (its dependencies are next/react/react-dom
// only), so it cannot mint a token the way the game frontends do via their
// own /api/auth/game-token route. Without this, tightening requireAdmin to
// require a verified token would lock the operator out of their own admin UI.
//
// Same signing secret and same payload shape as the game tokens, so
// middleware/verifyUser.js verifies both with one code path. Longer-lived
// (12h) because there is no session to silently re-mint from.
router.post('/admin-token', loginLimiter, async (req, res) => {
  try {
    if (!SECRET) {
      return res.status(503).json({ error: 'Server auth not configured' });
    }
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findByEmail(String(email).trim().toLowerCase());
    // One indistinguishable failure for "no such user", "wrong password" and
    // "not an admin" — otherwise this endpoint reports which addresses belong
    // to admins.
    const ok = user && user.isActive && (await user.comparePassword(password));
    if (!ok || user.role !== 'admin') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiresInSec = 12 * 60 * 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { sub: user.id, role: 'admin', iat: nowSec, exp: nowSec + expiresInSec },
      SECRET
    );

    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token,
      expiresAt: (nowSec + expiresInSec) * 1000,
      user: sessionUser(user),
    });
  } catch (error) {
    console.error('Admin token error:', error);
    res.status(500).json({ error: 'Failed to issue token' });
  }
});

// POST /api/auth/migrate - Link legacy localStorage ID to user account
//
// This is an account-linking primitive: a legacy id carries prior play
// history. Unauthenticated, it let anyone attach arbitrary ids to a victim's
// account, or claim a legacy identity that was not theirs.
router.post('/migrate', requireVerified, async (req, res) => {
  try {
    const { userId, legacyUserId } = req.body;

    if (!userId || !legacyUserId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and legacy ID are required'
      });
    }

    if (String(userId) !== req.authedUserId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const user = await User.findByCustomId(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // A legacy id maps to one person's history, so it can only ever belong to
    // one account. Without this, two accounts could both claim it and the
    // later claimant would silently inherit the other's play history.
    const claimedElsewhere = await User.findOne({
      legacyUserIds: legacyUserId,
      id: { $ne: user.id },
    }).select('id');
    if (claimedElsewhere) {
      return res.status(409).json({
        success: false,
        error: 'That account has already been linked'
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

// POST /api/auth/users/batch - Resolve user ids to display names.
//
// Was an unauthenticated, uncapped oracle: post a list of candidate ids and
// harvest the email address and role of every hit. Ids are 8 chars from
// Math.random(), so enumeration was practical. Three changes close it —
// sign-in required, a hard length cap, and no email or role in the response.
const BATCH_MAX = 100;

router.post('/users/batch', requireVerified, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be an array'
      });
    }

    const ids = [...new Set(userIds.map(String))];
    if (ids.length > BATCH_MAX) {
      return res.status(400).json({
        success: false,
        error: `At most ${BATCH_MAX} ids per request`
      });
    }

    const users = await User.find({ id: { $in: ids } })
      .select('id name')
      .lean();

    // Create a map of userId -> name. Callers use this purely to label
    // entries in the UI, so a name is all they need; falling back to the
    // email address here is what leaked addresses for unnamed accounts.
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = {
        id: user.id,
        name: user.name || 'Anonymous'
      };
    });

    res.json({
      success: true,
      users: userMap
    });

  } catch (error) {
    console.error('Batch users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// GET /api/auth/user/:id - Get user profile
//
// Stays readable without signing in (profile links are shareable), but a
// stranger gets the public shape only. This previously returned the whole
// document — email, role, bio, legacyUserIds, intakeResponses, holonBalance —
// to anyone who knew or guessed an id.
router.get('/user/:id', async (req, res) => {
  try {
    const user = await User.findByCustomId(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const isSelf = req.authedUserId && req.authedUserId === user.id;
    let isAdmin = false;
    if (req.authedUserId && !isSelf) {
      const viewer = await User.findOne({ id: req.authedUserId }).select('role isActive');
      isAdmin = Boolean(viewer && viewer.role === 'admin' && viewer.isActive);
    }

    res.json({
      success: true,
      user: isSelf || isAdmin ? user.toJSON() : publicUser(user)
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
//
// requireSelf, not enforceVerifiedUser: this route names its subject in the
// path, and enforceVerifiedUser only inspects x-user-id / body.userId. It saw
// no claimed identity here and waved every request through, which made this
// an unauthenticated write to any account on the platform.
router.put('/user/:id', requireSelf('id'), async (req, res) => {
  try {
    const { name, bio, profileVisibility } = req.body;

    const user = await User.findByCustomId(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update allowed fields. `bio` is capped by the schema at 500; `name` is
    // not, so it is clamped here rather than persisting unbounded input.
    if (name !== undefined) user.name = String(name).trim().slice(0, NAME_MAX);
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
