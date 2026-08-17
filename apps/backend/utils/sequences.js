// Copying a sequence's maps.
//
// A pattern is a skeleton: an ordered set of map *setups* — the questions, the
// axes, the frame — with nothing played on them. Running one has to produce
// fresh maps, because what participants put on a map belongs to the run and
// not to the pattern. Two callers need that copy (running a pattern, and
// duplicating a sequence in the builder) and they used to disagree about it:
// the duplicate endpoint cloned the Activity documents, while the pattern path
// reused the same activityIds, so every session of a pattern shared one set of
// maps with the pattern itself and with each other. The first run filled the
// skeleton in; the second arrived to someone else's entries.
const Activity = require('../models/Activity');

async function uniqueUrlName(base) {
  let candidate = base;
  let i = 2;
  while (await Activity.findOne({ urlName: candidate })) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}

// Everything that describes how a map is played. Deliberately a copy of the
// setup only: no entries follow (they live in their own collection, keyed by
// activityId), and no participants, stakes or status carry over.
const SETUP_FIELDS = [
  'activityType', 'mapQuestion', 'mapQuestion2', 'xAxis', 'yAxis',
  'commentQuestion', 'objectNameQuestion', 'preamble', 'wikiLink',
  'starterData', 'votesPerUser', 'maxEntries', 'showProfileLinks',
  'showAxisLabels', 'snapshotQuestions', 'xAxisPoints', 'yAxisPoints',
  'xAxisLabels', 'yAxisLabels', 'frameId', 'author',
];

/**
 * Copy each of a sequence's maps into a fresh Activity.
 *
 * @param {Array}  seqActivities  source `sequence.activities[]`
 * @param {Object} opts
 * @param {string} opts.instanceId  instance to stamp the copies with
 * @param {(src) => string} [opts.titleFor]   title of the copy (default: same)
 * @param {(src) => string} [opts.urlBaseFor] urlName base, uniquified per copy
 * @param {boolean} [opts.isDraft]  true for a template or a builder copy,
 *                                  false for maps a run is about to play
 * @param {string} [opts.topicId]   topic the copies belong to
 * @param {string} [opts.sourceAlgorithmId] pattern these copies came from, so
 *                                  a topic can show which maps it generated
 * @returns {Object} map of source activityId → copy activityId
 */
async function cloneActivities(seqActivities, {
  instanceId,
  titleFor = src => src.title,
  urlBaseFor = src => `${src.urlName}-copy`,
  isDraft = true,
  topicId = null,
  sourceAlgorithmId = null,
}) {
  const idMap = {};
  for (const seqAct of seqActivities || []) {
    const src = await Activity.findOne({ id: seqAct.activityId });
    if (!src) continue;

    const copy = new Activity({
      instanceId: src.instanceId || instanceId,
      title: titleFor(src),
      urlName: await uniqueUrlName(urlBaseFor(src)),
      topicId,
      sourceAlgorithmId,
      ...Object.fromEntries(SETUP_FIELDS.map(f => [f, src[f]])),
      isDraft,
      isPublic: src.isPublic,
      status: 'active',
      participants: [],
      stakes: [],
    });
    await copy.save();
    idMap[seqAct.activityId] = copy.id;
  }
  return idMap;
}

// Rebuild `sequence.activities[]` against the copies, remapping parent links
// and clearing the round schedule — a copy has not been opened yet.
function remapSequenceActivities(seqActivities, idMap) {
  return (seqActivities || [])
    .filter(a => idMap[a.activityId])
    .map(a => ({
      activityId: idMap[a.activityId],
      order: a.order,
      openOnCreate: a.openOnCreate,
      parentActivityIds: (a.parentActivityIds || []).map(pid => idMap[pid]).filter(Boolean),
      round: a.round,
      openedAt: null,
      closedAt: null,
      autoClose: false,
      duration: null,
    }));
}

module.exports = { cloneActivities, remapSequenceActivities, uniqueUrlName };
