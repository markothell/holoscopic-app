const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const User = require('../models/User');
const { transact, spend } = require('../utils/holons');
const { notify } = require('../utils/notify');

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
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Set up your Inquiry session.`, refType: 'topic', refId: topic.id });
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
    const status = req.query.status || 'nominated';
    const docs = await Topic.find({ instanceId, status }).sort({ expiresAt: 1 });
    const topics = docs.map(t => ({
      ...t.toJSON(),
      supporterCount: t.supporters.length,
      quorumThreshold: config.quorum.topicSupportThreshold,
    }));
    res.json({ topics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/inquiry
router.get('/inquiry', async (req, res) => {
  try {
    const Sequence = require('../models/Sequence');
    const topics = await Topic.find({ instanceId: req.instanceId, status: 'confirmed', inquirySequenceId: { $ne: null } })
      .sort({ confirmedAt: -1 })
      .lean({ virtuals: true });

    const enriched = await Promise.all(topics.map(async (t) => {
      const seq = await Sequence.findOne({ id: t.inquirySequenceId }).select('id title urlName description status');
      return { ...t, sequence: seq ? seq.toObject() : null };
    }));

    res.json({ inquiries: enriched });
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

  const { title, description, whyItMatters, priorTopicId, priorCycleNotes } = req.body;
  if (!title || !description || !whyItMatters) {
    return res.status(400).json({ error: 'title, description, and whyItMatters are required' });
  }

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const { nominationCost } = config.holons;
    const { topicSupportThreshold, topicWindowHours } = config.quorum;

    await spend({ userId, instanceId, type: 'nomination_cost', amount: nominationCost, refType: 'topic' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + topicWindowHours * 60 * 60 * 1000);

    const topic = new Topic({
      id: generateId(),
      instanceId,
      title,
      description,
      whyItMatters,
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
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Set up your Inquiry session.`, refType: 'topic', refId: topic.id });
    }

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/topics/:id/link-inquiry
router.post('/:id/link-inquiry', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { sequenceId } = req.body;
  if (!sequenceId) return res.status(400).json({ error: 'sequenceId is required' });

  try {
    const topic = await Topic.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.nominatedBy !== userId) return res.status(403).json({ error: 'Only the nominator can set up the inquiry' });
    if (topic.status !== 'confirmed') return res.status(400).json({ error: 'Topic must be confirmed to set up an inquiry' });

    const Sequence = require('../models/Sequence');
    const sequence = await Sequence.findOne({ id: sequenceId });
    if (!sequence) return res.status(404).json({ error: 'Sequence not found' });

    topic.inquirySequenceId = sequenceId;
    await topic.save();

    const participantIds = [...new Set([topic.nominatedBy, ...topic.supporters.map(s => s.userId)])];
    const users = await User.find({ id: { $in: participantIds } }).select('id email name');
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    for (const pid of participantIds) {
      const u = userMap[pid];
      if (u) {
        try { await sequence.addMember(u.id, u.email, u.name); } catch { /* already enrolled */ }
      }
    }

    for (const pid of topic.supporters.map(s => s.userId)) {
      await notify({ userId: pid, type: 'inquiry_linked', message: `The inquiry for "${topic.title}" is now set up. You've been enrolled.`, refType: 'topic', refId: topic.id });
    }

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
