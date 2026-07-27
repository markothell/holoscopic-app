const { test } = require('node:test');
const assert = require('node:assert/strict');

const funnel = require('./unisonNodes');

// In-memory store implementing the funnel's data-access surface. Lets us
// exercise the REAL funnel functions (create child, marry, reparent, cycle
// guard, same-owner invariant, frame dedupe) with no live MongoDB. getNode
// returns the stored reference so a saveNode-after-mutate sticks, exactly like
// a Mongoose document.
function memStore() {
  const nodes = new Map();
  const frames = new Map();
  return {
    _nodes: nodes,
    _frames: frames,
    async getNode(id) { return nodes.get(id) || null; },
    async insertNode(fields) {
      const doc = { ...fields, createdAt: new Date(), updatedAt: new Date() };
      nodes.set(doc.id, doc);
      return doc;
    },
    async saveNode(node) { node.updatedAt = new Date(); nodes.set(node.id, node); return node; },
    async findFrames(instanceId) {
      return [...frames.values()].filter(f => f.instanceId === instanceId);
    },
    async getFrame(id, instanceId) {
      const f = frames.get(id);
      return f && f.instanceId === instanceId ? f : null;
    },
    async createFrame(fields) { frames.set(fields.id, fields); return fields; },
  };
}

const COMM = 'comm1';
const alice = { ownerId: 'alice', ownerHandle: 'Alice' };
const bob = { ownerId: 'bob', ownerHandle: 'Bob' };

test('createRoot: a topic hub is a parentless root with no axes', async () => {
  const store = memStore();
  const hub = await funnel.createRoot({
    store, instanceId: COMM, ...alice, kind: 'topic',
    content: { topic: 'Governance' }, axisFrameIds: ['fX'],
  });
  assert.equal(hub.edgeKind, 'root');
  assert.deepEqual(hub.parentIds, []);
  assert.equal(hub.kind, 'topic');
  assert.equal(hub.content.topic, 'Governance');
  assert.deepEqual(hub.axisFrameIds, [], 'topic hubs carry no axes');
  assert.equal(hub.topicId, null);
  assert.equal(hub.visibility, 'private', 'private-first');
});

test('createChild: a thought attaches to a topic hub and inherits it as topicId', async () => {
  const store = memStore();
  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' } });
  const thought = await funnel.createChild({
    store, instanceId: COMM, ...alice, kind: 'thought',
    content: { thought: 'Quorum should scale with size.', context: 'Because ...' },
    axisFrameIds: ['fA', 'fB'], parentId: hub.id,
  });
  assert.equal(thought.edgeKind, 'child');
  assert.deepEqual(thought.parentIds, [hub.id]);
  assert.equal(thought.topicId, hub.id, 'thought home-hub = its topic parent');
  assert.equal(thought.content.thought, 'Quorum should scale with size.');
  assert.equal(thought.content.context, 'Because ...');
  assert.deepEqual(thought.axisFrameIds, ['fA', 'fB'], 'thoughts carry 1-2 axes');

  // A sub-thought inherits the hub transitively.
  const sub = await funnel.createChild({
    store, instanceId: COMM, ...alice, kind: 'thought',
    content: { thought: 'Except for founding members.' }, parentId: thought.id,
  });
  assert.equal(sub.topicId, hub.id, 'sub-thought inherits the nearest topic hub');
});

test('createChild: rejects a missing parent', async () => {
  const store = memStore();
  await assert.rejects(
    () => funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: {}, parentId: 'nope' }),
    /Parent not found/,
  );
});

test('marry: mints a synthesis node with two parents', async () => {
  const store = memStore();
  const a = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'A' } });
  const b = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'B' } });
  const synth = await funnel.marry({
    store, instanceId: COMM, ...alice,
    content: { thought: 'A and B combined', context: 'synthesis' },
    parentIds: [a.id, b.id],
  });
  assert.equal(synth.edgeKind, 'marriage');
  assert.equal(synth.kind, 'thought', 'a marriage yields a new claim by default');
  assert.deepEqual(synth.parentIds.sort(), [a.id, b.id].sort());
});

test('marry: requires exactly two DISTINCT parents', async () => {
  const store = memStore();
  const a = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'A' } });
  await assert.rejects(
    () => funnel.marry({ store, instanceId: COMM, ...alice, content: {}, parentIds: [a.id] }),
    /exactly two parents/,
  );
  await assert.rejects(
    () => funnel.marry({ store, instanceId: COMM, ...alice, content: {}, parentIds: [a.id, a.id] }),
    /two distinct parents/,
  );
});

test('same-owner invariant: parentIds must be owned by the node author', async () => {
  const store = memStore();
  const aliceHub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Alice hub' } });
  // Bob cannot child onto Alice's node — cross-map links are sourceNodeId, not parentIds.
  await assert.rejects(
    () => funnel.createChild({ store, instanceId: COMM, ...bob, kind: 'thought', content: {}, parentId: aliceHub.id }),
    /same author/,
  );
  // Marriage across owners is likewise rejected.
  const bobA = await funnel.createRoot({ store, instanceId: COMM, ...bob, kind: 'thought', content: { thought: 'bobA' } });
  await assert.rejects(
    () => funnel.marry({ store, instanceId: COMM, ...bob, content: {}, parentIds: [bobA.id, aliceHub.id] }),
    /same author/,
  );
});

