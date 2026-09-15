const User = require('../models/User');

// Records when an account last used each app, so the holoscopic.io dashboard
// can put the one you use first. Written at most once an hour per account and
// app, fire-and-forget: a missed write costs a slightly stale ordering, and a
// request must never wait on it.
//
// The app is the token's audience — which frontend minted it — not the
// instance, because the circles app and Threshold both run on the `threshold`
// instance. holoscopic.io mints `interview` tokens for its homepage and
// dashboard too, so that audience only counts on interView's own routers;
// otherwise opening the dashboard would rank interView as the app you use.

const WINDOW_MS = 60 * 60 * 1000;
const DIRECT = new Set(['circles', 'threshold', 'synthesis', 'spectrum']);
// Not /api/holons: the user menu reads the balance on every holoscopic.io page,
// so counting it would rank interView first for anyone who opens the site.
const INTERVIEW_PATHS = ['/api/activities', '/api/topics', '/api/algorithms', '/api/frames', '/api/frame-refs'];
const MAX_TRACKED = 50000;

const lastWrite = new Map();

function appFor(req) {
  const aud = req.authedAud;
  if (DIRECT.has(aud)) return aud;
  if (aud === 'interview') {
    const path = String(req.originalUrl || '').split('?')[0];
    if (INTERVIEW_PATHS.some(p => path === p || path.startsWith(`${p}/`))) return 'interview';
  }
  return null;
}

function touchLastUsed(req, _res, next) {
  const userId = req.authedUserId;
  const app = userId ? appFor(req) : null;
  if (app) {
    const key = `${userId}:${app}`;
    const now = Date.now();
    if (!(lastWrite.get(key) > now - WINDOW_MS)) {
      if (lastWrite.size >= MAX_TRACKED) lastWrite.clear();
      lastWrite.set(key, now);
      User.updateOne({ id: userId }, { $set: { [`lastUsed.${app}`]: new Date(now) } })
        .catch(err => console.error('[touchLastUsed]', err.message));
    }
  }
  next();
}

module.exports = { touchLastUsed, appFor };
