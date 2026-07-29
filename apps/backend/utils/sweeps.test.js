// The double-payout regression.
//
// Sweeps used to run inline on GET with no lock and a read-then-write status
// change, so N concurrent readers each observed `status: 'nominated'` and each
// issued the payout. Two people loading the topics page together could mint
// holons.
//
// The guarantee under test is NOT the lock — it is the conditional update.
// These tests deliberately call the sweep concurrently with no lock at all,
// because that is the situation a second Render instance would create, and the
// payout must still happen exactly once.
//
// Opt-in via RUN_DB_TESTS=1 (needs a real database; see utils/holons.test.js).
const test = require('node:test');
const assert = require('node:assert');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('path').join(__dirname, '..', envFile) });

const HAS_DB = Boolean(process.env.MONGODB_URI) && process.env.RUN_DB_TESTS === '1';

const mongoose = require('mongoose');
const Topic = require('../models/Topic');
const Instance = require('../models/Instance');
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');
const JobLock = require('../models/JobLock');
const { sweepQuorum, sweepExpired } = require('./sweeps');
const { withLock } = require('./jobs');

const INST = 'test-sweeps-' + Math.random().toString(36).slice(2, 8);
const HOST = 'host-' + Math.random().toString(36).slice(2, 8);

const CONFIG = {
  holons: { nominationCost: 10, topicQuorumReward: 25, supportCost: 5 },
  quorum: { topicSupportThreshold: 2 },
};

function newTopic(overrides = {}) {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 10),
    instanceId: INST,
    title: 'Test topic',
    description: 'A topic created by the sweeps test.',
    nominatedBy: HOST,
    quorumThreshold: CONFIG.quorum.topicSupportThreshold,
    status: 'nominated',
    supporters: [],
    expiresAt: new Date(Date.now() + 86400000),
    ...overrides,
  };
}

async function payouts(type, refId) {
  return HolonTransaction.countDocuments({ instanceId: INST, type, refId });
}

test('sweeps', { skip: HAS_DB ? false : 'set RUN_DB_TESTS=1 (needs a database)' }, async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);
  await Instance.create({ id: INST, name: 'Sweeps Test', slug: INST, config: CONFIG });

  t.after(async () => {
    await Promise.all([
      Instance.deleteMany({ id: INST }),
      Topic.deleteMany({ instanceId: INST }),
      InstanceMembership.deleteMany({ instanceId: INST }),
      HolonTransaction.deleteMany({ instanceId: INST }),
      JobLock.deleteMany({ name: /^test-sweeps/ }),
    ]);
    await mongoose.connection.close();
  });

  await t.test('quorum confirms a topic once and pays once', async () => {
    const topic = await Topic.create(newTopic({
      supporters: [{ userId: 'a', holonsWagered: 5 }, { userId: 'b', holonsWagered: 5 }],
    }));

    await sweepQuorum(INST, CONFIG);

    const after = await Topic.findOne({ id: topic.id });
    assert.equal(after.status, 'confirmed');
    assert.equal(after.holonPool, 20, 'nominationCost 10 + two 5-holon wagers');
    assert.equal(await payouts('session_host_reward', topic.id), 1);
  });

  // The regression itself.
  await t.test('ten concurrent quorum sweeps pay exactly once', async () => {
    const topic = await Topic.create(newTopic({
      supporters: [{ userId: 'c', holonsWagered: 5 }, { userId: 'd', holonsWagered: 5 }],
    }));

    await Promise.all(
      Array.from({ length: 10 }, () => sweepQuorum(INST, CONFIG))
    );

    assert.equal(
      await payouts('session_host_reward', topic.id), 1,
      'the conditional status flip must let exactly one sweep pay'
    );
    const after = await Topic.findOne({ id: topic.id });
    assert.equal(after.status, 'confirmed');
  });

  await t.test('ten concurrent expiry sweeps refund exactly once', async () => {
    const topic = await Topic.create(newTopic({
      expiresAt: new Date(Date.now() - 1000),
      supporters: [{ userId: 'e', holonsWagered: 5 }, { userId: 'f', holonsWagered: 5 }],
    }));

    await Promise.all(
      Array.from({ length: 10 }, () => sweepExpired(INST, CONFIG))
    );

    assert.equal(await payouts('nomination_return', topic.id), 1, 'nominator refunded once');
    assert.equal(await payouts('support_return', topic.id), 2, 'each supporter refunded once');
    const after = await Topic.findOne({ id: topic.id });
    assert.equal(after.status, 'expired');
  });

  await t.test('a topic below threshold is left alone', async () => {
    const topic = await Topic.create(newTopic({
      supporters: [{ userId: 'g', holonsWagered: 5 }],
    }));
    await sweepQuorum(INST, CONFIG);
    const after = await Topic.findOne({ id: topic.id });
    assert.equal(after.status, 'nominated');
    assert.equal(await payouts('session_host_reward', topic.id), 0);
  });

  await t.test('a topic that has not expired is left alone', async () => {
    const topic = await Topic.create(newTopic());
    await sweepExpired(INST, CONFIG);
    const after = await Topic.findOne({ id: topic.id });
    assert.equal(after.status, 'nominated');
  });

  await t.test('withLock admits one holder at a time', async () => {
    let running = 0;
    let maxConcurrent = 0;
    let ran = 0;

    const body = async () => {
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      ran++;
      await new Promise((r) => setTimeout(r, 60));
      running--;
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => withLock('test-sweeps-lock', 30_000, body))
    );

    assert.equal(maxConcurrent, 1, 'the lock must serialize the work');
    assert.equal(results.filter(Boolean).length, ran);
    assert.ok(ran >= 1 && ran < 5, `expected some callers to be turned away, ${ran} ran`);
  });

  await t.test('an expired lease can be taken over', async () => {
    await JobLock.create({
      name: 'test-sweeps-stale',
      holder: 'a-process-that-died',
      expiresAt: new Date(Date.now() - 1000),
    });

    let ran = false;
    const got = await withLock('test-sweeps-stale', 10_000, async () => { ran = true; });

    assert.equal(got, true, 'a dead holder must not wedge the job forever');
    assert.equal(ran, true);
  });
});
