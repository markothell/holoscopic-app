const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const InstanceMembership = require('../models/InstanceMembership');
const HolonTransaction = require('../models/HolonTransaction');
const Instance = require('../models/Instance');

let _io = null;
function setIO(io) { _io = io; }

// Explore-mode instances run with the economy switched off: every earn/spend
// is a no-op so no ledger accrues and balances never move. Checked here (the
// single chokepoint) so it covers all current and future transaction sites.
async function isExploreMode(instanceId) {
  const inst = await Instance.findOne({ id: instanceId }).select('config.mode').lean();
  return inst?.config?.mode === 'explore';
}

// Whether this deployment can run multi-document transactions. Atlas is a
// replica set so this is yes in every real environment; a standalone mongod
// (someone's laptop) is the exception, and it reports error code 20.
// Probed once, lazily, from the first real failure rather than by asking.
let txnSupported = true;

function isNoTransactionSupport(err) {
  // 20 = IllegalOperation, "Transaction numbers are only allowed on a replica
  // set member or mongos". 263 = OperationNotSupportedInTransaction.
  return err && (err.code === 20 || err.code === 263 ||
    /Transaction numbers are only allowed/i.test(err.message || ''));
}

/**
 * The atomic core: move a balance and write its ledger row as one unit.
 *
 * These used to be two sequential awaits — `$inc` the membership, then create
 * the HolonTransaction. A process killed between them (Render sends SIGTERM on
 * every deploy, and until recently nothing handled it) moved holons with no
 * record of the movement. scripts/verify-ledger.js found exactly that
 * fingerprint in the dev cluster: a balance sitting below the sum of its own
 * ledger.
 *
 * `minBalance` makes a spend conditional in the same operation, so a balance
 * check and its deduction cannot be split by a concurrent request. Read-then-
 * write let two simultaneous spends both observe a sufficient balance and both
 * proceed, overdrawing the account.
 *
 * @returns {number|null} new balance, or null when minBalance was not met.
 */
async function applyDelta({ userId, instanceId, type, amount, refType, refId, minBalance }) {
  const filter = { userId, instanceId };
  if (minBalance != null) filter.holonBalance = { $gte: minBalance };

  const ledgerRow = {
    id: uuidv4().replace(/-/g, '').slice(0, 8),
    userId,
    instanceId,
    type,
    amount,
    refType: refType ?? null,
    refId: refId ?? null,
  };

  // Sequential path, used only where transactions are unavailable.
  const withoutTransaction = async () => {
    const membership = await InstanceMembership.findOneAndUpdate(
      filter,
      { $inc: { holonBalance: amount } },
      { new: true }
    );
    if (!membership) return null;
    await HolonTransaction.create({ ...ledgerRow, balanceAfter: membership.holonBalance });
    return membership.holonBalance;
  };

  if (!txnSupported) return withoutTransaction();

  const session = await mongoose.startSession();
  try {
    let balance = null;
    await session.withTransaction(async () => {
      const membership = await InstanceMembership.findOneAndUpdate(
        filter,
        { $inc: { holonBalance: amount } },
        { new: true, session }
      );
      if (!membership) {
        // Filter did not match — insufficient funds, or no membership. No $inc
        // was applied, so there is nothing to roll back; returning early
        // commits an empty transaction, and no ledger row is written.
        balance = null;
        return;
      }
      // create() takes an array when given a session.
      await HolonTransaction.create(
        [{ ...ledgerRow, balanceAfter: membership.holonBalance }],
        { session }
      );
      balance = membership.holonBalance;
    });
    return balance;
  } catch (err) {
    if (isNoTransactionSupport(err)) {
      // Standalone mongod. Degrade rather than break local development, but
      // say so once — this is the configuration where the split-write bug can
      // still occur.
      txnSupported = false;
      console.warn(
        '⚠️  [holons] MongoDB deployment does not support transactions — ' +
        'balance and ledger writes are no longer atomic. Expected only on a ' +
        'standalone mongod; Atlas supports transactions.'
      );
      return withoutTransaction();
    }
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

async function transact({ userId, instanceId, type, amount, refType = null, refId = null }) {
  if (!instanceId) throw new Error('instanceId is required for holon transactions');

  if (await isExploreMode(instanceId)) {
    const m = await InstanceMembership.getOrCreate(userId, instanceId);
    return m.holonBalance;
  }

  await InstanceMembership.getOrCreate(userId, instanceId);

  const balance = await applyDelta({ userId, instanceId, type, amount, refType, refId });
  if (balance == null) {
    // No minBalance was set, so the only way to get here is a membership that
    // vanished between getOrCreate and the update.
    throw new Error('Membership not found');
  }

  // instanceId lets clients apply the update only when it belongs to the
  // instance they are currently viewing (balances are per-instance).
  if (_io) _io.to(`user:${userId}`).emit('holon_update', { balance, instanceId });

  return balance;
}

/**
 * Deduct Holons from a membership, throwing if balance is insufficient.
 *
 * The check and the deduction are one atomic operation (see applyDelta's
 * minBalance) — they used to be a read, a comparison, and then a separate
 * write, which two concurrent spends could interleave to overdraw an account.
 */
async function spend({ userId, instanceId, type, amount, refType, refId }) {
  if (!instanceId) throw new Error('instanceId is required for holon transactions');

  const membership = await InstanceMembership.getOrCreate(userId, instanceId);
  // Explore mode: nothing is charged and the balance is never gated.
  if (await isExploreMode(instanceId)) return membership.holonBalance;

  const balance = await applyDelta({
    userId, instanceId, type, amount: -amount, refType, refId,
    minBalance: amount,
  });
  if (balance == null) throw new Error('Insufficient Holons');

  if (_io) _io.to(`user:${userId}`).emit('holon_update', { balance, instanceId });

  return balance;
}

module.exports = { transact, spend, setIO };
