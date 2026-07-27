const { test } = require('node:test');
const assert = require('node:assert/strict');

const funnel = require('./unisonNodes');

// In-memory node store — the same data-access surface the funnel uses, plus
// the M1 networking reads (findOwnerTopicHubs / findBorrowedNode /
// findPublishedThoughts). Exercises the REAL respond()/feed()/upvoteReply()
// against no live MongoDB.
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
    async findFrames(instanceId) { return [...frames.values()].filter(f => f.instanceId === instanceId); },
    async getFrame(id, instanceId) { const f = frames.get(id); return f && f.instanceId === instanceId ? f : null; },
    async createFrame(fields) { frames.set(fields.id, fields); return fields; },
    async findOwnerTopicHubs(instanceId, ownerId) {
      return [...nodes.values()].filter(n => n.instanceId === instanceId && n.ownerId === ownerId && n.kind === 'topic');
    },
    async findBorrowedNode({ instanceId, ownerId, sourceNodeId }) {
      return [...nodes.values()].find(n =>
        n.instanceId === instanceId && n.ownerId === ownerId && n.sourceNodeId === sourceNodeId) || null;
    },
    async findPublishedThoughts(instanceId) {
      return [...nodes.values()]
        .filter(n => n.instanceId === instanceId && n.kind === 'thought' && n.visibility === 'published')
        .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    },
  };
}

// Faithful in-memory mirror of utils/entries.js: the (activity,user,slot,
// question) upsert key, the reset-others'-votes-on-remap rule, and the
// self-vote block — the exact behaviors respond()/upvoteReply() rely on.
function memEntries() {
  const entries = new Map();
  const keyOf = (activityId, userId, slot, q) => `${activityId}|${userId}|${slot}|${q}`;
  let seq = 0;
  return {
    _entries: entries,
    async upsertEntry({ activity, instanceId, userId, username, slotNumber, questionId, position, text }) {
      const k = keyOf(activity.id, userId, slotNumber, questionId);
      let e = entries.get(k);
      if (!e) {
        e = { id: `e${++seq}`, activityId: activity.id, instanceId, userId, username, slotNumber, questionId,
          position, text: text || '', voterIds: [], voteCount: 0 };
        entries.set(k, e);
      } else {
        e.username = username;
        if (text !== undefined) e.text = text;
        if (position !== undefined && position !== null) {
          e.position = position;
          e.voterIds = e.voterIds.filter(v => v === userId);
          e.voteCount = e.voterIds.length;
        }
      }
      return e;
    },
    async voteEntry({ activity, entryId, userId }) {
      const e = [...entries.values()].find(x => x.id === entryId && x.activityId === activity.id);
      if (!e) throw new Error('Entry not found');
      if (e.userId === userId) throw new Error('Cannot vote on your own entry');
      if (e.voterIds.includes(userId)) e.voterIds = e.voterIds.filter(v => v !== userId);
      else e.voterIds = [...e.voterIds, userId];
      e.voteCount = e.voterIds.length;
      return e;
    },
    async listByActivity(activityId) { return [...entries.values()].filter(e => e.activityId === activityId); },
    toClient(e) { return { ...e }; },
  };
}

const COMM = 'comm1';
const alice = { ownerId: 'alice', ownerHandle: 'Alice' };
const bob = { ownerId: 'bob', ownerHandle: 'Bob' };

// Alice: a "Governance" topic hub with one published thought under it.
async function publishedPost(store, { topic = 'Governance', thought = 'Quorum should scale.', context = 'Because ...', axisFrameIds = ['fA', 'fB'] } = {}) {
  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic } });
  const post = await funnel.createChild({
    store, instanceId: COMM, ...alice, kind: 'thought',
    content: { thought, context }, axisFrameIds, parentId: hub.id,
  });
  await funnel.publish({ store, nodeId: post.id });
  return { hub, post: await store.getNode(post.id) };
}

