const mongoose = require('mongoose');
const crypto = require('crypto');

// One page view or one link click, as reported by a browser.
//
// This is the RAW tier, and it is deliberately short-lived: a TTL index drops
// each document 30 days after it was written. Everything worth keeping past
// that has already been folded into TrafficDaily by utils/traffic.js at write
// time, so nothing here is the only copy of anything. That split is the whole
// storage design — drill-down for the recent past, counters forever — and it
// is what keeps a collection that grows with traffic from becoming the largest
// thing in the database inside a year.
//
// WHAT IS NOT HERE IS THE POINT. No IP address, no user agent string, no
// account id, no cookie. `visitorHash` is an HMAC of IP + user-agent + the
// calendar day, so it distinguishes two people on the same day and CANNOT link
// the same person across two days: yesterday's hash for a given phone is not
// recomputable from today's inputs, because the day is inside the digest. That
// makes "how many people came on Tuesday" answerable and "what did this person
// do over the last month" structurally unanswerable, which is the trade this
// platform wants — Chorus memorials in particular are grief contexts with no
// accounts by design (apps/chorus/PLAN.md D2), and a durable visitor id there
// would be a promise broken.

const trafficEventSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomUUID().substring(0, 8),
  },

  // Which frontend reported this. Sent explicitly by the beacon rather than
  // inferred from the Origin header, for the same reason Instance.app exists:
  // a guess from an accident of routing is how four consumers each ended up
  // with a different answer. Validated against an allowlist on the way in
  // (utils/traffic.js#APPS), so a spoofed value can only ever be one of ours.
  //
  // holoscopic.io serves three of these from one deployment — the marketing
  // site, interView, and Map+Sequence — and its beacon splits them by path,
  // because that app is the only thing that knows its own route structure.
  app: { type: String, required: true, index: true },

  type: { type: String, enum: ['view', 'click'], required: true },

  // Views: the path visited. Clicks: the path the link was clicked FROM.
  // Query strings are stripped before this is stored — a Chorus wall filtered
  // by tag is the same page, and `?k=` on a curate link is a credential.
  path: { type: String, default: '' },

  // Clicks only. `target` is where the link goes, `label` is what it said —
  // both are needed, because "Read the manifesto" and "/manifesto" answer
  // different questions and the interesting homepage links are the ones whose
  // wording is being tested.
  target: { type: String, default: '' },
  label: { type: String, default: '' },

  // Host only, never the full referring URL: enough to tell a text message
  // from a search engine from a link somebody posted, without recording the
  // search terms or the private page somebody came from.
  referrerHost: { type: String, default: '' },

  // Present when the reporting page belongs to one tenant — a Chorus memorial
  // is the case that matters, since one deployment serves every one of them
  // and "how did this memorial do" is the question a family asks.
  instanceId: { type: String, default: '' },
  slug: { type: String, default: '' },

  visitorHash: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
}, { id: false });

// The retention half of the storage design. 30 days of raw detail, dropped by
// the server rather than by a cron job somebody has to remember exists.
trafficEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// The dashboard's drill-down queries: one app, one kind of event, newest first.
trafficEventSchema.index({ app: 1, type: 1, createdAt: -1 });

// "Everything that happened on this memorial" — the per-tenant view.
trafficEventSchema.index({ instanceId: 1, createdAt: -1 });

module.exports = mongoose.models.TrafficEvent
  || mongoose.model('TrafficEvent', trafficEventSchema);
