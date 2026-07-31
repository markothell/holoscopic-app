// Off-site copy of Chorus media — the second home for recorded voices.
//
// WHY THIS EXISTS. Chorus data is split across two systems and until now only
// one of them was protected:
//
//   MongoDB   Memory documents, tag vocabularies, memorial config, and the
//             audio METADATA (url, pathname, duration, peaks, transcript).
//             Backed up twice: Atlas continuous + PITR, and the nightly
//             mongodump in scripts/backup-mongo.js.
//   Blob      The bytes. Voices and photographs. Backed up NOWHERE.
//
// That is exactly backwards from what matters. A lost Memory document costs
// somebody a paragraph they could retype. A lost recording is a dead person's
// voice, and there is no second take. We have already watched it happen: three
// memories survived a store deletion with their documents intact and their
// audio URLs pointing at nothing, and there was no repair path because there
// was nothing to repair FROM.
//
// So: every object that lands in Blob gets copied to the same S3-compatible
// bucket the Mongo backup already writes to, under its own prefix. Same
// bucket, same credentials, same retention rules, one more thing inside it.
//
// SHAPE. Two layers, the pattern this codebase already uses for transcription:
//   1. On write — memories.js fires this the moment a recorded memory is
//      created, so a voice is in two places within seconds rather than within
//      a day. For a contributor who records once and never comes back, that
//      window IS the risk.
//   2. Nightly reconcile — scripts/backup-blobs.js walks every memory with
//      audio and copies whatever the write path missed (a deploy mid-upload, a
//      network blip). The sweep is what makes the hook's fire-and-forget
//      safe to ignore failures on.
//
// RESTORE. The key is the blob's own pathname, so restoring is mechanical:
// re-upload each object at the same pathname into a (possibly new) store and
// rewrite the URL host on the Memory document. scripts/restore-blobs.js does
// exactly that. A backup nobody has restored from is not a backup.
//
// Configured entirely from the BACKUP_S3_* variables backup-mongo.js already
// needs. With them unset this is a no-op that says so — same contract as
// transcription, and reported the same way on /health.

const KEY_PREFIX_DEFAULT = 'blob';

function config(env = process.env) {
  return {
    bucket: env.BACKUP_S3_BUCKET || '',
    endpoint: env.BACKUP_S3_ENDPOINT || '',
    region: env.BACKUP_S3_REGION || 'auto',
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY || '',
    prefix: env.BACKUP_BLOB_PREFIX || KEY_PREFIX_DEFAULT,
  };
}

// Whether a recording made right now would gain an off-site copy, and if not,
// why. Surfaced on /health for the same reason transcription is: a backup that
// silently is not happening looks exactly like one that is.
//
//   'ready'          → mirroring will proceed
//   'no-bucket'      → BACKUP_S3_BUCKET / ENDPOINT unset
//   'no-credentials' → bucket configured but no key pair
function readiness(env = process.env) {
  const c = config(env);
  if (!c.bucket || !c.endpoint) return 'no-bucket';
  if (!c.accessKeyId || !c.secretAccessKey) return 'no-credentials';
  return 'ready';
}

function isConfigured(env = process.env) {
  return readiness(env) === 'ready';
}

// The object key is the blob pathname verbatim under one prefix. Deterministic
// on purpose: it makes the copy idempotent, makes "is this already backed up?"
// a HEAD request, and makes restore a straight replay rather than a mapping
// table somebody has to keep in step.
function keyFor(pathname, env = process.env) {
  const clean = String(pathname || '').replace(/^\/+/, '');
  return `${config(env).prefix}/${clean}`;
}

// Vercel Blob pathnames live at `memorial/<instanceId>/…`; the URL carries the
// store host in front. Prefer the stored pathname and fall back to parsing the
// URL, because an older document may predate pathname being recorded.
function pathnameFor(audio) {
  if (audio?.pathname) return String(audio.pathname);
  try {
    return new URL(audio.url).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

function makeClient(env = process.env) {
  const c = config(env);
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  });
}

/**
 * Copy one public blob URL into the backup bucket, unless an object of the
 * same size is already there.
 *
 * Returns a small result object rather than throwing, so both callers — a
 * fire-and-forget hook and a sweep that must keep going — can treat every
 * outcome the same way.
 */
async function mirrorObject({
  url,
  pathname,
  env = process.env,
  s3 = null,
  fetchImpl = globalThis.fetch,
}) {
  if (!url) return { status: 'no-url' };
  if (!isConfigured(env)) return { status: 'not-configured' };

  const key = keyFor(pathname || pathnameFor({ url }), env);
  if (key.endsWith('/')) return { status: 'no-pathname' };

  const c = config(env);
  const client = s3 || makeClient(env);
  const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

  // Fetch first: the source size is what decides whether an existing copy is
  // complete. Blob objects are immutable (a re-record uploads a new object),
  // so a size match means the same bytes.
  let body;
  let contentType;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { status: 'source-unreachable', code: res.status };
    contentType = res.headers?.get?.('content-type') || 'application/octet-stream';
    body = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { status: 'source-unreachable', error: err.message };
  }

  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: c.bucket, Key: key }));
    if (head?.ContentLength === body.length) return { status: 'already', key, bytes: body.length };
  } catch {
    // A miss is the normal path on first copy. Any other error surfaces on the
    // Put below rather than being diagnosed twice.
  }

  try {
    await client.send(new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Enough to rebuild the original URL without the database, for the case
      // where the database is the thing that was lost.
      Metadata: { sourceUrl: url, mirroredAt: new Date().toISOString() },
    }));
  } catch (err) {
    return { status: 'upload-failed', error: err.message };
  }

  return { status: 'copied', key, bytes: body.length };
}

/**
 * Mirror everything attached to one memory. Today that is its recording;
 * written to take a list so a future attachment type needs no new caller.
 */
async function mirrorMemory({ memory, env = process.env, s3 = null, fetchImpl = globalThis.fetch }) {
  const audio = memory?.body?.audio;
  if (!audio?.url) return { status: 'no-audio' };
  return mirrorObject({
    url: audio.url,
    pathname: pathnameFor(audio),
    env, s3, fetchImpl,
  });
}

module.exports = {
  config,
  readiness,
  isConfigured,
  keyFor,
  pathnameFor,
  makeClient,
  mirrorObject,
  mirrorMemory,
};
