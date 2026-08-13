const express = require('express');
const router = express.Router();

const traffic = require('../utils/traffic');
const requireAdmin = require('../middleware/requireAdmin');

// Site traffic — the REST surface. Two endpoints with opposite postures:
// `/collect` is open to the whole internet because every visitor's browser
// calls it, and `/summary` is admin-only because traffic figures are business
// information.
//
// MOUNTED WITHOUT enforceVerifiedUser, like routes/memorial.js and for the
// same reason: the callers are anonymous readers, most of whom will never have
// an account. Its ceiling is the dedicated `trafficLimiter` bucket in
// websocket-server.js, not auth.
//
// Deliberately NOT folded into routes/analytics.js. That router is older and
// reports participation inside activities — how many people mapped, commented
// and voted. This one is web traffic. Sharing a file would put an
// admin-gated business report and an open firehose behind one mount and one
// rate-limit story.

// Hosts that count as "us", so a link between our own properties is recorded
// as an internal path rather than as an outbound link to a competitor of
// ourselves. Derived from CLIENT_URL, which already lists every origin this
// platform serves, so a new game domain needs no second place to remember.
function siteHosts() {
  return String(process.env.CLIENT_URL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(origin => { try { return new URL(origin).hostname; } catch { return ''; } })
    .filter(Boolean);
}

// ── Collect ─────────────────────────────────────────────────────────────────

router.post('/collect', (req, res) => {
  // Answered before any work, exactly like the Chorus failure beacon. A
  // visitor is waiting on this response inside their page's own network
  // budget; making them wait on two database writes so we can tell them
  // something they will never read is a bad trade. A 204 also gives a retry
  // loop nothing to chew on.
  res.status(204).end();

  const body = req.body || {};
  const at = new Date();

  // The visitor identity is computed HERE, from the connection, and never
  // accepted from the client. A browser-supplied hash would be a browser-
  // supplied identity: trivially forgeable, trivially shareable, and worthless
  // as a count.
  const visitorHash = traffic.visitorHashFor({
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    at,
  });

  void traffic.record({
    app: body.app,
    type: body.type,
    path: body.path,
    target: body.target,
    label: body.label,
    // The client-sent field, and DELIBERATELY NOT `req.headers.referer`.
    //
    // That header looked like the trustworthy choice and was the wrong one: it
    // describes the request in hand, and this request is a fetch made by the
    // page itself, so it always carried the page's own origin. Every referrer
    // host recorded before 2026-08-13 is therefore the site the visitor was
    // already on, and answers nothing. `Beacon#entryReferrer` reads
    // `document.referrer` — the only place the real answer exists — and sends
    // it on the entry view alone.
    referrer: body.referrer || '',
    // Present only where a page belongs to one tenant — a Chorus memorial.
    // resolveInstance's fallback is deliberately NOT used: it never fails, so
    // an unrecognised header would silently attribute a memorial's traffic to
    // the default interView edition (see root CLAUDE.md).
    instanceId: body.instanceId,
    slug: body.slug,
    visitorHash,
    siteHosts: siteHosts(),
  }).catch(err => {
    // Analytics failing must never be visible to a reader, and must never be
    // invisible to us. One line, no alert: a beacon that cannot write is worth
    // knowing about, and is not worth waking anybody up for.
    console.error('[traffic:collect]', err.message);
  });
});

// ── Report ──────────────────────────────────────────────────────────────────

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await traffic.summary({
      from: from ? String(from).slice(0, 10) : undefined,
      to: to ? String(to).slice(0, 10) : undefined,
    });
    res.json({ traffic: data });
  } catch (error) {
    console.error('[traffic:summary]', error.message);
    res.status(500).json({ error: 'Failed to read traffic' });
  }
});

module.exports = router;
