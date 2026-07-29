const { test } = require('node:test');
const assert = require('node:assert/strict');

const ideas = require('./synIdeas');

// In-memory store implementing the funnel's data-access surface — same
// pattern as utils/synNodes.test.js's memStore. Lets us exercise the
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
    // Join order — `memberships` is append-only, so insertion order already
    // is join order.
    async listMembers(instanceId) {
      return memberships.filter(m => m.instanceId === instanceId);
    },
    async listPublicInstances(parentInstanceId, { limit = 50, skip = 0 } = {}) {
      return [...instances.values()]
        .filter(i => i.parentInstanceId === parentInstanceId
          && i.config?.synthesis?.visibility === 'public')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(skip, skip + limit);
    },
  };
}

test('createIdea: creates a child instance parented to the lazily-created synthesis parent', async () => {
  const store = memStore();
  const { instance, membership } = await ideas.createIdea({
    store, userId: 'alice', handle: 'Ally', title: 'Book Club',
  });
  assert.equal(instance.name, 'Book Club');
  assert.match(instance.slug, /^idea-/);
  assert.ok(instance.parentInstanceId, 'community is parented');

  const parent = store._instances.get('synthesis');
  assert.ok(parent, 'synthesis parent instance lazily created');
  assert.equal(instance.parentInstanceId, parent.id);
  assert.equal(parent.gameNumber, null, 'parent excluded from edition dashboards/getDefault()');

  assert.equal(membership.role, 'admin', 'creator is admin');
  assert.equal(membership.handle, 'Ally');
  assert.equal(membership.handleLower, 'ally');
});

test('createIdea: reuses the existing synthesis parent on a second community', async () => {
  const store = memStore();
  await ideas.createIdea({ store, userId: 'alice', handle: 'Al', title: 'One' });
  await ideas.createIdea({ store, userId: 'bob', handle: 'Bo', title: 'Two' });
  // synthesis parent + 2 communities, not 2 separate parents.
  assert.equal(store._instances.size, 3);
});

// An idea IS its title — it labels the home hub at the centre of every
// collaborator's map — so there is no generated-name fallback to inherit.
test('createIdea: requires a title', async () => {
  const store = memStore();
  await assert.rejects(
    () => ideas.createIdea({ store, userId: 'alice', handle: 'Al' }),
    /title is required/,
  );
  await assert.rejects(
    () => ideas.createIdea({ store, userId: 'alice', handle: 'Al', title: '   ' }),
    /title is required/,
  );
});

test('createIdea: defaults to private, and records the Synthesis bar + slot budget', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({ store, userId: 'alice', handle: 'Al', title: 'One' });
  const client = ideas.toClientIdea(instance);
  assert.equal(client.title, 'One');
  assert.equal(client.visibility, 'private');
  assert.equal(client.synthesisThreshold, ideas.DEFAULT_THRESHOLD);
  assert.equal(client.statementSlots, ideas.DEFAULT_SLOTS);
  assert.equal(client.synthesisReached, false, 'a fresh idea has reached nothing');
  assert.equal(client.synthesisStatementId, null);
});

test('createIdea: a public idea is marked public and rejects any other visibility', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({
    store, userId: 'alice', handle: 'Al', title: 'Open one', visibility: 'public',
  });
  assert.equal(ideas.toClientIdea(instance).visibility, 'public');
  await assert.rejects(
    () => ideas.createIdea({ store, userId: 'alice', handle: 'Al', title: 'X', visibility: 'secret' }),
    /visibility must be public or private/,
  );
});

// The browse directory is the ONLY way a non-collaborator finds an idea, so
// a private one leaking into it would defeat the visibility setting entirely.
test('listPublicIdeas: lists public ideas with their collaborator counts, never private ones', async () => {
  const store = memStore();
  await ideas.createIdea({ store, userId: 'alice', handle: 'Al', title: 'Open', visibility: 'public' });
  await ideas.createIdea({ store, userId: 'bob', handle: 'Bo', title: 'Closed', visibility: 'private' });

  const listed = await ideas.listPublicIdeas({ store });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, 'Open');
  assert.equal(listed[0].collaboratorCount, 1, 'the drafter counts as the first collaborator');
});

test('listCollaborators: returns the roster in join order', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({ store, userId: 'host', handle: 'Host', title: 'Idea' });
  const code = ideas.codeFor(instance.slug);
  await ideas.joinIdea({ store, code, userId: 'bob', handle: 'Bo' });

  const roster = await ideas.listCollaborators({ store, instanceId: instance.id });
  assert.deepEqual(roster.map(m => m.handle), ['Host', 'Bo']);
  assert.deepEqual(roster.map(m => m.role), ['admin', 'member']);
});

test('createIdea: rejects a missing or too-short handle', async () => {
  const store = memStore();
  await assert.rejects(
    () => ideas.createIdea({ store, userId: 'alice', handle: '', title: 'T' }),
    /handle is required/,
  );
  await assert.rejects(
    () => ideas.createIdea({ store, userId: 'alice', handle: 'X', title: 'T' }),
    /at least 2 characters/,
  );
});

test('joinIdea: the <=50-member gate (plan §8)', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({ store, userId: 'host', handle: 'Host', title: 'Host idea' });
  const code = ideas.codeFor(instance.slug);

  // Host already counts as 1; fill to the cap.
  for (let i = 0; i < ideas.MEMBER_CAP - 1; i++) {
    await ideas.joinIdea({ store, code, userId: `u${i}`, handle: `H${i}` });
  }
  assert.equal(await store.countMembers(instance.id), ideas.MEMBER_CAP);

  await assert.rejects(
    () => ideas.joinIdea({ store, code, userId: 'overflow', handle: 'Overflow' }),
    /full/,
  );
});

test('joinIdea: rejects a taken handle, case-insensitively', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({ store, userId: 'host', handle: 'Host', title: 'Host idea' });
  const code = ideas.codeFor(instance.slug);

  await ideas.joinIdea({ store, code, userId: 'bob', handle: 'Nomad' });
  await assert.rejects(
    () => ideas.joinIdea({ store, code, userId: 'carol', handle: 'nomad' }),
    /taken/,
  );
  // A distinct handle is fine.
  const { membership } = await ideas.joinIdea({ store, code, userId: 'carol', handle: 'Voyager' });
  assert.equal(membership.handle, 'Voyager');
});

test('joinIdea: rejoining an existing member is a no-op — handle does not change', async () => {
  const store = memStore();
  const { instance, membership: created } = await ideas.createIdea({
    store, userId: 'host', handle: 'Host', title: 'Host idea',
  });
  const code = ideas.codeFor(instance.slug);
  const { membership: rejoined } = await ideas.joinIdea({
    store, code, userId: 'host', handle: 'ignored-on-rejoin',
  });
  assert.equal(rejoined.id, created.id);
  assert.equal(rejoined.handle, 'Host', 'handle is frozen once joined');
});

test('joinIdea: rejects an unknown code', async () => {
  const store = memStore();
  await assert.rejects(
    () => ideas.joinIdea({ store, code: 'ZZZZZ', userId: 'x', handle: 'X' }),
    /not found/,
  );
});

test('joinIdea: rejects a missing/short handle for a NEW member (not the rejoin path)', async () => {
  const store = memStore();
  const { instance } = await ideas.createIdea({ store, userId: 'host', handle: 'Host', title: 'Host idea' });
  const code = ideas.codeFor(instance.slug);
  await assert.rejects(
    () => ideas.joinIdea({ store, code, userId: 'bob', handle: '' }),
    /handle is required/,
  );
});
