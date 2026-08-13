const crypto = require('crypto');

// Site traffic — the write funnel, on the same pattern as utils/memories.js and
// utils/entries.js. Nothing outside this file writes TrafficEvent,
// TrafficDaily or TrafficVisitorDay, because the two tiers have to move
// together: a raw event without its counter increment silently disappears from
// every chart the moment the TTL collects it, 30 days later, when nobody is
// looking at that week any more.
//
// NOT TO BE CONFUSED WITH routes/analytics.js, which is older and answers a
// different question. That one aggregates *participation* — how many people
// mapped, commented and voted inside an activity. This one is web traffic:
// who arrived, what they looked at, what they clicked. They share a dashboard
// eventually and nothing else.
//
// The store is injectable, defaulting to Mongo, so traffic.test.js runs under
// `node --test` with no database. Keep that when adding functions.

// ── The app vocabulary ──────────────────────────────────────────────────────
//
// An allowlist, because `app` arrives from a browser and a browser is not
// trusted. An unrecognised value is DROPPED rather than recorded as 'unknown':
// a chart with a mystery bar invites somebody to go looking for a tenant that
// does not exist.
//
// These are frontends-as-visitors-experience-them, which is why they do not
// match Instance.app exactly. holoscopic.io is one Next deployment serving
// three products, and 'site' / 'interview' / 'map-sequence' is the split its
// own beacon makes by path — the only place that knows those routes.
const APPS = new Set([
  'site',          // holoscopic.io — homepage, contact, essays, manifesto
  'interview',     // holoscopic.io/interview, /a, /play, /topics, /inquiry
  'map-sequence',  // holoscopic.io/create, /map-sequence
  'spectrum',
  'synthesis',
  'chorus',
  'threshold',
]);

const TYPES = new Set(['view', 'click']);

// Long enough for any real route, short enough that a generated URL cannot be
// used to write a novel into the database one beacon at a time.
const PATH_MAX = 200;
const LABEL_MAX = 80;

const VISITOR_SECRET = process.env.TRAFFIC_IP_SALT
  || process.env.GAME_TOKEN_SECRET
  || process.env.NEXTAUTH_SECRET
  || '';

/** 'YYYY-MM-DD' in UTC. One definition, used by every tier. */
function dayKey(at = new Date()) {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * The anonymous, single-day visitor identity.
 *
 * The calendar day is INSIDE the digest, which is what makes the rotation
 * automatic and total: there is no stored salt to rotate, no job that could
 * fail to rotate it, and no way to recompute yesterday's hash for a given
 * phone even holding the secret and the phone. Unique-visitor counts are
 * therefore per-day by construction rather than by policy.
 *
 * Returns '' when no secret is configured, which the caller treats as "count
 * the view, count no visitor" — a missing secret must never mean a weak hash.
 */
function visitorHashFor({ ip, userAgent, at = new Date(), secret = VISITOR_SECRET }) {
  if (!secret || !ip) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`${dayKey(at)}|${ip}|${String(userAgent || '')}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * A path safe to store and group by.
 *
 * The query string is always dropped, and that is a privacy rule rather than
 * tidiness: `/c/<slug>/curate?k=…` carries a Chorus curator key, which is a
 * credential (apps/chorus/PLAN.md D10), and a filtered wall like
 * `?tags=abc,def` is the same page for every purpose this dashboard has.
 */
function normalizePath(raw) {
  let value = String(raw || '/');
  const cut = value.search(/[?#]/);
  if (cut >= 0) value = value.slice(0, cut);
  if (!value.startsWith('/')) value = `/${value}`;
  // Collapse a trailing slash so `/contact` and `/contact/` are one row.
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value.slice(0, PATH_MAX);
}

/**
 * A click destination, reduced to something groupable.
 *
 * Internal links keep their path. External links keep scheme + host and lose
 * everything after it — enough to see that people are leaving for GitHub,
 * without recording which issue somebody opened.
 */
function normalizeTarget(raw, siteHosts = []) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('mailto:')) return 'mailto:';
  if (value.startsWith('/')) return normalizePath(value);
  try {
    const url = new URL(value);
    if (siteHosts.includes(url.hostname)) return normalizePath(url.pathname);
    return `${url.protocol}//${url.hostname}`.slice(0, PATH_MAX);
  } catch {
    return '';
  }
}

/** Host only — never the full referring URL. See TrafficEvent's header. */
function hostOf(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    return new URL(value).hostname.slice(0, PATH_MAX);
  } catch {
    return '';
  }
}

function clean(value, max) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

// ── The default store ───────────────────────────────────────────────────────

