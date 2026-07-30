// Error reporting.
//
// Off unless SENTRY_DSN is set — same shape as DEEPGRAM_API_KEY and the LLM
// adapters, so a deployment without it behaves exactly as before rather than
// failing at boot.
//
// ── Why the scrubbing below is not optional ──────────────────────────────────
// This backend serves Chorus, which stores memories about a named deceased
// person: free-text stories, a contributor's recorded voice, and a hashed IP.
// The subject cannot consent, and the contributors have no account. Sending
// that to a third party by accident would be a worse failure than the crash it
// was trying to report. So: an allow-list of request metadata, bodies never
// attached, and headers dropped.
const HAS_DSN = Boolean(process.env.SENTRY_DSN);

let Sentry = null;

// Query-string keys that must never leave the process.
const SENSITIVE = /pass|secret|token|key|auth|cookie|session|email|ip/i;

// Substring matching alone is not enough, because the two most dangerous
// parameters in this codebase are single letters:
//   ?k=  the Chorus curator key   (routes/memorial.js — authorizes hiding or
//        removing any memory, and is deliberately withheld from every public
//        read path)
//   ?t=  a contributor's token    (identity for an account-free writer)
// Both would sail past /token|key/. Short, opaque parameter names are exactly
// the ones a generic regex misses, so they are named explicitly.
const SENSITIVE_EXACT = new Set(['k', 't', 'key', 'token', 'code', 'secret']);

function isSensitiveKey(key) {
  return SENSITIVE_EXACT.has(key.toLowerCase()) || SENSITIVE.test(key);
}

function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const params = new URLSearchParams(url.slice(qIndex + 1));
  for (const key of [...params.keys()]) {
    if (isSensitiveKey(key)) params.set(key, '[redacted]');
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * The redaction pass. Exported and used verbatim as Sentry's `beforeSend`, so
 * observability.test.js exercises the real thing — a test that reimplemented
 * this would keep passing while the real path drifted, which for a redaction
 * rule is the one failure that matters.
 */
function redactEvent(event) {
  if (event.request) {
    // Bodies are never attached anywhere; drop them if an integration adds one
    // regardless.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  // Chorus is the most sensitive surface in the platform. Report that an error
  // happened and where, never what was being written.
  if (event.request?.url && /\/api\/memorial\b/.test(event.request.url)) {
    event.request = { url: scrubUrl(event.request.url), method: event.request.method };
    event.extra = { note: 'memorial request context withheld' };
  }
  // A user id is a random 8-char string, not PII on its own, and it is what
  // makes "one user hit this 40 times" distinguishable from "40 users did".
  // No email, no name, no IP.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  return event;
}

function init() {
  if (!HAS_DSN) {
    console.log('ℹ️  Error reporting disabled (SENTRY_DSN not set)');
    return null;
  }

  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Set to the deploy's commit so an error can be tied to a release. Render
    // exposes RENDER_GIT_COMMIT automatically.
    release: process.env.RENDER_GIT_COMMIT || undefined,

    // No performance traces. They sample real request URLs and add volume for
    // information the Mongo/Render dashboards already give us.
    tracesSampleRate: 0,

    // The three defaults that would otherwise ship user data.
    sendDefaultPii: false,
    maxValueLength: 2000,
    integrations: (defaults) =>
      // The HTTP integration records incoming request data including query
      // strings and headers. We build our own minimal context in
      // errorHandler.js instead.
      defaults.filter((i) => i.name !== 'Http' && i.name !== 'Express'),

    beforeSend: redactEvent,
  });

  console.log('✅ Error reporting enabled');
  return Sentry;
}

/**
 * Reporter for middleware/errorHandler.js#setReporter. Context is an
 * allow-list built by the caller — never the raw request.
 */
function report(err, context = {}) {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag('request_id', context.requestId);
    if (context.instanceId) scope.setTag('instance_id', context.instanceId);
    if (context.method) scope.setTag('http_method', context.method);
    if (context.path) scope.setContext('request', { method: context.method, path: context.path });
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(err);
  });
}

/** Flush pending events during shutdown, so a crash-time error is not lost. */
async function flush(timeoutMs = 2000) {
  if (!Sentry) return;
  try { await Sentry.flush(timeoutMs); } catch { /* nothing useful to do */ }
}

module.exports = { init, report, flush, enabled: HAS_DSN, scrubUrl, redactEvent };
