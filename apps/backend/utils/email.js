// The one place this platform sends mail.
//
// Two kinds of message leave here and they differ in who they are for:
//
//   operator mail   — utils/alerts.js, and the contact/capture notices. Tells a
//                     person who can act that something happened.
//   transactional   — password reset. Tells a user something they just asked
//                     for, and is useless if it is slow or lands in spam.
//
// Both are one HTTP call to Resend. Only the operator side needs throttling, so
// that stays in alerts.js and this file stays deliberately dumb: no SDK, no
// queue, no retry, no templates. There is nothing here to get out of date.
//
// It never throws and never rejects. A send is always a side effect of
// something else having already succeeded — a contact message that is saved, a
// reset token that is stored — and it must not become a second failure on that
// request's path. Callers get a status back and can log what actually happened
// instead of assuming delivery.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// The default envelope sender for transactional mail. Operator alerts override
// it with ALERT_FROM so a broken deploy is filterable from a password reset.
//
// THE SENDING DOMAIN IS THE SUBDOMAIN, not the apex. `notifications.holoscopic.io`
// carries the verified SPF/DKIM records; `holoscopic.io` itself is not a verified
// sender, and Resend rejects it outright with a 403 naming the domain. That
// separation is the good arrangement — mail volume cannot damage the apex
// domain's reputation — but it means every From address here sits under the
// subdomain, and an apex address is a send that never happens.
//
// Check what a key can actually send as: GET https://api.resend.com/domains.
// Guessing fails at send time, not at deploy time.
const MAIL_FROM = process.env.MAIL_FROM || 'Holoscopic <noreply@notifications.holoscopic.io>';

/** `ready` when a send can actually leave this process. */
function readiness() {
  return RESEND_API_KEY ? 'ready' : 'no-api-key';
}

/**
 * The site a link in an email should point at.
 *
 * Falls back to the first entry of CLIENT_URL rather than carrying a hand-set
 * copy of our own address, for the same reason render.yaml derives the Deepgram
 * callback from RENDER_EXTERNAL_URL: a value that exists in two places drifts,
 * and the failure mode here is a reset link pointing at the wrong host, which
 * nobody discovers until a locked-out user reports it.
 *
 * CLIENT_URL is an ordered, comma-separated CORS list, so the first entry is
 * the home origin. Set APP_URL explicitly if that ever stops being true.
 */
function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const first = (process.env.CLIENT_URL || '').split(',')[0].trim();
  return (first || 'http://localhost:4003').replace(/\/$/, '');
}

/**
 * Send one message. Returns what it decided:
 *   'sent' | 'failed' | 'unconfigured' | 'no-recipient'
 *
 * `text` only — no HTML. Every message this platform sends is a sentence and a
 * link, and a plain-text body cannot render wrong, cannot leak a tracking
 * pixel, and cannot be the reason a reset link is unclickable in someone's
 * mail client.
 */
async function sendEmail({ to, subject, text, from, replyTo }) {
  if (!RESEND_API_KEY) return 'unconfigured';
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return 'no-recipient';

  try {
    const payload = {
      from: from || MAIL_FROM,
      to: recipients,
      subject,
      text,
    };
    // Set on contact mail so hitting reply in your client answers the person
    // who wrote in, rather than the noreply box.
    if (replyTo) payload.reply_to = replyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // The body carries Resend's reason (unverified domain, bad key). Bounded
      // because it is attacker-influenced only via the address, but logs are
      // still not a place to paste an arbitrary upstream response.
      console.error('[email] send failed', res.status, (await res.text()).slice(0, 200));
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('[email] send threw', err.message);
    return 'failed';
  }
}

module.exports = { sendEmail, readiness, appUrl };
