const { test } = require('node:test');
const assert = require('node:assert/strict');

const transcribe = require('./memorialTranscribe');
const memories = require('./memories');

// No network, no Deepgram key in CI — fetch is injected and the env is set
// per-test. Every assertion here is about the two things that can go wrong
// quietly: enqueuing a job whose callback can never arrive, and accepting a
// forged transcript.

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
  DEEPGRAM_API_KEY: 'dg-test-key',
  NEXTAUTH_SECRET: 'test-secret',
  GAME_TOKEN_SECRET: undefined,
  PUBLIC_API_URL: 'https://api.example.com/api',
};

const memoryWithAudio = {
  id: 'mem123',
  instanceId: 'chorus',
  body: { audio: { url: 'https://abc.public.blob.vercel-storage.com/a.webm' } },
};

test('requestTranscript: hands Deepgram the blob URL and a signed callback', async () => {
  await withEnv(CONFIGURED, async () => {
    let seen = null;
    const fetchImpl = async (url, init) => {
      seen = { url, init };
      return { ok: true };
    };
    const result = await transcribe.requestTranscript({ memory: memoryWithAudio, fetchImpl });

    assert.equal(result.status, 'queued');
    const url = new URL(seen.url);
    assert.equal(url.origin + url.pathname, 'https://api.deepgram.com/v1/listen');
    assert.equal(url.searchParams.get('model'), 'nova-3');

    const callback = new URL(url.searchParams.get('callback'));
    assert.equal(callback.pathname, '/api/memorial/hooks/deepgram');
    assert.equal(callback.searchParams.get('m'), 'mem123');
    assert.equal(callback.searchParams.get('i'), 'chorus');
    assert.ok(
      transcribe.verifyCallbackToken('mem123', callback.searchParams.get('t')),
      'callback carries a token this server will accept',
    );

    // The AUDIO never passes through us — only its URL.
    assert.equal(JSON.parse(seen.init.body).url, memoryWithAudio.body.audio.url);
    assert.match(seen.init.headers.Authorization, /^Token /);
  });
});

test('requestTranscript: does nothing without a key, and never throws', async () => {
  await withEnv({ ...CONFIGURED, DEEPGRAM_API_KEY: undefined }, async () => {
    const result = await transcribe.requestTranscript({
      memory: memoryWithAudio,
      fetchImpl: () => { throw new Error('should not be called'); },
    });
    assert.equal(result.status, 'not-configured');
  });
});

test('requestTranscript: refuses to enqueue when the callback URL is unreachable', async () => {
  // The local-dev case. Enqueuing here would strand the memory on 'pending'
  // forever, promising a transcript that can never arrive.
  //
  // RENDER_EXTERNAL_URL is cleared explicitly: publicApiUrl() falls back to it,
  // so leaving it to the ambient environment would make this test pass or fail
  // depending on where it runs.
  await withEnv({ ...CONFIGURED, PUBLIC_API_URL: undefined, RENDER_EXTERNAL_URL: undefined }, async () => {
    const result = await transcribe.requestTranscript({
      memory: memoryWithAudio,
      fetchImpl: () => { throw new Error('should not be called'); },
    });
    assert.equal(result.status, 'no-callback-url');
  });
});

test('requestTranscript: derives the callback base from RENDER_EXTERNAL_URL', async () => {
  // Production carries no hand-set copy of its own address. Render injects
  // this, so a service rename can never leave a stale callback behind.
  await withEnv(
    { ...CONFIGURED, PUBLIC_API_URL: undefined, RENDER_EXTERNAL_URL: 'https://svc.onrender.com' },
    async () => {
      let seen = null;
      const result = await transcribe.requestTranscript({
        memory: memoryWithAudio,
        fetchImpl: async (url) => { seen = url; return { ok: true }; },
      });
      assert.equal(result.status, 'queued');
      const callback = new URL(seen).searchParams.get('callback');
      // The /api mount point must be added — routes live under /api/memorial.
      assert.ok(
        callback.startsWith('https://svc.onrender.com/api/memorial/hooks/deepgram'),
        `callback was ${callback}`,
      );
    },
  );
});

test('requestTranscript: an explicit PUBLIC_API_URL overrides the derived one', async () => {
  // Dev tunnels and any non-Render host depend on this precedence.
  await withEnv(
    { ...CONFIGURED, RENDER_EXTERNAL_URL: 'https://svc.onrender.com' },
    async () => {
      let seen = null;
      await transcribe.requestTranscript({
        memory: memoryWithAudio,
        fetchImpl: async (url) => { seen = url; return { ok: true }; },
      });
      const callback = new URL(seen).searchParams.get('callback');
      assert.ok(callback.startsWith('https://api.example.com/api/'), `callback was ${callback}`);
    },
  );
});

test('readiness: names the reason transcripts would not arrive', async () => {
  // What /health reports. Each branch is a state the app is otherwise
  // indistinguishable from healthy in.
  const noRender = { RENDER_EXTERNAL_URL: undefined };

  await withEnv({ ...CONFIGURED, ...noRender }, async () => {
    assert.equal(transcribe.readiness(), 'ready');
  });
  await withEnv({ ...CONFIGURED, ...noRender, DEEPGRAM_API_KEY: undefined }, async () => {
    assert.equal(transcribe.readiness(), 'no-api-key');
  });
  await withEnv({ ...CONFIGURED, ...noRender, NEXTAUTH_SECRET: undefined }, async () => {
    assert.equal(transcribe.readiness(), 'no-secret');
  });
  await withEnv({ ...CONFIGURED, ...noRender, PUBLIC_API_URL: undefined }, async () => {
    assert.equal(transcribe.readiness(), 'no-callback-url');
  });
  // Derived alone is enough to be ready — production sets nothing.
  await withEnv(
    { ...CONFIGURED, PUBLIC_API_URL: undefined, RENDER_EXTERNAL_URL: 'https://svc.onrender.com' },
    async () => { assert.equal(transcribe.readiness(), 'ready'); },
  );
});

