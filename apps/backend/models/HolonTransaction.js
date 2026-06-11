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
      // Activity stake model
      'activity_stake',
      'activity_stake_return',
      'comment_attribution',
      // Frame economy
      'frame_use_reward',
      // Pattern economy
      'entry_seed_reward',
      'pattern_activity_reward',
    ],
  },
  amount: { type: Number, required: true }, // positive = earn, negative = spend
  balanceAfter: { type: Number, required: true },
  // Reference to the entity that triggered this transaction
  refType: { type: String, enum: ['topic', 'inquiry', 'algorithm', 'algorithmSession', 'activity', 'sequence', 'frame', null] },
  refId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
}, { id: false });

module.exports = mongoose.model('HolonTransaction', holonTransactionSchema);
