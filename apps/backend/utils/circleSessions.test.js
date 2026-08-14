const { test } = require('node:test');
const assert = require('node:assert/strict');

const circleSessions = require('./circleSessions');

// In-memory store covering synIdeas' surface plus the bridge's additions —
// the same injectable-store pattern as every funnel test in this directory.
function memStore() {
  const instances = [];
  const memberships = [];
  let published = {}; // instanceId -> ownerIds
  let repliers = {};  // instanceId -> userIds
  return {
    _instances: instances,
    _memberships: memberships,
    setPublished(map) { published = map; },
    setRepliers(map) { repliers = map; },

    async findInstanceBySlug(slug) { return instances.find(i => i.slug === slug) || null; },
    async createInstance(fields) {
      const doc = { ...fields, createdAt: new Date(), save: async function () { return this; } };
      instances.push(doc);
      return doc;
    },
    async saveInstance(instance) { return instance; },
    async countMembers(instanceId) { return memberships.filter(m => m.instanceId === instanceId).length; },
    async findMembership(instanceId, userId) {
      return memberships.find(m => m.instanceId === instanceId && m.userId === userId) || null;
    },
    async findMembershipByHandle(instanceId, handleLower) {
      return memberships.find(m => m.instanceId === instanceId && m.handleLower === handleLower) || null;
    },
    async createMembership(fields) {
      const doc = { ...fields, joinedAt: new Date() };
      memberships.push(doc);
      return doc;
    },
    async listMembers(instanceId) { return memberships.filter(m => m.instanceId === instanceId); },
    async listPublicInstances() { return []; },

    async listCircleSessionInstances(circleId) {
      return instances.filter(i => i.config?.synthesis?.circleId === circleId);
    },
    async publishedOwnerIds(instanceId) { return published[instanceId] || []; },
    async replierIds(instanceId) { return repliers[instanceId] || []; },
  };
}

const CIRCLE = {
  id: 'circ1',
  createdBy: 'u1',
  members: [
    { userId: 'u1', username: 'Mara' },
    { userId: 'u2', username: 'Ivo' },
    { userId: 'u3', username: 'mara' }, // case-clash with u1, on purpose
  ],
};

test('createSession stamps the circle and mirrors every member, deduping handles', async () => {
  const store = memStore();
  const { instance } = await circleSessions.createSession({
    store, circle: CIRCLE, userId: 'u1', title: 'What holds us',
  });

  assert.equal(instance.config.synthesis.circleId, 'circ1');
  const members = await store.listMembers(instance.id);
  assert.equal(members.length, 3, 'the whole circle is in with no separate join');

  const byUser = Object.fromEntries(members.map(m => [m.userId, m]));
  assert.equal(byUser.u1.role, 'admin', 'the creator drafts it');
  assert.equal(byUser.u2.role, 'member');
  assert.equal(byUser.u1.handle, 'Mara');
  // The case-clashing username lands on a deduped handle rather than failing
  // the mirror — per-idea handle uniqueness is case-insensitive.
  assert.equal(byUser.u3.handle, 'mara2');
});

test('the mirror is idempotent, and a late circle joiner is healed in on list', async () => {
  const store = memStore();
  const { instance } = await circleSessions.createSession({
    store, circle: CIRCLE, userId: 'u1', title: 'What holds us',
  });

  await circleSessions.listSessions({ store, circle: CIRCLE, viewerId: 'u2' });
  assert.equal((await store.listMembers(instance.id)).length, 3, 'no duplicates');

  const grown = { ...CIRCLE, members: [...CIRCLE.members, { userId: 'u4', username: 'Nell' }] };
  await circleSessions.listSessions({ store, circle: grown, viewerId: 'u4' });
  const members = await store.listMembers(instance.id);
  assert.equal(members.length, 4, 'week-six joiner is in the session');
  assert.equal(members.find(m => m.userId === 'u4').handle, 'Nell');
});

test('listSessions reports circle-member contributors and the viewer flag', async () => {
  const store = memStore();
  const { instance } = await circleSessions.createSession({
    store, circle: CIRCLE, userId: 'u1', title: 'What holds us',
  });
  // u1 published, u2 replied, and an id outside the circle contributed too —
  // the map counts circle members only.
  store.setPublished({ [instance.id]: ['u1', 'stranger'] });
  store.setRepliers({ [instance.id]: ['u2'] });

  const sessions = await circleSessions.listSessions({ store, circle: CIRCLE, viewerId: 'u2' });
  assert.equal(sessions.length, 1);
  assert.deepEqual(new Set(sessions[0].contributorIds), new Set(['u1', 'u2']));
  assert.equal(sessions[0].contributorCount, 2);
  assert.equal(sessions[0].iContribute, true);
  assert.equal(sessions[0].title, 'What holds us');
  assert.ok(sessions[0].code, 'the shareable code still exists under the hood');
});

test('membership is the boundary for both verbs', async () => {
  const store = memStore();
  await assert.rejects(
    () => circleSessions.createSession({ store, circle: CIRCLE, userId: 'stranger', title: 'x' }),
    /Not a member/,
  );
  await assert.rejects(
    () => circleSessions.listSessions({ store, circle: CIRCLE, viewerId: 'stranger' }),
    /Not a member/,
  );
});
