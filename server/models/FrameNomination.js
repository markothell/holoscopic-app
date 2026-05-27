const mongoose = require('mongoose');

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const frameNominationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true, default: generateId },
  sequenceId: { type: String, required: true, index: true },
  sequenceUrlName: { type: String, required: true },
  sourceActivityId: { type: String, required: true },
  nomineeUserId: { type: String, required: true },
  nomineeUsername: { type: String, default: '' },
  entryObjectName: { type: String, default: '' },
  entrySlotNumber: { type: Number, default: 1 },
  selectionMethod: { type: String, enum: ['manual', 'top_voted', 'top_voted_per_quadrant'], default: 'manual' },
  nominatedBy: { type: String, required: true },
  status: { type: String, enum: ['pending', 'submitted', 'declined'], default: 'pending', index: true },
  resultActivityId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('FrameNomination', frameNominationSchema);
