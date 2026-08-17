const mongoose = require('mongoose');

// Activity — pure configuration for a map session. All participation content
// (positions, text, votes) lives in the Entry collection (models/Entry.js);
// this document holds the frame, questions, economy fields, and membership.
const ActivitySchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    default: function() {
      return require('crypto').randomUUID().substring(0, 8);
    }
  },

  // The game this map belongs to (Instance.id) — stamped at creation
  instanceId: { type: String, required: true, index: true },

  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  urlName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    unique: true,
    match: /^[a-z0-9-]+$/
  },

  // Author (optional - for participant-created activities)
  author: {
    userId: {
      type: String,
      required: false
    },
    name: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100
    }
  },

  // Map configuration
  mapQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  mapQuestion2: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200,
    default: ''
  },

  xAxis: {
    label: { type: String, required: true, trim: true, maxlength: 50 },
    min:   { type: String, required: true, trim: true, maxlength: 30 },
    max:   { type: String, required: true, trim: true, maxlength: 30 }
  },

  yAxis: {
    label: { type: String, required: true, trim: true, maxlength: 50 },
    min:   { type: String, required: true, trim: true, maxlength: 30 },
    max:   { type: String, required: true, trim: true, maxlength: 30 }
  },

  // Comment configuration
  commentQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  objectNameQuestion: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    default: 'Name something that represents your perspective'
  },

  // Seed data JSON — materialized as isSeed entries via utils/entries.js
  starterData: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },

  // Activity description and reference link
  preamble: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500,
    default: ''
  },

  wikiLink: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200,
    default: ''
  },

  // Vote configuration
  votesPerUser: {
    type: Number,
    required: false,
    default: null, // null = unlimited votes
    min: 0
  },

  // Multi-entry configuration
  // 0 = unlimited entries (solo tracker mode - creator only)
  // 1, 2, 4 = standard entry slots per user
  maxEntries: {
    type: Number,
    required: false,
    min: 0,
    default: 1
  },

  // Activity type - determines UI/flow behavior
  activityType: {
    type: String,
    required: true,
    enum: ['dissolve', 'resolve', 'snapshot'],
    default: 'dissolve'
  },

  // Snapshot-specific: multiple named questions sharing one set of axes
  snapshotQuestions: [{
    id: { type: String, required: true },
    topic: { type: String, required: false, trim: true, maxlength: 50, default: '' },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    color: { type: String, required: true, trim: true, maxlength: 20 },
    order: { type: Number, required: true }
  }],

  // Snapshot axis point configuration (2 or 4 discrete points per axis)
  xAxisPoints: { type: Number, enum: [2, 4], default: 2 },
  yAxisPoints: { type: Number, enum: [2, 4], default: 2 },
  // Labels for each point, left→right for x, bottom→top for y
  xAxisLabels: [{ type: String, trim: true, maxlength: 30 }],
  yAxisLabels: [{ type: String, trim: true, maxlength: 30 }],

  // Public/Private setting
  isPublic: {
    type: Boolean,
    default: false // Private by default, requires authentication
  },

  // Profile links setting
  showProfileLinks: {
    type: Boolean,
    default: true // Show profile icons by default
  },

  // Axis labels setting
  showAxisLabels: {
    type: Boolean,
    default: true // Show center axis labels on map by default
  },

  // Activity state
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  },

  // Draft mode - hidden from public view when true
  isDraft: {
    type: Boolean,
    default: true
  },

  // Frame of Reference this activity uses (references FrameOfReference.id)
  frameId: { type: String, default: null },

  // Topic context (references Topic.id)
  topicId: { type: String, default: null },

  // The pattern (Algorithm.id) whose skeleton produced this map, when a
  // session was run from one. Provenance, not membership: the map belongs to
  // its topic and its sequence, and this says where its setup came from — so
  // a topic can show which of its maps a pattern generated. A pattern's own
  // template maps leave it null; they are the origin rather than a result.
  sourceAlgorithmId: { type: String, default: null },

  // Stake ledger — tracks who staked holons into this activity's pool
  stakes: [{
    userId:     { type: String, required: true },
    instanceId: { type: String, required: true },
    amount:     { type: Number, required: true },
    settled:    { type: Boolean, default: false },
    stakedAt:   { type: Date, default: Date.now },
  }],

  // Membership — who has joined this map (presence is socket state, not data)
  participants: [{
    id: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Email collection
  emails: [{
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 100
    },
    userId: {
      type: String,
      required: false
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  id: false,
});

// Indexes for performance
ActivitySchema.index({ status: 1, createdAt: -1 });
ActivitySchema.index({ 'participants.id': 1 });
ActivitySchema.index({ topicId: 1 });
// routes/activities.js:209 — the instance activity list, sorted by recency.
ActivitySchema.index({ instanceId: 1, createdAt: -1 });
// The expiry sweep's query shape (instance-scoped after the cross-tenant fix).
ActivitySchema.index({ instanceId: 1, status: 1, createdAt: 1 });
// "Activities this user is in", scoped — the bare participants.id index above
// is global and matches across every instance.
ActivitySchema.index({ instanceId: 1, 'participants.id': 1 });

// Add or refresh a member
ActivitySchema.methods.addParticipant = async function(userId, username) {
  const existing = this.participants.find(p => p.id === userId);
  if (existing) {
    existing.username = username;
  } else {
    this.participants.push({ id: userId, username, joinedAt: new Date() });
  }
  return this.save();
};

ActivitySchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.id !== userId);
  return this.save();
};

ActivitySchema.methods.complete = function() {
  this.status = 'completed';
  return this.save();
};

module.exports = mongoose.model('Activity', ActivitySchema);