test('respond: two records — a public reply Entry AND a structure-mirrored borrowed node, linked', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);

  const { reply, borrowed } = await funnel.respond({
    store, entries, instanceId: COMM,
    responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.7, y: 0.2 }, text: 'I mostly agree.',
  });

  // 1) The reply Entry — on the POST, positioned, attributed by handle.
  assert.equal(reply.activityId, post.id, 'reply duck-types the post as its activity');
  assert.equal(reply.questionId, 'context');
  assert.equal(reply.username, 'Bob');
  assert.deepEqual(reply.position, { x: 0.7, y: 0.2 });
  assert.equal(reply.text, 'I mostly agree.');

  // 2) The borrowed node — on BOB'S map, linked back to the post + reply.
  assert.ok(borrowed, 'a cross-member response mints a borrowed node');
  assert.equal(borrowed.kind, 'thought');
  assert.equal(borrowed.origin, 'borrowed');
  assert.equal(borrowed.ownerId, 'bob', 'borrowed node lands on the responder\'s map');
  assert.equal(borrowed.sourceNodeId, post.id, 'links to the source post');
  assert.equal(borrowed.sourceEntryId, reply.id, 'links to the reply it was born from');
  assert.equal(borrowed.sourceOwnerHandle, 'Alice');
  assert.equal(borrowed.content.thought, 'Quorum should scale.', 'title mirrors the source thought');
  assert.deepEqual(borrowed.axisFrameIds, ['fA', 'fB'], 'mirrors the source axes');
  assert.equal(borrowed.visibility, 'private', 'a borrowed node starts private on my map');

  // Structure-mirroring (D8): filed under a Bob-owned "Governance" hub.
  const bobHubs = await store.findOwnerTopicHubs(COMM, 'bob');
  assert.equal(bobHubs.length, 1, 'a matching hub was created on Bob\'s map');
  assert.equal(bobHubs[0].content.topic, 'Governance');
  assert.equal(borrowed.topicId, bobHubs[0].id, 'borrowed thought hangs under the mirrored hub');
});

test('respond structure-mirroring: REUSES the responder\'s matching hub (trimmed, case-insensitive), never a duplicate', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store, { topic: 'Governance' });

  // Bob already owns a hub that matches by trimmed/case-insensitive label.
  const bobHub = await funnel.createRoot({
    store, instanceId: COMM, ...bob, kind: 'topic', content: { topic: '  governance ' },
  });

  const { borrowed } = await funnel.respond({
    store, entries, instanceId: COMM,
    responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.5, y: 0.5 },
  });

  assert.equal(borrowed.topicId, bobHub.id, 'reused the existing hub');
  const bobHubs = await store.findOwnerTopicHubs(COMM, 'bob');
  assert.equal(bobHubs.length, 1, 'no duplicate hub created');
});

test('respond: a source thought with NO topic hub borrows as a root', async () => {
  const store = memStore();
  const entries = memEntries();
  const post = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'Rootless claim' } });
  await funnel.publish({ store, nodeId: post.id });

  const { borrowed } = await funnel.respond({
    store, entries, instanceId: COMM,
    responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0, y: 1 },
  });
  assert.equal(borrowed.edgeKind, 'root');
  assert.deepEqual(borrowed.parentIds, []);
  assert.equal(borrowed.topicId, null);
});

test('re-respond: upserts BOTH records — one reply, one borrowed node, no duplicates', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);

  const first = await funnel.respond({
    store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.7, y: 0.2 }, text: 'first take',
  });
  const second = await funnel.respond({
    store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.3, y: 0.9 }, text: 'revised take',
  });

  // One reply per (member, post) — same Entry id, updated in place.
  assert.equal(first.reply.id, second.reply.id, 'the reply upserts, not duplicates');
  const replies = await entries.listByActivity(post.id);
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].position, { x: 0.3, y: 0.9 }, 'reply position updated');
  assert.equal(replies[0].text, 'revised take');

  // One borrowed node per (member, post) — same node id, updated in place.
  assert.equal(first.borrowed.id, second.borrowed.id, 'the borrowed node upserts, not duplicates');
  const bobBorrowed = [...store._nodes.values()].filter(n => n.ownerId === 'bob' && n.sourceNodeId === post.id);
  assert.equal(bobBorrowed.length, 1, 'exactly one borrowed node for the post');
});

test('re-respond after promotion: the reply upserts but a PROMOTED node keeps its owner-authored content', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);

  const { borrowed } = await funnel.respond({
    store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.7, y: 0.2 },
  });
  // Simulate an M2 promotion: Bob made it his own and rewrote the claim.
  borrowed.origin = 'own';
  borrowed.content = { topic: '', thought: 'My own reworked claim', context: '' };
  await store.saveNode(borrowed);

  await funnel.respond({
    store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.1, y: 0.1 },
  });
  const after = await store.getNode(borrowed.id);
  assert.equal(after.origin, 'own', 'not demoted');
  assert.equal(after.content.thought, 'My own reworked claim', 'promoted content is not clobbered');
});

