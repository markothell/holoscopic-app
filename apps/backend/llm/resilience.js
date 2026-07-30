// Timeouts, retries, concurrency caps and a spend ceiling for outbound vendor
// calls (Anthropic, Voyage, Deepgram).
//
// None of those calls had any of this. Concretely, what that cost:
//   - No timeout at all, so a vendor that accepts a connection and then stalls
//     pins a Node socket indefinitely. Nothing ever fails; requests just
//     accumulate.
//   - No retry, so a single 429 silently dropped a node from the search index
//     forever — the indexing path is fire-and-forget with a .catch that logs.
//   - No concurrency cap, so 100 simultaneous publishes meant 100 simultaneous
//     embedding requests.
//   - No spend ceiling, so a loop in a client (or an enthusiastic user) could
//     run up an unbounded bill with no upper bound anywhere in the system.
//
// Deliberately dependency-free and process-local. A shared cross-process
// budget would need Redis, which this deployment does not have; a per-process
// ceiling on one Render instance is the whole fleet today, and the startup
// assertion for >1 instance is tracked separately.

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;

/** Combine abort signals; the earliest abort wins. */
function anySignal(signals) {
  const present = signals.filter(Boolean);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present);
  const ac = new AbortController();
  for (const s of present) {
    if (s.aborted) { ac.abort(s.reason); break; }
    s.addEventListener('abort', () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

/**
 * fetch with a deadline.
 *
 * `streaming: true` makes the timeout a time-to-first-byte deadline rather than
 * a whole-request one: the timer is cleared as soon as response headers arrive,
 * so a legitimately long token stream is not cut off mid-answer. A
 * whole-request timeout is correct for embeddings, and wrong for chat.
 */
async function fetchWithTimeout(url, init = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, streaming = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: anySignal([ac.signal, init.signal]),
    });
    if (streaming) clearTimeout(timer);
    return res;
  } finally {
    if (!streaming) clearTimeout(timer);
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function retryAfterMs(res) {
  const raw = res && res.headers && res.headers.get('retry-after');
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 20_000);
  const when = Date.parse(raw);
  return Number.isFinite(when) ? Math.max(0, Math.min(when - Date.now(), 20_000)) : null;
}

/**
 * Retry with exponential backoff and jitter.
 *
 * `fn` receives the attempt number and must return a Response. Retries on the
 * status codes above and on network errors, never on a caller-initiated abort —
 * if the client hung up, retrying is pure waste.
 */
async function withRetry(fn, { retries = DEFAULT_RETRIES, label = 'request', signal } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new Error(`${label} aborted`);
    try {
      const res = await fn(attempt);
      if (res && res.ok) return res;
      if (!res || !RETRYABLE_STATUS.has(res.status) || attempt === retries) return res;
      const wait = retryAfterMs(res) ?? backoff(attempt);
      console.warn(`[llm] ${label} ${res.status} — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      // Drain the body so the socket is released before sleeping.
      await res.text().catch(() => {});
      await sleep(wait, signal);
    } catch (err) {
      // A caller abort is a decision, not a failure to retry through.
      if (err && (err.name === 'AbortError') && signal && signal.aborted) throw err;
      lastErr = err;
      if (attempt === retries) throw err;
      const wait = backoff(attempt);
      console.warn(`[llm] ${label} failed (${err.message}) — retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
      await sleep(wait, signal);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

function backoff(attempt) {
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return Math.round(base * (0.5 + Math.random() / 2)); // full-ish jitter
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
    }
  });
}

/**
 * Bound how many of something run at once. Queued callers wait in FIFO order
 * rather than being rejected — the point is to protect the vendor and the event
 * loop, not to shed load.
 */
function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => { active--; next(); });
  };
  return function run(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

/**
 * A daily call ceiling, so a runaway loop cannot produce an unbounded bill.
 *
 * Counts calls, not tokens: tokens are only known after the fact (and not at
 * all for a stream that is still running), whereas a call count is a hard
 * pre-check. Crude, but it is the difference between a capped and an uncapped
 * invoice. Resets on a UTC day boundary and on process restart.
 */
function createBudget({ limit, label }) {
  let day = new Date().toISOString().slice(0, 10);
  let used = 0;
  return {
    get used() { return used; },
    get limit() { return limit; },
    consume() {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) { day = today; used = 0; }
      if (limit > 0 && used >= limit) {
        const err = new Error(
          `Daily ${label} limit reached (${used}/${limit}). ` +
          `Raise it with the matching env var, or wait for the UTC day to roll over.`
        );
        err.status = 429;
        err.budgetExceeded = true;
        throw err;
      }
      used++;
    },
  };
}

module.exports = {
  fetchWithTimeout,
  withRetry,
  createSemaphore,
  createBudget,
  anySignal,
  DEFAULT_TIMEOUT_MS,
};
