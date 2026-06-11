const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true, index: true },
  instanceId: { type: String, required: true, default: 'default', index: true },

  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },

  nominatedBy: { type: String, required: true }, // userId

  status: {
    type: String,
    enum: ['nominated', 'confirmed', 'expired'],
    default: 'nominated',
    index: true,
  },

  // Each supporter: userId + holons they wagered
  supporters: [{
    userId: String,
    holonsWagered: Number,
    supportedAt: { type: Date, default: Date.now },
  }],

  // Holons in the pool (transferred in when quorum reached)
  holonPool: { type: Number, default: 0 },

  // Quorum snapshot at time of nomination (from config)
  quorumThreshold: { type: Number, required: true },

  nominatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },   // nominatedAt + topicWindowHours
  confirmedAt: { type: Date, default: null },

  // Prior cycle context (if this is a re-nomination)
  priorTopicId: { type: String, default: null },
  priorCycleNotes: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
}, { id: false });

topicSchema.virtual('supporterCount').get(function () {
  return this.supporters.length;
});

topicSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Topic', topicSchema);