test('respond: PUBLISHED-ONLY guard — cannot respond to a private draft (private-first, §8)', async () => {
  const store = memStore();
  const entries = memEntries();
  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' } });
  const draft = await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'draft' }, parentId: hub.id });

  await assert.rejects(
    () => funnel.respond({ store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
      sourceNodeId: draft.id, position: { x: 0.5, y: 0.5 } }),
    /published thought/,
  );
  // No leak: nothing was written on either map.
  assert.equal((await entries.listByActivity(draft.id)).length, 0, 'no reply written');
  assert.equal((await store.findOwnerTopicHubs(COMM, 'bob')).length, 0, 'no borrowed structure written');
});

test('respond: a topic hub is not a reply target; an unknown / cross-community source is not found', async () => {
  const store = memStore();
  const entries = memEntries();
  const hub = await funnel.createRoot({ store, instanceId: COMM, ...alice, kind: 'topic', content: { topic: 'Governance' } });
  await funnel.publish({ store, nodeId: hub.id }); // even a published hub isn't a post

  await assert.rejects(
    () => funnel.respond({ store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
      sourceNodeId: hub.id, position: { x: 0.5, y: 0.5 } }),
    /Only a published thought/,
  );
  await assert.rejects(
    () => funnel.respond({ store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
      sourceNodeId: 'nope', position: { x: 0.5, y: 0.5 } }),
    /Node not found/,
  );
  // A published post in another community is invisible from COMM.
  const { post } = await publishedPost(store);
  await assert.rejects(
    () => funnel.respond({ store, entries, instanceId: 'comm2', responderId: bob.ownerId, responderHandle: bob.ownerHandle,
      sourceNodeId: post.id, position: { x: 0.5, y: 0.5 } }),
    /Node not found/,
  );
});

test('respond: rejects a stance outside [0,1]', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);
  for (const bad of [undefined, null, { x: 0.5 }, { x: 1.2, y: 0.5 }, { x: -0.1, y: 0 }, { x: 'a', y: 0 }]) {
    await assert.rejects(
      () => funnel.respond({ store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
        sourceNodeId: post.id, position: bad }),
      /stance in \[0,1\]/,
    );
  }
});

test('respond to my OWN post (D9): the author gets a reply, but no borrowed node', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);

  const { reply, borrowed } = await funnel.respond({
    store, entries, instanceId: COMM, responderId: alice.ownerId, responderHandle: alice.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.5, y: 0.5 }, text: 'author note',
  });
  assert.ok(reply, 'author can join the reply map');
  assert.equal(borrowed, null, 'you don\'t borrow your own idea');
});

test('upvoteReply: toggles a free upvote; self-upvote blocked', async () => {
  const store = memStore();
  const entries = memEntries();
  const { post } = await publishedPost(store);
  const { reply } = await funnel.respond({
    store, entries, instanceId: COMM, responderId: bob.ownerId, responderHandle: bob.ownerHandle,
    sourceNodeId: post.id, position: { x: 0.4, y: 0.4 },
  });

  // Alice upvotes Bob's reply, then un-votes (toggle).
  let e = await funnel.upvoteReply({ store, entries, instanceId: COMM, sourceNodeId: post.id, entryId: reply.id, userId: 'alice' });
  assert.deepEqual(e.voterIds, ['alice']);
  assert.equal(e.voteCount, 1);
  e = await funnel.upvoteReply({ store, entries, instanceId: COMM, sourceNodeId: post.id, entryId: reply.id, userId: 'alice' });
  assert.equal(e.voteCount, 0, 'second call un-votes');

  // Bob can't upvote his own reply.
  await assert.rejects(
    () => funnel.upvoteReply({ store, entries, instanceId: COMM, sourceNodeId: post.id, entryId: reply.id, userId: 'bob' }),
    /own entry/,
  );
});

test('feed: returns published thoughts only, with topic + author fields; never private nodes', async () => {
  const store = memStore();
  const { post, hub } = await publishedPost(store, { topic: 'Governance', thought: 'Published one' });
  // A private draft and a published TOPIC hub must not appear as feed posts.
  await funnel.createChild({ store, instanceId: COMM, ...alice, kind: 'thought', content: { thought: 'secret draft' }, parentId: hub.id });

  const items = await funnel.feed({ store, instanceId: COMM });
  assert.equal(items.length, 1, 'only the one published thought');
  assert.equal(items[0].id, post.id);
  assert.equal(items[0].ownerHandle, 'Alice', 'author field for the by-author lens');
  assert.equal(items[0].topicLabel, 'Governance', 'topic label for the by-topic lens');
  assert.equal(items[0].visibility, 'published');
});
