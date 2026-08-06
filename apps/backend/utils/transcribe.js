const crypto = require('crypto');

// Deepgram transcription, generic over what is being transcribed.
//
// Extracted from utils/memorialTranscribe.js (2026-08-05) when Threshold became
// the second consumer. Only six lines of that file were ever Chorus-specific —
// where the audio URL lives on a document, the callback path, and two query
// params. Everything here was shared, including the HMAC that is the ONLY thing
// standing between a stranger and rewriting what somebody said. Copying that
// per app is how two forgery guards drift apart.
//
// The audio never passes through this server in either direction. The browser
// uploaded it straight to Vercel Blob; we hand Deepgram the public Blob URL and
// it fetches the bytes itself, then POSTs the transcript back to a callback we
// name. Render only ever moves URLs and text.
//
// FIRE-AND-FORGET by contract, like Synthesis's index hooks. Callers invoke this
// without awaiting or catching, so nothing here may be able to fail a write. A
// transcript is a nice-to-have — the audio already plays without it — and
// somebody's story must never be lost because a third-party API was down.
//
// With no DEEPGRAM_API_KEY the whole thing is a no-op and transcripts stay
// 'skipped'. That is the normal state in local dev and it is not an error.

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
// Enqueue-only deadline; the transcript itself returns via the callback.
const DEEPGRAM_TIMEOUT_MS = Number(process.env.DEEPGRAM_TIMEOUT_MS) || 15_000;

function apiKey() {
  return process.env.DEEPGRAM_API_KEY || '';
}

function callbackSecret() {
  return process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || '';
}

// The public base URL Deepgram will call back on. Localhost is unreachable
// from Deepgram's side, so in dev the enqueue is skipped rather than left to
// time out silently.
//
// DERIVED IN PRODUCTION, overridable everywhere. Render injects
// RENDER_EXTERNAL_URL for web services — the same mechanism observability.js
// already trusts for RENDER_GIT_COMMIT — so the deployment does not carry a
// hand-set copy of its own address. A hand-set copy is the kind of config that
// goes stale in silence: rename the service and jobs keep being enqueued
// against a callback nobody answers, transcripts simply stop arriving, and
// nothing anywhere reports a problem.
//
// PUBLIC_API_URL still wins when set, which is what dev needs (scripts/
// dev-tunnel.js writes a cloudflared URL there) and what any non-Render host
// would need.
//
// Deriving also fails in the SAFE direction: off Render with nothing set, this
// returns '' and requestTranscript skips the enqueue, leaving transcripts
// visibly 'skipped' rather than lost in flight.
function publicApiUrl() {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL;
  const external = process.env.RENDER_EXTERNAL_URL;
  // Routes are mounted under /api; the callback path is appended to this.
  return external ? `${external.replace(/\/+$/, '')}/api` : '';
}

// Whether a recording made right now would gain a transcript, and if not, why.
//
// Exists so /health can answer that question WITHOUT a recording to test with.
// Both ways this feature fails are invisible from outside — a missing key and
// an unreachable callback each leave the app working perfectly except that
// transcripts never appear — and the same reasoning already put
// `authConfigured` on /health.
//
//   'ready'            → enqueue will proceed
//   'no-api-key'       → DEEPGRAM_API_KEY unset (the normal local state)
//   'no-callback-url'  → nothing to call back on; enqueue is skipped
//   'no-secret'        → no signing secret, so a callback could be forged
//
// Never gate health on this. Transcription is optional by design: audio
// records and plays without it, and 503ing a service over a missing
// nice-to-have would take the whole platform down for it.
//
// One field covers every consumer: the key, the secret and the callback base
// are process-wide, so Chorus and Threshold are ready or not ready together.
function readiness() {
  if (!apiKey()) return 'no-api-key';
  if (!callbackSecret()) return 'no-secret';
  if (!publicApiUrl()) return 'no-callback-url';
  return 'ready';
}

