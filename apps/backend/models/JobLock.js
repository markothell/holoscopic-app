const mongoose = require('mongoose');

// A leased lock, so only one process runs a periodic job at a time.
//
// The lease (rather than a plain flag) is what makes this safe: a process that
// dies holding the lock does not wedge the job forever — the lease simply
// expires and the next tick picks it up.
//
// Note this is an optimization, not the correctness guarantee. The sweeps it
// guards use conditional updates, so even if two processes ran simultaneously
// each payout would still happen exactly once. See utils/sweeps.js.
const jobLockSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, index: true },
  holder:    { type: String, required: true },
  expiresAt: { type: Date, required: true },
  updatedAt: { type: Date, default: Date.now },
}, { id: false });

module.exports = mongoose.model('JobLock', jobLockSchema);
