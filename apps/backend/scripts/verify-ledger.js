// Audits the holon economy against its own ledger.
//
// InstanceMembership.holonBalance is a running total; HolonTransaction is the
// append-only record of every movement. The balance should equal the sum of
// the transactions for that (userId, instanceId). When it doesn't, something
// moved holons outside utils/holons.js, or a payout was issued more than once.
//
// This exists because the settlement path had two defects that could double-
// pay: sweep-on-read ran with no lock (concurrent requests each read
// status:'active' before any of them wrote), and the activity sweep was not
// instance-scoped. Both are fixed, but "fixed going forward" and "clean now"
// are different claims, and only this script can make the second one.
//
// Read-only. Safe to run against production.
//
//   node scripts/verify-ledger.js            # summary + any mismatches
//   node scripts/verify-ledger.js --verbose  # per-account detail
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });
const { MongoClient } = require('mongodb');

const VERBOSE = process.argv.includes('--verbose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || '(unknown)';
  console.log(`Auditing holon ledger in "${dbName}"\n`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // ── 1. Balance vs. ledger ──────────────────────────────────────────────
  const sums = await db.collection('holontransactions').aggregate([
    { $group: {
        _id: { userId: '$userId', instanceId: '$instanceId' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
    } },
  ]).toArray();

  const ledger = new Map(
    sums.map((s) => [`${s._id.userId}|${s._id.instanceId}`, s])
  );

  const memberships = await db.collection('instancememberships')
    .find({}, { projection: { userId: 1, instanceId: 1, holonBalance: 1, _id: 0 } })
    .toArray();

  const mismatches = [];
  for (const m of memberships) {
    const key = `${m.userId}|${m.instanceId}`;
    const entry = ledger.get(key);
    const expected = entry ? entry.total : 0;
    const actual = m.holonBalance ?? 0;
    if (expected !== actual) {
      mismatches.push({
        userId: m.userId,
        instanceId: m.instanceId,
        balance: actual,
        ledgerSum: expected,
        drift: actual - expected,
        txCount: entry ? entry.count : 0,
      });
    }
    ledger.delete(key);
  }

  // Ledger rows with no membership at all — holons that moved for an account
  // that does not exist in that instance.
  const orphanLedger = [...ledger.values()].map((s) => ({
    userId: s._id.userId,
    instanceId: s._id.instanceId,
    ledgerSum: s.total,
    txCount: s.count,
  }));

  console.log(`memberships checked : ${memberships.length}`);
  console.log(`ledger rows         : ${sums.length}`);
  console.log(`balance mismatches  : ${mismatches.length}`);
  console.log(`orphan ledger rows  : ${orphanLedger.length}`);

  if (mismatches.length) {
    console.log('\nMISMATCHES (balance != sum of transactions)');
    console.table(mismatches.slice(0, 50));
  }
  if (orphanLedger.length) {
    console.log('\nORPHAN LEDGER ROWS (transactions with no membership)');
    console.table(orphanLedger.slice(0, 50));
  }

  // ── 2. Duplicate payouts ───────────────────────────────────────────────
  // The specific fingerprint the old sweep race would leave: the same user
  // paid twice for the same reference by the same transaction type.
  const dupes = await db.collection('holontransactions').aggregate([
    { $match: { refId: { $ne: null } } },
    { $group: {
        _id: { userId: '$userId', type: '$type', refType: '$refType', refId: '$refId' },
        n: { $sum: 1 },
        total: { $sum: '$amount' },
    } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 50 },
  ]).toArray();

  console.log(`\nrepeated (user, type, ref) payouts: ${dupes.length}`);
  if (dupes.length) {
    console.log('Not automatically a bug — a user can legitimately earn the same');
    console.log('type against one reference more than once (e.g. several');
    console.log('comment_attribution payouts on one activity). Review the');
    console.log('settlement types below, which should be once-per-reference:');
    console.table(dupes.map((d) => ({
      userId: d._id.userId,
      type: d._id.type,
      ref: `${d._id.refType}:${d._id.refId}`,
      times: d.n,
      total: d.total,
    })));
  }

  // ── 3. Cross-tenant settlements ────────────────────────────────────────
  // The activity sweep used to run unscoped and settle other instances'
  // activities. If it ever mis-booked one, the fingerprint is an
  // activity-settlement transaction whose instanceId differs from the
  // referenced activity's own instanceId.
  const activityTx = await db.collection('holontransactions')
    .find(
      { refType: 'activity', type: { $in: ['activity_stake_return', 'comment_attribution'] } },
      { projection: { userId: 1, instanceId: 1, refId: 1, type: 1, amount: 1, _id: 0 } }
    )
    .toArray();

  const activityInstance = new Map(
    (await db.collection('activities')
      .find({}, { projection: { id: 1, instanceId: 1, _id: 0 } })
      .toArray()).map((a) => [a.id, a.instanceId])
  );

  const crossTenant = activityTx.filter((t) => {
    const owner = activityInstance.get(t.refId);
    return owner && owner !== t.instanceId;
  });

  console.log(`\nactivity settlement rows       : ${activityTx.length}`);
  console.log(`cross-tenant mis-bookings      : ${crossTenant.length}`);
  if (crossTenant.length) {
    console.log('\nCROSS-TENANT (holons booked to an instance that does not own the activity)');
    console.table(crossTenant.slice(0, 50));
  }

  if (VERBOSE) {
    const byType = await db.collection('holontransactions').aggregate([
      { $group: { _id: '$type', n: { $sum: 1 }, total: { $sum: '$amount' } } },
      { $sort: { n: -1 } },
    ]).toArray();
    console.log('\nTRANSACTIONS BY TYPE');
    console.table(byType.map((t) => ({ type: t._id, count: t.n, net: t.total })));
  }

  const clean = !mismatches.length && !orphanLedger.length && !crossTenant.length;
  console.log(`\n${clean ? '✅ Ledger is consistent.' : '❌ Ledger needs review.'}`);

  await client.close();
  process.exitCode = clean ? 0 : 1;
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