const mongoStore = {
  insertEvent: (doc) => require('../models/TrafficEvent').create(doc),

  bumpDaily: ({ day, app, type, key, slug, views, visitors }) =>
    require('../models/TrafficDaily').updateOne(
      { day, app, type, key },
      {
        $inc: { views: views || 0, visitors: visitors || 0 },
        $setOnInsert: { day, app, type, key, slug: slug || '' },
      },
      { upsert: true },
    ),

  // Resolves true when this is the first sighting. A duplicate key is the
  // ordinary answer "already counted today", so it is caught here rather than
  // being allowed to look like a failure to the caller.
  claimVisitor: async ({ day, app, visitorHash }) => {
    try {
      await require('../models/TrafficVisitorDay').create({ day, app, visitorHash });
      return true;
    } catch (err) {
      if (err && err.code === 11000) return false;
      throw err;
    }
  },

  dailyRange: ({ from, to, type }) =>
    require('../models/TrafficDaily')
      .find({ day: { $gte: from, $lte: to }, ...(type ? { type } : {}) })
      .lean(),

  recentEvents: ({ from, app, type, limit }) =>
    require('../models/TrafficEvent')
      .find({
        createdAt: { $gte: from },
        ...(app ? { app } : {}),
        ...(type ? { type } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
};

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Record one beacon.
 *
 * Returns `{ recorded: false, reason }` for anything rejected, so the route can
 * count drops without a throw. Every failure mode here is non-fatal by design:
 * a beacon is a side effect of somebody reading a page, and no analytics
 * problem may ever become their problem.
 */
async function record(raw, { store = mongoStore } = {}) {
  const app = clean(raw.app, 32);
  const type = clean(raw.type, 8);
  if (!APPS.has(app)) return { recorded: false, reason: 'unknown-app' };
  if (!TYPES.has(type)) return { recorded: false, reason: 'unknown-type' };

  const at = new Date();
  const day = dayKey(at);
  const path = normalizePath(raw.path);
  const target = type === 'click' ? normalizeTarget(raw.target, raw.siteHosts || []) : '';
  if (type === 'click' && !target) return { recorded: false, reason: 'no-target' };

  const doc = {
    app,
    type,
    path,
    target,
    label: type === 'click' ? clean(raw.label, LABEL_MAX) : '',
    referrerHost: hostOf(raw.referrer),
    instanceId: clean(raw.instanceId, 32),
    slug: clean(raw.slug, 64),
    visitorHash: clean(raw.visitorHash, 32),
    createdAt: at,
  };

  await store.insertEvent(doc);

  // The per-key counter: which path was viewed, or which destination was
  // clicked. `visitors` stays 0 here on purpose — see TrafficDaily's header.
  await store.bumpDaily({
    day, app, type,
    key: type === 'click' ? target : path,
    slug: doc.slug,
    views: 1,
  });

  // The per-app daily total, and the one row where a unique-visitor count is
  // meaningful. Only views contribute: a click is something a visit contains,
  // so counting both would report every clicking visitor twice.
  if (type === 'view') {
    let firstToday = false;
    if (doc.visitorHash) {
      firstToday = await store.claimVisitor({ day, app, visitorHash: doc.visitorHash });
    }
    await store.bumpDaily({
      day, app, type: 'view', key: '*', slug: doc.slug,
      views: 1,
      visitors: firstToday ? 1 : 0,
    });

    // Where the arrival came from, on the permanent tier so "who sends us
    // traffic" outlives the raw tier's 30-day TTL like every other number the
    // dashboard draws. Views only, and only entry views carry a referrer at
    // all: a click's referrer would be the page it happened on, which this row
    // already records as the `path`.
    if (doc.referrerHost) {
      await store.bumpDaily({
        day, app, type: 'referrer', key: doc.referrerHost, slug: doc.slug, views: 1,
      });
    }
  }

  return { recorded: true };
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Everything the dashboard draws, in one round trip.
 *
 * `from`/`to` are 'YYYY-MM-DD' inclusive. Totals and the per-day series come
 * from the permanent rollup so they answer for any range ever recorded; the
 * click, path and referrer breakdowns come from the same rollup, so they
 * survive the raw tier's 30-day TTL too. `recent` is the only thing that reads
 * raw events, and it is explicitly a window into the last 30 days rather than a
 * full history.
 */
async function summary({ from, to, recentLimit = 50 } = {}, { store = mongoStore } = {}) {
  const end = to || dayKey();
  const start = from || dayKey(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

  const rows = await store.dailyRange({ from: start, to: end });

  const byApp = {};
  const series = {};       // day → { app → views }
  const paths = {};        // app → { path → views }
  const clicks = {};       // app → { target → views }
  const referrers = {};    // app → { host → arrivals }

  for (const row of rows) {
    const { day, app, type, key, views = 0, visitors = 0 } = row;

    if (type === 'view' && key === '*') {
      byApp[app] = byApp[app] || { views: 0, visitors: 0 };
      byApp[app].views += views;
      byApp[app].visitors += visitors;
      series[day] = series[day] || {};
      series[day][app] = (series[day][app] || 0) + views;
      continue;
    }
    if (type === 'view') {
      paths[app] = paths[app] || {};
      paths[app][key] = (paths[app][key] || 0) + views;
      continue;
    }
    if (type === 'click') {
      clicks[app] = clicks[app] || {};
      clicks[app][key] = (clicks[app][key] || 0) + views;
      continue;
    }
    if (type === 'referrer') {
      referrers[app] = referrers[app] || {};
      referrers[app][key] = (referrers[app][key] || 0) + views;
    }
  }

  const rank = (map, limit) => Object.entries(map || {})
    .map(([key, views]) => ({ key, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);

  return {
    from: start,
    to: end,
    apps: Object.entries(byApp)
      .map(([app, v]) => ({ app, ...v }))
      .sort((a, b) => b.views - a.views),
    totals: {
      views: Object.values(byApp).reduce((n, v) => n + v.views, 0),
      visitors: Object.values(byApp).reduce((n, v) => n + v.visitors, 0),
    },
    series: Object.keys(series).sort().map(day => ({ day, ...series[day] })),
    paths: Object.fromEntries(Object.keys(paths).map(a => [a, rank(paths[a], 25)])),
    clicks: Object.fromEntries(Object.keys(clicks).map(a => [a, rank(clicks[a], 25)])),
    referrers: Object.fromEntries(Object.keys(referrers).map(a => [a, rank(referrers[a], 25)])),
    recentLimit,
  };
}

module.exports = {
  APPS,
  dayKey,
  visitorHashFor,
  normalizePath,
  normalizeTarget,
  hostOf,
  record,
  summary,
  mongoStore,
};
