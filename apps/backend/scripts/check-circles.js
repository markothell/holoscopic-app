// Integration check for the Circle round machine and Threshold, against a real
// database. Dev only — it refuses anything else and removes its own data.
//
//   NODE_PATH=… node scripts/check-circles.js      (from apps/backend)
//
// utils/circles.test.js and utils/threshold.test.js run on an injected
// in-memory store with a fabricated clock, which is why they are fast and
// offline — and why the Mongo path has no coverage in them at all. This covers
// what they structurally cannot:
//
//   1. Mixed-path persistence. seeds[].payload and seeds[].result are Mixed,
//      and Mongoose cannot see an in-place mutation of a Mixed path. Without
//      saveCircle's markModified('seeds') a computed reveal reports as saved
//      and is silently absent on the next read.
//   2. The unique indexes, which are correctness rather than speed — a second
//      share on the same pole must be refused by the DATABASE, not only by the
//      funnel that happens to check first.
//   3. sweepCircles() through the real store on a genuinely expired deadline,
//      including that the activity module ignores the store handed to its hooks
//      and uses its own (the tick knows nothing about shares or rankings).
//   4. SCHEMA VALIDATION. Circle.phase, Circle.status, seeds[].phase and
//      transitions[].via are enums, and the in-memory store has no Mongoose in
//      it — so a value the funnel writes and the schema forbids is invisible to
//      all 307 unit tests and fails every real write. Each state below is
//      re-read from the database rather than asserted on the object in hand.
//
// It has already earned its place twice: it caught that every in-app
// notification was failing enum validation and being swallowed by
// utils/notify.js, and it is the only check that ever exercises 'idle',
// 'closed', 'skipped' and via:'queue' against a real collection.

require('dotenv').config({ path: `${__dirname}/../.env.local` });

const mongoose = require('mongoose');
const assert = require('node:assert/strict');

const Circle = require('../models/Circle');
const ThresholdShare = require('../models/ThresholdShare');
const ThresholdRanking = require('../models/ThresholdRanking');
const circles = require('../utils/circles');
const threshold = require('../utils/threshold');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }

const dbName = (uri.match(/\/([^/?]+)\?/) || [])[1];
const host = (uri.match(/@([^/?]+)/) || [])[1];

// holoscopic-db means PRODUCTION whatever else the connection string says.
if (dbName !== 'holoscopic-dev' || process.env.NODE_ENV === 'production') {
  console.error(`REFUSING: this writes test data. Expected holoscopic-dev, got ${dbName} on ${host}.`);
  process.exit(1);
}

const INSTANCE = 'threshold-smoke';
const USERS = ['smoke-u1', 'smoke-u2', 'smoke-u3'];

// Real Mongo for everything; mail and notifications stubbed so this never
// sends to the invented addresses it creates. Note that sweepCircles() below
// deliberately uses the DEFAULT store instead, exercising the real notify.
const store = { ...threshold.mongoStore, async sendEmail() {}, async notify() {} };

const passed = [];
const ok = (label) => { passed.push(label); console.log(`  ✔ ${label}`); };

async function cleanup() {
  const mine = await Circle.find({ instanceId: INSTANCE }).lean();
  const seedIds = mine.flatMap(c => c.seeds.map(s => s.id));
  await Promise.all([
    Circle.deleteMany({ instanceId: INSTANCE }),
    ThresholdShare.deleteMany({ seedId: { $in: seedIds } }),
    ThresholdRanking.deleteMany({ seedId: { $in: seedIds } }),
    require('../models/Notification').deleteMany({ userId: { $in: USERS } }),
  ]);
}

