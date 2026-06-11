const mongoose = require('mongoose');

const algorithmSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true, index: true },
  instanceId: { type: String, required: true, default: 'default', index: true },

  title: { type: String, required: true, trim: true },
  thesis: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },

  authorId: { type: String, required: true },

  // Linked sequence that defines the conversation pattern
  sequenceId: { type: String, default: null },

  // Fork lineage
  forkParentId: { type: String, default: null },
  forkDepth: { type: Number, default: 0 },
  royaltyPercent: { type: Number, default: 0 }, // % of publish cost going to parent chain

  status: { type: String, enum: ['draft', 'published'], default: 'published' },

  publishedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}, { id: false });

module.exports = mongoose.model('Algorithm', algorithmSchema);
