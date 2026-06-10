const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const Sequence = require('../models/Sequence');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function uniqueUrlName(base, Model) {
  let candidate = base;
  let i = 2;
  while (await Model.findOne({ urlName: candidate })) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

// POST /api/import/sequence
// Body: { sequence: { title, urlName?, description }, activities: [...] }
router.post('/sequence', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { sequence: seqData, activities: activitiesData } = req.body;

  if (!seqData?.title || !Array.isArray(activitiesData)) {
    return res.status(400).json({ error: 'sequence.title and activities array are required' });
  }

  const createdActivityIds = []; // for cleanup on failure
  const refToId = {}; // _ref → real activity id

  try {
    // 1. Create each activity
    for (let i = 0; i < activitiesData.length; i++) {
      const a = activitiesData[i];

      const baseUrlName = a.urlName ? slugify(a.urlName) : slugify(a.title || `activity-${i + 1}`);
      const urlName = await uniqueUrlName(baseUrlName, Activity);

      const isSnapshot = a.activityType === 'snapshot';
      const xAxis = a.xAxis || { label: 'Horizontal', min: 'Low', max: 'High' };
      const yAxis = a.yAxis || { label: 'Vertical', min: 'Low', max: 'High' };

      const activity = new Activity({
        title: (a.title || 'Untitled').trim(),
        urlName,
        activityType: a.activityType || 'holoscopic',
        mapQuestion: (a.mapQuestion || 'How present is this?').trim(),
        mapQuestion2: a.mapQuestion2 ? a.mapQuestion2.trim() : '',
        xAxis: { label: xAxis.label || 'Horizontal', min: xAxis.min || 'Low', max: xAxis.max || 'High' },
        yAxis: { label: yAxis.label || 'Vertical', min: yAxis.min || 'Low', max: yAxis.max || 'High' },
        commentQuestion: (a.commentQuestion || 'Any thoughts?').trim(),
        objectNameQuestion: a.objectNameQuestion
          ? a.objectNameQuestion.trim()
          : 'Name something that represents your perspective',
        preamble: a.preamble ? a.preamble.trim() : '',
        wikiLink: a.wikiLink ? a.wikiLink.trim() : '',
        maxEntries: 1,
        showProfileLinks: true,
        showAxisLabels: true,
        ...(isSnapshot && {
          snapshotQuestions: (a.snapshotQuestions || []).map((q, qi) => ({
            id: Math.random().toString(36).slice(2, 10),
            label: q.label || '',
            topic: q.topic || q.label || '',
            color: q.color || '#9B59B6',
            order: qi + 1,
          })),
          xAxisPoints: a.xAxisPoints || 2,
          yAxisPoints: a.yAxisPoints || 2,
          xAxisLabels: a.xAxisLabels || [],
          yAxisLabels: a.yAxisLabels || [],
        }),
        author: { userId },
        status: 'active',
        participants: [],
        ratings: [],
        comments: [],
      });

      const saved = await activity.save();

      // Process starterData (accept array or JSON string)
      if (a.starterData) {
        try {
          const items = Array.isArray(a.starterData)
            ? a.starterData
            : JSON.parse(a.starterData);
          // Quadrant → x/y center coordinates
          const quadrantToXY = { 1: { x: 0.75, y: 0.75 }, 2: { x: 0.25, y: 0.75 }, 3: { x: 0.25, y: 0.25 }, 4: { x: 0.75, y: 0.25 } };
          if (Array.isArray(items)) {
            let current = saved; // re-fetched after each addRating to keep __v in sync
            for (let si = 0; si < items.length; si++) {
              const item = items[si];
              if (!item || typeof item !== 'object' || !item.objectName) continue;
              // Resolve x/y: explicit coords take priority, then quadrant mapping
              let x = item.x;
              let y = item.y;
              if ((typeof x !== 'number' || typeof y !== 'number') && item.quadrant) {
                const mapped = quadrantToXY[item.quadrant];
                if (mapped) { x = mapped.x; y = mapped.y; }
              }
              if (typeof x !== 'number' || typeof y !== 'number') continue;
              if (x < 0 || x > 1 || y < 0 || y > 1) continue;
              const starterUserId = `starter_${saved._id}_${si}`;
              await current.addParticipant(starterUserId, 'Example Data');
              await current.addRating(starterUserId, 'Example Data', { x, y }, item.objectName);
              // Re-fetch to get latest __v after addRating's internal save()
              current = await Activity.findOne({ id: saved.id });
              if (!item.comment || !item.comment.trim()) {
                continue;
              }
              await current.addComment(starterUserId, 'Example Data', item.comment.trim(), item.objectName);
              current = await Activity.findOne({ id: saved.id });
            }
          }
        } catch (e) {
          console.warn(`Starter data skipped for activity "${a.title}":`, e.message);
        }
      }
      createdActivityIds.push(saved.id);
      if (a._ref) refToId[a._ref] = saved.id;
    }

    // 2. Build sequence activities array (resolve parentActivityRefs)
    const seqActivities = activitiesData.map((a, i) => {
      const parentActivityIds = (a.parentActivityRefs || [])
        .map(ref => refToId[ref])
        .filter(Boolean);
      return {
        activityId: createdActivityIds[i],
        order: i + 1,
        parentActivityIds,
        round: a.round || null,
        autoClose: false,
        duration: null,
      };
    });

    // 3. Create the sequence
    const baseSeqUrl = seqData.urlName
      ? slugify(seqData.urlName)
      : slugify(seqData.title);
    const seqUrlName = await uniqueUrlName(baseSeqUrl, Sequence);

    const sequence = new Sequence({
      title: seqData.title.trim(),
      urlName: seqUrlName,
      description: seqData.description ? seqData.description.trim() : '',
      createdBy: userId,
      status: 'draft',
      activities: seqActivities,
      members: [],
      invitedEmails: [],
    });

    const savedSequence = await sequence.save();

    res.json({
      sequenceId: savedSequence.id,
      sequenceUrlName: savedSequence.urlName,
      activityCount: createdActivityIds.length,
    });

  } catch (err) {
    // Best-effort cleanup: delete any activities already created
    if (createdActivityIds.length > 0) {
      await Activity.deleteMany({ id: { $in: createdActivityIds } }).catch(() => {});
    }
    console.error('Import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

module.exports = router;
