const mongoose = require('mongoose');

// An invitation to one circle, for one address, behind one link.
//
// The link carries a random token and only its SHA-256 lands here — same
// reasoning as User.resetTokenHash: a link is a bearer credential, so reading
// the database must not be enough to mint one. There is no invitation mail;
// the host copies the link and writes their own (utils/invites.js).
//
// Accepting requires the account's CONFIRMED email to equal `email`. The token
// says "this is the invitation"; the address says "and it is yours". Either
// alone would let a forwarded link or a typed-in address take somebody's seat.
//
// Circle.invitedEmails stays the join gate (utils/circles.js#joinCircle). An
// invite adds its address there when created and removes it when revoked, so
// the circle page and the invite link can never disagree about who is in.
//
// Production runs autoIndex: false — these indexes reach it only through
// scripts/ensure-indexes.js with NODE_ENV=production.

const inviteSchema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  tokenHash:  { type: String, required: true, unique: true },
  circleId:   { type: String, required: true, index: true },
  instanceId: { type: String, required: true },
  email:      { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  invitedBy:  { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'revoked'],
    default: 'pending',
  },
  respondedAt: { type: Date, default: null },
  acceptedBy:  { type: String, default: null },
  // 'expired' is never stored: a pending invite past this date reads as
  // expired (utils/invites.js#statusOf), so nothing has to sweep it.
  expiresAt:   { type: Date, required: true },
}, {
  timestamps: true,
  id: false,
});

// "Invitations for me": the account's address, pending only.
inviteSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('Invite', inviteSchema);
