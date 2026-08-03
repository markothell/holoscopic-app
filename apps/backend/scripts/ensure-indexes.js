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
//   node scripts/ensure-indexes.js --create-missing  # also create absent collections
//
// Creation is serial and each step prints elapsed time plus the exact rollback
// command, so a build that turns out to be slow can be stopped between steps.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });
const { MongoClient } = require('mongodb');

const DRY_RUN = process.argv.includes('--dry-run');
const DROP_STALE = process.argv.includes('--drop-stale');
// Materialize a collection that does not exist yet so its indexes — above all
// its unique ones — are in place before the first row is written.
const CREATE_MISSING = process.argv.includes('--create-missing');

// Every index is explicitly named so rollback is unambiguous and so a rerun
// never creates a duplicate under a driver-generated name.
const INDEXES = [
  // --- hot path: resolveInstance runs on every single /api request ---
  { collection: 'instances', name: 'domains_1', keys: { domains: 1 } },
  { collection: 'instances', name: 'active_gameNumber_createdAt', keys: { active: 1, gameNumber: 1, createdAt: 1 } },

  // --- polled by every signed-in client every 30s ---
  { collection: 'notifications', name: 'userId_createdAt', keys: { userId: 1, createdAt: -1 } },

  // --- credential recovery: the only lookups that are not by id or email ---
  // Both are read once per redeemed link, so the index is about not scanning
  // the user table rather than about throughput. Left non-sparse deliberately:
  // the field is null on nearly every document, so a sparse index would be
  // smaller, but this script matches by KEY SHAPE and cannot tell the two
  // apart — switching later means dropping by hand. Not worth it for a table
  // of this size; revisit if users ever reaches six figures.
  { collection: 'users', name: 'resetTokenHash_1', keys: { resetTokenHash: 1 } },
  { collection: 'users', name: 'verifyTokenHash_1', keys: { verifyTokenHash: 1 } },
  // NOT listed, and still a real gap: users.email_1 and users.id_1 are UNIQUE
  // and appear nowhere in this file, so on a rebuilt database this script
  // would leave the user table with no unique constraint on email and no
  // complaint. The mechanism to fix that now exists — specs take an `options`
  // object, and the traffic entries at the bottom use it for `unique` and
  // `expireAfterSeconds` — so what remains is adding the two user entries.
  // That is deliberately not done here: it is an auth-adjacent change to a
  // live collection and wants its own review. Until then, do not treat
  // "ensure-indexes ran clean" as meaning the user constraints are there.

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

  // --- Site traffic. The only entries here whose OPTIONS are load-bearing ---
  //
  // Two of these three are not performance at all. The unique index on
  // trafficvisitordays is the visitor count: utils/traffic.js#claimVisitor
  // reads its duplicate-key error as "already counted today", so without the
  // constraint every page view reports a new person and the People column
  // silently equals the Visits column. The unique index on trafficdailies is
  // what makes two beacons landing in the same millisecond increment one
  // counter instead of racing to create two rows that then both get summed.
  //
  // The TTL on trafficevents is the entire retention design: the raw tier is
  // meant to hold 30 days and hand everything longer-lived to the rollup. With
  // no TTL it never stops growing, and nothing anywhere would report that.
  { collection: 'trafficevents', name: 'createdAt_1', keys: { createdAt: 1 },
    options: { expireAfterSeconds: 30 * 24 * 60 * 60 } },
  { collection: 'trafficevents', name: 'app_type_createdAt', keys: { app: 1, type: 1, createdAt: -1 } },
  { collection: 'trafficevents', name: 'instanceId_createdAt', keys: { instanceId: 1, createdAt: -1 } },

  { collection: 'trafficdailies', name: 'day_app_type_key', keys: { day: 1, app: 1, type: 1, key: 1 },
    options: { unique: true } },
  { collection: 'trafficdailies', name: 'day_type', keys: { day: -1, type: 1 } },

  { collection: 'trafficvisitordays', name: 'day_app_visitorHash', keys: { day: 1, app: 1, visitorHash: 1 },
    options: { unique: true } },
  { collection: 'trafficvisitordays', name: 'createdAt_1', keys: { createdAt: 1 },
    options: { expireAfterSeconds: 2 * 24 * 60 * 60 } },
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

    if (!present.has(spec.collection) && !CREATE_MISSING) {
      // Creating an index implicitly creates the collection. Harmless, but
      // silently materializing collections is a surprise worth avoiding.
      //
      // It is NOT harmless to skip when the index is a unique constraint on a
      // collection that is about to start filling. Production runs
      // autoIndex:false, so the first write creates the collection with no
      // constraint at all; by the time anyone runs this script the duplicates
      // it was meant to prevent already exist, and the build then fails on
      // them. The index has to be there BEFORE the first row — which is what
      // --create-missing is for, and why deploying a new counted collection
      // means running this first, not afterwards.
      console.log(`SKIP   ${label} — collection does not exist yet${spec.options?.unique ? '  ⚠ UNIQUE: create it before any write lands' : ''}`);
      skipped++;
      continue;
    }

    const col = db.collection(spec.collection);
    // A collection that does not exist yet has no indexes, but asking for them
    // throws `ns does not exist` rather than answering the empty list — which
    // only shows up on the --create-missing path, where the whole point is
    // that the collection is absent.
    const existing = await col.indexes().catch(err => {
      if (/ns does not exist/i.test(err.message)) return [];
      throw err;
    });
    const want = signature(spec.keys);
    const already = existing.find((i) => signature(i.key) === want);
    const indexName = defaultName(spec.keys);

    if (already) {
      // Shape match is not the whole story once options are in play. An index
      // that exists WITHOUT `unique` where unique is wanted looks identical
      // here and enforces nothing — and for TrafficVisitorDay that is not a
      // performance difference but a wrong number: the visitor count is
      // derived from the duplicate-key error, so a non-unique index makes
      // every view a new visitor. Mongo cannot change these in place, so this
      // reports rather than fixes; the remedy is dropIndex then rerun.
      const drift = [];
      for (const [k, v] of Object.entries(spec.options || {})) {
        if (already[k] !== v) drift.push(`${k}: have ${JSON.stringify(already[k])}, want ${JSON.stringify(v)}`);
      }
      if (drift.length) {
        console.log(`DRIFT  ${label} — present as "${already.name}" but ${drift.join('; ')}`);
        console.log(`         fix: db.${spec.collection}.dropIndex("${already.name}") then rerun`);
      } else {
        console.log(`OK     ${label} — already present as "${already.name}"`);
      }
      skipped++;
    } else if (DRY_RUN) {
      const n = await col.countDocuments();
      console.log(`WOULD  ${label} — { ${fmtKeys(spec.keys)} }  (${n} docs)`);
    } else {
      const n = await col.countDocuments();
      const t0 = Date.now();
      await col.createIndex(spec.keys, { name: indexName, ...(spec.options || {}) });
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