test('requestTranscript: a text-only memory is not a transcription job', async () => {
  await withEnv(CONFIGURED, async () => {
    const result = await transcribe.requestTranscript({
      memory: { id: 'x', instanceId: 'chorus', body: { text: 'typed' } },
      fetchImpl: () => { throw new Error('should not be called'); },
    });
    assert.equal(result.status, 'no-audio');
  });
});

test('requestTranscript: swallows an unreachable Deepgram', async () => {
  await withEnv(CONFIGURED, async () => {
    const result = await transcribe.requestTranscript({
      memory: memoryWithAudio,
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    });
    assert.equal(result.status, 'unreachable', 'a dead API must never surface to the sharer');
  });
});

test('verifyCallbackToken: rejects a forged or reused token', async () => {
  await withEnv(CONFIGURED, async () => {
    const good = transcribe.callbackToken('mem123');
    assert.ok(transcribe.verifyCallbackToken('mem123', good));
    assert.equal(transcribe.verifyCallbackToken('mem123', 'nonsense'), false);
    assert.equal(transcribe.verifyCallbackToken('mem123', ''), false);
    // A token minted for one memory must not unlock another.
    assert.equal(transcribe.verifyCallbackToken('other', good), false);
  });
});

test('extractTranscript: survives every shape Deepgram might not send', () => {
  assert.equal(
    transcribe.extractTranscript({
      results: { channels: [{ alternatives: [{ transcript: '  She left the radio on.  ' }] }] },
    }),
    'She left the radio on.',
  );
  for (const junk of [undefined, null, {}, { results: {} }, { results: { channels: [] } },
    { results: { channels: [{ alternatives: [{}] }] } }]) {
    assert.equal(transcribe.extractTranscript(junk), '', 'never throws inside a webhook');
  }
});

// ── The funnel's side of the hook ───────────────────────────────────────────

// THE SEAM TEST. Everything above stubs the transcriber, and everything in
// memories.test.js stubs it too — so the two halves were each proven correct
// while the call between them was wrong: the funnel passed the memory
// positionally, requestTranscript takes `{ memory }`, and it silently
// returned 'no-audio' for every recorded memory. Nothing failed, nothing
// logged, transcripts just never appeared. This wires the REAL function
// through the REAL hook with only `fetch` stubbed, which is the only place
// that mismatch can be caught.
test('setTranscriber + requestTranscript: the real pair actually reaches Deepgram', async () => {
  await withEnv(CONFIGURED, async () => {
    const hits = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { hits.push({ url: String(url), init }); return { ok: true }; };

    memories.setTranscriber(transcribe.requestTranscript);
    try {
      const created = await memories.createMemory({
        store: fakeStore(),
        instanceId: 'chorus',
        contributorId: 'c1',
        title: 'Spoken',
        body: { audio: { url: 'https://abc.public.blob.vercel-storage.com/a.webm', durationMs: 4000 } },
      });
      await new Promise(r => setImmediate(r));

      assert.equal(hits.length, 1, 'a recorded memory must enqueue exactly one job');
      assert.match(hits[0].url, /api\.deepgram\.com/);
      const callback = new URL(new URL(hits[0].url).searchParams.get('callback'));
      assert.equal(callback.searchParams.get('m'), created.id, 'the job points back at THIS memory');
      assert.equal(JSON.parse(hits[0].init.body).url, created.body.audio.url);
    } finally {
      globalThis.fetch = realFetch;
      memories.setTranscriber(null);
    }
  });
});

test('setTranscriber: fires on a recorded memory, and cannot fail the write', async () => {
  const calls = [];
  memories.setTranscriber(async ({ memory }) => {
    calls.push(memory.id);
    throw new Error('Deepgram exploded');   // must not reach the caller
  });

  const store = fakeStore();
  const created = await memories.createMemory({
    store,
    instanceId: 'chorus',
    contributorId: 'c1',
    title: 'Spoken',
    body: { audio: { url: 'https://abc.public.blob.vercel-storage.com/a.webm', durationMs: 4000 } },
  });

  assert.equal(created.body.kind, 'audio');
  await new Promise(r => setImmediate(r));   // let the fire-and-forget settle
  assert.deepEqual(calls, [created.id]);

  memories.setTranscriber(null);
});

test('setTranscriber: a typed memory never enqueues a job', async () => {
  const calls = [];
  memories.setTranscriber(async ({ memory }) => { calls.push(memory.id); });

  await memories.createMemory({
    store: fakeStore(),
    instanceId: 'chorus',
    contributorId: 'c1',
    title: 'Typed',
    body: { text: 'She left the radio on.' },
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, []);

  memories.setTranscriber(null);
});

// Minimal store — this file only exercises the hook, not the funnel's own
// rules (memories.test.js covers those).
function fakeStore() {
  const rows = [];
  return {
    async findTagByKey() { return null; },
    async createTag(f) { return f; },
    async bumpTagUse() {},
    async createMemory(f) { rows.push(f); return { ...f }; },
    async findMemory(_i, id) { return rows.find(r => r.id === id) || null; },
    async listTags() { return []; },
    // createMemory syncs the thread's denormalized count on the way out, so
    // even this minimal fake needs the thread read/write pair.
    async listThread(_i, threadId, statuses) {
      return rows.filter(r => r.threadId === threadId && statuses.includes(r.status));
    },
    async updateMemory(_i, id, patch) {
      const doc = rows.find(r => r.id === id);
      if (doc) Object.assign(doc, patch);
      return doc ? { ...doc } : null;
    },
  };
}
