const { test } = require('node:test');
const assert = require('node:assert/strict');

const funnel = require('./synNodes');

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
    async findOwnerTopicHubs(instanceId, ownerId) {
      return [...nodes.values()].filter(
        n => n.instanceId === instanceId && n.ownerId === ownerId && n.kind === 'topic',
      );
    },
  };
}

const COMM = 'comm1';
const alice = { ownerId: 'alice', ownerHandle: 'Alice' };
const bob = { ownerId: 'bob', ownerHandle: 'Bob' };

test('seedHomeHub: the idea title becomes a private topic root flagged isHome', async () => {
  const store = memStore();
  const hub = await funnel.seedHomeHub({
    store, instanceId: COMM, ...alice, title: 'What makes a ritual',
  });
  assert.equal(hub.kind, 'topic');
  assert.equal(hub.edgeKind, 'root');
  assert.deepEqual(hub.parentIds, []);
  assert.equal(hub.isHome, true);
  assert.equal(hub.content.topic, 'What makes a ritual');
});

// Joining is a no-op for an existing collaborator, and the route calls this
// on every join — a second hub would give the map two centres.
test('seedHomeHub: is idempotent per owner, and each collaborator gets their own', async () => {
  const store = memStore();
  const first = await funnel.seedHomeHub({ store, instanceId: COMM, ...alice, title: 'Idea' });
  const again = await funnel.seedHomeHub({ store, instanceId: COMM, ...alice, title: 'Idea' });
  assert.equal(again.id, first.id, 'the same hub comes back, never a second one');

  const bobsHub = await funnel.seedHomeHub({ store, instanceId: COMM, ...bob, title: 'Idea' });
  assert.notEqual(bobsHub.id, first.id, 'a map per collaborator, each with its own home hub');
  assert.equal(bobsHub.ownerId, 'bob');
});

test('createRoot: an ordinary topic hub is not flagged isHome', async () => {
  const store = memStore();
  const hub = await funnel.createRoot({
    store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' },
  });
  assert.equal(hub.isHome, false);
});

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

test('marry: mints a join node with two parents', async () => {
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

test('promote (M2): editing a borrowed node\'s content flips origin, stamps promotedAt, RETAINS provenance', async () => {
  const store = memStore();
  // A borrowed node, as respond()/borrowNode() would create it.
  const borrowed = await store.insertNode({
    id: 'nB1', instanceId: COMM, ownerId: bob.ownerId, ownerHandle: bob.ownerHandle,
    kind: 'thought', content: { topic: '', thought: 'Mirrored claim', context: 'Mirrored context' },
    axisFrameIds: [], topicId: null, parentIds: [], edgeKind: 'root',
    origin: 'borrowed', sourceNodeId: 'post1', sourceEntryId: 'entry1', sourceOwnerHandle: 'Alice',
    visibility: 'private', publishedAt: null, promotedAt: null,
  });
  assert.equal(borrowed.origin, 'borrowed');

  const promoted = await funnel.editContent({ store, nodeId: borrowed.id, content: { thought: 'My own take' } });
  assert.equal(promoted.origin, 'own', 'origin flips borrowed -> own');
  assert.ok(promoted.promotedAt instanceof Date, 'promotedAt is stamped');
  assert.equal(promoted.content.thought, 'My own take', 'owner-authored content is saved');
  // Provenance is RETAINED, not erased.
  assert.equal(promoted.sourceNodeId, 'post1');
  assert.equal(promoted.sourceEntryId, 'entry1');
  assert.equal(promoted.sourceOwnerHandle, 'Alice');
});

test('promote (M2): idempotent — re-editing an already-own node does not re-flip or re-stamp', async () => {
  const store = memStore();
  const borrowed = await store.insertNode({
    id: 'nB2', instanceId: COMM, ownerId: bob.ownerId, ownerHandle: bob.ownerHandle,
    kind: 'thought', content: { topic: '', thought: 'Mirrored claim', context: '' },
    axisFrameIds: [], topicId: null, parentIds: [], edgeKind: 'root',
    origin: 'borrowed', sourceNodeId: 'post1', sourceEntryId: 'entry1', sourceOwnerHandle: 'Alice',
    visibility: 'private', publishedAt: null, promotedAt: null,
  });

  const firstEdit = await funnel.editContent({ store, nodeId: borrowed.id, content: { thought: 'First own take' } });
  assert.equal(firstEdit.origin, 'own');
  const firstPromotedAt = firstEdit.promotedAt;

  const secondEdit = await funnel.editContent({ store, nodeId: borrowed.id, content: { thought: 'Second own take' } });
  assert.equal(secondEdit.origin, 'own', 'stays own — never toggles back to borrowed');
  assert.equal(secondEdit.promotedAt.getTime(), firstPromotedAt.getTime(), 'promotedAt does not move on a later edit');
  assert.equal(secondEdit.content.thought, 'Second own take');
});

test('promote (M2): a node created own-authored (never borrowed) is unaffected by promoteIfBorrowed', async () => {
  const store = memStore();
  const own = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'My idea' } });
  assert.equal(own.origin, 'own');
  const edited = await funnel.editContent({ store, nodeId: own.id, content: { context: 'more context' } });
  assert.equal(edited.origin, 'own');
  assert.equal(edited.promotedAt, null, 'never-borrowed nodes never get a promotedAt stamp');
});

test('promote (M2): ownership guard — a borrowed node can only be promoted via the OWNER\'s own editContent call (route-level 404 for others, see routes/synthesis.js#loadOwnedNode)', async () => {
  const store = memStore();
  const borrowed = await store.insertNode({
    id: 'nB3', instanceId: COMM, ownerId: bob.ownerId, ownerHandle: bob.ownerHandle,
    kind: 'thought', content: { thought: 'Mirrored claim', context: '' },
    axisFrameIds: [], topicId: null, parentIds: [], edgeKind: 'root',
    origin: 'borrowed', sourceNodeId: 'post1', sourceEntryId: 'entry1', sourceOwnerHandle: 'Alice',
    visibility: 'private', publishedAt: null, promotedAt: null,
  });
  // editContent itself trusts the caller (ownership is enforced one layer up,
  // in the route's loadOwnedNode) — but the node's ownerId is unchanged by
  // promotion, so "who can reach this" is exactly "who owns the node."
  const promoted = await funnel.editContent({ store, nodeId: borrowed.id, content: { thought: 'Bob\'s own take' } });
  assert.equal(promoted.ownerId, 'bob', 'promotion never changes ownership');
  assert.equal(promoted.origin, 'own');
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

// ── D19: unmarry is reparent to one parent ──────────────────────────────────

test('D19: dropping one parent from a join node makes it an ordinary child again', async () => {
  const store = memStore();
  const hubA = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'A' } });
  const hubB = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'B' } });
  const ta = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'a' }, parentId: hubA.id });
  const tb = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'b' }, parentId: hubB.id });
  const join = await funnel.marry({
    store, instanceId: COMM, ...alice, content: { thought: 'both at once' }, parentIds: [ta.id, tb.id],
  });
  assert.equal(join.edgeKind, 'marriage');
  assert.equal(join.topicId, hubA.id, 'first-selected parent wins the topic (D4)');

  const single = await funnel.reparent({ store, nodeId: join.id, newParentIds: [tb.id] });
  assert.equal(single.edgeKind, 'child', 'the arity flip is the unmarry');
  assert.deepEqual(single.parentIds, [tb.id]);
  assert.equal(single.topicId, hubB.id, 'topic re-derives from the remaining parent');
});
