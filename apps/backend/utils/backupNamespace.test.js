const test = require('node:test');
const assert = require('node:assert/strict');

const ns = require('./backupNamespace');

// These tests are about which folder production's only off-site copy lands in.
// Both directions of getting it wrong are silent, so both are covered.

const PROD = 'mongodb+srv://u:p@live.ofmfipp.mongodb.net/holoscopic-db?retryWrites=true';
const DEV = 'mongodb+srv://u:p@cluster0.38i5zna.mongodb.net/holoscopic-db?retryWrites=true';

test('hostOf: pulls the host out of a mongodb+srv URI', () => {
  assert.equal(ns.hostOf(PROD), 'live.ofmfipp.mongodb.net');
  assert.equal(ns.hostOf(DEV), 'cluster0.38i5zna.mongodb.net');
  assert.equal(ns.hostOf(''), '');
  assert.equal(ns.hostOf(undefined), '');
});

test('the production cluster gets the production prefixes', () => {
  const r = ns.resolve({ uri: PROD, env: { NODE_ENV: 'production' } });
  assert.equal(r.isProduction, true);
  assert.equal(r.mongoPrefix, 'mongo');
  assert.equal(r.blobPrefix, 'blob');
});

test('any other cluster is forced to dev prefixes, whatever the env says', () => {
  // The case that mattered: a rebuilt .env.local with no prefix lines at all.
  // Previously this wrote straight into production's folder.
  const r = ns.resolve({ uri: DEV, env: {} });
  assert.equal(r.isProduction, false);
  assert.equal(r.mongoPrefix, 'mongo-dev');
  assert.equal(r.blobPrefix, 'blob-dev');
  assert.ok(r.notes.some(n => /forcing dev prefixes/.test(n)));
});

test('a dev run cannot reach production even by setting the variables', () => {
  const r = ns.resolve({ uri: DEV, env: { BACKUP_PREFIX: 'mongo', BACKUP_BLOB_PREFIX: 'blob' } });
  assert.equal(r.mongoPrefix, 'mongo-dev');
  assert.equal(r.blobPrefix, 'blob-dev');
});

test('already-suffixed dev prefixes are left alone rather than doubled', () => {
  const r = ns.resolve({ uri: DEV, env: { BACKUP_PREFIX: 'mongo-dev', BACKUP_BLOB_PREFIX: 'blob-dev' } });
  assert.equal(r.mongoPrefix, 'mongo-dev');
  assert.equal(r.blobPrefix, 'blob-dev');
  assert.equal(r.notes.length, 0);
});

test('a stray -dev on the production cluster is stripped, loudly', () => {
  // Silent data loss on a timer: the dev lifecycle rule expires mongo-dev/ at
  // 7 days, so production's only off-site copy would vanish weekly while every
  // run reported success.
  const r = ns.resolve({
    uri: PROD,
    env: { NODE_ENV: 'production', BACKUP_PREFIX: 'mongo-dev', BACKUP_BLOB_PREFIX: 'blob-dev' },
  });
  assert.equal(r.mongoPrefix, 'mongo');
  assert.equal(r.blobPrefix, 'blob');
  assert.equal(r.notes.length, 2);
  assert.ok(r.notes.every(n => /ignored/.test(n)));
});

test('NODE_ENV=production against an unrecognised host refuses to run', () => {
  // A cluster migration must break the backup loudly — the heartbeat then
  // reports it — rather than quietly filing production under a dev prefix.
  assert.throws(
    () => ns.resolve({ uri: DEV, env: { NODE_ENV: 'production' } }),
    /refusing to run/,
  );
  assert.throws(
    () => ns.resolve({ uri: '', env: { NODE_ENV: 'production' } }),
    /refusing to run/,
  );
});

test('a moved production cluster is handled by naming it, not by guessing', () => {
  const moved = 'mongodb+srv://u:p@live2.abcdef.mongodb.net/holoscopic-db';
  assert.throws(() => ns.resolve({ uri: moved, env: { NODE_ENV: 'production' } }), /refusing to run/);
  const r = ns.resolve({
    uri: moved,
    env: { NODE_ENV: 'production', BACKUP_PRODUCTION_HOST: 'live2.abcdef' },
  });
  assert.equal(r.isProduction, true);
  assert.equal(r.mongoPrefix, 'mongo');
});

test('apply(): writes the decision into the environment blobMirror reads', () => {
  const env = { NODE_ENV: 'production' };
  const lines = [];
  ns.apply({ uri: PROD, env, log: l => lines.push(l) });
  assert.equal(env.BACKUP_PREFIX, 'mongo');
  assert.equal(env.BACKUP_BLOB_PREFIX, 'blob');
  assert.ok(lines[0].includes('PRODUCTION'));

  const devEnv = {};
  ns.apply({ uri: DEV, env: devEnv, log: () => {} });
  assert.equal(devEnv.BACKUP_PREFIX, 'mongo-dev');
  assert.equal(devEnv.BACKUP_BLOB_PREFIX, 'blob-dev');
});
