// The pure rules behind invitations. The flows themselves touch four
// collections and are exercised against the dev cluster, not here.

const test = require('node:test');
const assert = require('node:assert');
const invites = require('./invites');

test('an address is compared lowercased and trimmed', () => {
  assert.equal(invites.normalizeEmail('  Ma@Example.COM '), 'ma@example.com');
  assert.equal(invites.normalizeEmail(null), '');
});

test('the masked address keeps two letters and the domain, nothing else', () => {
  assert.equal(invites.maskEmail('marko@example.com'), 'ma•••@example.com');
  assert.equal(invites.maskEmail('not-an-address'), '');
});

test('the token hash is stable and is not the token', () => {
  const h = invites.hashToken('abc');
  assert.equal(h, invites.hashToken('abc'));
  assert.notEqual(h, 'abc');
  assert.equal(h.length, 64);
});

test('a Threshold circle opens in Threshold; every other activity in Circles', () => {
  assert.equal(invites.appForCircle({ activity: 'threshold' }), 'threshold');
  assert.equal(invites.appForCircle({ activity: 'gather' }), 'circles');
  assert.equal(invites.circlePath({ activity: 'threshold', urlName: 'x' }), '/t/x');
  assert.equal(invites.circlePath({ activity: 'gather', urlName: 'x' }), '/c/x');
});

test('a pending invitation past its date reads as expired; others keep their status', () => {
  const now = new Date('2026-09-15T00:00:00Z');
  const past = new Date('2026-09-14T00:00:00Z');
  const future = new Date('2026-10-15T00:00:00Z');
  assert.equal(invites.statusOf({ status: 'pending', expiresAt: past }, now), 'expired');
  assert.equal(invites.statusOf({ status: 'pending', expiresAt: future }, now), 'pending');
  assert.equal(invites.statusOf({ status: 'accepted', expiresAt: past }, now), 'accepted');
});
