const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const Activity = require('../models/Activity');
const { transact, spend } = require('../utils/holons');
const { notify } = require('../utils/notify');

// Per-topic activity rollup: breadth (maps) and depth (entries + comments).
// Score = 5×maps + 2×participants + 1×(ratings + comments).
async function activityRollup(topicIds) {
  if (topicIds.length === 0) return {};
  const rows = await Activity.aggregate([
    { $match: { topicId: { $in: topicIds }, isDraft: { $ne: true } } },
    { $project: {
      topicId: 1,
      participants: { $size: { $ifNull: ['$participants', []] } },
      ratings: { $size: { $ifNull: ['$ratings', []] } },
      comments: { $size: { $ifNull: ['$comments', []] } },
    } },
    { $group: {
      _id: '$topicId',
      maps: { $sum: 1 },
      participants: { $sum: '$participants' },
      ratings: { $sum: '$ratings' },
      comments: { $sum: '$comments' },
    } },
  ]);
  return Object.fromEntries(rows.map(r => [r._id, {
    activityCount: r.maps,
    activityScore: r.maps * 5 + r.participants * 2 + r.ratings + r.comments,
  }]));
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

async function sweepQuorum(instanceId, config) {
  const threshold = config.quorum.topicSupportThreshold;
  const topics = await Topic.find({ instanceId, status: 'nominated' });
  for (const topic of topics) {
    if (topic.supporters.length >= threshold) {
      topic.status = 'confirmed';
      topic.confirmedAt = new Date();
      topic.holonPool = config.holons.nominationCost + topic.supporters.reduce((sum, s) => sum + s.holonsWagered, 0);
      await topic.save();
      await transact({ userId: topic.nominatedBy, instanceId, type: 'session_host_reward', amount: config.holons.topicQuorumReward, refType: 'topic', refId: topic.id });
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Create an activity to start mapping.`, refType: 'topic', refId: topic.id });
    }
  }
}

async function sweepExpired(instanceId, config) {
  const expired = await Topic.find({ instanceId, status: 'nominated', expiresAt: { $lte: new Date() } });
  for (const topic of expired) {
    topic.status = 'expired';
    await topic.save();
    await transact({ userId: topic.nominatedBy, instanceId, type: 'nomination_return', amount: config.holons.nominationCost, refType: 'topic', refId: topic.id });
    for (const s of topic.supporters) {
      await transact({ userId: s.userId, instanceId, type: 'support_return', amount: s.holonsWagered, refType: 'topic', refId: topic.id });
    }
  }
  return expired.length;
}

// GET /api/topics
router.get('/', async (req, res) => {
  try {
    const { instanceId } = req;
    const config = req.instance.config;
    await sweepExpired(instanceId, config);
    await sweepQuorum(instanceId, config);
    const statuses = String(req.query.status || 'nominated').split(',').map(s => s.trim()).filter(Boolean);
    const docs = await Topic.find({ instanceId, status: { $in: statuses } }).sort({ expiresAt: 1 });
    const rollup = await activityRollup(docs.map(t => t.id));
    const topics = docs.map(t => ({
      ...t.toJSON(),
      supporterCount: t.supporters.length,
      quorumThreshold: config.quorum.topicSupportThreshold,
      activityCount: rollup[t.id]?.activityCount ?? 0,
      activityScore: rollup[t.id]?.activityScore ?? 0,
    }));
    res.json({ topics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/:id
router.get('/:id', async (req, res) => {
  try {
    const config = req.instance.config;
    await sweepQuorum(req.instanceId, config);
    const doc = await Topic.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!doc) return res.status(404).json({ error: 'Topic not found' });
    res.json({
      topic: {
        ...doc.toJSON(),
        supporterCount: doc.supporters.length,
        quorumThreshold: config.quorum.topicSupportThreshold,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/nominate
router.post('/nominate', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description, priorTopicId, priorCycleNotes } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const { nominationCost } = config.holons;
    const { topicSupportThreshold, topicWindowHours } = config.quorum;

    // Exact duplicates are blocked while a topic is alive — overlapping
    // questions belong inside the topic as activities, not as parallel topics.
    // (Expired topics may be renominated.)
    const normalized = String(title).trim();
    const duplicate = await Topic.findOne({
      instanceId,
      status: { $in: ['nominated', 'confirmed'] },
      title: { $regex: `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (duplicate) {
      return res.status(409).json({
        error: `"${duplicate.title}" is already ${duplicate.status === 'confirmed' ? 'open' : 'seeking support'} — support it or add an activity instead`,
        duplicateTopicId: duplicate.id,
      });
    }

    await spend({ userId, instanceId, type: 'nomination_cost', amount: nominationCost, refType: 'topic' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + topicWindowHours * 60 * 60 * 1000);

    const topic = new Topic({
      id: generateId(),
      instanceId,
      title,
      description,
      nominatedBy: userId,
      quorumThreshold: topicSupportThreshold,
      nominatedAt: now,
      expiresAt,
      priorTopicId: priorTopicId || null,
      priorCycleNotes: priorCycleNotes || null,
    });

    await topic.save();
    res.status(201).json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/topics/:id/support
router.post('/:id/support', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    await sweepExpired(instanceId, config);

    const topic = await Topic.findOne({ id: req.params.id, instanceId });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.status !== 'nominated') return res.status(400).json({ error: 'Topic is no longer open for support' });
    if (topic.nominatedBy === userId) return res.status(400).json({ error: 'Cannot support your own nomination' });
    if (topic.supporters.some(s => s.userId === userId)) return res.status(400).json({ error: 'Already supporting this topic' });

    const { supportCost } = config.holons;
    await spend({ userId, instanceId, type: 'support_cost', amount: supportCost, refType: 'topic', refId: topic.id });

    topic.supporters.push({ userId, holonsWagered: supportCost });
    await topic.save();

    if (topic.supporters.length >= config.quorum.topicSupportThreshold) {
      topic.status = 'confirmed';
      topic.confirmedAt = new Date();
      topic.holonPool = config.holons.nominationCost + (supportCost * topic.supporters.length);
      await topic.save();
      await transact({ userId: topic.nominatedBy, instanceId, type: 'session_host_reward', amount: config.holons.topicQuorumReward, refType: 'topic', refId: topic.id });
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Create an activity to start mapping.`, refType: 'topic', refId: topic.id });
    }

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/topics/:id/unsupport
router.post('/:id/unsupport', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const topic = await Topic.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.status !== 'nominated') return res.status(400).json({ error: 'Cannot withdraw support after quorum reached' });

    const supporter = topic.supporters.find(s => s.userId === userId);
    if (!supporter) return res.status(400).json({ error: 'Not supporting this topic' });

    topic.supporters = topic.supporters.filter(s => s.userId !== userId);
    await topic.save();

    await transact({ userId, instanceId: req.instanceId, type: 'support_return', amount: supporter.holonsWagered, refType: 'topic', refId: topic.id });
    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