async function main() {
  // Scripts connect with autoIndex:false, always — requiring a model otherwise
  // builds every declared index on whatever database this is pointed at.
  await mongoose.connect(uri, { autoIndex: false });
  console.log(`connected: ${host} / ${dbName}\n`);

  // Built deliberately here. The unique ones must exist BEFORE the first write,
  // which is what ensure-indexes.js warns about for a collection that does not
  // exist yet.
  await Promise.all([
    Circle.createIndexes(), ThresholdShare.createIndexes(), ThresholdRanking.createIndexes(),
  ]);
  await cleanup();

  console.log('a 3-member circle, end to end:');
  const circle = await circles.createCircle({
    store, instanceId: INSTANCE, activity: 'threshold',
    title: 'Smoke circle', urlName: 'smoke', createdBy: USERS[0],
    creatorName: 'One', requireInvitation: false,
  });
  for (const u of USERS.slice(1)) {
    await circles.joinCircle({ store, circleId: circle.id, userId: u, username: u });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: USERS[0] });

  // 'idle' is a schema value nothing else exercises: an open circle with an
  // empty queue, which is where every circle starts (D27, D29).
  let fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.phase, 'idle', "phase 'idle' was rejected by the schema");
  assert.equal(fresh.status, 'running');
  assert.equal(fresh.liveSeedId, null);
  ok('a started circle persists as idle with an empty queue');

  for (let i = 0; i < USERS.length; i++) {
    await circles.addSeed({
      store, circleId: circle.id, userId: USERS[i],
      payload: { topic: `Topic ${i + 1}`, poleA: 'Liberating', poleB: 'Constricting' },
    });
  }
  ok('the first topic posted started the first cycle');

  // Re-read from the database throughout. The in-memory document proves nothing.
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.phase, 'cycle');
  assert.equal(fresh.seeds.length, 3);
  assert.equal(fresh.seeds[0].phase, 'share');
  assert.equal(fresh.liveSeedId, fresh.seeds[0].id, 'liveSeedId persisted');
  assert.equal(fresh.seeds[0].payload.topic, 'Topic 1', 'Mixed payload survived the round trip');
  assert.deepEqual([...fresh.seeds[1].supporterIds], [USERS[1]], 'posting is supporting, and it persisted');
  assert.ok(fresh.transitions.some(t => t.via === 'queue'), "transitions.via 'queue' was rejected by the schema");
  ok('circle + Mixed seed payload + the queue fields persisted');

  // Support and promote, through the database.
  await circles.supportSeed({ store, circleId: circle.id, seedId: fresh.seeds[2].id, userId: USERS[0] });
  await circles.supportSeed({ store, circleId: circle.id, seedId: fresh.seeds[2].id, userId: USERS[1] });
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.seeds[2].supporterIds.length, 3);
  assert.deepEqual(circles.queue(fresh).map(s => s.payload.topic), ['Topic 3', 'Topic 2']);

  await circles.promoteSeed({ store, circleId: circle.id, seedId: fresh.seeds[1].id, userId: USERS[0] });
  fresh = await Circle.findOne({ id: circle.id });
  assert.ok(fresh.seeds[1].promotedAt instanceof Date, 'promotedAt persisted as a Date');
  assert.deepEqual(circles.queue(fresh).map(s => s.payload.topic), ['Topic 2', 'Topic 3']);
  ok('support and promote reorder the queue, through the database');

  const seed0 = fresh.seeds[0];
  for (const u of USERS) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed0.id, userId: u, username: u,
      pole: u === USERS[2] ? 'B' : 'A', text: `${u} on Topic 1`,
    });
  }
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.seeds[0].phase, 'rank', 'the last share advanced the phase');
  ok('share phase advanced on completion and persisted');

  const shareIds = (await ThresholdShare.find({ seedId: seed0.id }).sort({ createdAt: 1 })).map(s => s.id);
  assert.equal(shareIds.length, 3);

  // Three rankers, split on the middle story:
  //   share[0] → A,A,A   agreement 1.00
  //   share[1] → A,A,B   agreement 0.67
  //   share[2] → B,B,B   agreement 0.00
  const plan = [
    { [shareIds[0]]: 'A', [shareIds[1]]: 'A', [shareIds[2]]: 'B' },
    { [shareIds[0]]: 'A', [shareIds[1]]: 'A', [shareIds[2]]: 'B' },
    { [shareIds[0]]: 'A', [shareIds[1]]: 'B', [shareIds[2]]: 'B' },
  ];
  for (let i = 0; i < USERS.length; i++) {
    await threshold.submitRanking({
      store, circleId: circle.id, seedId: seed0.id, userId: USERS[i],
      placements: Object.entries(plan[i]).map(([shareId, pole]) => ({ shareId, pole })),
    });
  }

  // The check this script exists for.
  fresh = await Circle.findOne({ id: circle.id });
  const result = fresh.seeds[0].result;
  assert.ok(result, 'seed.result is absent — saveCircle is missing markModified("seeds")');
  assert.equal(result.rankers, 3);
  assert.deepEqual(result.shares.map(r => r.shareId), shareIds);
  assert.deepEqual(result.shares.map(r => Number(r.agreement.toFixed(4))), [1, 0.6667, 0]);
  assert.equal(result.unanimous, 2);
  ok('the reveal computed correctly AND survived the Mixed-path round trip');

  assert.equal(fresh.seeds[0].phase, 'revealed');
  assert.equal(fresh.liveSeedId, fresh.seeds[1].id);
  assert.equal(fresh.seeds[1].phase, 'share', 'the promoted topic ran next');
  ok('reveal rolled straight into the top of the queue');

  console.log('\nthe tick:');
  await Circle.updateOne(
    { id: circle.id },
    { $set: { 'seeds.1.phaseDeadline': new Date(Date.now() - 60_000) } },
  );

  // Deliberately the DEFAULT store — circles.mongoStore, which knows nothing
  // about shares or rankings, and whose notify() is the real one. This is what
  // jobs/index.js passes, so it is the configuration that matters.
  const swept = await circles.sweepCircles();
  assert.ok(swept.examined >= 1);
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.seeds[1].phase, 'rank', 'the expired share phase advanced');
  ok(`sweepCircles advanced an expired phase (examined ${swept.examined}, advanced ${swept.advanced})`);

  // Notification.type is a closed enum and utils/notify.js swallows validation
  // errors, so a bad type is invisible except by counting the rows.
  const notes = await require('../models/Notification').countDocuments({ userId: { $in: USERS } });
  assert.ok(notes > 0, 'no notifications were written — check Notification.type against the enum');
  ok(`in-app notifications actually landed (${notes} rows)`);

  console.log('\nthe facilitator tools:');

  // The tick left topic 2 mid-sort. Dropping it moves the circle to the last
  // topic in the queue.
  await circles.skipSeed({ store, circleId: circle.id, userId: USERS[0] });
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.seeds[1].phase, 'skipped', "seeds[].phase 'skipped' was rejected by the schema");
  assert.ok(fresh.seeds[1].result, 'a skipped topic still computed a result');
  assert.equal(fresh.liveSeedId, fresh.seeds[2].id, 'and moved to the next topic');
  ok('skip revealed what the topic had and moved on');

  // A skipped topic keeps its stories. Give the last one a story first, so
  // "kept" means something.
  const last = fresh.seeds[2];
  await threshold.submitShare({
    store, circleId: circle.id, seedId: last.id, userId: USERS[0], username: 'One',
    pole: 'A', text: 'told before the group moved on',
  });
  await circles.skipSeed({ store, circleId: circle.id, userId: USERS[0] });

  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.seeds[2].phase, 'skipped');
  assert.equal(await ThresholdShare.countDocuments({ seedId: last.id }), 1, 'nobody\'s story was deleted');
  const kept = await threshold.listShares({ store, circle: fresh, seedId: last.id, viewerId: USERS[0] });
  assert.equal(kept[0].username, 'One', 'and it reads attributed, like any reveal');
  ok('a skipped topic keeps every story it had');

  // The queue is empty now: idle rather than an ending — a circle has no
  // completion condition (D29).
  assert.equal(fresh.phase, 'idle');
  assert.equal(fresh.status, 'running');
  assert.equal(fresh.completedAt, null, 'running out of topics is a pause, not an ending');
  ok('an emptied queue parks the circle at idle');

  // The record reads at any time, and it is the same shape closed or not.
  const midResult = threshold.circleResult(fresh);
  assert.equal(midResult.topics.length, 3);
  assert.equal(midResult.topics.filter(t => t.skipped).length, 2);
  ok(`the circle record reads while running (${midResult.topics.length} topics, 2 skipped)`);

  await circles.closeCircle({ store, circleId: circle.id, userId: USERS[0] });
  fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.phase, 'closed', "phase 'closed' was rejected by the schema");
  assert.equal(fresh.status, 'complete');
  assert.ok(fresh.completedAt);
  assert.equal(threshold.circleResult(fresh).topics.length, 3, 'and the record still reads');
  ok('close is the only ending, and it persisted');

  console.log('\nunique indexes:');
  await assert.rejects(
    () => ThresholdShare.create({
      instanceId: INSTANCE, circleId: circle.id, seedId: seed0.id,
      userId: USERS[0], username: 'One', pole: 'A', title: 'dup', text: 'dup',
    }),
    e => e.code === 11000,
    'a second share on the same pole must be refused by the index, not only by the funnel',
  );
  ok('thresholdshares {seedId,userId,pole} rejects a duplicate (E11000)');

  await assert.rejects(
    () => ThresholdRanking.create({
      instanceId: INSTANCE, circleId: circle.id, seedId: seed0.id,
      rankerId: USERS[0], placements: [], submittedAt: new Date(),
    }),
    e => e.code === 11000,
  );
  ok('thresholdrankings {seedId,rankerId} rejects a duplicate (E11000)');

  await assert.rejects(
    () => Circle.create({
      id: 'dup12345', instanceId: INSTANCE, activity: 'threshold',
      title: 'Dup', urlName: 'smoke', createdBy: USERS[0],
    }),
    e => e.code === 11000,
  );
  ok('circles {instanceId,urlName} rejects a duplicate (E11000)');

  await cleanup();
  console.log(`\n${passed.length} checks passed. Test data removed.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  try { await cleanup(); } catch { /* best effort */ }
  await mongoose.disconnect();
  process.exit(1);
});
