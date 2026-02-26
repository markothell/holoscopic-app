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
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    topics: [
      {
        type: String,
        enum: ['Relationship', 'Intuition', 'Work', 'Sexuality'],
      },
    ],
  },
  { timestamps: true }
);

WaitlistSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

module.exports = mongoose.model('Waitlist', WaitlistSchema);
