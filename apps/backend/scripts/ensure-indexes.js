// Creates production indexes explicitly.
//
// Production runs with autoIndex disabled (websocket-server.js), so index
// declarations in models/*.js do NOT reach production on deploy. That is
// deliberate: a declaration added to a model would otherwise trigger an
// uncontrolled foreground build during boot, on the request path, with no
// visibility and no way to abort. This script is the controlled path.
//
// The list below MUST mirror the declarations in models/*.js. It is duplicated
// on purpose — this file is what actually runs against production, so it
// should be reviewable on its own without loading Mongoose.
//
// Indexes are matched by KEY SHAPE, not by name, and are created with
// Mongoose's default naming convention (field_1_field_-1). Both matter:
// development still runs with autoIndex on, so Mongoose creates these same
// indexes under its own names. Matching on shape makes this script idempotent
// against indexes Mongoose already built, and using its naming keeps dev and
// production from drifting into two names for one index.
//
// Usage:
//   node scripts/ensure-indexes.js --dry-run     # show the plan, touch nothing
//   node scripts/ensure-indexes.js               # create missing indexes
//   node scripts/ensure-indexes.js --drop-stale  # also drop superseded indexes
//
// Creation is serial and each step prints elapsed time plus the exact rollback
// command, so a build that turns out to be slow can be stopped between steps.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });
const { MongoClient } = require('mongodb');

const DRY_RUN = process.argv.includes('--dry-run');
const DROP_STALE = process.argv.includes('--drop-stale');

// Every index is explicitly named so rollback is unambiguous and so a rerun
// never creates a duplicate under a driver-generated name.
const INDEXES = [
  // --- hot path: resolveInstance runs on every single /api request ---
  { collection: 'instances', name: 'domains_1', keys: { domains: 1 } },
  { collection: 'instances', name: 'active_gameNumber_createdAt', keys: { active: 1, gameNumber: 1, createdAt: 1 } },

  // --- polled by every signed-in client every 30s ---
  { collection: 'notifications', name: 'userId_createdAt', keys: { userId: 1, createdAt: -1 } },

  // --- fastest-growing collection: one row per bonus/stake/settlement ---
  { collection: 'holontransactions', name: 'userId_instanceId_createdAt', keys: { userId: 1, instanceId: 1, createdAt: -1 } },
  { collection: 'holontransactions', name: 'instanceId_type_amount', keys: { instanceId: 1, type: 1, amount: 1 } },

  // --- activity lists and the expiry sweep ---
  { collection: 'activities', name: 'instanceId_createdAt', keys: { instanceId: 1, createdAt: -1 } },
  { collection: 'activities', name: 'instanceId_status_createdAt', keys: { instanceId: 1, status: 1, createdAt: 1 } },
  { collection: 'activities', name: 'instanceId_participantId', keys: { instanceId: 1, 'participants.id': 1 } },

  // --- the single most-read query in the app (play page payload) ---
  { collection: 'entries', name: 'activityId_createdAt', keys: { activityId: 1, createdAt: 1 } },

  { collection: 'topics', name: 'instanceId_status_expiresAt', keys: { instanceId: 1, status: 1, expiresAt: 1 } },

  // --- Synthesis published feed + LLM corpus read ---
  { collection: 'synnodes', name: 'instanceId_visibility_publishedAt', keys: { instanceId: 1, visibility: 1, publishedAt: -1 } },

  // --- Chorus wall. Trailing id direction must match SORTS in utils/memories.js
  //     ({createdAt:-1,id:-1}); a mismatch serves neither ordering. ---
  { collection: 'memories', name: 'wall_newest', keys: { instanceId: 1, status: 1, createdAt: -1, id: -1 },
    supersedes: ['instanceId_1_status_1_createdAt_-1'] },
  { collection: 'memories', name: 'wall_connected', keys: { instanceId: 1, status: 1, threadCount: -1, createdAt: -1, id: -1 },
    supersedes: ['instanceId_1_status_1_threadCount_-1_createdAt_-1'] },

  // --- On a Spectrum pulse feed ---
  { collection: 'oasgames', name: 'parentInstanceId_updatedAt', keys: { parentInstanceId: 1, updatedAt: -1 } },
  { collection: 'oasframes', name: 'parentInstanceId_createdAt', keys: { parentInstanceId: 1, createdAt: -1 } },
  // Queried once per spectrum in a loop (up to 50 per pulse request).
  { collection: 'oasnominations', name: 'frameSlate_frameId', keys: { 'frameSlate.frameId': 1 } },
];

function fmtKeys(keys) {
  return Object.entries(keys).map(([k, v]) => `${k}:${v}`).join(', ');
}

// Mongoose's default index name, so a script-created index and an
// autoIndex-created one are the same object rather than two.
function defaultName(keys) {
  return Object.entries(keys).map(([k, v]) => `${k}_${v}`).join('_');
}

// Order-sensitive: {a:1,b:1} and {b:1,a:1} are different indexes, and
// direction matters for whether a sort is served.
function signature(keys) {
  return Object.entries(keys).map(([k, v]) => `${k}:${v}`).join('|');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || '(unknown)';
  console.log(`Database: ${dbName}`);
  console.log(DRY_RUN ? 'Mode: DRY RUN (nothing will be written)\n' : 'Mode: CREATE\n');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const present = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );

  let created = 0;
  let skipped = 0;
  let dropped = 0;
  const rollback = [];

  for (const spec of INDEXES) {
    const label = `${spec.collection}.${spec.name}`;

    if (!present.has(spec.collection)) {
      // Creating an index implicitly creates the collection. Harmless, but
      // silently materializing collections is a surprise worth avoiding.
      console.log(`SKIP   ${label} — collection does not exist yet`);
      skipped++;
      continue;
    }

    const col = db.collection(spec.collection);
    const existing = await col.indexes();
    const want = signature(spec.keys);
    const already = existing.find((i) => signature(i.key) === want);
    const indexName = defaultName(spec.keys);

    if (already) {
      console.log(`OK     ${label} — already present as "${already.name}"`);
      skipped++;
    } else if (DRY_RUN) {
      const n = await col.countDocuments();
      console.log(`WOULD  ${label} — { ${fmtKeys(spec.keys)} }  (${n} docs)`);
    } else {
      const n = await col.countDocuments();
      const t0 = Date.now();
      await col.createIndex(spec.keys, { name: indexName });
      const ms = Date.now() - t0;
      console.log(`CREATE ${label} — { ${fmtKeys(spec.keys)} }  ${n} docs, ${ms}ms`);
      rollback.push(`db.${spec.collection}.dropIndex("${indexName}")`);
      created++;
    }

    // Indexes fully contained in a new one are dead weight on every write.
    for (const stale of spec.supersedes || []) {
      const found = existing.find((i) => i.name === stale);
      if (!found) continue;
      if (DRY_RUN || !DROP_STALE) {
        console.log(`  stale  ${spec.collection}.${stale} superseded — rerun with --drop-stale to remove`);
      } else {
        await col.dropIndex(stale);
        console.log(`  DROP   ${spec.collection}.${stale} (superseded)`);
        dropped++;
      }
    }
  }

  console.log(`\ncreated: ${created}  dropped: ${dropped}  skipped: ${skipped}`);
  if (rollback.length) {
    console.log('\nRollback:');
    rollback.forEach((r) => console.log(`  ${r}`));
  }

  await client.close();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
