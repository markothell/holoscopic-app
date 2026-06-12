const express = require('express');
const router = express.Router();
const Algorithm = require('../models/Algorithm');
const AlgorithmProposal = require('../models/AlgorithmProposal');
const Sequence = require('../models/Sequence');
const User = require('../models/User');
const { spend, transact } = require('../utils/holons');
const { notify } = require('../utils/notify');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function toSlug(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 35) + '-' + Math.random().toString(36).substring(2, 6);
}

async function cloneSequence(fromSequenceId, title, createdBy) {
  const source = await Sequence.findOne({ id: fromSequenceId }).lean();
  if (!source) return null;
  const urlName = toSlug(title || source.title);
  return await Sequence.create({
    title: title || source.title,
    urlName,
    description: source.description || '',
    createdBy,
    activities: (source.activities || []).map(a => ({
      activityId: a.activityId,
      order: a.order,
      autoClose: a.autoClose || false,
      duration: a.duration || null,
      openedAt: null,
      closedAt: null,
      parentActivityIds: a.parentActivityIds || [],
      round: a.round || null,
      openOnCreate: a.openOnCreate || false,
    })),
    welcomePage: source.welcomePage || {},
    status: 'active',
    startedAt: new Date(),
  });
}

async function activateProposal(proposal, algorithm, instanceId, config) {
  if (proposal.status !== 'open') return null;
  if (proposal.signups.length < proposal.quorumThreshold) return null;

  const title = `${algorithm.title} — ${proposal.intent.substring(0, 50)}`;
  let sequence;

  try {
    if (algorithm.sequenceId) {
      sequence = await cloneSequence(algorithm.sequenceId, title, proposal.proposedBy);
    } else {
      sequence = await Sequence.create({
        title,
        urlName: toSlug(algorithm.title),
        description: '',
        createdBy: proposal.proposedBy,
        activities: [],
        status: 'active',
        startedAt: new Date(),
      });
    }
  } catch (err) {
    console.error('[activateProposal] sequence create/clone failed:', err.message);
    throw err;
  }
  if (!sequence) return null;

  const userIds = proposal.signups.map(s => s.userId);
  const users = await User.find({ id: { $in: userIds } }).select('id email name').lean();
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));
  for (const uid of userIds) {
    const u = userMap[uid];
    if (u) { try { await sequence.addMember(u.id, u.email, u.name); } catch { } }
  }

  proposal.status = 'active';
  proposal.sequenceId = sequence.id;
  await proposal.save();

  // Quorum met — settle the proposal economy:
  // deposits return to everyone, host and participants earn their rewards.
  const instConfig = config?.holons || {};
  const depositAmount = instConfig.supportCost ?? 5;
  for (const uid of userIds) {
    try {
      await transact({ userId: uid, instanceId, type: 'algorithm_proposal_return', amount: depositAmount, refType: 'algorithm', refId: proposal.algorithmId });
      await transact({ userId: uid, instanceId, type: 'session_participant_reward', amount: instConfig.sessionParticipantReward ?? 15, refType: 'sequence', refId: sequence.id });
    } catch (e) { console.error('[activateProposal] settle error:', e.message); }
  }
  try {
    await transact({ userId: proposal.proposedBy, instanceId, type: 'session_host_reward', amount: instConfig.sessionHostReward ?? 30, refType: 'sequence', refId: sequence.id });
  } catch (e) { console.error('[activateProposal] host reward error:', e.message); }

  for (const uid of userIds) {
    await notify({
      userId: uid,
      type: 'algorithm_session_ready',
      message: `The group session for "${algorithm.title}" is live. You've been enrolled.`,
      refType: 'sequence',
      refId: sequence.urlName,
    });
  }

  return sequence;
}

// Expired proposals refund everyone — same liability rule as topic expiry.
async function sweepExpiredProposals(instanceId, config) {
  const depositAmount = config?.holons?.supportCost ?? 5;
  const expired = await AlgorithmProposal.find({ instanceId, status: 'open', expiresAt: { $lte: new Date() } });
  for (const proposal of expired) {
    proposal.status = 'cancelled';
    await proposal.save();
    for (const s of proposal.signups) {
      try {
        await transact({ userId: s.userId, instanceId, type: 'algorithm_proposal_return', amount: depositAmount, refType: 'algorithm', refId: proposal.algorithmId });
      } catch (e) { console.error('[algorithms] proposal refund error:', e.message); }
    }
  }
  return expired.length;
}

