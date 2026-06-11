const express = require('express');
const router = express.Router();
const Instance = require('../models/Instance');
const requireAdmin = require('../middleware/requireAdmin');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// GET /api/instances/current — returns config for the resolved instance (used by frontend)
router.get('/current', (req, res) => {
  const { id, name, slug, gameType, access, config, startDate, endDate } = req.instance;
  res.json({ instance: { id, name, slug, gameType, access, config, startDate, endDate } });
});

// All routes below require admin
router.use(requireAdmin);

// GET /api/instances — list all instances
router.get('/', async (req, res) => {
  try {
    const instances = await Instance.find().sort({ createdAt: -1 });
    res.json({ instances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instances — create a new instance
router.post('/', async (req, res) => {
  try {
    const { name, slug, domains, gameType, access, startDate, endDate, config } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

    const existing = await Instance.findOne({ slug });
    if (existing) return res.status(409).json({ error: 'Slug already in use' });

    const gameNumber = (await Instance.countDocuments()) + 1;
    const instance = await Instance.create({
      id: generateId(),
      name,
      slug,
      domains: domains || [],
      gameType: gameType || 'holoscopic-game',
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
    const { name, domains, access, startDate, endDate, active, config, gameVersion } = req.body;
    const instance = await Instance.findOne({ id: req.params.id });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (name        !== undefined) instance.name        = name;
    if (domains     !== undefined) instance.domains     = domains;
    if (access      !== undefined) instance.access      = access;
    if (startDate   !== undefined) instance.startDate   = startDate;
    if (endDate     !== undefined) instance.endDate     = endDate;
    if (active      !== undefined) instance.active      = active;
    if (gameVersion !== undefined) instance.gameVersion = gameVersion;
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
