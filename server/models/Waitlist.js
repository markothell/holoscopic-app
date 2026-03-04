const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const WaitlistSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => uuidv4().replace(/-/g, '').substring(0, 8),
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    sequenceId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index: one entry per email per sequence
WaitlistSchema.index({ email: 1, sequenceId: 1 }, { unique: true });

WaitlistSchema.statics.findByEmail = function (email) {
  return this.find({ email: email.toLowerCase().trim() });
};

module.exports = mongoose.model('Waitlist', WaitlistSchema);
