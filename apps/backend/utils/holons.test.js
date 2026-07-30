// The money path. Every holon that has ever moved went through these two
// functions, and until now none of it was tested.
//
// Needs a real MongoDB — the properties under test (transactional rollback,
// conditional-update concurrency) cannot be faked, because faking them would
// only test the fake.
//
// Opt-in via RUN_DB_TESTS=1. It talks to Atlas, so it costs ~35s of network
// round-trips; left on by default it would be the reason someone eventually
// stops running `npm test` at all. CI should set RUN_DB_TESTS=1 against a
// scratch database — this is the money path, and it is the only coverage it
// has.
//
//   RUN_DB_TESTS=1 node --test utils/holons.test.js
//
// Writes and deletes its own scratch instance and memberships. It never
// touches existing data, and never runs against production unless someone
// deliberately sets NODE_ENV=production.
const test = require('node:test');
const assert = require('node:assert');

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('path').join(__dirname, '..', envFile) });

const HAS_DB = Boolean(process.env.MONGODB_URI) && process.env.RUN_DB_TESTS === '1';

const mongoose = require('mongoose');
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');
const Instance = require('../models/Instance');
const { transact, spend } = require('./holons');

const TEST_INSTANCE = 'test-holons-' + Math.random().toString(36).slice(2, 8);
const USER = 'tu-' + Math.random().toString(36).slice(2, 8);

async function balanceOf(userId = USER) {
  const m = await InstanceMembership.findOne({ userId, instanceId: TEST_INSTANCE });
  return m ? m.holonBalance : null;
}

async function ledgerSum(userId = USER) {
  const rows = await HolonTransaction.find({ userId, instanceId: TEST_INSTANCE });
  return rows.reduce((n, r) => n + r.amount, 0);
}

test('holons money path', { skip: HAS_DB ? false : 'set RUN_DB_TESTS=1 (needs a database)' }, async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);

  await Instance.create({
    id: TEST_INSTANCE,
    name: 'Holons Test',
    slug: TEST_INSTANCE,
    config: { holons: { startingStake: 100 } },
  });

  t.after(async () => {
    await Promise.all([
      Instance.deleteMany({ id: TEST_INSTANCE }),
      InstanceMembership.deleteMany({ instanceId: TEST_INSTANCE }),
      HolonTransaction.deleteMany({ instanceId: TEST_INSTANCE }),
    ]);
    await mongoose.connection.close();
  });

  await t.test('transact writes the balance and the ledger together', async () => {
    await transact({ userId: USER, instanceId: TEST_INSTANCE, type: 'daily_bonus', amount: 25 });
    // 100 starting stake (join_bonus) + 25
    assert.equal(await balanceOf(), 125);
    assert.equal(await ledgerSum(), 125, 'ledger must equal the balance');
  });

  await t.test('balanceAfter on the ledger row matches the resulting balance', async () => {
    const before = await balanceOf();
    await transact({ userId: USER, instanceId: TEST_INSTANCE, type: 'daily_bonus', amount: 7 });
    const row = await HolonTransaction.findOne({ userId: USER, instanceId: TEST_INSTANCE, type: 'daily_bonus', amount: 7 });
    assert.equal(row.balanceAfter, before + 7);
  });

  // The regression this whole change exists for. Previously the $inc and the
  // ledger insert were two sequential awaits; a failure between them left the
  // balance moved with no record. Now they share a transaction, so a failing
  // ledger write must take the balance change with it.
  await t.test('a failing ledger write rolls the balance back', async () => {
    const before = await balanceOf();
    const beforeLedger = await ledgerSum();

    const realCreate = HolonTransaction.create;
    HolonTransaction.create = async () => { throw new Error('simulated ledger failure'); };
    try {
      await assert.rejects(
        () => transact({ userId: USER, instanceId: TEST_INSTANCE, type: 'daily_bonus', amount: 1000 }),
        /simulated ledger failure/
      );
    } finally {
      HolonTransaction.create = realCreate;
    }

    assert.equal(await balanceOf(), before, 'balance must not move when the ledger write fails');
    assert.equal(await ledgerSum(), beforeLedger);
  });

  await t.test('spend deducts and records', async () => {
    const before = await balanceOf();
    await spend({ userId: USER, instanceId: TEST_INSTANCE, type: 'support_cost', amount: 10 });
    assert.equal(await balanceOf(), before - 10);
    assert.equal(await ledgerSum(), await balanceOf());
  });

  await t.test('spend refuses to overdraw', async () => {
    const before = await balanceOf();
    await assert.rejects(
      () => spend({ userId: USER, instanceId: TEST_INSTANCE, type: 'support_cost', amount: before + 1 }),
      /Insufficient Holons/
    );
    assert.equal(await balanceOf(), before, 'a refused spend must not move the balance');
  });

  // spend() used to read the balance, compare, and then write. Two concurrent
  // spends could both observe a sufficient balance and both proceed. The check
  // is now part of the update itself.
  await t.test('concurrent spends cannot overdraw', async () => {
    const racer = 'race-' + Math.random().toString(36).slice(2, 8);
    await InstanceMembership.getOrCreate(racer, TEST_INSTANCE); // 100

    // Ten simultaneous spends of 20 against a balance of 100: at most five
    // may succeed.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        spend({ userId: racer, instanceId: TEST_INSTANCE, type: 'support_cost', amount: 20 })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;

    const finalBalance = await balanceOf(racer);
    assert.ok(finalBalance >= 0, `balance went negative: ${finalBalance}`);
    assert.equal(ok, 5, `expected exactly 5 successful spends, got ${ok}`);
    assert.equal(finalBalance, 0);
    assert.equal(await ledgerSum(racer), 0, 'ledger must still reconcile after a race');
  });
});
