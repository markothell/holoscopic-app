const jwt = require('jsonwebtoken');

// Shared secret with the game frontend (which signs short-lived tokens from
// the NextAuth session via /api/auth/game-token). Falls back to NEXTAUTH_SECRET
// so a single shared env value works across both apps.
const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;
const isProduction = process.env.NODE_ENV === 'production';
let warnedNoSecret = false;

// Parse + verify the Authorization bearer token if present.
// Attaches req.authedUserId; never rejects on its own.
function attachVerifiedUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token && SECRET) {
    try {
      const payload = jwt.verify(token, SECRET);
      if (payload && payload.sub) req.authedUserId = String(payload.sub);
    } catch (_e) {
      // invalid/expired token — treated as absent; enforcement decides below
    }
  }
  next();
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Guard for user-identity routes: any write that claims a user identity
// (x-user-id header or body.userId) must prove it with a verified token.
// Bare x-user-id is never trusted for writes on guarded routers.
function enforceVerifiedUser(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const claimed = req.headers['x-user-id'] || (req.body && req.body.userId);
  if (!claimed) return next(); // identity-free request; route logic decides

  if (!SECRET) {
    if (isProduction) {
      console.error('[verifyUser] GAME_TOKEN_SECRET/NEXTAUTH_SECRET not set in production — rejecting identity-bearing write');
      return res.status(503).json({ error: 'Server auth not configured' });
    }
    if (!warnedNoSecret) {
      console.warn('⚠️  [verifyUser] No token secret set — accepting unverified x-user-id (dev only)');
      warnedNoSecret = true;
    }
    return next();
  }

  if (!req.authedUserId) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  if (String(claimed) !== req.authedUserId) {
    return res.status(401).json({ error: 'Identity mismatch' });
  }

  // Normalize both identity sources to the proven value
  req.headers['x-user-id'] = req.authedUserId;
  if (req.body && req.body.userId) req.body.userId = req.authedUserId;
  next();
}

module.exports = { attachVerifiedUser, enforceVerifiedUser };
