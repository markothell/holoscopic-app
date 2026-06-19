const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Signup — general interest capture (e.g. "Start your own" notify-me).
 * Global, not instance-scoped. Distinct from Waitlist, which is per-sequence.
 */
const SignupSchema = new mongoose.Schema(
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
    // Where the signup came from, e.g. 'start-your-own'.
    source: {
      type: String,
      required: true,
      trim: true,
      default: 'start-your-own',
      index: true,
    },
  },
  { timestamps: true }
);

// One entry per email per source.
SignupSchema.index({ email: 1, source: 1 }, { unique: true });

module.exports = mongoose.model('Signup', SignupSchema);
