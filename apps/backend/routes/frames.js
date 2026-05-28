const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');
const FrameNomination = require('../models/FrameNomination');
const User = require('../models/User');
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

function getQuadrant(x, y) {
  if (x > 0.5 && y > 0.5) return 'NE';
  if (x <= 0.5 && y > 0.5) return 'NW';
  if (x <= 0.5 && y <= 0.5) return 'SW';
  return 'SE';
}

// GET /api/frames/entries/:activityId
// Returns all entries with vote counts, quadrant, and auto-selected top nominations
router.get('/entries/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params;
    const activity = await Activity.findOne({ id: activityId }).lean();
    if (!activity) return res.status(404).json({ error: 'Activity not found' });

    const commentMap = {};
    for (const c of activity.comments || []) {
      commentMap[`${c.userId}:${c.slotNumber ?? 1}`] = c;
    }

    const entries = (activity.ratings || []).map(r => {
      const slot = r.slotNumber ?? 1;
      const comment = commentMap[`${r.userId}:${slot}`] || null;
      const x = r.position?.x ?? 0.5;
      const y = r.position?.y ?? 0.5;
      return {
        userId: r.userId,
        username: r.username,
        objectName: r.objectName || '',
        slotNumber: slot,
        position: { x, y },
        quadrant: getQuadrant(x, y),
        voteCount: comment?.voteCount ?? 0,
        commentText: comment?.text || '',
      };
    });

    // top_voted: entry with most votes overall
    const topVoted = entries.length
      ? entries.reduce((best, e) => e.voteCount > best.voteCount ? e : best, entries[0])
      : null;

    // top_voted_per_quadrant: highest-vote entry in each quadrant
    const quadrants = ['NE', 'NW', 'SW', 'SE'];
    const topPerQuadrant = {};
    for (const q of quadrants) {
      const inQ = entries.filter(e => e.quadrant === q);
      if (inQ.length) {
        topPerQuadrant[q] = inQ.reduce((best, e) => e.voteCount > best.voteCount ? e : best, inQ[0]);
      }
    }

    res.json({ entries, topVoted, topPerQuadrant });
  } catch (err) {
    console.error('[frames] entries error:', err.message);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// POST /api/frames/nominate
// Facilitator nominates an entry (or uses auto-selection) to create the next activity
router.post('/nominate', async (req, res) => {
  try {
    const facilitatorId = req.headers['x-user-id'];
    if (!facilitatorId) return res.status(401).json({ error: 'Not authenticated' });

    const { sequenceId, sourceActivityId, selectionMethod, nomineeUserId, entrySlotNumber } = req.body;
    if (!sequenceId || !sourceActivityId || !selectionMethod) {
      return res.status(400).json({ error: 'sequenceId, sourceActivityId, selectionMethod required' });
    }

    const sequence = await Sequence.findOne({ id: sequenceId });
    if (!sequence) return res.status(404).json({ error: 'Sequence not found' });

    // Verify facilitator is sequence owner
    if (sequence.createdBy !== facilitatorId) {
      return res.status(403).json({ error: 'Only the sequence facilitator can nominate frames' });
    }

    const activity = await Activity.findOne({ id: sourceActivityId }).lean();
    if (!activity) return res.status(404).json({ error: 'Source activity not found' });

    const commentMap = {};
    for (const c of activity.comments || []) {
      commentMap[`${c.userId}:${c.slotNumber ?? 1}`] = c;
    }

    const entries = (activity.ratings || []).map(r => {
      const slot = r.slotNumber ?? 1;
      const comment = commentMap[`${r.userId}:${slot}`] || null;
      const x = r.position?.x ?? 0.5;
      const y = r.position?.y ?? 0.5;
      return { userId: r.userId, username: r.username, objectName: r.objectName || '', slotNumber: slot, position: { x, y }, quadrant: getQuadrant(x, y), voteCount: comment?.voteCount ?? 0 };
    });

    let targetEntry = null;

    if (selectionMethod === 'manual') {
      if (!nomineeUserId) return res.status(400).json({ error: 'nomineeUserId required for manual selection' });
      const slot = entrySlotNumber ?? 1;
      targetEntry = entries.find(e => e.userId === nomineeUserId && e.slotNumber === slot);
      if (!targetEntry) return res.status(404).json({ error: 'Entry not found for that user/slot' });
    } else if (selectionMethod === 'top_voted') {
      if (!entries.length) return res.status(400).json({ error: 'No entries in this activity' });
      targetEntry = entries.reduce((best, e) => e.voteCount > best.voteCount ? e : best, entries[0]);
    } else if (selectionMethod === 'top_voted_per_quadrant') {
      // Create one nomination per quadrant that has entries
      const quadrants = ['NE', 'NW', 'SW', 'SE'];
      const nominations = [];
      for (const q of quadrants) {
        const inQ = entries.filter(e => e.quadrant === q);
        if (!inQ.length) continue;
        const best = inQ.reduce((b, e) => e.voteCount > b.voteCount ? e : b, inQ[0]);
        const nominee = await User.findOne({ id: best.userId }).select('id name').lean();
        const nom = await FrameNomination.create({
          sequenceId, sequenceUrlName: sequence.urlName, sourceActivityId,
          nomineeUserId: best.userId, nomineeUsername: best.username,
          entryObjectName: best.objectName, entrySlotNumber: best.slotNumber,
          selectionMethod, nominatedBy: facilitatorId,
        });
        await notify({
          userId: best.userId,
          type: 'frame_nominated',
          message: `You've been nominated to create the next frame for "${sequence.title}" based on your entry "${best.objectName || 'your entry'}".`,
          refType: 'frame_nomination',
          refId: nom.id,
        });
        nominations.push(nom);
      }
      return res.status(201).json({ nominations });
    }

    // Single nomination (manual or top_voted)
    const nominee = await User.findOne({ id: targetEntry.userId }).select('id name').lean();
    const nomination = await FrameNomination.create({
      sequenceId, sequenceUrlName: sequence.urlName, sourceActivityId,
      nomineeUserId: targetEntry.userId, nomineeUsername: targetEntry.username,
      entryObjectName: targetEntry.objectName, entrySlotNumber: targetEntry.slotNumber,
      selectionMethod, nominatedBy: facilitatorId,
    });

    await notify({
      userId: targetEntry.userId,
      type: 'frame_nominated',
      message: `You've been nominated to create the next frame for "${sequence.title}" based on your entry "${targetEntry.objectName || 'your entry'}".`,
      refType: 'frame_nomination',
      refId: nomination.id,
    });

    res.status(201).json({ nomination });
  } catch (err) {
    console.error('[frames] nominate error:', err.message);
    res.status(500).json({ error: 'Failed to create nomination' });
  }
});

// GET /api/frames/:id
// Get nomination details (for the nominee's form page)
router.get('/:id', async (req, res) => {
  try {
    const nomination = await FrameNomination.findOne({ id: req.params.id }).lean();
    if (!nomination) return res.status(404).json({ error: 'Nomination not found' });

    const sourceActivity = await Activity.findOne({ id: nomination.sourceActivityId })
      .select('id title xAxis yAxis mapQuestion commentQuestion objectNameQuestion')
      .lean();

    res.json({ nomination, sourceActivity });
  } catch (err) {
    console.error('[frames] get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch nomination' });
  }
});

