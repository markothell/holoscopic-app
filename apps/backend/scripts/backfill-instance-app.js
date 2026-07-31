#!/usr/bin/env node
// Stamps Instance.app on rows created before the field existed.
//
//   node scripts/backfill-instance-app.js              # dev cluster, dry run
//   node scripts/backfill-instance-app.js --write      # dev cluster, apply
//   NODE_ENV=production node scripts/backfill-instance-app.js --write
//
// This file is the last home of the old inference rules. Until Instance.app
// existed, "which app is this instance?" was answered four different ways in
// four different files (routes/users.js read parentInstanceId, the platform
// admin read the slug, Chorus read config.memorial). Those readers now read the
// field. The rules live on here only to interpret history — nothing else
// should ever infer an app again.
//
// Safe to re-run: it only fills rows whose stored app disagrees with what the
// evidence says, and it reports every change before making it.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const Instance = require('../models/Instance');

const WRITE = process.argv.includes('--write');

// The historical evidence, in priority order. `parents` maps an instance id to
// the slug of the top-level instance it hangs off, which is the strongest
// signal available — On a Spectrum rooms and Synthesis ideas both carry it.
// Instances whose app cannot be derived from anything stored on them. mompod
// carries no parent, a slug that hints at nothing, and an interView-era
// gameNumber — every rule below reads it as interView, and only Mark knows it
// is a Spectrum edition. Without this the backfill silently reverts it on the
// next run.
const KNOWN = {
  mompod: 'spectrum',
};

function inferApp(inst, parents) {
  if (KNOWN[inst.slug]) return KNOWN[inst.slug];

  const parentSlug = inst.parentInstanceId ? parents.get(inst.parentInstanceId) : null;
  if (parentSlug === 'spectrum' || inst.slug === 'spectrum') return 'spectrum';
  if (parentSlug === 'synthesis' || inst.slug === 'synthesis') return 'synthesis';

  // Slug conventions, for children whose parent row has gone missing.
  if (/^oas-/i.test(inst.slug)) return 'spectrum';
  if (/^idea-/i.test(inst.slug)) return 'synthesis';

  // A memorial is identified by carrying a subject, not by its slug — every
  // memorial has its own slug and there will eventually be many. The slug
  // check is a fallback for one provisioned but not yet filled in.
  if (inst.config?.memorial?.subjectName || inst.config?.memorial?.curatorKey) return 'chorus';
  if (/^chorus/i.test(inst.slug)) return 'chorus';

  // interView is what everything else has always implicitly been.
  return 'interview';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  const host = process.env.MONGODB_URI.match(/@([^/?]+)/)?.[1];
  console.log(`cluster: ${host}  (${envFile})`);
  console.log(WRITE ? 'mode: WRITE\n' : 'mode: dry run — pass --write to apply\n');

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });

  // .lean() on purpose. Instance.app is declared `default: 'interview'`, and a
  // hydrated document therefore reports 'interview' for a row where the field
  // is ABSENT in MongoDB — so this script compared 'interview' to 'interview'
  // and announced there was nothing to fix, on exactly the rows it exists to
  // fix. A default is a Mongoose-layer fiction; `find({ app: 'interview' })`
  // runs in the database and matches none of them.
  const all = await Instance.find({}).lean();
  const parents = new Map(all.map(i => [i.id, i.slug]));

  const changes = [];
  for (const inst of all) {
    const app = inferApp(inst, parents);
    const stored = Object.prototype.hasOwnProperty.call(inst, 'app') ? inst.app : undefined;
    if (stored !== app) {
      changes.push({ inst, from: stored === undefined ? '(field absent)' : stored || '(empty)', to: app });
    }
  }

  const counts = all.reduce((acc, i) => {
    const app = inferApp(i, parents);
    acc[app] = (acc[app] || 0) + 1;
    return acc;
  }, {});
  console.log(`${all.length} instances: ` + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));

  if (!changes.length) {
    console.log('\n✓ Nothing to change — every instance already carries the right app.');
    return;
  }

  console.log(`\n${changes.length} to update:`);
  for (const { inst, from, to } of changes) {
    console.log(`  ${inst.slug.padEnd(24)} ${from} → ${to}`);
  }

  if (!WRITE) {
    console.log('\nDry run. Re-run with --write to apply.');
    return;
  }

  // updateOne rather than save(): these are lean objects now, and a targeted
  // $set writes the one field without rewriting the rest of the document from
  // a snapshot taken before the read.
  for (const { inst, to } of changes) {
    await Instance.updateOne({ id: inst.id }, { $set: { app: to } });
  }

  // Prove it landed in the database rather than trusting the write. The bug
  // this script just carried was precisely a Mongoose-layer value standing in
  // for a stored one.
  const stillMissing = await Instance.collection.countDocuments({ app: { $exists: false } });
  console.log(`\n✓ Updated ${changes.length} instances.`);
  console.log(stillMissing
    ? `⚠️  ${stillMissing} document(s) still have no app field.`
    : '✓ Every instance document now carries a stored app field.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('✗', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
