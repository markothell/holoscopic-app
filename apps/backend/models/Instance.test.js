// Instance#toPublicJSON is the boundary between the instance document and the
// anonymous internet. GET /api/instances/current is fetched on load by every
// frontend — including Chorus, which has no accounts at all — so anything this
// method returns is public by definition.
//
// These tests assert on ABSENCE rather than on the exact returned shape. That
// is deliberate: the failure being guarded against is someone adding a secret
// to Instance.config later and it silently riding along.
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const Instance = require('./Instance');

function build(overrides = {}) {
  return new Instance({
    id: 'inst1',
    name: 'Test Instance',
    slug: 'test-instance',
    domains: ['test.holoscopic.io'],
    access: { mode: 'invite', inviteCodes: ['SECRET-CODE-1', 'SECRET-CODE-2'] },
    config: {
      memorial: { curatorKey: 'super-secret-curator-key', accent: '#C83B50' },
    },
    ...overrides,
  });
}

// Recursive search so a secret nested anywhere in the payload is caught, not
// just one at the top level.
function findValue(obj, needle, path = '$') {
  if (obj === needle) return path;
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const hit = findValue(v, needle, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function findKey(obj, key, path = '$') {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) return `${path}.${k}`;
      const hit = findKey(v, key, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

test('toPublicJSON never exposes the memorial curatorKey', () => {
  const pub = build().toPublicJSON();
  assert.equal(
    findValue(pub, 'super-secret-curator-key'),
    null,
    'curatorKey authorizes hiding/removing any Chorus memory'
  );
  assert.equal(findKey(pub, 'curatorKey'), null, 'the key itself must not appear');
});

test('toPublicJSON never exposes access.inviteCodes', () => {
  const pub = build().toPublicJSON();
  assert.equal(findValue(pub, 'SECRET-CODE-1'), null);
  assert.equal(findKey(pub, 'inviteCodes'), null);
});

test('toPublicJSON still reports the access mode', () => {
  const pub = build().toPublicJSON();
  assert.equal(pub.access.mode, 'invite', 'clients need to know an instance is gated');
});

test('toPublicJSON survives an instance with no config at all', () => {
  const bare = new Instance({ id: 'i2', name: 'Bare', slug: 'bare' });
  assert.doesNotThrow(() => bare.toPublicJSON());
});

test('toPublicJSON keeps the fields the frontends actually read', () => {
  const pub = build().toPublicJSON();
  for (const field of ['id', 'name', 'slug', 'active']) {
    assert.ok(field in pub, `frontends read ${field}`);
  }
  assert.equal(pub.config.memorial.accent, '#C83B50', 'public memorial theming');
});

// The regression that matters most: an allow-list stays safe when someone adds
// a field to the schema; a delete-list does not. This proves it is the former.
test('an unknown config field added later does NOT leak through', () => {
  const inst = build();
  inst.config.memorial.curatorKey = 'k';
  // Simulate a future secret being attached to the document.
  inst.set('config.someFutureSecret', 'oops-a-new-secret');
  const pub = inst.toPublicJSON();
  assert.equal(
    findValue(pub, 'oops-a-new-secret'),
    null,
    'toPublicJSON must be an allow-list, not a delete-list'
  );
});

test.after(() => mongoose.connection.close());
