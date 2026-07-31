const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * ContactMessage — somebody wrote in from /contact.
 *
 * Global, not instance-scoped: a person reaching out is reaching the platform,
 * and they may well be writing about a Chorus memorial they have no account in.
 *
 * The row is the point. routes/contact.js saves it BEFORE it tries to send,
 * because the whole reason this exists is that a visitor had no way to reach a
 * person — and losing their message to an expired Resend key would be the same
 * failure wearing a different hat.
 */
const ContactMessageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => uuidv4().replace(/-/g, '').substring(0, 8),
      unique: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // What the send attempt returned: 'sent' | 'failed' | 'unconfigured' |
    // 'no-recipient'. Stored so "did anyone actually see this?" is answerable
    // from the row itself rather than by correlating with server logs that
    // have since rotated.
    deliveryStatus: {
      type: String,
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactMessage', ContactMessageSchema);
