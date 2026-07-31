#!/usr/bin/env node
// Put the recordings back.
//
//   node scripts/restore-blobs.js --instance=chorus                # report
//   node scripts/restore-blobs.js --instance=chorus --write        # do it
//   NODE_ENV=production node scripts/restore-blobs.js --instance=… --write
//
//   --migrate   move media into the store BLOB_READ_WRITE_TOKEN names, even
//               where the current URLs still resolve. For splitting one Blob
//               store into two, not for repairing damage.
//
// It covers the subject photograph as well as the recordings. It did not, for a
// while: backup-blobs.js preserved the photo and nothing could put it back, so
// the picture a family chose was backed up and unrecoverable.
//
// THIS SCRIPT IS THE POINT OF THE BACKUP. A copy nobody has ever restored from
// is a guess, not a backup — so this exists from the same commit as the mirror,
// and the dry run is worth doing once before you ever need it for real.
//
// The disaster it answers: the Vercel Blob store is gone (deleted, or its
// project detached) and every Memory document now carries an audio URL that
// 404s. Mongo is fine. The bytes are in the backup bucket. What is missing is
// the mapping back.
//
// It is mechanical because the key was chosen to make it so: the backup key is
// the blob's own pathname under one prefix, so restoring is a replay —
//
//   1. read each memory's stored audio pathname
//   2. pull those bytes from the backup bucket
//   3. upload them to the CURRENT blob store at the same pathname
//   4. rewrite Memory.body.audio.url to the URL the upload returns
//
// Step 4 is the part a naive backup forgets. The store id is baked into the
// hostname (`<storeid>.public.blob.vercel-storage.com`), so a restore into a
// NEW store produces new URLs, and documents pointing at the old host stay
// broken no matter how faithfully the bytes were preserved.
//
// Requires BLOB_READ_WRITE_TOKEN for the destination store, plus the same
// BACKUP_S3_* variables the mirror uses.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
require('dotenv').config({ path: require('node:path').join(__dirname, '..', envFile) });

const mongoose = require('mongoose');
const Memory = require('../models/Memory');
const mirror = require('../utils/blobMirror');

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const WRITE = args.has('write');
const INSTANCE = args.get('instance');

// Normally an object whose URL still resolves is left alone — a restore must be
// safe to run against a partially-healthy memorial, and re-uploading working
// audio would be pointless risk.
//
// --migrate inverts that for the one case where a reachable URL is still the
// wrong answer: the media lives in a store this deployment should no longer be
// using. That is not a disaster, it is a move, and it is what happened when dev
// and production stopped sharing a Blob store — every dev URL resolved
// perfectly and every one of them pointed into production.
const MIGRATE = args.has('migrate');

