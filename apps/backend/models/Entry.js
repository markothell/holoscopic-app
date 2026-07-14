const mongoose = require('mongoose');

// Entry — the atomic unit of participation and the source of truth for maps.
// One document per (activity, user, slot, question): a named position on the
// grid plus its comment text and the votes it has received.
//
// Ancestry (instanceId, topicId, activityId) is denormalized onto every entry
// so any map scope — an activity's live session, a player's personal map, a
// merged bridge map, the collective topics view — is a flat indexed query
// with no traversal.
const positionSchema = new mongoose.Schema({
  x: { type: Number, required: true, min: 0, max: 1 },
  y: { type: Number, required: true, min: 0, max: 1 },
}, { _id: false, id: false });

const entrySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  // Denormalized ancestry
  instanceId: { type: String, required: true, index: true },
  topicId:    { type: String, default: null },
  activityId: { type: String, required: true, index: true },

  // Author
  userId:   { type: String, required: true },
  username: { type: String, required: true, trim: true, maxlength: 20 },

  // Slot/question addressing. Standard types: slotNumber 1..maxEntries
  // (unbounded in solo tracker mode). Snapshot: slotNumber = question order,
  // questionId set. questionId stays null for non-snapshot types.
  slotNumber: { type: Number, required: true, min: 1, default: 1 },
  questionId: { type: String, default: null },

  // Content — position and text arrive in either order during play,
  // so both are optional; the entry is the union of what's been submitted.
  objectName: { type: String, default: '', trim: true, maxlength: 80 },
  position:   { type: positionSchema, default: null },
  text:       { type: String, default: '', trim: true, maxlength: 500 },

  // Votes received. Only voter identity is stored (never rendered with
  // usernames); voteCount is maintained in the same atomic update.
  voterIds:  [{ type: String }],
  voteCount: { type: Number, default: 0 },

  // Sample/seed data flag — replaces the legacy starter_* userId convention
  isSeed: { type: Boolean, default: false },
}, {
  timestamps: true,
  id: false,
});

// Personal map: everything a player authored in a game
entrySchema.index({ instanceId: 1, userId: 1 });
// Personal map reverse edge: entries a player voted for in a game (multikey)
entrySchema.index({ instanceId: 1, voterIds: 1 });
// Collective rollups per topic
entrySchema.index({ topicId: 1 });
// One entry per (activity, user, slot, question) — the upsert key
entrySchema.index(
  { activityId: 1, userId: 1, slotNumber: 1, questionId: 1 },
  { unique: true }
);

module.exports = mongoose.model('Entry', entrySchema);
