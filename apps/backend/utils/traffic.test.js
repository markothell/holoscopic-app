const test = require('node:test');
const assert = require('node:assert');

const traffic = require('./traffic');

// Runs with no database: `record` and `summary` take an injectable store, the
// same contract memories.js keeps. Everything below exercises the rules that
// are expensive to get wrong and invisible when they are — the visitor hash's
// day boundary, the query-string strip, and the counter arithmetic that
// decides whether a number in the dashboard means anything.

function fakeStore() {
  const events = [];
  const daily = new Map();
  const visitors = new Set();
  return {
    events, daily, visitors,
    insertEvent: async (doc) => { events.push(doc); },
    bumpDaily: async ({ day, app, type, key, views = 0, visitors: v = 0 }) => {
      const id = `${day}|${app}|${type}|${key}`;
      const row = daily.get(id) || { day, app, type, key, views: 0, visitors: 0 };
      row.views += views;
      row.visitors += v;
      daily.set(id, row);
    },
    claimVisitor: async ({ day, app, visitorHash }) => {
      const id = `${day}|${app}|${visitorHash}`;
      if (visitors.has(id)) return false;
      visitors.add(id);
      return true;
    },
    dailyRange: async () => [...daily.values()],
    recentEvents: async () => events,
  };
}

// ── The visitor hash ────────────────────────────────────────────────────────

test('visitor hash is stable within a day and unrecoverable across days', () => {
  const args = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0', secret: 's3cret' };
  const monday = traffic.visitorHashFor({ ...args, at: new Date('2026-08-03T09:00:00Z') });
  const mondayLater = traffic.visitorHashFor({ ...args, at: new Date('2026-08-03T23:59:00Z') });
  const tuesday = traffic.visitorHashFor({ ...args, at: new Date('2026-08-04T00:01:00Z') });

  assert.equal(monday, mondayLater, 'same person, same day, same hash');
  assert.notEqual(monday, tuesday, 'the day is inside the digest, so it rotates itself');
  assert.equal(monday.length, 32);
});

test('two visitors on one connection are told apart by user agent', () => {
  const at = new Date('2026-08-03T09:00:00Z');
  const a = traffic.visitorHashFor({ ip: '203.0.113.7', userAgent: 'iPhone', at, secret: 's' });
  const b = traffic.visitorHashFor({ ip: '203.0.113.7', userAgent: 'Android', at, secret: 's' });
  assert.notEqual(a, b);
});

test('no secret yields no hash rather than a weak one', () => {
  assert.equal(traffic.visitorHashFor({ ip: '203.0.113.7', userAgent: 'x', secret: '' }), '');
});

// ── Normalization ───────────────────────────────────────────────────────────

test('query strings never reach storage — a curator key is a credential', () => {
  assert.equal(traffic.normalizePath('/c/ellen/curate?k=SECRETKEY'), '/c/ellen/curate');
  assert.equal(traffic.normalizePath('/c/ellen?tags=a,b#top'), '/c/ellen');
});

test('a trailing slash is the same page', () => {
  assert.equal(traffic.normalizePath('/contact/'), '/contact');
  assert.equal(traffic.normalizePath('/'), '/');
});

test('external click targets keep the host and lose the path', () => {
  assert.equal(
    traffic.normalizeTarget('https://github.com/markothell/holoscopic-app/issues/12'),
    'https://github.com',
  );
  assert.equal(traffic.normalizeTarget('mailto:mo@holoscopic.io'), 'mailto:');
});

test('a link to one of our own hosts is recorded as an internal path', () => {
  assert.equal(
    traffic.normalizeTarget('https://chorus.holoscopic.io/c/ellen', ['chorus.holoscopic.io']),
    '/c/ellen',
  );
});

test('referrer keeps the host and nothing else', () => {
  assert.equal(traffic.hostOf('https://www.google.com/search?q=private+thing'), 'www.google.com');
  assert.equal(traffic.hostOf(''), '');
});

// ── Recording ───────────────────────────────────────────────────────────────

test('an unknown app is dropped rather than recorded as unknown', async () => {
  const store = fakeStore();
  const out = await traffic.record({ app: 'not-ours', type: 'view', path: '/' }, { store });
  assert.deepEqual(out, { recorded: false, reason: 'unknown-app' });
  assert.equal(store.events.length, 0);
});

