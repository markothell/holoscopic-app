#!/usr/bin/env node
// Nightly reconcile: every recording referenced by a Memory document has an
// off-site copy.
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
// Exits non-zero if anything is still missing at the end, so the cron's
// dead-man's-switch reports a partial backup as a failure rather than a
// success. A backup nobody is alerted about is not a backup.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const Memory = require('../models/Memory');
const Instance = require('../models/Instance');
const mirror = require('../utils/blobMirror');

const DRY = process.argv.includes('--dry-run');

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
  console.log(DRY ? 'mode: DRY RUN — copying nothing\n' : 'mode: copy what is missing\n');

  await mongoose.connect(uri);
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

  const targets = [
    ...memories.map(m => ({ label: m.title || m.id, url: m.body.audio.url, pathname: mirror.pathnameFor(m.body.audio) })),
    ...photos.map(p => ({ label: `${p.slug} (photo)`, url: p.url, pathname: '' })),
  ];

  console.log(`${targets.length} objects referenced (${memories.length} recordings, ${photos.length} photos)\n`);

  const tally = { copied: 0, already: 0, failed: 0 };
  const failures = [];

  for (const t of targets) {
    if (DRY) {
      console.log(`  would check  ${mirror.keyFor(t.pathname || mirror.pathnameFor({ url: t.url }))}`);
      continue;
    }
    const res = await mirror.mirrorObject({ url: t.url, pathname: t.pathname, s3 });
    if (res.status === 'copied') {
      tally.copied++;
      console.log(`  copied   ${res.key}  (${res.bytes} bytes)`);
    } else if (res.status === 'already') {
      tally.already++;
    } else {
      tally.failed++;
      failures.push(`${t.label}: ${res.status}${res.error ? ` — ${res.error}` : ''}`);
      console.error(`  FAILED   ${t.label}: ${res.status}${res.error ? ` — ${res.error}` : ''}`);
    }
  }

  if (DRY) {
    console.log('\nDry run — nothing copied.');
    return;
  }

  console.log(`\n${tally.copied} copied, ${tally.already} already present, ${tally.failed} failed`);
  if (tally.failed) {
    throw new Error(`${tally.failed} object(s) could not be mirrored:\n  ${failures.join('\n  ')}`);
  }
  console.log('✅ every referenced recording and photo has an off-site copy');
  await heartbeat(true, `${targets.length} objects, ${tally.copied} new`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('\n❌ blob backup FAILED:', err.message);
    await heartbeat(false, err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
