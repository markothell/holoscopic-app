#!/usr/bin/env node
// Nightly reconcile: every recording the database references — a Chorus
// Memory, a Threshold share, a memorial's subject photo — has an off-site copy.
//
//   node scripts/backup-blobs.js               # dev cluster, report + copy
//   node scripts/backup-blobs.js --dry-run     # report only, copy nothing
//   NODE_ENV=production node scripts/backup-blobs.js
//
// utils/blobMirror.js already copies each recording the moment it is created.
// This is the backstop, and it is the half that makes the write-path hook safe
// to leave fire-and-forget: a deploy landing mid-upload, a network blip, or a
// memory written before mirroring existed all end up here instead of being
// lost quietly.
//
// Runs from the same Render cron as backup-mongo.js, against the same bucket
// and the same credentials, so there is one place to look and one place to
// rotate. See render.yaml.
//
// The database is the source of truth for WHAT should exist, not the blob
// store — an object nobody references is an abandoned draft (somebody opened
// the recorder and closed the sheet), and copying those forever would grow the
// bucket with things no memorial will ever show.
//
// WHAT COUNTS AS FAILURE. The cron pings a dead-man's switch, so the exit code
// decides when somebody is woken up. Two outcomes look identical to the copier
// and are not remotely the same event:
//
//   a recording that is GONE      the source 404s. No run, ever, can copy it.
//                                 Failing nightly cannot bring it back.
//   a recording that FAILED       a timeout, a 503, a rejected upload. Tomorrow
//                                 will probably work.
//
// So the set of known-gone objects is persisted in the bucket next to the
// backups (STATUS_KEY below), and the run fails when that set GROWS. A voice
// that vanished last month is reported every night and pages nobody; a voice
// that vanished today pages immediately, which is the alert that matters and
// the one a nightly false alarm would have taught you to ignore.
//
// The decision logic is utils/blobMirror.js reconcileGone(), which is pure and
// tested — whether you get paged should not depend on infrastructure being
// available to exercise it.
//
// Resolved against THIS FILE, never the shell's cwd — see the note in
// backup-mongo.js. A bare relative path silently loads nothing when the script
// is run from anywhere but apps/backend, and the run then inherits whatever
// MONGODB_URI is exported instead of the one the env file names.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const Memory = require('../models/Memory');
const Instance = require('../models/Instance');
const ThresholdShare = require('../models/ThresholdShare');
const mirror = require('../utils/blobMirror');

const DRY = process.argv.includes('--dry-run');

// Deliberately outside the blob/ and mongo/ prefixes: those carry lifecycle
// expiry rules, and the record of what was lost must outlive the backups it
// describes.
//
// Scoped by BACKUP_BLOB_PREFIX because dev and production point at the SAME
// bucket. reconcileGone rebuilds the set from the objects this run saw, which
// is right within one environment — a removed memory should drop out — and
// destructive across two: a dev sweep would erase production's record, and the
// next production run would see three-year-old losses as brand new and page for
// all of them.
//
// A function rather than a constant, because utils/backupNamespace derives that
// prefix from the cluster once main() knows which one it is. A module-scope
// constant would have been frozen before that ran.
const statusKey = () => `status/${process.env.BACKUP_BLOB_PREFIX || 'blob'}-gone.json`;

// The set of objects already known to be unreachable. A missing document is the
// normal first run, not an error — but any OTHER read failure is fatal, because
// treating it as "nothing known gone" would make every dead object look new and
// page for all of them at once.
async function loadGone(s3, bucket) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: statusKey() }));
    const parsed = JSON.parse(await obj.Body.transformToString());
    return parsed.gone || {};
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound') return {};
    throw new Error(`could not read ${statusKey()}: ${err.name} — ${err.message}`);
  }
}

async function saveGone(s3, bucket, gone) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: statusKey(),
    Body: JSON.stringify({ updatedAt: new Date().toISOString(), count: Object.keys(gone).length, gone }, null, 2),
    ContentType: 'application/json',
  }));
}

