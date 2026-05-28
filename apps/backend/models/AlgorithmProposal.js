const mongoose = require('mongoose');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const proposalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true, default: generateId },
  instanceId: { type: String, required: true, default: 'default', index: true },
  algorithmId: { type: String, required: true, index: true },
  proposedBy: { type: String, required: true },
  intent: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'active', 'cancelled'], default: 'open', index: true },
  signups: [{
    userId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
  }],
  quorumThreshold: { type: Number, required: true },
  sequenceId: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AlgorithmProposal', proposalSchema);
