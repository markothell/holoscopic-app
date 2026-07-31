// Operator alerts — the path by which a problem reaches a person.
//
// This exists for one shape of failure: the kind nobody will report. A memorial
// is often a single family for a single week, and a contributor who cannot post
// mostly closes the tab. The first live Chorus upload failure was found only
// because somebody happened to be holding the phone and said so.
//
// Deliberately small: one HTTP call to Resend, no SDK, no queue, no database.
// If it is unconfigured it degrades to the log line the caller already wrote,
// and /health reports which of those two worlds we are in.
//
// It is also deliberately quiet. A broken deploy makes every contributor fail
// at once, and an alert per failure would be a hundred emails describing one
// bug — which is indistinguishable from no alerting at all, because nobody
// reads the hundredth.

const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_FROM = process.env.ALERT_FROM || 'alerts@holoscopic.io';

// One alert per distinct problem per hour, and never more than this many in an
// hour whatever happens. Both are counted in memory: a restart resets them,
// which errs toward sending rather than staying silent.
const PER_KEY_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 12;

const lastSentByKey = new Map();
let windowStartedAt = 0;
let sentThisWindow = 0;

function readiness() {
  if (!RESEND_API_KEY) return 'no-api-key';
  if (!ALERT_EMAIL) return 'no-recipient';
  return 'ready';
}

/**
 * Send at most one alert per `key` per hour. Returns what it decided, so the
 * caller can log the outcome rather than assume delivery.
 *
 * Never throws and never rejects: an alert is a side effect of somebody else's
 * failure, and it must not become a second failure on the request path.
 */
async function alertOnce(key, subject, body) {
  if (readiness() !== 'ready') return 'unconfigured';

  const now = Date.now();
  if (now - windowStartedAt > 60 * 60 * 1000) {
    windowStartedAt = now;
    sentThisWindow = 0;
  }
  if (sentThisWindow >= MAX_PER_HOUR) return 'capped';

  const last = lastSentByKey.get(key) || 0;
  if (now - last < PER_KEY_COOLDOWN_MS) return 'cooling-down';
  lastSentByKey.set(key, now);
  sentThisWindow++;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [ALERT_EMAIL],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      console.error('[alerts] send failed', res.status, (await res.text()).slice(0, 200));
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[alerts] send threw', err.message);
    return 'failed';
  }
}

module.exports = { alertOnce, readiness };