async function heartbeat(ok, detail) {
  const url = process.env.BACKUP_HEARTBEAT_URL;
  if (!url) return;
  try {
    await fetch(ok ? url : `${url}/fail`, {
      method: 'POST',
      body: String(detail || '').slice(0, 500),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* a missed ping must never fail the backup itself */ }
}

async function main() {
  const ready = mirror.readiness();
  console.log(`mirror config: ${ready}`);
  if (ready !== 'ready') {
    throw new Error(
      `blob mirroring is not configured (${ready}). Set BACKUP_S3_BUCKET, `
      + 'BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY.',
    );
  }

  // Prefers the read-only backup user, same as backup-mongo.js: this script
  // only ever reads, and the cron carries MONGODB_URI_BACKUP rather than the
  // read-write URI on purpose. Falls back so a local run needs no extra setup.
  const uri = process.env.MONGODB_URI_BACKUP || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI_BACKUP (or MONGODB_URI) not set');
  const host = uri.match(/@([^/?]+)/)?.[1];
  console.log(`cluster: ${host}  (${envFile})`);

  // Before anything computes a key. mirror.keyFor(), loadGone() and saveGone()
  // all read the prefix from the environment, and this is what decides it —
  // from the cluster above rather than from whatever the variables happen to
  // say, so a rebuilt .env.local cannot point a dev sweep at production's
  // record of which recordings are lost.
  require('../utils/backupNamespace').apply({ uri });

  console.log(DRY ? 'mode: DRY RUN — copying nothing\n' : 'mode: copy what is missing\n');

  await mongoose.connect(uri, { autoIndex: false });
  const s3 = mirror.makeClient();

  // Recordings. Only live/hidden memories — a removed one keeps its document
  // for the curator's audit trail, but its audio need not be preserved
  // forever.
  const memories = await Memory.find({
    'body.audio.url': { $exists: true, $ne: '' },
    status: { $ne: 'removed' },
  }).lean();

  // Subject photographs, which live on the instance rather than on a memory.
  // A family chose that picture; it is no more replaceable than the audio.
  const instances = await Instance.find({ app: 'chorus' }).lean();
  const photos = instances
    .map(i => ({ url: i.config?.memorial?.subjectPhotoUrl || '', slug: i.slug }))
    .filter(p => p.url.includes('.public.blob.vercel-storage.com'));

  // Threshold shares. Same rule and the same reason as a memory's audio: the
  // story was told once, and nothing here is regenerable. Kept in this one job
  // rather than a second cron so "is every recording backed up?" stays a single
  // question with a single answer.
  const shares = await ThresholdShare.find({
    'audio.url': { $exists: true, $ne: '' },
  }).lean();

  const targets = [
    ...memories.map(m => ({ label: m.title || m.id, url: m.body.audio.url, pathname: mirror.pathnameFor(m.body.audio) })),
    ...shares.map(s => ({ label: `${s.title || s.id} (threshold)`, url: s.audio.url, pathname: mirror.pathnameFor(s.audio) })),
    ...photos.map(p => ({ label: `${p.slug} (photo)`, url: p.url, pathname: '' })),
  ].map(t => ({ ...t, key: mirror.keyFor(t.pathname || mirror.pathnameFor({ url: t.url })) }));

  console.log(`${targets.length} objects referenced (${memories.length} recordings, ${shares.length} threshold shares, ${photos.length} photos)\n`);

  const bucket = mirror.config().bucket;
  const previous = await loadGone(s3, bucket);
  const knownGone = Object.keys(previous).length;
  if (knownGone) console.log(`${knownGone} object(s) already recorded as gone in ${statusKey()}\n`);

  if (DRY) {
    for (const t of targets) {
      const mark = previous[t.key] ? '  [known gone]' : '';
      console.log(`  would check  ${t.key}${mark}`);
    }
    console.log('\nDry run — nothing copied, nothing recorded.');
    return;
  }

  const tally = { copied: 0, already: 0 };
  const outcomes = [];

  for (const t of targets) {
    const result = await mirror.mirrorObject({ url: t.url, pathname: t.pathname, s3 });
    outcomes.push({ key: t.key, label: t.label, result });
    if (result.status === 'copied') {
      tally.copied++;
      console.log(`  copied   ${result.key}  (${result.bytes} bytes)`);
    } else if (result.status === 'already') {
      tally.already++;
    }
  }

  const { gone, newlyGone, stillGone, recovered, transient } = mirror.reconcileGone({ previous, outcomes });

  for (const g of stillGone) console.log(`  gone     ${g.label}  (recorded ${previous[g.key].firstSeenGone.slice(0, 10)}, unrecoverable)`);
  for (const r of recovered) console.log(`  BACK     ${r.label} — reachable again, clearing its gone marker`);
  for (const n of newlyGone) console.error(`  LOST     ${n.label}  ${n.key}`);
  for (const f of transient) console.error(`  FAILED   ${f.label}: ${f.detail}`);

  // Persisted before the throw below, so a newly-gone object is recorded even
  // on the run that fails because of it. Otherwise the same alert fires every
  // night and the set never converges.
  await saveGone(s3, bucket, gone);

  console.log(
    `\n${tally.copied} copied, ${tally.already} already present, `
    + `${stillGone.length} known gone, ${newlyGone.length} newly gone, ${transient.length} failed`,
  );

  if (newlyGone.length) {
    throw new Error(
      `${newlyGone.length} recording(s) VANISHED since the last run — the source no longer exists:\n  `
      + newlyGone.map(n => `${n.label} (${n.key})`).join('\n  ')
      + '\n\nIf they were mirrored before, the bytes are still in the bucket: '
      + 'scripts/restore-blobs.js puts them back.',
    );
  }
  if (transient.length) {
    throw new Error(
      `${transient.length} object(s) could not be mirrored this run:\n  `
      + transient.map(f => `${f.label}: ${f.detail}`).join('\n  '),
    );
  }

  if (stillGone.length) {
    console.log(`⚠️  ${stillGone.length} recording(s) remain unrecoverable — see ${statusKey()}`);
  }
  console.log('✅ every reachable recording and photo has an off-site copy');
  await heartbeat(true, `${targets.length} objects, ${tally.copied} new, ${stillGone.length} gone`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('\n❌ blob backup FAILED:', err.message);
    await heartbeat(false, err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