async function main() {
  if (!INSTANCE) throw new Error('--instance=<slug or id> is required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required — it names the destination store');
  }
  const ready = mirror.readiness();
  if (ready !== 'ready') throw new Error(`backup bucket is not configured (${ready})`);

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });

  const Instance = require('../models/Instance');
  const inst = await Instance.findOne({ $or: [{ slug: INSTANCE }, { id: INSTANCE }] });
  if (!inst) throw new Error(`no instance ${INSTANCE}`);

  console.log(`cluster : ${process.env.MONGODB_URI.match(/@([^/?]+)/)?.[1]}`);
  console.log(`memorial: ${inst.slug} (${inst.id}) — ${inst.config?.memorial?.subjectName || '?'}`);
  console.log(WRITE ? 'mode    : WRITE\n' : 'mode    : dry run — pass --write to apply\n');

  // The prefix comes from the cluster, not from a variable — otherwise a
  // restore run against dev would read production's backups.
  require('../utils/backupNamespace').apply({ uri: process.env.MONGODB_URI });

  const memories = await Memory.find({
    instanceId: inst.id,
    'body.audio.url': { $exists: true, $ne: '' },
  });

  // One list, because a memorial is not only its recordings. The subject
  // photograph lives on the Instance rather than on a Memory, and it used to be
  // backed up by backup-blobs.js and restorable by nothing — preserved and
  // unrecoverable, which is the worst of both. A family chose that picture.
  const targets = memories.map(m => ({
    label: m.title || m.id,
    url: m.body.audio.url,
    pathname: mirror.pathnameFor(m.body.audio),
    contentType: m.body.audio.mimeType || 'audio/webm',
    async commit(uploaded) {
      m.body.audio.url = uploaded.url;
      m.body.audio.pathname = uploaded.pathname;
      await m.save();
    },
  }));

  const photoUrl = inst.config?.memorial?.subjectPhotoUrl || '';
  if (photoUrl.includes('.public.blob.vercel-storage.com')) {
    targets.push({
      label: `${inst.slug} (subject photo)`,
      url: photoUrl,
      pathname: mirror.pathnameFor({ url: photoUrl }),
      contentType: 'image/jpeg',
      async commit(uploaded) {
        inst.config.memorial.subjectPhotoUrl = uploaded.url;
        inst.markModified('config.memorial');
        await inst.save();
      },
    });
  }

  console.log(`${targets.length} object(s) referenced (${memories.length} recordings`
    + `${photoUrl ? ', 1 photo' : ''})\n`);

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  // Required lazily and by name. Restore is a rare break-glass operation, so
  // @vercel/blob is deliberately NOT a backend dependency — it would otherwise
  // ride into the nightly cron image for a script that image never runs. A
  // missing package must say exactly how to fix it, because the person reading
  // this message is mid-incident.
  let put;
  try {
    ({ put } = require('@vercel/blob'));
  } catch {
    throw new Error(
      'restore needs the Blob SDK, which the backend does not carry by default.\n'
      + '  npm install @vercel/blob --workspace=apps/backend',
    );
  }
  const s3 = mirror.makeClient();
  const cfg = mirror.config();

  let restored = 0; let intact = 0; let missing = 0;

  // Which store this deployment is supposed to be writing to. A URL can resolve
  // perfectly and still be wrong, if it points at a store we no longer own.
  const destinationHost = MIGRATE
    ? (await put('_migrate-probe.txt', Buffer.from('probe'), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true,
    }).then(async (p) => {
      const { del } = require('@vercel/blob');
      await del(p.url).catch(() => {});
      return new URL(p.url).host;
    }))
    : null;
  if (MIGRATE) console.log(`destination store: ${destinationHost}\n`);

  for (const t of targets) {
    const key = mirror.keyFor(t.pathname);
    const alreadyHome = destinationHost && new URL(t.url).host === destinationHost;

    if (MIGRATE && alreadyHome) { intact++; continue; }

    if (!MIGRATE) {
      // Anything still reachable is left exactly as it is. A restore must be
      // safe to run against a partially-healthy memorial.
      try {
        const head = await fetch(t.url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
        if (head.ok) { intact++; continue; }
      } catch { /* unreachable → restore it */ }
    }

    let body;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      body = Buffer.from(await obj.Body.transformToByteArray());
    } catch (err) {
      missing++;
      console.error(`  NO BACKUP  ${t.label} — ${key} (${err.name})`);
      continue;
    }

    if (!WRITE) {
      console.log(`  would ${MIGRATE ? 'migrate' : 'restore'}  ${t.label}  ←  ${key} (${body.length} bytes)`);
      restored++;
      continue;
    }

    // Same pathname, so a second run is a no-op rather than a duplicate. The
    // returned URL carries the CURRENT store's host, which is the whole reason
    // the document has to be rewritten.
    const uploaded = await put(t.pathname, body, {
      access: 'public',
      contentType: t.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    await t.commit(uploaded);
    restored++;
    console.log(`  ${MIGRATE ? 'migrated' : 'restored'}  ${t.label}  →  ${uploaded.url}`);
  }

  console.log(`\n${intact} already ${MIGRATE ? 'in the destination store' : 'reachable'}, `
    + `${restored} ${WRITE ? (MIGRATE ? 'migrated' : 'restored') : (MIGRATE ? 'to migrate' : 'restorable')}, `
    + `${missing} with no backup`);
  if (missing) {
    console.log('\n⚠️  Recordings with no backup are unrecoverable. They predate the mirror,');
    console.log('   or the sweep never ran. Nothing in this script can bring them back.');
  }
  if (!WRITE && restored) console.log('\nRe-run with --write to apply.');
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('✗', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
