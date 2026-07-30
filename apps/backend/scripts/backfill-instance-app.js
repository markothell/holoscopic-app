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
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const Instance = require('../models/Instance');

const WRITE = process.argv.includes('--write');

// The historical evidence, in priority order. `parents` maps an instance id to
// the slug of the top-level instance it hangs off, which is the strongest
// signal available — On a Spectrum rooms and Synthesis ideas both carry it.
function inferApp(inst, parents) {
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

  await mongoose.connect(process.env.MONGODB_URI);

  const all = await Instance.find({});
  const parents = new Map(all.map(i => [i.id, i.slug]));

  const changes = [];
  for (const inst of all) {
    const app = inferApp(inst, parents);
    if (inst.app !== app) changes.push({ inst, from: inst.app || '(unset)', to: app });
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

  for (const { inst, to } of changes) {
    inst.app = to;
    await inst.save();
  }
  console.log(`\n✓ Updated ${changes.length} instances.`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('✗', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
