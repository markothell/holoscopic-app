const express = require('express');
const router = express.Router();
const FrameOfReference = require('../models/FrameOfReference');
const Activity = require('../models/Activity');
const Topic = require('../models/Topic');
const { transact } = require('../utils/holons');

function generateId() {
  return require('crypto').randomUUID().substring(0, 8);
}

// GET /api/frame-refs
// List all frames. Optional ?search= to filter by axis labels.
router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, skip = 0 } = req.query;
    let query = {};
    if (search) {
      const re = new RegExp(search, 'i');
      query = { $or: [{ xLabel: re }, { yLabel: re }, { xMin: re }, { xMax: re }, { yMin: re }, { yMax: re }] };
    }
    const frames = await FrameOfReference.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();
    const total = await FrameOfReference.countDocuments(query);
    // Usage counts (maps built on each frame) — lets the UI show graph scale
    const counts = await Activity.aggregate([
      { $match: { frameId: { $in: frames.map(f => f.id) }, isDraft: { $ne: true } } },
      { $group: { _id: '$frameId', n: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id, c.n]));
    res.json({ frames: frames.map(f => ({ ...f, usageCount: countMap[f.id] ?? 0 })), total });
  } catch (err) {
    console.error('[frame-refs] list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch frames' });
  }
});

// GET /api/frame-refs/:id
router.get('/:id', async (req, res) => {
  try {
    const frame = await FrameOfReference.findOne({ id: req.params.id }).lean();
    if (!frame) return res.status(404).json({ error: 'Frame not found' });
    res.json({ frame });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch frame' });
  }
});

// GET /api/frame-refs/:id/usage
// Returns activities and topics that reference this frame (for the graph view)
router.get('/:id/usage', async (req, res) => {
  try {
    const frame = await FrameOfReference.findOne({ id: req.params.id }).lean();
    if (!frame) return res.status(404).json({ error: 'Frame not found' });

    const activities = await Activity.find({ frameId: req.params.id })
      .select('id title urlName activityType topicId status')
      .lean();

    const topicIds = [...new Set(activities.map(a => a.topicId).filter(Boolean))];
    const topics = topicIds.length
      ? await Topic.find({ id: { $in: topicIds } }).select('id title status instanceId').lean()
      : [];

    res.json({ frame, activities, topics });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch frame usage' });
  }
});

// POST /api/frame-refs
// Create a new frame of reference
router.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { xLabel, xMin, xMax, yLabel, yMin, yMax } = req.body;
    if (!xLabel || !yLabel) return res.status(400).json({ error: 'xLabel and yLabel are required' });

    const frame = await FrameOfReference.create({
      id: generateId(),
      xLabel: xLabel.trim(),
      xMin: xMin?.trim() || '',
      xMax: xMax?.trim() || '',
      yLabel: yLabel.trim(),
      yMin: yMin?.trim() || '',
      yMax: yMax?.trim() || '',
      createdBy: userId,
    });

    res.status(201).json({ frame });
  } catch (err) {
    console.error('[frame-refs] create error:', err.message);
    res.status(500).json({ error: 'Failed to create frame' });
  }
});

// DELETE /api/frame-refs/:id
// Remove a frame (admin only)
const requireAdmin = require('../middleware/requireAdmin');
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const frame = await FrameOfReference.findOne({ id: req.params.id });
    if (!frame) return res.status(404).json({ error: 'Frame not found' });
    await FrameOfReference.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[frame-refs] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete frame' });
  }
});

// PUT /api/frame-refs/:id
// Update a frame (creator only)
router.put('/:id', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const frame = await FrameOfReference.findOne({ id: req.params.id });
    if (!frame) return res.status(404).json({ error: 'Frame not found' });
    if (frame.createdBy !== userId) return res.status(403).json({ error: 'Only the creator can edit this frame' });

    const { xLabel, xMin, xMax, yLabel, yMin, yMax } = req.body;
    if (xLabel !== undefined) frame.xLabel = xLabel.trim();
    if (xMin !== undefined) frame.xMin = xMin.trim();
    if (xMax !== undefined) frame.xMax = xMax.trim();
    if (yLabel !== undefined) frame.yLabel = yLabel.trim();
    if (yMin !== undefined) frame.yMin = yMin.trim();
    if (yMax !== undefined) frame.yMax = yMax.trim();
    await frame.save();

    res.json({ frame });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update frame' });
  }
});

module.exports = router;