test('CYCLE GUARD: reparent rejects a back-edge that closes a loop', async () => {
  const store = memStore();
  // Build a chain: root -> child -> grandchild (all Alice's).
  const root = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'root' } });
  const child = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'child' }, parentId: root.id });
  const grand = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'grand' }, parentId: child.id });

  // Re-parenting root under its own descendant (grand) would create a cycle.
  await assert.rejects(
    () => funnel.reparent({ store, nodeId: root.id, newParentIds: [grand.id] }),
    /cycle/,
    'root -> grand back-edge must be rejected',
  );
  // A node cannot be its own parent.
  await assert.rejects(
    () => funnel.reparent({ store, nodeId: child.id, newParentIds: [child.id] }),
    /its own parent/,
  );
  // A legal reparent (child directly under root's... sibling) still works.
  const other = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'other' } });
  const moved = await funnel.reparent({ store, nodeId: grand.id, newParentIds: [other.id] });
  assert.deepEqual(moved.parentIds, [other.id]);
  assert.equal(moved.edgeKind, 'child');
});

test('CYCLE GUARD: marry rejects when a parent is a descendant of the... (diamond safe)', async () => {
  const store = memStore();
  // assertAcyclic must terminate on a diamond (shared ancestor) without looping.
  const root = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'r' } });
  const l = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'l' }, parentId: root.id });
  const r = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'r' }, parentId: root.id });
  // Marrying the two branches (diamond) is legal and must terminate.
  const diamond = await funnel.marry({ store, instanceId: COMM, ...alice, content: { thought: 'merge' }, parentIds: [l.id, r.id] });
  assert.equal(diamond.edgeKind, 'marriage');
});

test('publish / unpublish flips visibility', async () => {
  const store = memStore();
  const t = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'post' } });
  assert.equal(t.visibility, 'private');
  const pub = await funnel.publish({ store, nodeId: t.id });
  assert.equal(pub.visibility, 'published');
  assert.ok(pub.publishedAt instanceof Date);
  const priv = await funnel.unpublish({ store, nodeId: t.id });
  assert.equal(priv.visibility, 'private');
  assert.equal(priv.publishedAt, null);
});

test('frame dedupe: same poles in either orientation resolve to one frame', async () => {
  const store = memStore();
  const f1 = await funnel.resolveFrame({ store, instanceId: COMM, spec: { poleA: 'Concrete', poleB: 'Abstract' }, userId: 'alice', username: 'Alice' });
  const f2 = await funnel.resolveFrame({ store, instanceId: COMM, spec: { poleA: 'abstract', poleB: 'concrete' }, userId: 'bob', username: 'Bob' });
  assert.equal(f1.id, f2.id, 'orientation-free dedupe within a community');
  assert.equal(store._frames.size, 1);
  // A distinct pole pair is a new frame.
  const f3 = await funnel.resolveFrame({ store, instanceId: COMM, spec: { poleA: 'Fast', poleB: 'Slow' }, userId: 'alice', username: 'Alice' });
  assert.notEqual(f3.id, f1.id);
  // Borrowing by id returns the existing frame.
  const f4 = await funnel.resolveFrame({ store, instanceId: COMM, spec: { frameId: f1.id }, userId: 'bob', username: 'Bob' });
  assert.equal(f4.id, f1.id);
  // Frames are community-scoped: another community can't borrow the id.
  await assert.rejects(
    () => funnel.resolveFrame({ store, instanceId: 'comm2', spec: { frameId: f1.id }, userId: 'x', username: 'X' }),
    /not found/,
  );
});

test('resolveFrame: rejects equal or empty poles', async () => {
  const store = memStore();
  await assert.rejects(() => funnel.resolveFrame({ store, instanceId: COMM, spec: { poleA: 'Same', poleB: 'same' }, userId: 'a', username: 'A' }), /must differ/);
  await assert.rejects(() => funnel.resolveFrame({ store, instanceId: COMM, spec: { poleA: '', poleB: 'x' }, userId: 'a', username: 'A' }), /both poles/);
});

test('editContent: partial update leaves untouched fields alone', async () => {
  const store = memStore();
  const t = await funnel.createRoot({
    store, instanceId: COMM, ...alice, kind: 'thought',
    content: { thought: 'Original claim', context: 'Original context' },
  });
  const updated = await funnel.editContent({ store, nodeId: t.id, content: { context: 'Revised context' } });
  assert.equal(updated.content.thought, 'Original claim', 'thought untouched');
  assert.equal(updated.content.context, 'Revised context', 'context updated');

  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' } });
  const renamed = await funnel.editContent({ store, nodeId: hub.id, content: { topic: 'New Governance' } });
  assert.equal(renamed.content.topic, 'New Governance');
});

test('editContent: rejects a missing node', async () => {
  const store = memStore();
  await assert.rejects(() => funnel.editContent({ store, nodeId: 'nope', content: {} }), /Node not found/);
});

test("setAxes: replaces a thought's axes wholesale; rejects on a topic hub", async () => {
  const store = memStore();
  const t = await funnel.createRoot({
    store, instanceId: COMM, ...alice, kind: 'thought',
    content: { thought: 'Claim' }, axisFrameIds: ['fA'],
  });
  const updated = await funnel.setAxes({ store, nodeId: t.id, axisFrameIds: ['fX', 'fY'] });
  assert.deepEqual(updated.axisFrameIds, ['fX', 'fY']);
  const cleared = await funnel.setAxes({ store, nodeId: t.id, axisFrameIds: [] });
  assert.deepEqual(cleared.axisFrameIds, []);

  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' } });
  await assert.rejects(
    () => funnel.setAxes({ store, nodeId: hub.id, axisFrameIds: ['fA'] }),
    /Only thoughts carry axes/,
  );
});
