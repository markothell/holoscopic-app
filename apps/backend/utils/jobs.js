const os = require('node:os');
const crypto = require('node:crypto');
const JobLock = require('../models/JobLock');

// Identifies this process in the lock document. Useful in logs when a job
// stops running and you need to know which box was holding it.
const HOLDER = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

/**
 * Run `fn` only if this process can take the named lease.
 *
 * One atomic findOneAndUpdate does the whole acquisition: the filter matches
 * only a lock that is expired or already ours, so exactly one caller can win.
 * A duplicate-key error means another process created it first — also a loss.
 *
 * @returns {Promise<boolean>} whether the work ran here.
 */
async function withLock(name, ttlMs, fn) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  let acquired = false;
  try {
    // Only an expired lease can be taken. Note there is deliberately no
    // "…or I already hold it" clause: that would let this process re-enter its
    // own lock, so two overlapping ticks in ONE process — a sweep running
    // longer than the interval — would both proceed. The lock has to exclude
    // the local caller as strictly as a remote one.
    const res = await JobLock.findOneAndUpdate(
      { name, expiresAt: { $lt: now } },
      { $set: { holder: HOLDER, expiresAt, updatedAt: now } },
      { new: true, upsert: true },
    );
    acquired = Boolean(res);
  } catch (err) {
    // 11000: the lock exists and is held by someone whose lease is still live,
    // so the upsert collided. A normal loss, not an error.
    if (err.code === 11000) return false;
    throw err;
  }

  if (!acquired) return false;

  try {
    await fn();
  } finally {
    // Release by expiring the lease rather than deleting the document — the
    // row is a useful record of which process ran the job last.
    await JobLock.updateOne(
      { name, holder: HOLDER },
      { $set: { expiresAt: new Date(), updatedAt: new Date() } },
    ).catch(() => {});
  }
  return true;
}

module.exports = { withLock, HOLDER };
