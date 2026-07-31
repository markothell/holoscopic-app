// Off-site logical backup: mongodump → gzip → S3-compatible object storage.
//
// Atlas M10 already provides continuous backup and point-in-time restore, and
// that is the primary recovery path. This is the SECOND copy, because Atlas
// snapshots live in the same Atlas account and therefore do not survive:
//   - the account itself being compromised
//   - a cluster deleted by accident
//   - somebody running scripts/reset-db-for-launch.js against production
//
// Meant to run as a Render Cron Job (see render.yaml), not inside the web
// service — mongodump competes for the same memory and dies on deploy.
//
//   node scripts/backup-mongo.js            # dump, upload, verify, heartbeat
//   node scripts/backup-mongo.js --dry-run  # check config and tooling only
//
// Required env:
//   MONGODB_URI_BACKUP  read-only Atlas user (readAnyDatabase). Falls back to
//                       MONGODB_URI, but a dedicated read-only user is the
//                       point: a leaked backup credential must not be able to
//                       write to the database.
//   BACKUP_S3_BUCKET, BACKUP_S3_ENDPOINT, BACKUP_S3_REGION,
//   BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
// Optional:
//   BACKUP_PREFIX         key prefix (default 'mongo')
//   BACKUP_HEARTBEAT_URL  dead-man's-switch ping (healthchecks.io et al)
//
// Retention is NOT handled here on purpose. Lifecycle rules on the bucket own
// it, so this script's credential never needs DeleteObject — a compromised
// backend must not be able to erase its own backups.
// Resolved against THIS FILE, never the shell's cwd. dotenv treats a bare
// relative path as cwd-relative, so `node apps/backend/scripts/backup-mongo.js`
// from the repo root found no file, reported nothing, and left the script on
// whatever MONGODB_URI happened to be exported — the dev cluster. The run then
// carried NODE_ENV=production against a dev host, which is exactly the state
// utils/backupNamespace refuses to proceed in. The guard caught it; this is
// why it had something to catch.
const path = require('node:path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: path.join(__dirname, '..', envFile) });

const { execFileSync, execFileSync: exec } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const DRY_RUN = process.argv.includes('--dry-run');

// A backup that silently does nothing is worse than no backup, because it
// buys false confidence. Every precondition below is fatal, never a warning.
function requireEnv(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) {
    console.error(`FATAL: ${name} is not set.`);
    process.exit(1);
  }
  return v;
}

function requireMongodump() {
  try {
    const out = execFileSync('mongodump', ['--version'], { encoding: 'utf8' });
    console.log(`mongodump: ${out.split('\n')[0]}`);
  } catch {
    console.error(
      'FATAL: mongodump not found on PATH.\n' +
      "Render's default Node image does not ship mongodb-database-tools; this\n" +
      'service needs a Docker environment that installs them. Failing loudly\n' +
      'rather than recording a successful backup that never happened.'
    );
    process.exit(1);
  }
}

async function heartbeat(url, ok, detail) {
  if (!url) return;
  try {
    await fetch(ok ? url : `${url}/fail`, {
      method: 'POST',
      body: String(detail || '').slice(0, 1000),
    });
  } catch (e) {
    console.error('heartbeat failed (not fatal):', e.message);
  }
}

