#!/usr/bin/env node
// Clears out Unison — the pre-rename identity of the Synthesis app.
//
//   node scripts/drop-unison.js            # dry run: report what WOULD go
//   node scripts/drop-unison.js --confirm  # actually drop
//
// Synthesis renamed every Unison model (UnisonNode -> SynNode and friends), so
// Mongoose now reads and writes `synnodes`, `synframes`, `synmemberships`,
// `synembeddings`, `synunions`. The old `unison*` collections are orphaned, as
// are the `unison` parent Instance and every `uni-<code>` community Instance
// (ideas now live under a `synthesis` parent at `idea-<code>`).
//
// There was never production Unison data — this is a dev-database cleanup, and
// it is deliberately one-way. It refuses to touch anything named `syn*`, so a
// mistaken run can't take the live Synthesis collections with it.
//
// Reads MONGODB_URI from .env.local (or .env.production with NODE_ENV).
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');

const COLLECTIONS = [
  'unisonnodes',
  'unisonframes',
  'unisonmemberships',
  'unisonembeddings',
  'unisonsyntheses',
];

const confirm = process.argv.includes('--confirm');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error(`MONGODB_URI missing from ${envFile}`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log(`Connected to ${db.databaseName}${confirm ? '' : '  (DRY RUN — pass --confirm to drop)'}\n`);

  // Guardrail: every name we drop must start with `unison`. The Synthesis
  // collections are `syn*` and must survive any run of this script.
  const unsafe = COLLECTIONS.filter(name => !name.startsWith('unison'));
  if (unsafe.length) throw new Error(`Refusing to run: non-unison collection in the list — ${unsafe.join(', ')}`);

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      console.log(`  ·  ${name} — already gone`);
      continue;
    }
    const count = await db.collection(name).countDocuments();
    if (confirm) {
      await db.collection(name).drop();
      console.log(`  ✓  ${name} — dropped (${count} docs)`);
    } else {
      console.log(`  →  ${name} — would drop (${count} docs)`);
    }
  }

  // The `unison` parent Instance and its `uni-<code>` community children.
  const instances = db.collection('instances');
  const query = { $or: [{ slug: 'unison' }, { slug: { $regex: '^uni-' } }] };
  const doomed = await instances.find(query).project({ slug: 1, name: 1 }).toArray();
  if (doomed.length === 0) {
    console.log('  ·  instances — no unison/uni-* instances found');
  } else if (confirm) {
    const { deletedCount } = await instances.deleteMany(query);
    console.log(`  ✓  instances — deleted ${deletedCount}: ${doomed.map(i => i.slug).join(', ')}`);
  } else {
    console.log(`  →  instances — would delete ${doomed.length}: ${doomed.map(i => i.slug).join(', ')}`);
  }

  console.log(confirm ? '\nDone.' : '\nDry run complete. Re-run with --confirm to apply.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
