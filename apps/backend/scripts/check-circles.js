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
//
// It has already earned its place once: it caught that every in-app
// notification was failing enum validation and being swallowed by
// utils/notify.js, which no unit test with a stubbed notify could see.

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

  for (let i = 0; i < USERS.length; i++) {
    await circles.addSeed({
      store, circleId: circle.id, userId: USERS[i],
      payload: { topic: `Topic ${i + 1}`, poleA: 'Liberating', poleB: 'Constricting' },
    });
  }
  ok('seeding advanced to the first cycle once everyone seeded');

  // Re-read from the database throughout. The in-memory document proves nothing.
  let fresh = await Circle.findOne({ id: circle.id });
  assert.equal(fresh.phase, 'cycle');
  assert.equal(fresh.seeds.length, 3);
  assert.equal(fresh.seeds[0].phase, 'share');
  assert.equal(fresh.seeds[0].payload.topic, 'Topic 1', 'Mixed payload survived the round trip');
  ok('circle + Mixed seed payload persisted');

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
  assert.equal(fresh.cycleIndex, 1);
  assert.equal(fresh.seeds[1].phase, 'share');
  ok('reveal rolled straight into the next cycle');

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
