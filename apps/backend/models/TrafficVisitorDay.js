const mongoose = require('mongoose');

// "Have I already counted this visitor on this app today?"
//
// Existence is the whole record. A unique index on (day, app, visitorHash)
// turns the question into an insert that either succeeds — first sighting, so
// bump TrafficDaily.visitors — or fails with a duplicate-key error, which is
// the answer "already counted" arriving as an exception. That makes the
// visitor count EXACT rather than estimated, at the cost of one small document
// per visitor per app per day.
//
// It is scratch space, not history. A TTL of two days clears it, because the
// only question it answers is about today and the number it produced has
// already been written into TrafficDaily. Two rather than one so a visit a few
// minutes before midnight UTC is still deduped against a visit a few minutes
// after, on whichever day the write lands.
//
// The hashes here have the same one-day lifetime built into them as everywhere
// else (see TrafficEvent), so this collection cannot be mined for a cross-day
// history of anyone even while it exists.

const trafficVisitorDaySchema = new mongoose.Schema({
  day: { type: String, required: true },
  app: { type: String, required: true },
  visitorHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { id: false });

trafficVisitorDaySchema.index({ day: 1, app: 1, visitorHash: 1 }, { unique: true });
trafficVisitorDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.models.TrafficVisitorDay
  || mongoose.model('TrafficVisitorDay', trafficVisitorDaySchema);
