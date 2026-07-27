const { test } = require('node:test');
const assert = require('node:assert/strict');

const communities = require('./unisonCommunities');

// In-memory store implementing the funnel's data-access surface — same
// pattern as utils/unisonNodes.test.js's memStore. Lets us exercise the
// REAL funnel functions (lazy parent creation, code generation, the ≤50-
// member gate, handle uniqueness) with no live MongoDB.
function memStore() {
  const instances = new Map(); // slug -> doc
  const memberships = [];
  return {
    _instances: instances,
    _memberships: memberships,
    async findInstanceBySlug(slug) { return instances.get(slug) || null; },
    async createInstance(fields) {
      const doc = { ...fields, createdAt: new Date(), updatedAt: new Date() };
      instances.set(doc.slug, doc);
      return doc;
    },
    async countMembers(instanceId) {
      return memberships.filter(m => m.instanceId === instanceId).length;
    },
    async findMembership(instanceId, userId) {
      return memberships.find(m => m.instanceId === instanceId && m.userId === userId) || null;
    },
    async findMembershipByHandle(instanceId, handleLower) {
      return memberships.find(m => m.instanceId === instanceId && m.handleLower === handleLower) || null;
    },
    async createMembership(fields) {
      const doc = { ...fields, createdAt: new Date(), updatedAt: new Date() };
      memberships.push(doc);
      return doc;
    },
  };
}

test('createCommunity: creates a child instance parented to the lazily-created unison parent', async () => {
  const store = memStore();
  const { instance, membership } = await communities.createCommunity({
    store, userId: 'alice', handle: 'Ally', name: 'Book Club',
  });
  assert.equal(instance.name, 'Book Club');
  assert.match(instance.slug, /^uni-/);
  assert.ok(instance.parentInstanceId, 'community is parented');

  const parent = store._instances.get('unison');
  assert.ok(parent, 'unison parent instance lazily created');
  assert.equal(instance.parentInstanceId, parent.id);
  assert.equal(parent.gameNumber, null, 'parent excluded from edition dashboards/getDefault()');

  assert.equal(membership.role, 'admin', 'creator is admin');
  assert.equal(membership.handle, 'Ally');
  assert.equal(membership.handleLower, 'ally');
});

test('createCommunity: reuses the existing unison parent on a second community', async () => {
  const store = memStore();
  await communities.createCommunity({ store, userId: 'alice', handle: 'Al' });
  await communities.createCommunity({ store, userId: 'bob', handle: 'Bo' });
  // unison parent + 2 communities, not 2 separate parents.
  assert.equal(store._instances.size, 3);
});

test('createCommunity: defaults the name from the generated code when none given', async () => {
  const store = memStore();
  const { instance } = await communities.createCommunity({ store, userId: 'alice', handle: 'Al' });
  assert.match(instance.name, /^Community [A-Z0-9]{5}$/);
});

test('createCommunity: rejects a missing or too-short handle', async () => {
  const store = memStore();
  await assert.rejects(
    () => communities.createCommunity({ store, userId: 'alice', handle: '' }),
    /handle is required/,
  );
  await assert.rejects(
    () => communities.createCommunity({ store, userId: 'alice', handle: 'X' }),
    /at least 2 characters/,
  );
});

test('joinCommunity: the <=50-member gate (plan §8)', async () => {
  const store = memStore();
  const { instance } = await communities.createCommunity({ store, userId: 'host', handle: 'Host' });
  const code = instance.slug.slice(4).toUpperCase();

  // Host already counts as 1; fill to the cap.
  for (let i = 0; i < communities.MEMBER_CAP - 1; i++) {
    await communities.joinCommunity({ store, code, userId: `u${i}`, handle: `H${i}` });
  }
  assert.equal(await store.countMembers(instance.id), communities.MEMBER_CAP);

  await assert.rejects(
    () => communities.joinCommunity({ store, code, userId: 'overflow', handle: 'Overflow' }),
    /full/,
  );
});

test('joinCommunity: rejects a taken handle, case-insensitively', async () => {
  const store = memStore();
  const { instance } = await communities.createCommunity({ store, userId: 'host', handle: 'Host' });
  const code = instance.slug.slice(4).toUpperCase();

  await communities.joinCommunity({ store, code, userId: 'bob', handle: 'Nomad' });
  await assert.rejects(
    () => communities.joinCommunity({ store, code, userId: 'carol', handle: 'nomad' }),
    /taken/,
  );
  // A distinct handle is fine.
  const { membership } = await communities.joinCommunity({ store, code, userId: 'carol', handle: 'Voyager' });
  assert.equal(membership.handle, 'Voyager');
});

test('joinCommunity: rejoining an existing member is a no-op — handle does not change', async () => {
  const store = memStore();
  const { instance, membership: created } = await communities.createCommunity({
    store, userId: 'host', handle: 'Host',
  });
  const code = instance.slug.slice(4).toUpperCase();
  const { membership: rejoined } = await communities.joinCommunity({
    store, code, userId: 'host', handle: 'ignored-on-rejoin',
  });
  assert.equal(rejoined.id, created.id);
  assert.equal(rejoined.handle, 'Host', 'handle is frozen once joined');
});

test('joinCommunity: rejects an unknown code', async () => {
  const store = memStore();
  await assert.rejects(
    () => communities.joinCommunity({ store, code: 'ZZZZZ', userId: 'x', handle: 'X' }),
    /not found/,
  );
});

test('joinCommunity: rejects a missing/short handle for a NEW member (not the rejoin path)', async () => {
  const store = memStore();
  const { instance } = await communities.createCommunity({ store, userId: 'host', handle: 'Host' });
  const code = instance.slug.slice(4).toUpperCase();
  await assert.rejects(
    () => communities.joinCommunity({ store, code, userId: 'bob', handle: '' }),
    /handle is required/,
  );
});
