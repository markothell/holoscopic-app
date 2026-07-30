// The auth boundary. Every test here corresponds to a hole that was open in
// production, so a failure means that hole is back.
//
// The secret must be set before verifyUser.js is required — it reads
// process.env once at module load.
process.env.GAME_TOKEN_SECRET = 'test-secret-for-auth-boundary';

const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const Module = require('node:module');

const SECRET = process.env.GAME_TOKEN_SECRET;

// --- requireAdmin needs a User model; inject a stub through the require cache
// before the middleware is loaded, so these stay pure unit tests with no DB.
const userStub = { doc: null };
const userPath = require.resolve('../models/User');
require.cache[userPath] = {
  id: userPath,
  filename: userPath,
  loaded: true,
  exports: { findOne: async () => userStub.doc },
};

const {
  attachVerifiedUser,
  requireSelf,
  requireVerified,
  verifyToken,
  isAuthConfigured,
} = require('./verifyUser');
const requireAdmin = require('./requireAdmin');

function mkRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function run(mw, req) {
  const res = mkRes();
  let nexted = false;
  const done = mw(req, res, () => { nexted = true; });
  const settle = () => ({ nexted, status: res.statusCode, body: res.body });
  return done && typeof done.then === 'function' ? done.then(settle) : settle();
}

const sign = (payload, opts = {}) =>
  jwt.sign({ iat: Math.floor(Date.now() / 1000), ...payload }, SECRET, opts);

// ---------------------------------------------------------------- verifyToken

test('verifyToken rejects tokens signed with the wrong key', () => {
  const forged = jwt.sign({ sub: 'attacker' }, 'not-the-secret');
  assert.equal(verifyToken(forged), null);
});

test('verifyToken rejects expired tokens', () => {
  const stale = jwt.sign(
    { sub: 'u1', iat: 1000, exp: 2000 }, // long past
    SECRET
  );
  assert.equal(verifyToken(stale), null);
});

test('verifyToken rejects garbage and empty input', () => {
  assert.equal(verifyToken('not.a.jwt'), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(null), null);
});

test('verifyToken accepts a well-formed token', () => {
  const payload = verifyToken(sign({ sub: 'u1' }, { expiresIn: '5m' }));
  assert.equal(payload.sub, 'u1');
});

test('isAuthConfigured is true when a secret is present', () => {
  assert.equal(isAuthConfigured(), true);
});

// --------------------------------------------------------- attachVerifiedUser

test('attachVerifiedUser ignores an unsigned Authorization header', async () => {
  const req = { headers: { authorization: 'Bearer ' + jwt.sign({ sub: 'x' }, 'wrong') } };
  await run(attachVerifiedUser, req);
  assert.equal(req.authedUserId, undefined);
});

test('attachVerifiedUser never rejects on its own — enforcement decides', async () => {
  const req = { headers: {} };
  const r = await run(attachVerifiedUser, req);
  assert.equal(r.nexted, true);
  assert.equal(req.authedUserId, undefined);
});

test('attachVerifiedUser exposes role as advisory only', async () => {
  const req = { headers: { authorization: `Bearer ${sign({ sub: 'u1', role: 'admin' }, { expiresIn: '5m' })}` } };
  await run(attachVerifiedUser, req);
  assert.equal(req.authedUserId, 'u1');
  assert.equal(req.authedRole, 'admin');
});

// ------------------------------------------------------------------ requireSelf
// PUT /auth/user/:id and PUT /users/:userId/settings identify their subject by
// path param. enforceVerifiedUser cannot see that, so it waved them through and
// they were writable by anyone.

test('requireSelf blocks an anonymous caller', async () => {
  const r = await run(requireSelf('id'), { params: { id: 'victim' }, headers: {} });
  assert.equal(r.status, 401);
  assert.equal(r.nexted, false);
});

test('requireSelf blocks a signed-in user targeting someone else', async () => {
  const r = await run(requireSelf('id'), {
    params: { id: 'victim' },
    authedUserId: 'attacker',
    headers: {},
  });
  assert.equal(r.status, 403);
  assert.equal(r.nexted, false);
});

test('requireSelf allows a user editing their own record', async () => {
  const r = await run(requireSelf('id'), {
    params: { id: 'u1' },
    authedUserId: 'u1',
    headers: {},
  });
  assert.equal(r.nexted, true);
});

test('requireSelf honours a custom param name', async () => {
  const r = await run(requireSelf('userId'), {
    params: { userId: 'u1' },
    authedUserId: 'u1',
    headers: {},
  });
  assert.equal(r.nexted, true);
});

// -------------------------------------------------------------- requireVerified

test('requireVerified rejects anonymous callers', async () => {
  const r = await run(requireVerified, { headers: {} });
  assert.equal(r.status, 401);
});

test('requireVerified admits any signed-in caller', async () => {
  const r = await run(requireVerified, { authedUserId: 'u1', headers: {} });
  assert.equal(r.nexted, true);
});

// ----------------------------------------------------------------- requireAdmin
// The header used to BE the credential: anyone who learned an admin's 8-char
// id had full admin.

test('requireAdmin ignores a bare x-user-id header', async () => {
  userStub.doc = { id: 'admin1', role: 'admin', isActive: true };
  const r = await run(requireAdmin, { headers: { 'x-user-id': 'admin1' } });
  assert.equal(r.status, 401, 'a header alone must never authorize');
  assert.equal(r.nexted, false);
});

test('requireAdmin rejects a verified NON-admin', async () => {
  userStub.doc = { id: 'u1', role: 'user', isActive: true };
  const r = await run(requireAdmin, { authedUserId: 'u1', headers: {} });
  assert.equal(r.status, 403);
});

test('requireAdmin rejects a disabled admin immediately, not at token expiry', async () => {
  userStub.doc = { id: 'admin1', role: 'admin', isActive: false };
  const r = await run(requireAdmin, { authedUserId: 'admin1', headers: {} });
  assert.equal(r.status, 403);
});

test('requireAdmin rejects a token whose subject no longer exists', async () => {
  userStub.doc = null;
  const r = await run(requireAdmin, { authedUserId: 'ghost', headers: {} });
  assert.equal(r.status, 403);
});

test('requireAdmin admits a verified, active admin', async () => {
  userStub.doc = { id: 'admin1', role: 'admin', isActive: true };
  const req = { authedUserId: 'admin1', headers: {} };
  const r = await run(requireAdmin, req);
  assert.equal(r.nexted, true);
  assert.equal(req.adminUser.id, 'admin1');
});

test('requireAdmin overwrites a spoofed x-user-id with the proven id', async () => {
  userStub.doc = { id: 'admin1', role: 'admin', isActive: true };
  const req = { authedUserId: 'admin1', headers: { 'x-user-id': 'someone-else' } };
  await run(requireAdmin, req);
  assert.equal(
    req.headers['x-user-id'],
    'admin1',
    'downstream handlers read this header; it must be the proven value'
  );
});

// A role claim inside a token is up to 15 minutes stale. It must never be
// sufficient on its own — the User row is what authorizes.
test('requireAdmin does not trust a role claim in the token', async () => {
  userStub.doc = { id: 'u1', role: 'user', isActive: true };
  const r = await run(requireAdmin, {
    authedUserId: 'u1',
    authedRole: 'admin',
    headers: {},
  });
  assert.equal(r.status, 403, 'the DB row decides, not the claim');
});
