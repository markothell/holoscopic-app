const jwt = require('jsonwebtoken');

// Shared secret with the game frontend (which signs short-lived tokens from
// the NextAuth session via /api/auth/game-token). Falls back to NEXTAUTH_SECRET
// so a single shared env value works across both apps.
const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;
const isProduction = process.env.NODE_ENV === 'production';
let warnedNoSecret = false;

// Verify a raw token string. Returns the payload, or null if the token is
// absent, malformed, expired, or signed with the wrong key.
//
// Exported so the Socket.IO handshake (websocket-server.js) verifies
// identities exactly the same way HTTP does. Two implementations of "is this
// token real" is how a socket path quietly ends up trusting something the
// HTTP path rejects.
function verifyToken(token) {
  if (!token || !SECRET) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (_e) {
    return null;
  }
}

// Parse + verify the Authorization bearer token if present.
// Attaches req.authedUserId and req.authedRole; never rejects on its own.
function attachVerifiedUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (payload && payload.sub) {
    req.authedUserId = String(payload.sub);
    // Advisory only. requireAdmin still reads the User row — a role claim is
    // up to 15 minutes stale, so it must never be the thing that authorizes.
    if (payload.role) req.authedRole = String(payload.role);
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

// Single source of truth for "can this process verify identities at all?".
// Read by /health so the server reports unhealthy rather than accepting
// traffic it will 503 on (enforceVerifiedUser above).
function isAuthConfigured() {
  return Boolean(SECRET);
}

// Guard for routes that identify their subject by path param rather than by
// x-user-id / body.userId — enforceVerifiedUser cannot see those, so it waves
// them through. PUT /auth/user/:id was world-writable for exactly this reason.
function requireSelf(paramName = 'id') {
  return function (req, res, next) {
    if (!req.authedUserId) {
      return res.status(401).json({ error: 'Sign in required' });
    }
    if (String(req.params[paramName]) !== req.authedUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Bare "you must be signed in", with no claim about who. For read routes that
// should not be open to the anonymous internet.
function requireVerified(req, res, next) {
  if (!req.authedUserId) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  next();
}

// Single source of truth for "can this process verify identities at all?".
// Read by /health so the server reports unhealthy rather than accepting
// traffic it will 503 on (enforceVerifiedUser above).
function isAuthConfigured() {
  return Boolean(SECRET);
}

module.exports = {
  attachVerifiedUser,
  enforceVerifiedUser,
  requireSelf,
  requireVerified,
  verifyToken,
  isAuthConfigured,
};