test('a view writes the raw event, the path counter and the app total', async () => {
  const store = fakeStore();
  await traffic.record(
    { app: 'chorus', type: 'view', path: '/c/ellen', visitorHash: 'v1' },
    { store },
  );

  assert.equal(store.events.length, 1);
  const day = traffic.dayKey();
  assert.equal(store.daily.get(`${day}|chorus|view|/c/ellen`).views, 1);
  assert.equal(store.daily.get(`${day}|chorus|view|*`).views, 1);
  assert.equal(store.daily.get(`${day}|chorus|view|*`).visitors, 1);
});

test('one visitor viewing three pages is one visitor and three views', async () => {
  const store = fakeStore();
  for (const path of ['/c/ellen', '/c/ellen/m/1', '/c/ellen/m/2']) {
    await traffic.record({ app: 'chorus', type: 'view', path, visitorHash: 'v1' }, { store });
  }
  const total = store.daily.get(`${traffic.dayKey()}|chorus|view|*`);
  assert.equal(total.views, 3);
  assert.equal(total.visitors, 1, 'unique visitors cannot be summed across paths');
});

test('the same visitor on two apps counts once on each', async () => {
  const store = fakeStore();
  await traffic.record({ app: 'chorus', type: 'view', path: '/', visitorHash: 'v1' }, { store });
  await traffic.record({ app: 'site', type: 'view', path: '/', visitorHash: 'v1' }, { store });
  const day = traffic.dayKey();
  assert.equal(store.daily.get(`${day}|chorus|view|*`).visitors, 1);
  assert.equal(store.daily.get(`${day}|site|view|*`).visitors, 1);
});

test('a view with no hash still counts as a view, never as a visitor', async () => {
  const store = fakeStore();
  await traffic.record({ app: 'site', type: 'view', path: '/', visitorHash: '' }, { store });
  const total = store.daily.get(`${traffic.dayKey()}|site|view|*`);
  assert.equal(total.views, 1);
  assert.equal(total.visitors, 0);
});

test('a click counts against its target and leaves the visit total alone', async () => {
  const store = fakeStore();
  await traffic.record(
    { app: 'site', type: 'click', path: '/', target: '/chorus', label: 'Chorus', visitorHash: 'v1' },
    { store },
  );
  const day = traffic.dayKey();
  assert.equal(store.daily.get(`${day}|site|click|/chorus`).views, 1);
  assert.equal(
    store.daily.get(`${day}|site|view|*`),
    undefined,
    'a click is something a visit contains — counting both double-counts the visitor',
  );
});

test('a click with no resolvable target is dropped', async () => {
  const store = fakeStore();
  const out = await traffic.record({ app: 'site', type: 'click', path: '/', target: '' }, { store });
  assert.deepEqual(out, { recorded: false, reason: 'no-target' });
  assert.equal(store.events.length, 0);
});

// ── Reading ─────────────────────────────────────────────────────────────────

test('summary separates per-app totals from path and click breakdowns', async () => {
  const store = fakeStore();
  await traffic.record({ app: 'site', type: 'view', path: '/', visitorHash: 'v1' }, { store });
  await traffic.record({ app: 'site', type: 'view', path: '/contact', visitorHash: 'v1' }, { store });
  await traffic.record({ app: 'chorus', type: 'view', path: '/c/e', visitorHash: 'v2' }, { store });
  await traffic.record(
    { app: 'site', type: 'click', path: '/', target: '/chorus', visitorHash: 'v1' },
    { store },
  );

  const out = await traffic.summary({}, { store });

  assert.equal(out.totals.views, 3, 'clicks stay out of the view total');
  assert.equal(out.totals.visitors, 2);

  const site = out.apps.find(a => a.app === 'site');
  assert.equal(site.views, 2);
  assert.equal(site.visitors, 1);

  assert.deepEqual(out.paths.site, [{ key: '/', views: 1 }, { key: '/contact', views: 1 }]);
  assert.deepEqual(out.clicks.site, [{ key: '/chorus', views: 1 }]);
  assert.equal(out.clicks.chorus, undefined);
});

test('summary ranks the busiest first', async () => {
  const store = fakeStore();
  for (let i = 0; i < 3; i++) {
    await traffic.record({ app: 'site', type: 'click', path: '/', target: '/chorus' }, { store });
  }
  await traffic.record({ app: 'site', type: 'click', path: '/', target: '/spectrum' }, { store });

  const out = await traffic.summary({}, { store });
  assert.deepEqual(out.clicks.site.map(c => c.key), ['/chorus', '/spectrum']);
});
