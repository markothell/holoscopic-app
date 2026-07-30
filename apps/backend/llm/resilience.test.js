// Guardrails on outbound vendor calls. No network: every test drives a fake
// fetch, so these run in the default suite.
const test = require('node:test');
const assert = require('node:assert');

const {
  fetchWithTimeout, withRetry, createSemaphore, createBudget,
} = require('./resilience');

function res(status, { body = '', headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body || '{}'),
  };
}

// ── timeout ────────────────────────────────────────────────────────────────

test('fetchWithTimeout aborts a request that never responds', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  });
  try {
    await assert.rejects(
      () => fetchWithTimeout('https://example.test', {}, { timeoutMs: 40 }),
      (e) => e.name === 'AbortError',
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('fetchWithTimeout passes a fast response straight through', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => res(200, { body: 'ok' });
  try {
    const r = await fetchWithTimeout('https://example.test', {}, { timeoutMs: 500 });
    assert.equal(r.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The distinction that matters for chat: the deadline is time-to-first-byte,
// so a slow *stream* must not be killed once headers have arrived.
test('streaming mode does not abort after headers arrive', async () => {
  const realFetch = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = async (_url, init) => {
    init.signal.addEventListener('abort', () => { aborted = true; });
    return res(200);
  };
  try {
    await fetchWithTimeout('https://example.test', {}, { timeoutMs: 30, streaming: true });
    await new Promise((r) => setTimeout(r, 80)); // outlive the deadline
    assert.equal(aborted, false, 'a long token stream must not be cut off');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── retry ──────────────────────────────────────────────────────────────────

test('withRetry retries a 429 and returns the eventual success', async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    return calls < 3 ? res(429) : res(200, { body: 'done' });
  }, { retries: 3, label: 'test' });
  assert.equal(out.status, 200);
  assert.equal(calls, 3);
});

test('withRetry gives up after the configured attempts and returns the last response', async () => {
  let calls = 0;
  const out = await withRetry(async () => { calls++; return res(503); }, { retries: 2, label: 'test' });
  assert.equal(out.status, 503);
  assert.equal(calls, 3, 'initial attempt plus two retries');
});

test('withRetry does not retry a 400', async () => {
  let calls = 0;
  const out = await withRetry(async () => { calls++; return res(400); }, { retries: 3, label: 'test' });
  assert.equal(out.status, 400);
  assert.equal(calls, 1, 'a client error will not fix itself');
});

test('withRetry honours Retry-After', async () => {
  let calls = 0;
  const t0 = Date.now();
  await withRetry(async () => {
    calls++;
    return calls === 1 ? res(429, { headers: { 'retry-after': '0.2' } }) : res(200);
  }, { retries: 2, label: 'test' });
  assert.ok(Date.now() - t0 >= 180, 'must wait roughly as long as asked');
});

test('withRetry retries a network error', async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    if (calls === 1) throw new Error('ECONNRESET');
    return res(200);
  }, { retries: 2, label: 'test' });
  assert.equal(out.status, 200);
  assert.equal(calls, 2);
});

test('withRetry stops immediately when the caller aborts', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => withRetry(async () => res(500), { retries: 5, label: 'test', signal: ac.signal }),
    /aborted/,
  );
});

// ── concurrency ────────────────────────────────────────────────────────────

test('createSemaphore never exceeds its limit', async () => {
  const run = createSemaphore(3);
  let active = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 20 }, () => run(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  })));
  assert.equal(peak, 3);
  assert.equal(active, 0);
});

test('createSemaphore releases its slot when work throws', async () => {
  const run = createSemaphore(1);
  await assert.rejects(() => run(async () => { throw new Error('boom'); }), /boom/);
  // If the slot leaked, this would hang rather than resolve.
  assert.equal(await run(async () => 'through'), 'through');
});

// ── budget ─────────────────────────────────────────────────────────────────

test('createBudget throws once the daily limit is reached', () => {
  const b = createBudget({ limit: 2, label: 'test' });
  b.consume();
  b.consume();
  assert.throws(() => b.consume(), (e) => e.budgetExceeded === true && e.status === 429);
  assert.equal(b.used, 2);
});

test('createBudget with limit 0 is unlimited', () => {
  const b = createBudget({ limit: 0, label: 'test' });
  for (let i = 0; i < 50; i++) b.consume();
  assert.equal(b.used, 50);
});
