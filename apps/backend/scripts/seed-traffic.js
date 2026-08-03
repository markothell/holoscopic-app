// Demo traffic, so the platform's Traffic page can be looked at before there
// is a month of real data to look at.
//
//   node apps/backend/scripts/seed-traffic.js           # 30 days of demo rows
//   node apps/backend/scripts/seed-traffic.js --clear   # remove them again
//
// It writes ONLY to the permanent rollup (TrafficDaily), never to TrafficEvent:
// the raw tier is what a real browser produces, and faking it would put rows
// with no visitor hash into the collection that drill-down reads from.
//
// Every row it writes carries `slug: 'demo-seed'`, which is what --clear
// matches on. Real rows never carry it, so removing the demo cannot take a real
// number with it.
//
// The one thing --clear CANNOT undo: where a demo row landed on a
// (day, app, type, key) a real browser had already created, the upsert found
// an existing row and only incremented it — `$setOnInsert` did not fire, so
// that row has no sentinel, survives --clear, and keeps the demo's increment
// forever. In practice that is today's rows and only today's. Seeding a day
// you have also browsed leaves that day permanently inflated; if the number
// matters, delete the day outright rather than trusting --clear to unpick it.
//
// REFUSES TO RUN AGAINST PRODUCTION, by database name and by NODE_ENV. Both
// clusters answer to a URI that looks fine; `holoscopic-db` is the production
// one (root CLAUDE.md), and demo numbers in a real dashboard are worse than no
// dashboard.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mongoose = require('mongoose');

const SENTINEL = 'demo-seed';
const DAYS = 30;

const APPS = [
  { app: 'site',         base: 40, paths: ['/', '/chorus', '/contact', '/manifesto', '/essays/maps-transform-the-world'] },
  { app: 'chorus',       base: 26, paths: ['/c/chorus', '/c/chorus/m/a1', '/c/chorus/m/b2'] },
  { app: 'interview',    base: 14, paths: ['/interview/g1', '/play', '/topics'] },
  { app: 'spectrum',     base: 9,  paths: ['/', '/room/abc'] },
  { app: 'map-sequence', base: 4,  paths: ['/create', '/create/sequences'] },
];

const CLICKS = [
  ['/chorus', 30], ['/synthesis', 18], ['https://spectrum.holoscopic.io', 14],
  ['/contact', 9], ['/manifesto', 7], ['https://github.com', 4],
];

function assertNotProduction(uri) {
  const host = (uri.match(/@([^/?]+)/) || [])[1] || '(unknown host)';
  const db = (uri.match(/\/([^/?]+)\?/) || [])[1] || '(unknown db)';
  if (db === 'holoscopic-db' || process.env.NODE_ENV === 'production') {
    throw new Error(`Refusing to touch production (${host}/${db}). This script writes demo numbers.`);
  }
  return { host, db };
}

async function main() {
  const clear = process.argv.includes('--clear');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const { host, db } = assertNotProduction(uri);

  // autoIndex: false in every script, always — see apps/backend/CLAUDE.md.
  // Requiring a model compiles its schema, and a connect without this builds
  // every declared index on whatever database the script is pointed at.
  await mongoose.connect(uri, { autoIndex: false });
  console.log(`connected: ${host}/${db}`);

  const TrafficDaily = require('../models/TrafficDaily');

  if (clear) {
    const { deletedCount } = await TrafficDaily.deleteMany({ slug: SENTINEL });
    console.log(`removed ${deletedCount} demo rows`);
    await mongoose.disconnect();
    return;
  }

  const rows = [];
  for (let d = DAYS - 1; d >= 0; d--) {
    const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    // A gentle wave with an upward drift, so the chart has a shape worth
    // reading rather than a flat band of noise.
    const wave = 0.6 + 0.4 * Math.sin((DAYS - 1 - d) / 4) + (DAYS - 1 - d) / 45;

    for (const { app, base, paths } of APPS) {
      const total = Math.max(0, Math.round(base * wave * (0.7 + Math.random() * 0.6)));
      if (!total) continue;
      rows.push({ day, app, type: 'view', key: '*', views: total, visitors: Math.round(total * 0.62) });

      let left = total;
      paths.forEach((path, i) => {
        const share = i === 0 ? 0.5 : 0.5 / (paths.length - 1);
        const n = i === paths.length - 1 ? left : Math.round(total * share);
        left -= n;
        if (n > 0) rows.push({ day, app, type: 'view', key: path, views: n, visitors: 0 });
      });
    }

    for (const [target, weight] of CLICKS) {
      const n = Math.round((weight * wave * (0.5 + Math.random())) / 4);
      if (n > 0) rows.push({ day, app: 'site', type: 'click', key: target, views: n, visitors: 0 });
    }
  }

  for (const r of rows) {
    await TrafficDaily.updateOne(
      { day: r.day, app: r.app, type: r.type, key: r.key },
      { $inc: { views: r.views, visitors: r.visitors }, $setOnInsert: { slug: SENTINEL } },
      { upsert: true },
    );
  }

  console.log(`seeded ${rows.length} rollup rows across ${DAYS} days`);
  console.log('remove them with:  node apps/backend/scripts/seed-traffic.js --clear');
  await mongoose.disconnect();
}

main().catch(err => { console.error(err.message); process.exit(1); });
