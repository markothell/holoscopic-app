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

const okFetch = (bytes = 1234) => async () => ({
  ok: true,
  headers: { get: () => 'audio/webm' },
  arrayBuffer: async () => new ArrayBuffer(bytes),
});

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

test('mirrorObject: a copy of the same size is left alone', async () => {
  await withEnv({ ...CONFIGURED }, async () => {
    const s3 = fakeS3({ headResult: { ContentLength: 2048 } });
    const res = await mirror.mirrorObject({
      url: AUDIO_URL, pathname: PATHNAME, s3, fetchImpl: okFetch(2048),
    });
    assert.equal(res.status, 'already');
    assert.equal(s3.calls.filter(c => c.name === 'PutObjectCommand').length, 0);
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
