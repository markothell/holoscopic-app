// What must never leave the process.
//
// This backend serves Chorus: free-text memories about a named deceased person,
// a contributor's recorded voice, and a hashed IP — from people with no account
// who never agreed to a vendor. Reporting a crash must not become a way to
// export that. These tests assert on the redaction path directly rather than
// trusting the SDK's defaults.
const test = require('node:test');
const assert = require('node:assert');

const { scrubUrl, report, enabled, redactEvent } = require('./observability');

// ── URL scrubbing ──────────────────────────────────────────────────────────

test('scrubUrl leaves a plain path alone', () => {
  assert.equal(scrubUrl('/api/topics'), '/api/topics');
});

test('scrubUrl redacts sensitive query keys and keeps the rest', () => {
  const out = scrubUrl('/api/memorial/curate?k=super-secret-curator-key&sort=newest');
  assert.ok(!out.includes('super-secret-curator-key'), 'the curator key authorizes moderation');
  assert.ok(out.includes('sort=newest'), 'harmless params stay for debuggability');
});

test('scrubUrl redacts tokens, passwords and email addresses', () => {
  for (const [q, secret] of [
    ['t=abc.def.ghi', 'abc.def.ghi'],
    ['password=hunter2', 'hunter2'],
    ['email=someone@example.com', 'someone@example.com'],
    ['sessionToken=xyz', 'xyz'],
    ['apiKey=sk-123', 'sk-123'],
  ]) {
    const out = scrubUrl(`/api/thing?${q}`);
    assert.ok(!out.includes(secret), `${q} must be redacted`);
  }
});

test('scrubUrl tolerates non-string input', () => {
  assert.equal(scrubUrl(undefined), undefined);
  assert.equal(scrubUrl(null), null);
});

// ── redaction (the real beforeSend) ────────────────────────────────────────
// redactEvent is exactly what Sentry is configured with, so these exercise the
// shipped path rather than a copy of it.
const beforeSendUnderTest = redactEvent;

test('beforeSend strips request bodies, cookies and headers', () => {
  const out = beforeSendUnderTest({
    request: {
      url: '/api/activities',
      method: 'POST',
      data: { text: 'a private opinion', userId: 'u1' },
      cookies: { 'next-auth.session-token': 'secret' },
      headers: { authorization: 'Bearer secret' },
    },
  });
  assert.equal(out.request.data, undefined);
  assert.equal(out.request.cookies, undefined);
  assert.equal(out.request.headers, undefined);
  assert.equal(out.request.url, '/api/activities', 'the path itself is useful and safe');
});

test('beforeSend withholds all memorial context', () => {
  const out = beforeSendUnderTest({
    request: {
      url: '/api/memorial/memories?t=contributor-token',
      method: 'POST',
      data: { title: 'The day she taught me to swim', sharerName: 'Anna' },
    },
    extra: { audioUrl: 'https://x.public.blob.vercel-storage.com/voice.webm' },
  });
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes('taught me to swim'), 'memory text must never leave');
  assert.ok(!serialized.includes('Anna'), 'contributor names must never leave');
  assert.ok(!serialized.includes('voice.webm'), 'audio URLs must never leave');
  assert.ok(!serialized.includes('contributor-token'), 'the token must be redacted');
  assert.equal(out.request.method, 'POST', 'method is still reported');
});

test('beforeSend reduces user context to an opaque id', () => {
  const out = beforeSendUnderTest({
    user: { id: 'upt866fb', email: 'mark@example.com', username: 'Mo', ip_address: '1.2.3.4' },
  });
  assert.deepEqual(out.user, { id: 'upt866fb' });
});

test('beforeSend drops user context entirely when there is no id', () => {
  const out = beforeSendUnderTest({ user: { email: 'mark@example.com' } });
  assert.equal(out.user, undefined);
});

// ── disabled by default ────────────────────────────────────────────────────

test('report is a safe no-op when no DSN is configured', () => {
  assert.equal(enabled, false, 'no DSN in the test environment');
  assert.doesNotThrow(() => report(new Error('boom'), { requestId: 'abc' }));
});
