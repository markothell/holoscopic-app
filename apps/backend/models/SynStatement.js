const mongoose = require('mongoose');

// SynStatement — a proposition one collaborator puts to an idea's group, and
// the votes it has drawn. This is the mechanism by which a group ARRIVES
// somewhere: the Union (SynUnion) reads the corpus, a member edits that read
// into a claim they will stand behind, and the group votes. When one statement
// clears the bar (D12, ⅔ of collaborators) the group has reached Synthesis.
//
// WHY NOT AN ENTRY. Replies duck-type a published node as their activity and
// live in the shared `Entry` collection, and it was tempting to do the same
// here. Three things rule it out: a statement carries no position (it is prose,
// not a stance on axes), it is scoped to the IDEA rather than to a post, and —
// decisively — Entry's vote budget (`activity.votesPerUser`, utils/entries.js)
// counts votes only. D14's budget spans authoring and voting TOGETHER, which
// voteEntry cannot express. What is reused is the shape: `voterIds` +
// `voteCount` maintained exactly as entries.js maintains them, so the client
// reads a statement the same way it reads a reply.
//
// All writes go through utils/synStatements.js — the slot budget and the
// threshold check live there and nowhere else.

const synStatementSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // the idea

  // Pseudonymous author, handle denormalized for the leaderboard (D3 — no
  // anonymization anywhere in this app).
  authorId:     { type: String, required: true },
  authorHandle: { type: String, required: true },

  text: { type: String, required: true, trim: true, maxlength: 500 },

  // The Union this was drafted from, when it was. Null for a statement written
  // from scratch. Kept for provenance: it answers "did the group's own read
  // seed this, or did someone bring it themselves?"
  sourceUnionId: { type: String, default: null },

  // 'live'      — on the board, holding one of its author's slots
  // 'withdrawn' — retired by its author; frees every slot it held
  //
  // There is deliberately NO 'synthesized' status. Synthesis is a living
  // measure of the group, recomputed from current votes (utils/synStatements.js
  // #synthesisState), so no statement is ever marked the winner. A statement is
  // the group's synthesis for exactly as long as the group is still behind it.
  status: {
    type: String,
    enum: ['live', 'withdrawn'],
    default: 'live',
    index: true,
  },

  // Same contract as Entry: voteCount is always voterIds.length, never
  // maintained independently. Voter handles are not stored — the client needs
  // "have I voted" and a count, and nothing else.
  voterIds:  { type: [String], default: [] },
  voteCount: { type: Number, default: 0 },
}, {
  timestamps: true,
  id: false,
});

// The leaderboard: an idea's live statements, most-backed first.
synStatementSchema.index({ instanceId: 1, status: 1, voteCount: -1 });
// Slot accounting: "which statements is this user holding a vote on?" —
// multikey, and the other half of the budget count (authored) is covered by
// the index below.
synStatementSchema.index({ instanceId: 1, voterIds: 1 });
synStatementSchema.index({ instanceId: 1, authorId: 1, status: 1 });

module.exports = mongoose.model('SynStatement', synStatementSchema);
