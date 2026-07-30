const mongoose = require('mongoose');

// SynMembership — join record for a Synthesis community (a child Instance,
// slug `idea-<code>`). Distinct from the platform-wide InstanceMembership
// (which tracks Holon balance): Synthesis has no economy in v1 (plan D1) and
// needs a field InstanceMembership doesn't carry — the member's
// PSEUDONYMOUS HANDLE, the name every node, reply, and citation in this
// community attributes to (plan D3, "always named by handle").
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
synthesisMembershipSchema.index({ instanceId: 1, userId: 1 }, { unique: true });
synthesisMembershipSchema.index({ instanceId: 1, handleLower: 1 }, { unique: true });

module.exports = mongoose.model('SynMembership', synthesisMembershipSchema);
