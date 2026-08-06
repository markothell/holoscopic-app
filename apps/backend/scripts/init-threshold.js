#!/usr/bin/env node
// Create Threshold's collections and their indexes, before any data exists.
//
//   node scripts/init-threshold.js                    # dev cluster
//   NODE_ENV=production node scripts/init-threshold.js
//   …--dry-run                                        # report, touch nothing
//
// WHY THIS EXISTS, and why ensure-indexes.js is not enough.
//
// Three of Threshold's indexes are `unique`, and they are correctness rather
// than speed: they are the upsert keys for a share (one story per pole) and a
// ranking (one per person per seed), and the name of a circle within an
// instance. Without them a double submit creates a second document that
// computeResult then counts twice, quietly shifting the agreement fraction the
// whole reveal is built on.
//
// But `ensure-indexes.js` SKIPS a collection that does not exist yet — it says
// so, with a warning — and Mongo creates a collection lazily on first write. So
// on a fresh deployment there is a window where the collections exist and the
// unique indexes do not, and the only way to close it is to create them first.
//
// Doing it afterwards is worse than it sounds: building a unique index over
// rows that already violate it FAILS, and by then the duplicates are real data
// somebody has to reconcile by hand.
//
// Idempotent. Safe to run again; an index that already exists is left alone.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');

const DRY = process.argv.includes('--dry-run');

const MODELS = ['Circle', 'ThresholdShare', 'ThresholdRanking'];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const host = uri.match(/@([^/?]+)/)?.[1];
  const db = uri.match(/\/([^/?]+)\?/)?.[1];
  // Both halves are printed because either one answers "which cluster is this"
  // on its own now, and `holoscopic-db` means production whatever else the
  // connection string says.
  console.log(`cluster : ${host}`);
  console.log(`database: ${db}   (${envFile})`);
  console.log(DRY ? 'mode    : DRY RUN — nothing will be written\n' : 'mode    : create\n');

  // autoIndex:false, always — requiring a model otherwise builds every declared
  // index on whatever database this script happens to point at. The creation
  // below is deliberate and explicit instead.
  await mongoose.connect(uri, { autoIndex: false });

  for (const name of MODELS) {
    const Model = require(`../models/${name}`);
    const coll = Model.collection.collectionName;

    const existing = await Model.collection.indexes().catch(() => null);
    if (!existing) {
      console.log(`${coll}: collection does not exist yet`);
    }

    const declared = Model.schema.indexes();
    const uniques = declared.filter(([, opts]) => opts?.unique).length;
    console.log(`${coll}: ${declared.length} declared indexes (${uniques} unique)`);

    if (DRY) {
      for (const [keys, opts] of declared) {
        console.log(`   would ensure ${JSON.stringify(keys)}${opts?.unique ? '  UNIQUE' : ''}`);
      }
      continue;
    }

    // createIndexes() creates the collection as a side effect when it is
    // absent, which is exactly what makes this the right tool here.
    await Model.createIndexes();
    const after = await Model.collection.indexes();
    console.log(`   ✔ ${after.length} indexes present: ${after.map(i => i.name).join(', ')}`);
  }

  console.log(DRY ? '\nDry run complete.' : '\nDone. Run scripts/ensure-indexes.js afterwards to confirm no drift.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