// GET /api/algorithms
router.get('/', async (req, res) => {
  try {
    const algorithms = await Algorithm.find({ instanceId: req.instanceId, status: 'published' })
      .sort({ publishedAt: -1 })
      .lean();

    const authorIds = [...new Set(algorithms.map(a => a.authorId))];
    const authors = await User.find({ id: { $in: authorIds } }).select('id name').lean();
    const authorMap = Object.fromEntries(authors.map(u => [u.id, u.name]));

    // Step counts from linked sequences — lets the UI show graph scale
    const seqIds = algorithms.map(a => a.sequenceId).filter(Boolean);
    const seqs = seqIds.length
      ? await Sequence.find({ id: { $in: seqIds } }).select('id activities').lean()
      : [];
    const stepMap = Object.fromEntries(seqs.map(s => [s.id, (s.activities || []).length]));

    res.json({ algorithms: algorithms.map(a => ({
      ...a,
      authorName: authorMap[a.authorId] || 'Unknown',
      activityCount: a.sequenceId ? (stepMap[a.sequenceId] ?? 0) : 0,
    })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/algorithms/my-sessions
router.get('/my-sessions', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.json({ sessions: [] });

  try {
    const proposals = await AlgorithmProposal.find({
      instanceId: req.instanceId,
      status: 'active',
      sequenceId: { $ne: null },
      'signups.userId': userId,
    }).sort({ createdAt: -1 }).lean();

    const algorithmIds = [...new Set(proposals.map(p => p.algorithmId))];
    const sequenceIds = proposals.map(p => p.sequenceId).filter(Boolean);

    const [algorithms, sequences] = await Promise.all([
      Algorithm.find({ id: { $in: algorithmIds } }).select('id title').lean(),
      Sequence.find({ id: { $in: sequenceIds } }).select('id urlName title status').lean(),
    ]);

    const algMap = Object.fromEntries(algorithms.map(a => [a.id, a.title]));
    const seqMap = Object.fromEntries(sequences.map(s => [s.id, s]));

    const sessions = proposals.map(p => ({
      proposalId: p.id,
      algorithmId: p.algorithmId,
      algorithmTitle: algMap[p.algorithmId] || 'Unknown',
      intent: p.intent,
      sequenceId: p.sequenceId,
      sequenceUrlName: seqMap[p.sequenceId]?.urlName || null,
      sequenceTitle: seqMap[p.sequenceId]?.title || null,
      sequenceStatus: seqMap[p.sequenceId]?.status || null,
      createdAt: p.createdAt,
    }));

    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/algorithms/proposals
router.get('/proposals', async (req, res) => {
  try {
    // Refund deposits on any proposals whose window ended (sweep-on-read)
    await sweepExpiredProposals(req.instanceId, req.instance.config);

    const proposals = await AlgorithmProposal.find({
      instanceId: req.instanceId,
      status: 'open',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).lean();

    const algorithmIds = [...new Set(proposals.map(p => p.algorithmId))];
    const proposerIds  = [...new Set(proposals.map(p => p.proposedBy))];

    const [algorithms, users] = await Promise.all([
      Algorithm.find({ id: { $in: algorithmIds } }).select('id title').lean(),
      User.find({ id: { $in: proposerIds } }).select('id name').lean(),
    ]);

    const algMap  = Object.fromEntries(algorithms.map(a => [a.id, a.title]));
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    res.json({ proposals: proposals.map(p => ({ ...p, algorithmTitle: algMap[p.algorithmId] || 'Unknown', proposedByName: userMap[p.proposedBy] || 'Unknown' })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/algorithms/:id
router.get('/:id', async (req, res) => {
  try {
    const algorithm = await Algorithm.findOne({ id: req.params.id, instanceId: req.instanceId }).lean();
    if (!algorithm) return res.status(404).json({ error: 'Algorithm not found' });

    const author = await User.findOne({ id: algorithm.authorId }).select('id name').lean();
    const forks  = await Algorithm.find({ forkParentId: algorithm.id, instanceId: req.instanceId, status: 'published' }).select('id title authorId publishedAt').lean();
    const forkAuthorIds = [...new Set(forks.map(f => f.authorId))];
    const forkAuthors   = await User.find({ id: { $in: forkAuthorIds } }).select('id name').lean();
    const forkAuthorMap = Object.fromEntries(forkAuthors.map(u => [u.id, u.name]));

    res.json({ algorithm: { ...algorithm, authorName: author?.name || 'Unknown', forks: forks.map(f => ({ ...f, authorName: forkAuthorMap[f.authorId] || 'Unknown' })) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/algorithms/:id/proposals
router.get('/:id/proposals', async (req, res) => {
  try {
    const proposals = await AlgorithmProposal.find({
      algorithmId: req.params.id,
      instanceId: req.instanceId,
      status: 'open',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).lean();

    const proposerIds = [...new Set(proposals.map(p => p.proposedBy))];
    const users = await User.find({ id: { $in: proposerIds } }).select('id name').lean();
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    res.json({ proposals: proposals.map(p => ({ ...p, proposedByName: userMap[p.proposedBy] || 'Unknown' })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/algorithms/:id/proposals
router.post('/:id/proposals', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { intent } = req.body;
  if (!intent || !intent.trim()) return res.status(400).json({ error: 'intent is required' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const algorithm = await Algorithm.findOne({ id: req.params.id, instanceId, status: 'published' });
    if (!algorithm) return res.status(404).json({ error: 'Algorithm not found' });

    const supportCost = config.holons?.supportCost ?? 5;
    const algorithmSessionQuorum = config.quorum?.algorithmSessionQuorum ?? 3;
    const algorithmProposalWindowHours = config.quorum?.algorithmProposalWindowHours ?? 48;

    await spend({ userId, instanceId, type: 'algorithm_proposal', amount: supportCost, refType: 'algorithm' });

    const expiresAt = new Date(Date.now() + algorithmProposalWindowHours * 60 * 60 * 1000);
    const proposal = await AlgorithmProposal.create({
      instanceId,
      algorithmId: algorithm.id,
      proposedBy: userId,
      intent: intent.trim(),
      signups: [{ userId, joinedAt: new Date() }],
      quorumThreshold: algorithmSessionQuorum,
      expiresAt,
    });

    const sequence = await activateProposal(proposal, algorithm, instanceId, config);
    const proposer = await User.findOne({ id: userId }).select('name').lean();

    res.status(201).json({
      proposal: { ...proposal.toObject(), proposedByName: proposer?.name || 'Unknown' },
      sessionStarted: !!sequence,
      sequenceUrlName: sequence?.urlName || null,
    });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/algorithms/:id/proposals/:proposalId/join
router.post('/:id/proposals/:proposalId/join', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const proposal = await AlgorithmProposal.findOne({ id: req.params.proposalId, algorithmId: req.params.id, instanceId });
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'open') return res.status(400).json({ error: 'Proposal is no longer open' });
    if (proposal.expiresAt < new Date()) return res.status(400).json({ error: 'Proposal has expired' });
    if (proposal.signups.some(s => s.userId === userId)) return res.status(400).json({ error: 'Already signed up' });

    const algorithm = await Algorithm.findOne({ id: req.params.id, instanceId });
    if (!algorithm) return res.status(404).json({ error: 'Algorithm not found' });

    await spend({ userId, instanceId, type: 'algorithm_proposal_join', amount: config.holons?.supportCost ?? 5, refType: 'algorithm' });

    proposal.signups.push({ userId, joinedAt: new Date() });
    await proposal.save();

    const sequence = await activateProposal(proposal, algorithm, instanceId, config);
    res.json({ proposal: proposal.toObject(), sessionStarted: !!sequence, sequenceUrlName: sequence?.urlName || null });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// POST /api/algorithms/:id/proposals/:proposalId/withdraw
router.post('/:id/proposals/:proposalId/withdraw', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const proposal = await AlgorithmProposal.findOne({ id: req.params.proposalId, algorithmId: req.params.id, instanceId: req.instanceId });
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'open') return res.status(400).json({ error: 'Cannot withdraw from an active or cancelled proposal' });
    if (!proposal.signups.some(s => s.userId === userId)) return res.status(400).json({ error: 'Not signed up' });
    if (proposal.proposedBy === userId) return res.status(400).json({ error: 'Proposer cannot withdraw — cancel the proposal instead' });

    proposal.signups = proposal.signups.filter(s => s.userId !== userId);
    await proposal.save();
    // Wager returned in full — same promise as topic support withdrawal
    await transact({ userId, instanceId: req.instanceId, type: 'algorithm_proposal_return', amount: req.instance.config?.holons?.supportCost ?? 5, refType: 'algorithm', refId: proposal.algorithmId });
    res.json({ proposal: proposal.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/algorithms/publish
router.post('/publish', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, thesis, description, sequenceId } = req.body;
  if (!title || !thesis) return res.status(400).json({ error: 'title and thesis are required' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const { algorithmPublishCost } = config.holons;

    await spend({ userId, instanceId, type: 'algorithm_publish_cost', amount: algorithmPublishCost, refType: 'algorithm' });

    const algorithm = await Algorithm.create({
      id: generateId(),
      instanceId,
      title,
      thesis,
      description: description || '',
      authorId: userId,
      sequenceId: sequenceId || null,
      forkParentId: null,
      forkDepth: 0,
      royaltyPercent: 0,
    });

    res.status(201).json({ algorithm });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

// PATCH /api/algorithms/:id/sequence
router.patch('/:id/sequence', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const algorithm = await Algorithm.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!algorithm) return res.status(404).json({ error: 'Algorithm not found' });
    if (algorithm.authorId !== userId) return res.status(403).json({ error: 'Only the author can update the sequence link' });

    algorithm.sequenceId = req.body.sequenceId || null;
    await algorithm.save();
    res.json({ algorithm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/algorithms/:id/fork
router.post('/:id/fork', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { title, thesis, description, sequenceId } = req.body;
  if (!title || !thesis) return res.status(400).json({ error: 'title and thesis are required' });

  try {
    const { instanceId } = req;
    const config = req.instance.config;
    const parent = await Algorithm.findOne({ id: req.params.id, instanceId, status: 'published' });
    if (!parent) return res.status(404).json({ error: 'Algorithm not found' });

    const { algorithmPublishCost, forkRoyaltyDecayPercent, forkDepthCap } = config.holons;

    if (parent.forkDepth >= forkDepthCap) {
      return res.status(400).json({ error: `Fork depth limit of ${forkDepthCap} reached` });
    }

    await spend({ userId, instanceId, type: 'algorithm_publish_cost', amount: algorithmPublishCost, refType: 'algorithm' });

    const royaltyPool = algorithmPublishCost * (forkRoyaltyDecayPercent / 100);
    let remaining = royaltyPool;
    let current = parent;
    while (current && remaining >= 1) {
      const share = Math.floor(remaining);
      if (share > 0) {
        await transact({ userId: current.authorId, instanceId, type: 'algorithm_royalty', amount: share, refType: 'algorithm', refId: current.id });
      }
      remaining = remaining * (forkRoyaltyDecayPercent / 100);
      if (!current.forkParentId) break;
      current = await Algorithm.findOne({ id: current.forkParentId });
    }

    let clonedSequenceId = sequenceId || null;
    let newSequenceUrlName = null;
    if (!sequenceId && parent.sequenceId) {
      const cloned = await cloneSequence(parent.sequenceId, `${title} — session`, userId);
      if (cloned) {
        clonedSequenceId = cloned.id;
        newSequenceUrlName = cloned.urlName;
        cloned.status = 'draft';
        await cloned.save();
      }
    }

    const fork = await Algorithm.create({
      id: generateId(),
      instanceId,
      title,
      thesis,
      description: description || '',
      authorId: userId,
      sequenceId: clonedSequenceId,
      forkParentId: parent.id,
      forkDepth: parent.forkDepth + 1,
      royaltyPercent: forkRoyaltyDecayPercent,
    });

    res.status(201).json({ algorithm: fork, newSequenceUrlName });
  } catch (err) {
    res.status(err.message === 'Insufficient Holons' ? 402 : 500).json({ error: err.message });
  }
});

module.exports = router;
