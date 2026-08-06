const mongoose = require('mongoose');

// Circle — a cohort plus a round machine, generic over the activity it runs.
//
// A circle holds members, an ordered list of SEEDS (one per member), and a
// phase machine that walks the seeds one at a time. What a seed CONTAINS and
// what "this member is done" MEANS are supplied by an activity module
// registered in utils/circleActivities.js — the circle never reads inside
// `seeds[].payload`.
//
// The whole point is asynchronous participation: a phase ends when everyone
// finishes, when its deadline passes, or when the author says so, and each
// transition notifies the people who now have something to do. See
// apps/threshold/PLAN.md §3 for the design and why this is not an extension of
// Sequence (global, activity-DAG-shaped, no completion trigger).
//
// Consumer #1 is Threshold. Nothing in this file knows that.

const memberSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  username: { type: String, required: true, trim: true, maxlength: 40 },
  email:    { type: String, trim: true, lowercase: true, maxlength: 100, default: '' },
  joinedAt: { type: Date, default: Date.now },
  // Set by the no-login unsubscribe link. Suppresses mail, never notifications.
  emailOptOut: { type: Boolean, default: false },
}, { _id: false, id: false });

const seedSchema = new mongoose.Schema({
  id:       { type: String, required: true },
  authorId: { type: String, required: true },
  order:    { type: Number, required: true },

  // OPAQUE to the circle. Validated and normalized by the activity module's
  // normalizeSeed(); read by nothing in utils/circles.js.
  payload:  { type: mongoose.Schema.Types.Mixed, default: {} },

  // 'pending' until this seed's cycle opens. The middle values come from the
  // module's `phases` array, so they are activity-defined and deliberately not
  // an enum here — Threshold's are 'share' and 'rank'. 'revealed' is terminal.
  phase:    { type: String, default: 'pending' },

  openedAt:      { type: Date, default: null },
  phaseDeadline: { type: Date, default: null },
  revealedAt:    { type: Date, default: null },

  // Guards against a retry after a partial mail failure re-notifying everyone
  // (PLAN §3.6). Keyed by phase name.
  notifiedPhases: { type: [String], default: () => [] },

  // The activity module's computed output for this cycle, written by
  // onCycleReveal(). Opaque here, like payload.
  result:   { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false, id: false });

// Why a phase ended. Kept so a cycle that closed early is explainable later —
// "the deadline passed" and "the author moved us on" look identical in the
// resulting data otherwise.
const transitionSchema = new mongoose.Schema({
  at:       { type: Date, default: Date.now },
  seedId:   { type: String, default: null },
  from:     { type: String, required: true },
  to:       { type: String, required: true },
  via:      { type: String, enum: ['complete', 'deadline', 'manual'], required: true },
  byUserId: { type: String, default: null },
}, { _id: false, id: false });

const circleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    default: function () {
      return require('crypto').randomUUID().substring(0, 8);
    },
  },

  instanceId: { type: String, required: true, index: true },

  // Key into utils/circleActivities.js. An unregistered value is fatal at
  // evaluate time, not at save time — a circle whose app was removed should
  // fail loudly rather than silently stop advancing.
  activity: { type: String, required: true },

  title:   { type: String, required: true, trim: true, maxlength: 100 },
  urlName: { type: String, required: true, trim: true, maxlength: 50, match: /^[a-z0-9-]+$/ },

  createdBy: { type: String, required: true },

  // 'single' caps seeds at 1, authored by the creator at creation time, and
  // skips the seeding phase entirely. A standalone run of the activity IS a
  // one-seed circle — there is no second code path (PLAN §1, D1).
  mode:   { type: String, enum: ['single', 'circle'], default: 'circle' },
  status: { type: String, enum: ['draft', 'open', 'running', 'complete'], default: 'draft' },

  phase:         { type: String, enum: ['draft', 'seeding', 'cycle', 'complete'], default: 'draft' },
  // Seeding's clock. Cycle deadlines live on the seed, since each cycle has its own.
  phaseDeadline: { type: Date, default: null },

  config: {
    // null on any of these = that phase has no clock and ends only on
    // completion or by hand (D16).
    seedHours:  { type: Number, default: 72, min: 1, max: 8760 },
    shareHours: { type: Number, default: 72, min: 1, max: 8760 },
    rankHours:  { type: Number, default: 72, min: 1, max: 8760 },

    advanceOnComplete: { type: Boolean, default: true },

    // Starting point for the seed form. Activity-specific, opaque.
    seedDefaults: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },

  members:           { type: [memberSchema], default: () => [] },
  invitedEmails:     { type: [String], default: () => [] },
  requireInvitation: { type: Boolean, default: true },

  seeds:      { type: [seedSchema], default: () => [] },
  // Index into seeds[] — which cycle is live. -1 before the first opens.
  cycleIndex: { type: Number, default: -1 },

  transitions: { type: [transitionSchema], default: () => [] },

  startedAt:   { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, {
  timestamps: true,
  id: false,
});

// One circle per name per instance. Unlike Sequence's global urlName, this is
// scoped — two deployments may both have a circle called 'authority'.
circleSchema.index({ instanceId: 1, urlName: 1 }, { unique: true });
// utils/circles.js#sweepCircles — the tick's only query.
circleSchema.index({ status: 1, updatedAt: -1 });
// "circles I'm in" (multikey, same pattern as Entry.voterIds).
circleSchema.index({ 'members.userId': 1 });
// routes/threshold.js finds the circle by a SEED id rather than making the
// client carry both — so this runs on every share, ranking and reveal request.
// Declared here as well as in scripts/ensure-indexes.js: the two must agree, or
// scripts/init-threshold.js (which builds what the SCHEMA declares) leaves
// production one index short of what the specs claim.
circleSchema.index({ instanceId: 1, 'seeds.id': 1 });

module.exports = mongoose.model('Circle', circleSchema);
