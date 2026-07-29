const express = require('express');
const router = express.Router();
const Instance = require('../models/Instance');
const InstanceMembership = require('../models/InstanceMembership');
const requireAdmin = require('../middleware/requireAdmin');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// GET /api/instances/current — returns config for the resolved instance (used by frontend)
//
// Public: every frontend fetches this on load, including Chorus, which has no
// accounts at all. It therefore must never return a secret — see
// Instance#toPublicJSON.
router.get('/current', (req, res) => {
  res.json({ instance: req.instance.toPublicJSON() });
});

// GET /api/instances/mine — interView editions the current user has joined.
// "Joined" = has an InstanceMembership (created at signup under an edition, or
// on first holon activity in it). Used to populate the dashboard's Games list.
router.get('/mine', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.json({ instances: [] });

    const memberships = await InstanceMembership.find({ userId }).sort({ joinedAt: -1 });
    if (memberships.length === 0) return res.json({ instances: [] });

    const byInstance = new Map(memberships.map(m => [m.instanceId, m]));
    // Per-room instances (On a Spectrum games) are not editions — keep them
    // out of the dashboard's Games list.
    const instances = await Instance.find({
      id: { $in: [...byInstance.keys()] },
      parentInstanceId: null,
    });

    const shaped = instances
      .map(inst => {
        const m = byInstance.get(inst.id);
        return {
          id: inst.id,
          name: inst.name,
          slug: inst.slug,
          gameNumber: inst.gameNumber,
          gameVersion: inst.gameVersion,
          active: inst.active,
          startDate: inst.startDate,
          endDate: inst.endDate,
          holonBalance: m ? m.holonBalance : 0,
          joinedAt: m ? m.joinedAt : null,
        };
      })
      .sort((a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0));

    res.json({ instances: shaped });
  } catch (err) {
    console.error('GET /instances/mine error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instances/resolve/:slugOrId — strict lookup with NO default
// fallback. Unlike the x-instance-id header (which falls back to the default
// game), this 404s for unknown slugs so the frontend can surface bad game
// URLs instead of silently serving the default instance.
router.get('/resolve/:slugOrId', async (req, res) => {
  try {
    const key = req.params.slugOrId;
    const instance = await Instance.findOne({ slug: key }) || await Instance.findOne({ id: key });
    if (!instance) return res.status(404).json({ error: 'No game found for that address' });
    // Also public, and enumerable by slug — it returned `access` whole, so it
    // handed out inviteCodes for any instance whose slug could be guessed.
    const pub = instance.toPublicJSON();
    res.json({
      instance: {
        id: pub.id,
        name: pub.name,
        slug: pub.slug,
        gameNumber: pub.gameNumber,
        access: pub.access,
        active: pub.active,
        startDate: pub.startDate,
        endDate: pub.endDate,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All routes below require admin
router.use(requireAdmin);

// GET /api/instances — list all instances. Per-room instances (On a
// Spectrum games) are hidden unless ?includeRooms=1.
router.get('/', async (req, res) => {
  try {
    const filter = req.query.includeRooms === '1' ? {} : { parentInstanceId: null };
    const instances = await Instance.find(filter).sort({ createdAt: -1 });
    res.json({ instances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instances — create a new instance
router.post('/', async (req, res) => {
  try {
    const { name, domains, access, startDate, endDate, config } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    // Next game number = highest existing + 1 (count-based numbering breaks
    // once non-game instances like spectrum exist).
    const top = await Instance.findOne({ gameNumber: { $ne: null } }).sort({ gameNumber: -1 });
    const gameNumber = (top?.gameNumber || 0) + 1;

    // No custom slug → address the game by its number (g1, g2, …)
    const slug = req.body.slug || `g${gameNumber}`;
    const existing = await Instance.findOne({ slug });
    if (existing) return res.status(409).json({ error: 'Slug already in use' });
    const instance = await Instance.create({
      id: generateId(),
      name,
      slug,
      domains: domains || [],
      access: access || { mode: 'public' },
      startDate: startDate || null,
      endDate: endDate || null,
      adminUserId: req.adminUser.id,
      config: config || {},
      gameNumber,
      gameVersion: req.body.gameVersion || '1.0',
    });

    res.status(201).json({ instance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instances/:id — read single instance
router.get('/:id', async (req, res) => {
  try {
    const instance = await Instance.findOne({ id: req.params.id });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    res.json({ instance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/instances/:id — update instance (config, domains, access, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { name, domains, access, startDate, endDate, active, config, gameVersion, gameNumber } = req.body;
    const instance = await Instance.findOne({ id: req.params.id });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (name        !== undefined) instance.name        = name;
    if (domains     !== undefined) instance.domains     = domains;
    if (access      !== undefined) instance.access      = access;
    if (startDate   !== undefined) instance.startDate   = startDate;
    if (endDate     !== undefined) instance.endDate     = endDate;
    if (active      !== undefined) instance.active      = active;
    if (gameVersion !== undefined) instance.gameVersion = gameVersion;
    if (gameNumber  !== undefined) instance.gameNumber  = (gameNumber === null || gameNumber === '') ? null : Number(gameNumber);
    if (config      !== undefined) {
      instance.config = { ...instance.config.toObject(), ...config };
    }

    await instance.save();
    res.json({ instance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