// Signs the id so the callback can't be forged. Deepgram is not authenticated
// to us — anyone who learns the URL could POST a transcript — so this token is
// the only thing standing between a stranger and rewriting what somebody said.
//
// The input is stringified and nothing else is mixed in. That is deliberate and
// must not "improve": a token minted before this file existed has to keep
// verifying, because Deepgram callbacks arrive minutes after the enqueue and a
// deploy lands in between. Namespacing by app here would silently drop every
// transcript already in flight.
function callbackToken(id) {
  return crypto.createHmac('sha256', callbackSecret()).update(String(id)).digest('base64url');
}

function verifyCallbackToken(id, offered) {
  const secret = callbackSecret();
  if (!secret || !offered) return false;
  const expected = callbackToken(id);
  const a = Buffer.from(String(offered));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Pull the flat transcript out of Deepgram's response envelope. Defensive on
// every hop: a shape change upstream should yield an empty string we can mark
// 'failed', not a thrown error inside a webhook handler.
function extractTranscript(payload) {
  const alt = payload?.results?.channels?.[0]?.alternatives?.[0];
  return typeof alt?.transcript === 'string' ? alt.transcript.trim() : '';
}

/**
 * Ask Deepgram to transcribe one audio URL.
 *
 * Returns a small result object describing what happened, purely so tests and
 * logs can tell "not configured" from "failed" — no caller branches on it.
 *
 * @param {string} id            what the callback token signs, and what the
 *                               receiving route looks the record up by
 * @param {string} audioUrl      public URL Deepgram fetches the bytes from
 * @param {string} callbackPath  appended to the API base, e.g.
 *                               '/memorial/hooks/deepgram'
 * @param {object} params        query params for the callback, minus the token
 * @param {string} label         log prefix, so a failure names its caller
 */
async function requestTranscript({
  id,
  audioUrl,
  callbackPath,
  params = {},
  label = 'transcribe',
  fetchImpl = globalThis.fetch,
  markPending = null,
}) {
  if (!audioUrl) return { status: 'no-audio' };
  if (!apiKey()) return { status: 'not-configured' };
  if (!callbackSecret()) return { status: 'not-configured' };

  const base = publicApiUrl();
  if (!base) {
    // Deepgram can't reach a laptop. Rather than enqueue a job whose callback
    // will never arrive and leave the record stuck on 'pending' forever, do
    // nothing and leave it 'skipped'.
    return { status: 'no-callback-url' };
  }

  const callbackParams = new URLSearchParams({ ...params, t: callbackToken(id) });
  const callback = `${base.replace(/\/$/, '')}${callbackPath}?${callbackParams}`;

  const query = new URLSearchParams({
    model: 'nova-3',
    smart_format: 'true',
    punctuate: 'true',
    callback,
  });

  try {
    // A deadline, because this had none. Deepgram only has to accept the job
    // here (transcription itself is async and arrives by callback), so 15s is
    // generous — but without any timeout a stalled connection holds a socket
    // for the lifetime of the process.
    //
    // Applied via the signal rather than by wrapping fetchImpl, so an injected
    // test double keeps working unchanged.
    const res = await fetchImpl(`${DEEPGRAM_URL}?${query}`, {
      method: 'POST',
      signal: AbortSignal.timeout(DEEPGRAM_TIMEOUT_MS),
      headers: {
        Authorization: `Token ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    });
    if (!res.ok) {
      console.error(`[${label}] Deepgram rejected the job:`, res.status);
      return { status: 'rejected' };
    }
    if (markPending) await markPending();
    return { status: 'queued' };
  } catch (err) {
    console.error(`[${label}] Could not reach Deepgram:`, err.message);
    return { status: 'unreachable' };
  }
}

module.exports = {
  requestTranscript,
  readiness,
  callbackToken,
  verifyCallbackToken,
  extractTranscript,
  publicApiUrl,
  apiKey,
  callbackSecret,
};
