const mongoose = require('mongoose');

// UnisonThread — persisted "Ask the Group" chat history, one thread per user
// per community (PLAN §6). Gives the LLM conversational continuity across
// sessions and lets the frontend rehydrate a prior conversation.
//
// Turns are pseudonymous by handle like everything else in Unison. Assistant
// turns carry the `citations` assembled from that turn's retrieval set so the
// UI can re-render the citation chips on reload (the citations are NOT parsed
// from model output — they are the caller-assembled retrieval set; see
// utils/unisonChat.js).
const citationSchema = new mongoose.Schema({
  kind:        { type: String, enum: ['node', 'reply'] },
  nodeId:      { type: String },
  replyId:     { type: String, default: null },
  ownerHandle: { type: String },
  anchorUrl:   { type: String },
}, { _id: false, id: false });

const turnSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, default: '' },
  citations: { type: [citationSchema], default: undefined },
  createdAt: { type: Date, default: Date.now },
}, { _id: false, id: false });

const unisonThreadSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true }, // community
  userId:     { type: String, required: true },
  handle:     { type: String, required: true },

  turns: { type: [turnSchema], default: [] },
}, {
  timestamps: true,
  id: false,
});

// One thread per member per community.
unisonThreadSchema.index({ instanceId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('UnisonThread', unisonThreadSchema);
