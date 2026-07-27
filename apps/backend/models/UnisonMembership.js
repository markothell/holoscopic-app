const mongoose = require('mongoose');

// UnisonMembership — join record for a Unison community (a child Instance,
// slug `uni-<code>`). Distinct from the platform-wide InstanceMembership
// (which tracks Holon balance): Unison has no economy in v1 (plan D1) and
// needs a field InstanceMembership doesn't carry — the member's
// PSEUDONYMOUS HANDLE, the name every node, reply, and citation in this
// community attributes to (plan D3, "always named by handle").
//
// The ≤50-member gate (plan §8) is enforced by counting these records
// before insert in utils/unisonCommunities.js — never client-side, never
// here (this is a plain schema, no business logic).
const unisonMembershipSchema = new mongoose.Schema({
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

  // Pseudonymous identity within this community. `handle` keeps the
  // author's display casing; `handleLower` is the case-insensitive dedupe
  // key a community's members are unique on.
  handle:      { type: String, required: true, trim: true, maxlength: 40 },
  handleLower: { type: String, required: true },

  role: { type: String, enum: ['member', 'admin'], default: 'member' },

  joinedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  id: false,
});

// One membership per (community, user); one handle per community.
unisonMembershipSchema.index({ instanceId: 1, userId: 1 }, { unique: true });
unisonMembershipSchema.index({ instanceId: 1, handleLower: 1 }, { unique: true });

module.exports = mongoose.model('UnisonMembership', unisonMembershipSchema);
