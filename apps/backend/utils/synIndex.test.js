const { test } = require('node:test');
const assert = require('node:assert/strict');

const index = require('./synIndex');

// In-memory index store implementing utils/synIndex.js's data-access surface,
// so the REAL indexing + retrieval logic (private-leak guard, cosine ranking,
// instanceId scoping) runs with no live MongoDB and no network.
function memIndexStore() {
  const rows = [];
  const keyOf = d => `${d.instanceId}|${d.kind}|${d.refId}`;
  return {
    _rows: rows,
    async upsert(doc) {
      const i = rows.findIndex(r => keyOf(r) === keyOf(doc));
      if (i >= 0) rows[i] = { ...rows[i], ...doc };
      else rows.push({ ...doc });
      return rows[rows.findIndex(r => keyOf(r) === keyOf(doc))];
    },
    async remove({ instanceId, kind, refId }) {
      const i = rows.findIndex(r => r.instanceId === instanceId && r.kind === kind && r.refId === refId);
      if (i >= 0) rows.splice(i, 1);
    },
    async removeByNode({ instanceId, nodeId }) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].instanceId === instanceId && rows[i].nodeId === nodeId) rows.splice(i, 1);
      }
    },
    async list(instanceId) {
      return rows.filter(r => r.instanceId === instanceId);
    },
  };
}

// A fake ChatModel: deterministic bag-of-terms embeddings over a fixed vocab, so
// cosine ordering is predictable. NO network, NO vendor SDK.
const VOCAB = ['quorum', 'governance', 'snack', 'color', 'budget'];
function fakeModel({ embedConfigured = true } = {}) {
  return {
    embedConfigured,
    info: { embed: { modelId: 'fake-embed' } },
    async embed(texts) {
      return texts.map(t => {
        const low = String(t).toLowerCase();
        return VOCAB.map(w => low.split(w).length - 1); // occurrence counts
      });
    },
  };
}

const COMM = 'comm1';

function thought(over = {}) {
  return {
    id: 'n1', instanceId: COMM, ownerHandle: 'Ada', kind: 'thought',
    content: { topic: '', thought: 'Quorum should scale with governance size.', context: '' },
    visibility: 'published', topicId: null,
    ...over,
  };
}

test('indexNode: PRIVATE-LEAK GUARD — only published thoughts are ever embedded', async () => {
  const store = memIndexStore();
  const model = fakeModel();

  const pub = await index.indexNode({ store, model, node: thought() });
  assert.ok(pub, 'a published thought is indexed');
  assert.equal(store._rows.length, 1);

  // A private/unpublished node is never embedded.
  const priv = await index.indexNode({ store, model, node: thought({ id: 'n2', visibility: 'private' }) });
  assert.equal(priv, null, 'private node refused');
  assert.equal(store._rows.length, 1, 'nothing written for the private node');

  // A topic hub (private scaffold) is never a post → never embedded.
  const hub = await index.indexNode({ store, model, node: { id: 'h1', instanceId: COMM, ownerHandle: 'Ada', kind: 'topic', content: { topic: 'Governance' }, visibility: 'published' } });
  assert.equal(hub, null, 'topic hub refused');
  assert.equal(store._rows.length, 1);

  // An empty-content published thought contributes no retrievable text.
  const empty = await index.indexNode({ store, model, node: thought({ id: 'n3', content: { thought: '', context: '' } }) });
  assert.equal(empty, null);
  assert.equal(store._rows.length, 1);
});

test('refreshNode: unpublishing removes the row from the corpus', async () => {
  const store = memIndexStore();
  const model = fakeModel();
  const node = thought();
  await index.refreshNode({ store, model, node });
  assert.equal(store._rows.length, 1);
  // Same node, now private → refresh removes it.
  await index.refreshNode({ store, model, node: { ...node, visibility: 'private' } });
  assert.equal(store._rows.length, 0, 'unpublished node is dropped from the index');
});

test('retrieve: top-k cosine ranking, instanceId-scoped, published-only', async () => {
  const store = memIndexStore();
  const model = fakeModel();

  // Two published thoughts in COMM: one on quorum/governance, one on snacks.
  await index.indexNode({ store, model, node: thought({ id: 'gov', content: { thought: 'Quorum should scale with governance.', context: '' } }) });
  await index.indexNode({ store, model, node: thought({ id: 'snack', content: { thought: 'We should bring snacks to meetings.', context: '' } }) });

  // A node in ANOTHER community — must be scoped out even though it matches.
  await index.indexNode({ store, model, node: thought({ id: 'other', instanceId: 'comm2', content: { thought: 'Quorum governance quorum.', context: '' } }) });

  // A STALE private row (simulating a missed removal) — must never be returned.
  store._rows.push({
    instanceId: COMM, kind: 'node', refId: 'leak', nodeId: 'leak',
    ownerHandle: 'Ghost', text: 'Secret quorum governance draft', visibility: 'private',
    vector: [5, 5, 0, 0, 0],
  });

  const hits = await index.retrieve({ store, model, instanceId: COMM, queryText: 'quorum governance', k: 5 });

  const ids = hits.map(h => h.refId);
  assert.equal(hits[0].refId, 'gov', 'best match ranks first');
  assert.ok(!ids.includes('other'), 'other community is scoped out');
  assert.ok(!ids.includes('leak'), 'PRIVATE-LEAK GUARD: private row never retrieved');
  assert.deepEqual(ids.sort(), ['gov', 'snack'], 'only COMM published rows returned');
  // Snacks node is unrelated → ranks below the governance node.
  const snackHit = hits.find(h => h.refId === 'snack');
  assert.ok(hits[0].score >= snackHit.score);
});

test('retrieve: empty query returns nothing; unconfigured model throws', async () => {
  const store = memIndexStore();
  const model = fakeModel();
  await index.indexNode({ store, model, node: thought() });

  assert.deepEqual(await index.retrieve({ store, model, instanceId: COMM, queryText: '   ' }), []);
  await assert.rejects(
    () => index.retrieve({ store, model: fakeModel({ embedConfigured: false }), instanceId: COMM, queryText: 'quorum' }),
    /LLM not configured/,
  );
});

test('indexReply: a public reply on a published post is embedded by its context prose', async () => {
  const store = memIndexStore();
  const model = fakeModel();
  const post = thought({ id: 'p1', visibility: 'published' });
  const reply = { id: 'e1', username: 'Bo', text: 'I think quorum is the wrong lever entirely.' };

  const row = await index.indexReply({ store, model, entry: reply, post });
  assert.ok(row);
  assert.equal(store._rows[0].kind, 'reply');
  assert.equal(store._rows[0].refId, 'e1');
  assert.equal(store._rows[0].nodeId, 'p1', 'reply cites its post node');
  assert.equal(store._rows[0].ownerHandle, 'Bo', 'attribution by handle');

  // A reply on a PRIVATE post is never indexed.
  const onPrivate = await index.indexReply({ store, model, entry: reply, post: { ...post, visibility: 'private' } });
  assert.equal(onPrivate, null);

  // A stance-only reply (no prose) carries no retrievable language → dropped.
  const dropped = await index.indexReply({ store, model, entry: { id: 'e1', username: 'Bo', text: '   ' }, post });
  assert.equal(dropped, null);
  assert.equal(store._rows.length, 0, 'the prior row for this reply is removed');
});
