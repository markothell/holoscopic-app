#!/usr/bin/env node
// Put the recordings back.
//
//   node scripts/restore-blobs.js --instance=chorus                # report
//   node scripts/restore-blobs.js --instance=chorus --write        # do it
//   NODE_ENV=production node scripts/restore-blobs.js --instance=… --write
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
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const Memory = require('../models/Memory');
const mirror = require('../utils/blobMirror');

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const WRITE = args.has('write');
const INSTANCE = args.get('instance');

async function main() {
  if (!INSTANCE) throw new Error('--instance=<slug or id> is required');
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is required — it names the destination store');
  }
  const ready = mirror.readiness();
  if (ready !== 'ready') throw new Error(`backup bucket is not configured (${ready})`);

  await mongoose.connect(process.env.MONGODB_URI);

  const Instance = require('../models/Instance');
  const inst = await Instance.findOne({ $or: [{ slug: INSTANCE }, { id: INSTANCE }] });
  if (!inst) throw new Error(`no instance ${INSTANCE}`);

  console.log(`cluster : ${process.env.MONGODB_URI.match(/@([^/?]+)/)?.[1]}`);
  console.log(`memorial: ${inst.slug} (${inst.id}) — ${inst.config?.memorial?.subjectName || '?'}`);
  console.log(WRITE ? 'mode    : WRITE\n' : 'mode    : dry run — pass --write to apply\n');

  const memories = await Memory.find({
    instanceId: inst.id,
    'body.audio.url': { $exists: true, $ne: '' },
  });
  console.log(`${memories.length} recordings referenced\n`);

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

  for (const m of memories) {
    const audio = m.body.audio;
    const pathname = mirror.pathnameFor(audio);
    const key = mirror.keyFor(pathname);

    // Anything still reachable is left exactly as it is. A restore must be
    // safe to run against a partially-healthy memorial.
    try {
      const head = await fetch(audio.url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
      if (head.ok) { intact++; continue; }
    } catch { /* unreachable → restore it */ }

    let body;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      body = Buffer.from(await obj.Body.transformToByteArray());
    } catch (err) {
      missing++;
      console.error(`  NO BACKUP  ${m.title || m.id} — ${key} (${err.name})`);
      continue;
    }

    if (!WRITE) {
      console.log(`  would restore  ${m.title || m.id}  ←  ${key} (${body.length} bytes)`);
      restored++;
      continue;
    }

    // Same pathname, so a second run is a no-op rather than a duplicate. The
    // returned URL carries the CURRENT store's host, which is the whole reason
    // the document has to be rewritten.
    const uploaded = await put(pathname, body, {
      access: 'public',
      contentType: audio.mimeType || 'audio/webm',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    m.body.audio.url = uploaded.url;
    m.body.audio.pathname = uploaded.pathname;
    await m.save();
    restored++;
    console.log(`  restored  ${m.title || m.id}  →  ${uploaded.url}`);
  }

  console.log(`\n${intact} already reachable, ${restored} ${WRITE ? 'restored' : 'restorable'}, ${missing} with no backup`);
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
