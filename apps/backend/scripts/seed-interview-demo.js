#!/usr/bin/env node
// Seeds interView with a public demo conversation: a confirmed topic and a
// published map ("What makes hard conversations possible?") filled with
// example entries and a few votes — so first-time visitors see a living
// map, not an empty one. Idempotent by urlName; safe to re-run.
//
//   node scripts/seed-interview-demo.js <userId> [instanceSlug]
//
// Run against production after the cutover push (needs MONGODB_URI in the
// env file NODE_ENV selects).
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const crypto = require('crypto');

const URL_NAME = 'what-makes-hard-conversations-possible';

const DEMO = {
  topic: {
    title: 'What makes hard conversations possible?',
    description: 'A demo conversation — real example data showing how a mapped topic looks once a group has played it.',
  },
  activity: {
    title: 'What makes hard conversations possible?',
    objectNameQuestion: 'Name something that makes hard conversations possible',
    mapQuestion: 'How present is this in the conversations you’re part of?',
    mapQuestion2: 'How much does it cost to bring?',
    commentQuestion: 'Tell the story of a time this worked.',
    xAxis: { label: 'Presence', min: 'Rare', max: 'Common' },
    yAxis: { label: 'Cost', min: 'Light', max: 'Heavy' },
  },
  entries: [
    { x: 0.55, y: 0.62, objectName: 'Naming the stakes', comment: 'Saying why the conversation matters before diving in.' },
    { x: 0.72, y: 0.25, objectName: 'A shared meal', comment: 'Food first. Everything lands softer.' },
    { x: 0.38, y: 0.70, objectName: 'Someone goes first', comment: 'One person risking honesty gives everyone else permission.' },
    { x: 0.60, y: 0.35, objectName: 'Time limits', comment: 'Knowing it ends makes it enterable.' },
    { x: 0.25, y: 0.80, objectName: 'A neutral third', comment: 'Rare but transformative — someone with no stake holding the frame.' },
    { x: 0.68, y: 0.20, objectName: 'Laughing early', comment: 'One good laugh in the first five minutes changes the whole thing.' },
    { x: 0.30, y: 0.45, objectName: 'Writing before talking', comment: 'Two minutes of silence with paper beats an hour of reaction.' },
    { x: 0.42, y: 0.55, objectName: 'Follow-up ritual', comment: 'Checking back a week later is where the change actually sticks.' },
  ],
  // entry index → which demo voters back it (each voter stays within the
  // activity's votesPerUser budget of 3)
  votes: { 1: [0, 1, 2], 2: [0, 1], 0: [2, 0], 6: [1], 7: [2] },
};

const newId = () => crypto.randomUUID().substring(0, 8);

async function main() {
  const [userId, instanceSlug = 'g1'] = process.argv.slice(2);
  if (!userId) {
    console.error('Usage: node scripts/seed-interview-demo.js <userId> [instanceSlug]');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });

  const Instance = require('../models/Instance');
  const Topic = require('../models/Topic');
  const Activity = require('../models/Activity');
  const entryUtils = require('../utils/entries');

  const instance = await Instance.findOne({ slug: instanceSlug });
  if (!instance) throw new Error(`No instance with slug ${instanceSlug}`);

  let activity = await Activity.findOne({ urlName: URL_NAME });
  if (activity) {
    console.log(`✓ Demo already present: /a/${URL_NAME} (activity ${activity.id})`);
    await mongoose.connection.close();
    return;
  }

  // A confirmed topic so the demo shows up in the hub's topic web.
  const topic = await Topic.create({
    id: newId(),
    instanceId: instance.id,
    title: DEMO.topic.title,
    description: DEMO.topic.description,
    nominatedBy: userId,
    status: 'confirmed',
    supporters: [{ userId, holonsWagered: 0 }],
    quorumThreshold: instance.config?.quorum?.topicSupportThreshold ?? 5,
    confirmedAt: new Date(),
    // Confirmed topics aren't swept, but keep the window far out anyway.
    expiresAt: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000),
  });

  activity = await Activity.create({
    id: newId(),
    instanceId: instance.id,
    topicId: topic.id,
    urlName: URL_NAME,
    ...DEMO.activity,
    activityType: 'dissolve',
    maxEntries: 1,
    votesPerUser: 3,
    isDraft: false,
    isPublic: true,
    status: 'active',
    author: { userId },
    participants: [],
  });

  for (let i = 0; i < DEMO.entries.length; i++) {
    const e = DEMO.entries[i];
    await entryUtils.upsertEntry({
      activity,
      instanceId: instance.id,
      userId: `seed_${activity.id}_${i}`,
      username: 'Example Data',
      slotNumber: 1,
      position: { x: e.x, y: e.y },
      objectName: e.objectName,
      text: e.comment,
      isSeed: true,
    });
  }

  // A few votes so the tallies read as lived-in. Each demo voter stays
  // inside the activity's votesPerUser budget.
  const entries = await entryUtils.listByActivity(activity.id);
  const byIndex = i => entries.find(e => e.userId === `seed_${activity.id}_${i}`);
  const voters = [`seedvoter_${activity.id}_1`, `seedvoter_${activity.id}_2`, `seedvoter_${activity.id}_3`];
  for (const [idxStr, voterIdxs] of Object.entries(DEMO.votes)) {
    const entry = byIndex(Number(idxStr));
    if (!entry) continue;
    for (const v of voterIdxs) {
      await entryUtils.voteEntry({ activity, entryId: entry.id, userId: voters[v] });
    }
  }

  console.log(`✓ Seeded demo: topic ${topic.id} (confirmed) + activity ${activity.id}`);
  console.log(`  map: /a/${URL_NAME} — ${DEMO.entries.length} entries, votes cast`);
  await mongoose.connection.close();
}

main().catch(err => { console.error('✗', err.message); process.exit(1); });
