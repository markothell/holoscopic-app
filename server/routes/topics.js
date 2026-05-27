const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const AdminConfig = require('../models/AdminConfig');
const User = require('../models/User');
const { transact, spend } = require('../utils/holons');
const { notify } = require('../utils/notify');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Confirm any nominated topics that already meet the current quorum threshold
async function sweepQuorum() {
  const config = await AdminConfig.get();
  const threshold = config.quorum.topicSupportThreshold;
  const topics = await Topic.find({ status: 'nominated' });
  for (const topic of topics) {
    if (topic.supporters.length >= threshold) {
      topic.status = 'confirmed';
      topic.confirmedAt = new Date();
      topic.holonPool = config.holons.nominationCost + topic.supporters.reduce((sum, s) => sum + s.holonsWagered, 0);
      await topic.save();
      await transact({ userId: topic.nominatedBy, type: 'session_host_reward', amount: config.holons.topicQuorumReward, refType: 'topic', refId: topic.id });
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Set up your Inquiry session.`, refType: 'topic', refId: topic.id });
    }
  }
}

// Run expiry sweep — mark expired nominations and return Holons
async function sweepExpired() {
  const expired = await Topic.find({ status: 'nominated', expiresAt: { $lte: new Date() } });
  for (const topic of expired) {
    topic.status = 'expired';
    await topic.save();
    // Return Holons to nominator and all supporters
    const allWagers = [
      { userId: topic.nominatedBy, type: 'nomination_return' },
      ...topic.supporters.map(s => ({ userId: s.userId, type: 'support_return', amount: s.holonsWagered })),
    ];
    // Return nomination cost from config
    const config = await AdminConfig.get();
    await transact({ userId: topic.nominatedBy, type: 'nomination_return', amount: config.holons.nominationCost, refType: 'topic', refId: topic.id });
    for (const s of topic.supporters) {
      await transact({ userId: s.userId, type: 'support_return', amount: s.holonsWagered, refType: 'topic', refId: topic.id });
    }
  }
  return expired.length;
}

// GET /api/topics — list topics
// ?status=nominated|confirmed|expired (default: nominated)
router.get('/', async (req, res) => {
  try {
    await sweepExpired();
    await sweepQuorum();
    const status = req.query.status || 'nominated';
    const [docs, config] = await Promise.all([
      Topic.find({ status }).sort({ expiresAt: 1 }),
      AdminConfig.get(),
    ]);
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

// GET /api/topics/inquiry — confirmed topics with a linked sequence (must be before /:id)
router.get('/inquiry', async (req, res) => {
  try {
    const Sequence = require('../models/Sequence');
    const topics = await Topic.find({ status: 'confirmed', inquirySequenceId: { $ne: null } })
      .sort({ confirmedAt: -1 })
      .lean({ virtuals: true });

    const enriched = await Promise.all(topics.map(async (t) => {
      const seq = await Sequence.findOne({ id: t.inquirySequenceId })
        .select('id title urlName description status');
      return { ...t, sequence: seq ? seq.toObject() : null };
    }));

    res.json({ inquiries: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/topics/:id — single topic
router.get('/:id', async (req, res) => {
  try {
    await sweepQuorum();
    const [doc, config] = await Promise.all([
      Topic.findOne({ id: req.params.id }),
      AdminConfig.get(),
    ]);
    if (!doc) return res.status(404).json({ error: 'Topic not found' });
    const topic = {
      ...doc.toJSON(),
      supporterCount: doc.supporters.length,
      quorumThreshold: config.quorum.topicSupportThreshold,
    };
    res.json({ topic });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/nominate — create a nomination
router.post('/nominate', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, description, whyItMatters, priorTopicId, priorCycleNotes } = req.body;
  if (!title || !description || !whyItMatters) {
    return res.status(400).json({ error: 'title, description, and whyItMatters are required' });
  }

  try {
    const config = await AdminConfig.get();
    const { nominationCost, startingStake } = config.holons;
    const { topicSupportThreshold, topicWindowHours } = config.quorum;

    // Deduct nomination cost
    await spend({ userId, type: 'nomination_cost', amount: nominationCost, refType: 'topic' });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + topicWindowHours * 60 * 60 * 1000);

    const topic = new Topic({
      id: generateId(),
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

// POST /api/topics/:id/support — support a nomination
router.post('/:id/support', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await sweepExpired();
    const topic = await Topic.findOne({ id: req.params.id });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.status !== 'nominated') return res.status(400).json({ error: 'Topic is no longer open for support' });
    if (topic.nominatedBy === userId) return res.status(400).json({ error: 'Cannot support your own nomination' });
    if (topic.supporters.some(s => s.userId === userId)) {
      return res.status(400).json({ error: 'Already supporting this topic' });
    }

    const config = await AdminConfig.get();
    const { supportCost } = config.holons;

    await spend({ userId, type: 'support_cost', amount: supportCost, refType: 'topic', refId: topic.id });

    topic.supporters.push({ userId, holonsWagered: supportCost });
    await topic.save();

    // Check quorum against current config threshold
    if (topic.supporters.length >= config.quorum.topicSupportThreshold) {
      topic.status = 'confirmed';
      topic.confirmedAt = new Date();
      topic.holonPool = config.holons.nominationCost + (supportCost * topic.supporters.length);
      await topic.save();

      await transact({ userId: topic.nominatedBy, type: 'session_host_reward', amount: config.holons.topicQuorumReward, refType: 'topic', refId: topic.id });
      await notify({ userId: topic.nominatedBy, type: 'topic_confirmed', message: `Your topic "${topic.title}" reached quorum. Set up your Inquiry session.`, refType: 'topic', refId: topic.id });
    }

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/topics/:id/link-inquiry — nominator links a sequence to a confirmed topic
router.post('/:id/link-inquiry', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { sequenceId } = req.body;
  if (!sequenceId) return res.status(400).json({ error: 'sequenceId is required' });

  try {
    const topic = await Topic.findOne({ id: req.params.id });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.nominatedBy !== userId) return res.status(403).json({ error: 'Only the nominator can set up the inquiry' });
    if (topic.status !== 'confirmed') return res.status(400).json({ error: 'Topic must be confirmed to set up an inquiry' });

    // Verify sequence exists
    const Sequence = require('../models/Sequence');
    const sequence = await Sequence.findOne({ id: sequenceId });
    if (!sequence) return res.status(404).json({ error: 'Sequence not found' });

    topic.inquirySequenceId = sequenceId;
    await topic.save();

    // Auto-enroll nominator + all supporters into the sequence
    const participantIds = [topic.nominatedBy, ...topic.supporters.map(s => s.userId)];
    const uniqueIds = [...new Set(participantIds)];
    const users = await User.find({ id: { $in: uniqueIds } }).select('id email name');
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    for (const pid of uniqueIds) {
      const u = userMap[pid];
      if (u) {
        try {
          await sequence.addMember(u.id, u.email, u.name);
        } catch { /* already enrolled — ignore */ }
      }
    }

    // Notify supporters that the inquiry is ready
    for (const pid of topic.supporters.map(s => s.userId)) {
      await notify({ userId: pid, type: 'inquiry_linked', message: `The inquiry for "${topic.title}" is now set up. You've been enrolled.`, refType: 'topic', refId: topic.id });
    }

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/topics/:id/unsupport — withdraw support (only while still nominated)
router.post('/:id/unsupport', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const topic = await Topic.findOne({ id: req.params.id });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.status !== 'nominated') return res.status(400).json({ error: 'Cannot withdraw support after quorum reached' });

    const supporter = topic.supporters.find(s => s.userId === userId);
    if (!supporter) return res.status(400).json({ error: 'Not supporting this topic' });

    topic.supporters = topic.supporters.filter(s => s.userId !== userId);
    await topic.save();

    await transact({ userId, type: 'support_return', amount: supporter.holonsWagered, refType: 'topic', refId: topic.id });

    res.json({ topic: topic.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
