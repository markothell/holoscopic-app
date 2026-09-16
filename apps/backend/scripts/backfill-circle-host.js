// Stamp `hostId` on every circle written before the field existed.
//
// utils/circles.js#hostOf already reads an absent hostId as the circle's
// creator, so nothing is broken without this. What the backfill buys is that
// QUERIES stop needing the compatibility arm: `find({ hostId })` runs in the
// database and matches no document lacking the field, which is why
// hostedByQuery() carries a `{ hostId: null, createdBy }` branch at all.
//
// Deliberately does NOT touch a circle whose seat is vacant (`hostId: ''`).
// That is a host who left, and handing the seat back to whoever created the
// circle would silently re-host a circle somebody walked away from.
//
// Usage, from apps/backend:
//   node scripts/backfill-circle-host.js                 # dry run
//   node scripts/backfill-circle-host.js --write         # apply (dev)
//   NODE_ENV=production node scripts/backfill-circle-host.js --write
//
// Reads .env.production only under NODE_ENV=production — check which cluster
// it printed before passing --write.

const path = require('node:path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });

const mongoose = require('mongoose');

const WRITE = process.argv.includes('--write');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  // autoIndex:false in every script, always. Requiring a model compiles its
  // schema, and a default connection would build every declared index against
  // whichever database this happens to point at — which is how index changes
  // have reached production before with no deploy and nothing printed.
  await mongoose.connect(uri, { autoIndex: false });

  const host = uri.match(/@([^/?]+)/)?.[1];
  const dbName = uri.match(/\/([^/?]+)\?/)?.[1];
  console.log(`connected: ${host} / ${dbName}   (${WRITE ? 'WRITE' : 'dry run'})`);

  const Circle = require('../models/Circle');

  // .lean() matters: a hydrated document reports the schema default for a field
  // that is absent in MongoDB, so the comparison would match every row and the
  // script would report nothing to do on exactly the rows it exists to fix.
  const rows = await Circle.find({ hostId: null }).select('id title urlName createdBy hostId').lean();

  console.log(`circles with no stored hostId: ${rows.length}`);
  for (const c of rows) {
    console.log(`  ${c.urlName} (${c.id}) → hostId = ${c.createdBy}`);
  }

  if (!rows.length) {
    console.log('nothing to change.');
  } else if (!WRITE) {
    console.log('\ndry run — pass --write to apply.');
  } else {
    const res = await Circle.updateMany(
      { hostId: null },
      [{ $set: { hostId: '$createdBy' } }],
    );
    console.log(`\nupdated ${res.modifiedCount} circle(s).`);
  }

  const vacant = await Circle.countDocuments({ hostId: '' });
  if (vacant) console.log(`left alone: ${vacant} circle(s) with a vacated seat.`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
