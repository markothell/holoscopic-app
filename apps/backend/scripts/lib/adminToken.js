// Mints a bearer token for scripts that call admin endpoints.
//
// Scripts used to send a bare `x-user-id` header, which stopped working when
// requireAdmin began requiring a verified token. This is not a backdoor: the
// credential is possession of GAME_TOKEN_SECRET, which lives in the same env
// file as MONGODB_URI. Anyone who can run this could already connect to the
// database directly.
const jwt = require('jsonwebtoken');

const SECRET = process.env.GAME_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || null;

/**
 * @param {string} userId  Must belong to a real user; requireAdmin still
 *                         checks role and isActive against the User row, so
 *                         a token for a non-admin gets a 403.
 * @param {object} [opts]  { role, expiresInSec }
 */
function mintToken(userId, opts = {}) {
  if (!SECRET) {
    throw new Error(
      'GAME_TOKEN_SECRET (or NEXTAUTH_SECRET) is not set — cannot mint a token. ' +
      'Check the .env file for this NODE_ENV.'
    );
  }
  if (!userId) throw new Error('mintToken requires a userId');

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresInSec = opts.expiresInSec ?? 15 * 60;
  const payload = { sub: String(userId), iat: nowSec, exp: nowSec + expiresInSec };
  if (opts.role) payload.role = opts.role;
  return jwt.sign(payload, SECRET);
}

/** Convenience: headers for a fetch() against an identity-bearing endpoint. */
function authHeaders(userId, opts = {}) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${mintToken(userId, opts)}`,
    'x-user-id': String(userId),
  };
}

module.exports = { mintToken, authHeaders };
