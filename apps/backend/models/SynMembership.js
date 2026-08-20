const mongoose = require('mongoose');

// SynMembership — membership record for a Synthesis idea (a child Instance,
// slug `idea-<code>`). Distinct from the platform-wide InstanceMembership
// (which tracks Holon balance): Synthesis has no economy in v1 (plan D1).
//
// PSEUDONYMITY WAS DROPPED 2026-08-20 (reversing plan D3). `handle` was a
// per-idea pseudonym the member chose, unique within the idea and enforced by
// a `handleLower` index. It is now a plain denormalized snapshot of the
// member's Holoscopic account name, taken at write time — the same treatment
// `ownerHandle` gets on SynNode. D3 was written when ideas were standalone
// demo games; circles are the centre now, an idea inside a circle is a group
// of people who know each other, and a second name for the same person was
// friction with nothing on the other side of it. Two members may share a
// display name; nothing keys off it. The field kept its name because live
// rows and three denormalized siblings already use it.
//
// The ≤50-member gate (plan §8) is enforced by counting these records
// before insert in utils/synIdeas.js — never client-side, never
// here (this is a plain schema, no business logic).
const synthesisMembershipSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // the community
  userId:     { type: String, required: true, index: true }, // global User.id

  // Display name, snapshotted from the account at write time. Not unique.
  handle: { type: String, required: true, trim: true, maxlength: 40 },

  role: { type: String, enum: ['member', 'admin'], default: 'member' },

  joinedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  id: false,
});

// One membership per (idea, user). The handle index went with the pseudonym.
synthesisMembershipSchema.index({ instanceId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('SynMembership', synthesisMembershipSchema);
