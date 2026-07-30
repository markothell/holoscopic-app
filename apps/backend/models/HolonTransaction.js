const mongoose = require('mongoose');

const holonTransactionSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true, index: true },
  userId:     { type: String, required: true, index: true },
  instanceId: { type: String, default: 'default', index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'join_bonus',
      'daily_bonus',
      'nomination_cost',
      'nomination_return',
      'support_cost',
      'support_return',
      'session_host_reward',
      'session_participant_reward',
      'frame_contribution_reward',
      'algorithm_publish_cost',
      'algorithm_royalty',
      'algorithm_frame_royalty',
      'algorithm_proposal',
      'algorithm_proposal_join',
      'algorithm_proposal_return',
      // Activity stake model
      'activity_stake',
      'activity_stake_return',
      'comment_attribution',
      // Frame economy
      'frame_use_reward',
      // Pattern economy
      'entry_seed_reward',
      'pattern_activity_reward',
      // On a Spectrum token locks — stakes always lock and return, never burn
      'oas_stake',
      'oas_stake_return',
    ],
  },
  amount: { type: Number, required: true }, // positive = earn, negative = spend
  balanceAfter: { type: Number, required: true },
  // Reference to the entity that triggered this transaction
  refType: { type: String, enum: ['topic', 'inquiry', 'algorithm', 'algorithmSession', 'activity', 'sequence', 'frame', 'oas_nomination', null] },
  refId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
}, { id: false });

// The fastest-growing collection on the platform — one row per daily bonus,
// stake, vote settlement and award.
// routes/holons.js:85 — a user's ledger page.
holonTransactionSchema.index({ userId: 1, instanceId: 1, createdAt: -1 });
// routes/holons.js:56 — the leaderboard aggregation, which otherwise scans
// every transaction in the instance before grouping.
holonTransactionSchema.index({ instanceId: 1, type: 1, amount: 1 });

module.exports = mongoose.model('HolonTransaction', holonTransactionSchema);
