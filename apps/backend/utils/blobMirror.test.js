const test = require('node:test');
const assert = require('node:assert/strict');

const mirror = require('./blobMirror');

// No network, no S3, no database — the client and fetch are both injected, the
// same way memorialTranscribe.test.js injects fetch. A backup path that can
// only be exercised against real infrastructure is a backup path nobody tests.

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => {
    try { return await fn(); }
    finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  })();
}

const CONFIGURED = {
  BACKUP_S3_BUCKET: 'holoscopic-backups',
  BACKUP_S3_ENDPOINT: 'https://accountid.r2.cloudflarestorage.com',
  BACKUP_S3_REGION: 'auto',
  BACKUP_S3_ACCESS_KEY_ID: 'ak',
  BACKUP_S3_SECRET_ACCESS_KEY: 'sk',
  BACKUP_BLOB_PREFIX: undefined,
};

const AUDIO_URL = 'https://eiuui62jhmfnk5es.public.blob.vercel-storage.com/memorial/chorus/1785502117538-abc.webm';
const PATHNAME = 'memorial/chorus/1785502117538-abc.webm';

// A stand-in Blob CDN that answers HEAD and GET the way the real one does, and
// records which it was asked for — `calls` is how a test proves the sweep did
// not move the bytes. `headBytes` lets a test make HEAD disagree with GET (or
// go silent), which is the case that must fall back to downloading.
const okFetch = (bytes = 1234, { headBytes = bytes } = {}) => {
  const fn = async (_url, opts = {}) => {
    fn.calls.push(opts.method || 'GET');
    if ((opts.method || 'GET') === 'HEAD') {
      return {
        ok: true,
        headers: {
          get: (h) => (String(h).toLowerCase() === 'content-length'
            ? (headBytes === null ? null : String(headBytes))
            : 'audio/webm'),
        },
      };
    }
    return {
      ok: true,
      headers: { get: () => 'audio/webm' },
      arrayBuffer: async () => new ArrayBuffer(bytes),
    };
  };
  fn.calls = [];
  return fn;
};

// A stand-in S3 that records what it was asked to do. `headResult` decides
// whether an object is already present.
function fakeS3({ headResult = null, putThrows = null } = {}) {
  const calls = [];
  return {
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === 'HeadObjectCommand') {
        if (!headResult) { const e = new Error('NotFound'); e.name = 'NotFound'; throw e; }
        return headResult;
      }
      if (name === 'PutObjectCommand') {
        if (putThrows) throw new Error(putThrows);
        return {};
      }
      return {};
    },
  };
}

test('readiness: names why mirroring would not happen', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    assert.equal(mirror.readiness(), 'ready');
  });
  await withEnv({ ...CONFIGURED, BACKUP_S3_BUCKET: undefined }, async () => {
    assert.equal(mirror.readiness(), 'no-bucket');
  });
  await withEnv({ ...CONFIGURED, BACKUP_S3_ENDPOINT: undefined }, async () => {
    assert.equal(mirror.readiness(), 'no-bucket');
  });
  await withEnv({ ...CONFIGURED, BACKUP_S3_SECRET_ACCESS_KEY: undefined }, async () => {
    assert.equal(mirror.readiness(), 'no-credentials');
  });
  // The region has no default on purpose. Defaulting it to R2's 'auto' made an
  // AWS S3 bucket look fully configured while SigV4 signed every request over
  // the wrong region and the store rejected all of them.
  await withEnv({ ...CONFIGURED, BACKUP_S3_REGION: undefined }, async () => {
    assert.equal(mirror.readiness(), 'no-region');
  });
});

test('keyFor: the backup key is the blob pathname, so restore is a replay', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    assert.equal(mirror.keyFor(PATHNAME), `blob/${PATHNAME}`);
    // Leading slashes must not produce a double slash in the key — that would
    // be a different object from the one the sweep looks for.
    assert.equal(mirror.keyFor(`/${PATHNAME}`), `blob/${PATHNAME}`);
  });
  await withEnv({ ...CONFIGURED, BACKUP_BLOB_PREFIX: 'media' }, async () => {
    assert.equal(mirror.keyFor(PATHNAME), `media/${PATHNAME}`);
  });
});

test('pathnameFor: falls back to the URL for documents written before pathname was stored', () => {
  assert.equal(mirror.pathnameFor({ pathname: PATHNAME, url: AUDIO_URL }), PATHNAME);
  assert.equal(mirror.pathnameFor({ url: AUDIO_URL }), PATHNAME);
  assert.equal(mirror.pathnameFor({ url: 'not a url' }), '');
});

