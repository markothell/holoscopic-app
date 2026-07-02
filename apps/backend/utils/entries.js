const Entry = require('../models/Entry');

// The single funnel for entry writes. REST routes and Socket.IO handlers are
// thin wrappers over these functions — nothing else writes to the entries
// collection. Contention is per (activity, user, slot, question), so plain
// read-modify-write is safe; only a double-submit from the same user races,
// handled by one retry on the unique-index collision.

const entryKey = ({ activityId, userId, slotNumber = 1, questionId = null }) => ({
  activityId,
  userId,
  slotNumber,
  questionId: questionId || null,
});

// Client wire shape. Voter usernames are never stored or sent; voterIds are
// enough for "have I voted" and vote budgets.
function toClient(entry) {
  return {
    id: entry.id,
    userId: entry.userId,
    username: entry.username,
    slotNumber: entry.slotNumber,
    questionId: entry.questionId || null,
    objectName: entry.objectName || '',
    position: entry.position ? { x: entry.position.x, y: entry.position.y } : null,
    text: entry.text || '',
    voterIds: entry.voterIds || [],
    voteCount: entry.voteCount || 0,
    isSeed: !!entry.isSeed,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

// Redacted wire shape for another player's personal map: shows what was
// voted for, never who authored it.
function toRedacted(entry) {
  const e = toClient(entry);
  return {
    id: e.id,
    slotNumber: e.slotNumber,
    questionId: e.questionId,
    objectName: e.objectName,
    position: e.position,
    text: e.text,
    voteCount: e.voteCount,
    isSeed: e.isSeed,
  };
}

async function listByActivity(activityId) {
  return Entry.find({ activityId }).sort({ createdAt: 1 });
}

// Upsert the union of what's been submitted for this slot. A new position
// resets votes cast by others — remapping returns voters' budgets, same rule
// the old addRating enforced.
async function upsertEntry({
  activity, instanceId, userId, username,
  slotNumber = 1, questionId = null,
  position, objectName, text, isSeed = false,
}, _retried = false) {
  const key = entryKey({ activityId: activity.id, userId, slotNumber, questionId });

  try {
    let entry = await Entry.findOne(key);
    if (!entry) {
      entry = new Entry({
        ...key,
        instanceId,
        topicId: activity.topicId || null,
        username,
        objectName: objectName || '',
        position: position || null,
        text: text || '',
        isSeed,
      });
    } else {
      entry.username = username;
      if (objectName !== undefined) entry.objectName = objectName || '';
      if (text !== undefined) entry.text = text;
      if (position !== undefined && position !== null) {
        entry.position = position;
        entry.voterIds = (entry.voterIds || []).filter(v => v === userId);
        entry.voteCount = entry.voterIds.length;
      }
    }
    await entry.save();
    return entry;
  } catch (err) {
    if (err.code === 11000 && !_retried) {
      return upsertEntry({
        activity, instanceId, userId, username,
        slotNumber, questionId, position, objectName, text, isSeed,
      }, true);
    }
    throw err;
  }
}

// Toggle a vote on an entry. Self-votes are blocked outside solo tracker
// mode; votesPerUser budgets count distinct entries voted in this activity.
async function voteEntry({ activity, entryId, userId }) {
  const entry = await Entry.findOne({ id: entryId, activityId: activity.id });
  if (!entry) throw new Error('Entry not found');

  const isSoloTracker = activity.maxEntries === 0;
  if (entry.userId === userId && !isSoloTracker) {
    throw new Error('Cannot vote on your own entry');
  }

  const hasVoted = (entry.voterIds || []).includes(userId);
  if (hasVoted) {
    entry.voterIds = entry.voterIds.filter(v => v !== userId);
  } else {
    if (!isSoloTracker && activity.votesPerUser !== null && activity.votesPerUser !== undefined) {
      const used = await Entry.countDocuments({ activityId: activity.id, voterIds: userId });
      if (used >= activity.votesPerUser) {
        throw new Error(`Vote limit reached. You can only cast ${activity.votesPerUser} vote(s).`);
      }
    }
    entry.voterIds = [...(entry.voterIds || []), userId];
  }
  entry.voteCount = entry.voterIds.length;
  await entry.save();
  return entry;
}

async function clearSlot({ activityId, userId, slotNumber }) {
  return Entry.deleteMany({ activityId, userId, slotNumber });
}

async function deleteByActivity(activityId) {
  return Entry.deleteMany({ activityId });
}

// Replace an activity's seed entries from its starterData JSON.
async function seedFromStarterData(activity, instanceId) {
  await Entry.deleteMany({ activityId: activity.id, isSeed: true });
  if (!activity.starterData || !activity.starterData.trim()) return 0;

  let parsed;
  try { parsed = JSON.parse(activity.starterData); }
  catch { throw new Error('Invalid starter data format'); }
  if (!Array.isArray(parsed)) return 0;

  let count = 0;
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const valid = item && typeof item === 'object' &&
      typeof item.x === 'number' && typeof item.y === 'number' &&
      item.x >= 0 && item.x <= 1 && item.y >= 0 && item.y <= 1 &&
      item.objectName && item.comment;
    if (!valid) continue;
    await upsertEntry({
      activity,
      instanceId,
      userId: `seed_${activity.id}_${i}`,
      username: 'Example Data',
      slotNumber: 1,
      position: { x: item.x, y: item.y },
      objectName: item.objectName,
      text: item.comment,
      isSeed: true,
    });
    count++;
  }
  return count;
}

module.exports = {
  toClient,
  toRedacted,
  listByActivity,
  upsertEntry,
  voteEntry,
  clearSlot,
  deleteByActivity,
  seedFromStarterData,
};