async function main() {
  const uri = requireEnv('MONGODB_URI_BACKUP', process.env.MONGODB_URI);
  const dbName = (uri.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'holoscopic-db';
  const heartbeatUrl = process.env.BACKUP_HEARTBEAT_URL || null;

  // Decide the prefix from the cluster, not from a variable. The databases are
  // named apart now (holoscopic-dev vs holoscopic-db), but the prefix is what
  // keeps a dev dump out of production's latest.json — the pointer somebody
  // follows during a restore — and a name is one rename away from colliding
  // again. Throws rather than guessing when NODE_ENV claims production and the
  // host disagrees.
  require('../utils/backupNamespace').apply({ uri });

  requireMongodump();

  const bucket = requireEnv('BACKUP_S3_BUCKET');
  const endpoint = requireEnv('BACKUP_S3_ENDPOINT');
  // Required, not defaulted — see utils/blobMirror.js config(). 'auto' is
  // correct for Cloudflare R2 and silently fatal for AWS S3, where it becomes
  // the SigV4 signing region and every PutObject comes back
  // SignatureDoesNotMatch. Write it out for whichever one this bucket is.
  const region = requireEnv('BACKUP_S3_REGION');
  const accessKeyId = requireEnv('BACKUP_S3_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('BACKUP_S3_SECRET_ACCESS_KEY');
  const prefix = process.env.BACKUP_PREFIX || 'mongo';

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `${prefix}/${dbName}/${stamp}.archive.gz`;

  if (DRY_RUN) {
    console.log('\nDRY RUN — configuration is complete and mongodump is present.');
    console.log(`  would dump   : ${dbName}`);
    console.log(`  would upload : s3://${bucket}/${key}`);
    console.log(`  heartbeat    : ${heartbeatUrl ? 'configured' : 'NOT configured'}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-backup-'));
  const archive = path.join(tmpDir, 'dump.archive.gz');

  try {
    // --archive + --gzip keeps it to one stream-friendly file.
    //
    // Note: --oplog is deliberately absent. It needs oplog access, and the
    // dump is therefore a fuzzy snapshot rather than point-in-time consistent
    // across collections. Acceptable here — nothing writes across collections
    // transactionally except the holon ledger, and HolonTransaction is
    // authoritative (InstanceMembership.holonBalance is derivable from it,
    // which is what scripts/verify-ledger.js checks).
    console.log(`dumping ${dbName}…`);
    const t0 = Date.now();
    exec('mongodump', [`--uri=${uri}`, '--archive=' + archive, '--gzip'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const dumpMs = Date.now() - t0;

    const { size } = fs.statSync(archive);
    console.log(`dump complete: ${(size / 1048576).toFixed(2)} MB in ${(dumpMs / 1000).toFixed(1)}s`);

    // A dump far smaller than expected usually means it failed partway and
    // still exited zero. Treat a suspiciously tiny archive as a failure.
    const MIN_BYTES = Number(process.env.BACKUP_MIN_BYTES || 1024);
    if (size < MIN_BYTES) {
      throw new Error(`archive is only ${size} bytes — expected at least ${MIN_BYTES}`);
    }

    const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const body = fs.readFileSync(archive);
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');

    console.log(`uploading s3://${bucket}/${key}…`);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/gzip',
      Metadata: { sha256, database: dbName, dumpedAt: stamp },
    }));

    // Read back what we just wrote. An upload that reports success and stores
    // nothing is the failure mode this whole script exists to prevent.
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentLength !== size) {
      throw new Error(`uploaded ${head.ContentLength} bytes but archive is ${size}`);
    }
    console.log(`verified: ${head.ContentLength} bytes, sha256=${sha256.slice(0, 16)}…`);

    // A pointer to the newest good backup, so a restore does not begin with
    // "which key do I want?".
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/${dbName}/latest.json`,
      Body: JSON.stringify({ key, size, sha256, dumpedAt: stamp, dumpMs }, null, 2),
      ContentType: 'application/json',
    }));

    console.log('\n✅ backup complete');
    console.log(`   restore with: mongorestore --gzip --archive=<file> --uri=<target>`);
    await heartbeat(heartbeatUrl, true, `${size} bytes`);
  } catch (err) {
    console.error('\n❌ backup FAILED:', err.message);
    await heartbeat(heartbeatUrl, false, err.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// The inner try/catch covers the dump and upload. This covers everything
// BEFORE it — most importantly utils/backupNamespace refusing to run when
// NODE_ENV claims production and the cluster disagrees. Without it that
// refusal printed a raw stack trace and pinged nothing, so the one failure
// designed to be loud was the one the dead-man's switch never heard about
// until the grace window expired.
main().catch(async (err) => {
  console.error('\n❌ backup FAILED:', err.message);
  await heartbeat(process.env.BACKUP_HEARTBEAT_URL, false, err.message);
  process.exit(1);
});