test('mirrorObject: copies a recording that is not there yet', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3();
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3, fetchImpl: okFetch(2048),
    });
    assert.equal(res.status, 'copied');
    assert.equal(res.key, `blob/${PATHNAME}`);
    assert.equal(res.bytes, 2048);

    const put = s3.calls.find(c => c.name === 'PutObjectCommand');
    assert.equal(put.input.Bucket, 'holoscopic-backups');
    assert.equal(put.input.Key, `blob/${PATHNAME}`);
    assert.equal(put.input.ContentType, 'audio/webm');
    // The source URL travels with the object, so the bytes can be placed even
    // if the database is the thing that was lost.
    assert.equal(put.input.Metadata.sourceUrl, AUDIO_URL);
  });
});

test('mirrorObject: a copy of the same size is left alone, and never downloaded', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3({ headResult: { ContentLength: 2048 } });
    const fetchImpl = okFetch(2048);
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3, fetchImpl,
    });
    assert.equal(res.status, 'already');
    assert.equal(res.bytes, 2048);
    assert.equal(s3.calls.filter(c => c.name === 'PutObjectCommand').length, 0);

    // The point of the whole exercise. The nightly sweep runs this path once
    // per recording per night forever, so a GET here is not a small waste —
    // it is the memorial's entire audio library re-downloaded every night,
    // and it grows with every voice added. HEAD only.
    assert.deepEqual(fetchImpl.calls, ['HEAD']);
  });
});

test('mirrorObject: a source that will not report its size is downloaded, not assumed', async () => {
  // A CDN that answers HEAD without a Content-Length must NOT be read as
  // "matches, skip it". An unverified backup is not a backup, so the
  // uncertain case pays the download and compares for real.
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3({ headResult: { ContentLength: 2048 } });
    const fetchImpl = okFetch(2048, { headBytes: null });
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3, fetchImpl,
    });
    // Downloaded, found to match, and re-put rather than trusted — the old
    // behaviour, which is the correct fallback when HEAD tells us nothing.
    assert.deepEqual(fetchImpl.calls, ['HEAD', 'GET']);
    assert.equal(res.status, 'copied');
  });
});

test('mirrorObject: a truncated copy is overwritten rather than trusted', async () => {
  // The failure this guards: an upload that died partway leaves a short object
  // that a naive "does the key exist?" check would accept forever.
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3({ headResult: { ContentLength: 11 } });
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3, fetchImpl: okFetch(2048),
    });
    assert.equal(res.status, 'copied');
    assert.equal(s3.calls.filter(c => c.name === 'PutObjectCommand').length, 1);
  });
});

test('mirrorObject: never throws — it reports', async () => {
  // Every caller is either fire-and-forget or a sweep that must keep going.
  await withEnv({ ...CONFIGURED }, async () => {
    const unreachable = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3: fakeS3(),
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    });
    assert.equal(unreachable.status, 'source-unreachable');

    const gone = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3: fakeS3(),
      fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null } }),
    });
    assert.equal(gone.status, 'source-unreachable');
    assert.equal(gone.code, 404);

    const rejected = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME,
      s3: fakeS3({ putThrows: 'AccessDenied' }), fetchImpl: okFetch(),
    });
    assert.equal(rejected.status, 'upload-failed');
  });
});

test('mirrorObject: unconfigured is a no-op, not an error', async () => {
  // The normal state in local development. It must not look like a failure,
  // and it must not attempt an upload.
  await withEnv({ ...CONFIGURED, BACKUP_S3_BUCKET: undefined }, async () => {
    const s3 = fakeS3();
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3,
      fetchImpl: () => { throw new Error('should not fetch'); },
    });
    assert.equal(res.status, 'not-configured');
    assert.equal(s3.calls.length, 0);
  });
});

test('mirrorMemory: a typed memory is not a backup job', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const res = await mirror.mirrorMemory({
      memory: { id: 'm1', body: { text: 'she kept the radio on' } },
      s3: fakeS3(),
      fetchImpl: () => { throw new Error('should not fetch'); },
    });
    assert.equal(res.status, 'no-audio');
  });
});

test('mirrorMemory: a recorded memory is mirrored at its own pathname', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3();
    const res = await mirror.mirrorMemory({
      memory: { id: 'm2', body: { audio: { url: AUDIO_URL, pathname: PATHNAME } } },
      s3, fetchImpl: okFetch(999),
    });
    assert.equal(res.status, 'copied');
    assert.equal(res.key, `blob/${PATHNAME}`);
  });
});

// ── The paging decision ─────────────────────────────────────────────────────
// backup-blobs.js pings a dead-man's switch, so these tests are really about
// when a human gets woken up. The failure they guard against is not a crash:
// it is a nightly false alarm training somebody to ignore the one that matters.