// POST /api/frames/:id/submit
// Nominee submits activity creation form — creates activity and appends to sequence
router.post('/:id/submit', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const nomination = await FrameNomination.findOne({ id: req.params.id });
    if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
    if (nomination.nomineeUserId !== userId) return res.status(403).json({ error: 'Not your nomination' });
    if (nomination.status !== 'pending') return res.status(400).json({ error: `Nomination already ${nomination.status}` });

    const { title, xAxis, yAxis, mapQuestion, commentQuestion, objectNameQuestion, preamble } = req.body;
    if (!title || !xAxis?.label || !yAxis?.label || !mapQuestion || !commentQuestion) {
      return res.status(400).json({ error: 'title, xAxis, yAxis, mapQuestion, commentQuestion are required' });
    }

    const user = await User.findOne({ id: userId }).select('id name').lean();
    const urlName = toSlug(title);

    const activity = await Activity.create({
      title: title.trim(),
      urlName,
      mapQuestion: mapQuestion.trim(),
      xAxis: { label: xAxis.label.trim(), min: xAxis.min?.trim() || '', max: xAxis.max?.trim() || '' },
      yAxis: { label: yAxis.label.trim(), min: yAxis.min?.trim() || '', max: yAxis.max?.trim() || '' },
      commentQuestion: commentQuestion.trim(),
      objectNameQuestion: objectNameQuestion ? objectNameQuestion.trim() : 'Name something that represents your perspective',
      preamble: preamble ? preamble.trim() : '',
      author: { userId, name: user?.name || '' },
      status: 'active',
    });

    // Append activity to sequence
    const sequence = await Sequence.findOne({ id: nomination.sequenceId });
    if (sequence) {
      const maxOrder = sequence.activities.reduce((m, a) => Math.max(m, a.order ?? 0), 0);
      sequence.activities.push({ activityId: activity.id, order: maxOrder + 1 });
      await sequence.save();
    }

    nomination.status = 'submitted';
    nomination.resultActivityId = activity.id;
    await nomination.save();

    res.json({ activity, nomination });
  } catch (err) {
    console.error('[frames] submit error:', err.message);
    res.status(500).json({ error: 'Failed to submit frame' });
  }
});

// POST /api/frames/:id/decline
router.post('/:id/decline', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const nomination = await FrameNomination.findOne({ id: req.params.id });
    if (!nomination) return res.status(404).json({ error: 'Nomination not found' });
    if (nomination.nomineeUserId !== userId) return res.status(403).json({ error: 'Not your nomination' });
    if (nomination.status !== 'pending') return res.status(400).json({ error: `Nomination already ${nomination.status}` });

    nomination.status = 'declined';
    await nomination.save();

    res.json({ nomination });
  } catch (err) {
    console.error('[frames] decline error:', err.message);
    res.status(500).json({ error: 'Failed to decline nomination' });
  }
});

module.exports = router;
