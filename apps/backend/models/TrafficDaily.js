const mongoose = require('mongoose');

// The permanent tier: one counter row per (day, app, type, key).
//
// TrafficEvent keeps 30 days and then deletes itself, so this is what answers
// "how did traffic move over the last year". It is written at the same moment
// as the raw event rather than by a nightly rollup job, which costs one extra
// upsert per beacon and buys the property that matters: there is no window in
// which a number exists in one tier and not the other, and no job whose
// failure is invisible until somebody asks for a chart.
//
// `key` is overloaded on purpose, and the convention is load-bearing:
//   type 'view',     key '*'      → that app's total views for the day
//   type 'view',     key '/path'  → views of one path
//   type 'click',    key '/target'→ clicks that went to one destination
//   type 'referrer', key 'host'   → arrivals credited to one referring host
//
// 'referrer' is a `type` rather than a prefixed `key` because the alternative —
// 'ref:example.com' filed under type 'view' — puts a row that is not a page
// view into the per-path breakdown, where every reader of that list would have
// to know to skip it.
//
// VISITORS ARE ONLY MEANINGFUL ON THE '*' ROWS. A unique-visitor count cannot
// be summed — one person viewing five paths is one visitor, not five — so it
// is maintained solely on the per-app daily total, where TrafficVisitorDay can
// decide "is this hash new for this app today" exactly. Every other row leaves
// it at 0, and the dashboard never adds them up.

const trafficDailySchema = new mongoose.Schema({
  // 'YYYY-MM-DD' in UTC. A string rather than a Date because every read groups
  // by calendar day and the string sorts, ranges and equality-matches without
  // anybody having to think about a timezone twice.
  day: { type: String, required: true },

  app: { type: String, required: true },
  type: { type: String, enum: ['view', 'click', 'referrer'], required: true },
  key: { type: String, required: true },

  views: { type: Number, default: 0 },

  // Distinct visitors, maintained only where key === '*'. See above.
  visitors: { type: Number, default: 0 },

  // Carried so a Chorus memorial's own numbers can be pulled without joining
  // back to the raw tier, which is gone after 30 days.
  slug: { type: String, default: '' },
}, { id: false });

// The upsert target. Unique so two beacons landing in the same millisecond
// increment one row instead of racing to create two.
trafficDailySchema.index({ day: 1, app: 1, type: 1, key: 1 }, { unique: true });

// The dashboard's main read: a date range, grouped by app.
trafficDailySchema.index({ day: -1, type: 1 });

module.exports = mongoose.models.TrafficDaily
  || mongoose.model('TrafficDaily', trafficDailySchema);