test('isPermanentlyGone: only a 404/410 source is unrecoverable', () => {
  assert.equal(mirror.isPermanentlyGone({ status: 'source-unreachable', code: 404 }), true);
  assert.equal(mirror.isPermanentlyGone({ status: 'source-unreachable', code: 410 }), true);
  // A 503 or a timeout is tomorrow's problem, not a permanent loss.
  assert.equal(mirror.isPermanentlyGone({ status: 'source-unreachable', code: 503 }), false);
  assert.equal(mirror.isPermanentlyGone({ status: 'source-unreachable', error: 'timeout' }), false);
  assert.equal(mirror.isPermanentlyGone({ status: 'upload-failed', error: 'no perms' }), false);
  assert.equal(mirror.isPermanentlyGone({ status: 'copied' }), false);
  assert.equal(mirror.isPermanentlyGone(undefined), false);
});

const GONE = { status: 'source-unreachable', code: 404 };
const OK = { status: 'copied' };

test('reconcileGone: a newly vanished recording pages, the same one tomorrow does not', () => {
  const outcomes = [{ key: 'blob/a.webm', label: 'Carrots', result: GONE }];

  // Night one: nothing known gone yet. This is loss happening now.
  const first = mirror.reconcileGone({ previous: {}, outcomes, now: () => 'T1' });
  assert.equal(first.newlyGone.length, 1);
  assert.equal(first.stillGone.length, 0);
  assert.equal(first.gone['blob/a.webm'].firstSeenGone, 'T1');

  // Night two: same object, already recorded. Reported, but nobody is woken.
  const second = mirror.reconcileGone({ previous: first.gone, outcomes, now: () => 'T2' });
  assert.equal(second.newlyGone.length, 0);
  assert.equal(second.stillGone.length, 1);
  // The original sighting date survives — it is the only record of WHEN.
  assert.equal(second.gone['blob/a.webm'].firstSeenGone, 'T1');
});

test('reconcileGone: a whole store dying overnight still pages', () => {
  // The disaster this exists to catch. Everything 404s at once and none of it
  // was known — every object must count as newly gone.
  const outcomes = [
    { key: 'blob/a.webm', label: 'a', result: GONE },
    { key: 'blob/b.webm', label: 'b', result: GONE },
    { key: 'blob/c.jpg', label: 'c', result: GONE },
  ];
  const r = mirror.reconcileGone({ previous: {}, outcomes });
  assert.equal(r.newlyGone.length, 3);
});

test('reconcileGone: a transient failure is fatal and never marks an object gone', () => {
  const outcomes = [
    { key: 'blob/a.webm', label: 'a', result: { status: 'upload-failed', error: 'boom' } },
    { key: 'blob/b.webm', label: 'b', result: { status: 'source-unreachable', code: 503 } },
  ];
  const r = mirror.reconcileGone({ previous: {}, outcomes });
  assert.equal(r.transient.length, 2);
  assert.equal(r.newlyGone.length, 0);
  // Nothing gets a tombstone on a maybe — that would suppress the real alert.
  assert.deepEqual(r.gone, {});
});

test('reconcileGone: an object that comes back drops out of the set', () => {
  const previous = { 'blob/a.webm': { firstSeenGone: 'T1', label: 'a' } };
  const r = mirror.reconcileGone({
    previous,
    outcomes: [{ key: 'blob/a.webm', label: 'a', result: OK }],
  });
  assert.equal(r.recovered.length, 1);
  assert.deepEqual(r.gone, {});
  // So if it vanishes again later it pages again, rather than being
  // permanently excused by a tombstone nobody cleared.
  const again = mirror.reconcileGone({
    previous: r.gone,
    outcomes: [{ key: 'blob/a.webm', label: 'a', result: GONE }],
  });
  assert.equal(again.newlyGone.length, 1);
});

test('reconcileGone: a flaky night does not erase an existing tombstone', () => {
  const previous = { 'blob/a.webm': { firstSeenGone: 'T1', label: 'a' } };
  const r = mirror.reconcileGone({
    previous,
    outcomes: [{ key: 'blob/a.webm', label: 'a', result: { status: 'source-unreachable', error: 'timeout' } }],
  });
  // Kept, so tomorrow's confirmed 404 is 'stillGone' rather than a fresh page.
  assert.equal(r.gone['blob/a.webm'].firstSeenGone, 'T1');
  assert.equal(r.transient.length, 1);
});

test('reconcileGone: an already-present copy counts as healthy', () => {
  const r = mirror.reconcileGone({
    previous: {},
    outcomes: [{ key: 'blob/a.webm', label: 'a', result: { status: 'already' } }],
  });
  assert.equal(r.newlyGone.length, 0);
  assert.equal(r.transient.length, 0);
  assert.deepEqual(r.gone, {});
});
