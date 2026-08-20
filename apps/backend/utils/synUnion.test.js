const { test } = require('node:test');
const assert = require('node:assert/strict');

const synthesis = require('./synUnion');

const COMM = 'comm1';

// ── fakes ────────────────────────────────────────────────────────────────

// In-memory embedding-index store (utils/synIndex.js's data-access shape)
// so selectCorpus's published-only filter is exercised with no live MongoDB.
function memIndexStore(rows) {
  return { async list(instanceId) { return rows.filter(r => r.instanceId === instanceId); } };
}

// In-memory positional store (utils/synUnion.js's positionalMongoStore
// shape): the idea's thoughts + their positioned replies + frames.
function memPositionalStore({ posts = [], repliesByPost = {}, frames = [] }) {
  return {
    async findThoughts(instanceId) {
      return posts.filter(p => p.instanceId === instanceId);
    },
    async findPositionedReplies(nodeId) {
      return repliesByPost[nodeId] || [];
    },
    async getFrames(ids) {
      return frames.filter(f => ids.includes(f.id));
    },
  };
}

// In-memory cache store (utils/synUnion.js's cacheMongoStore shape).
function memCacheStore() {
  const docs = new Map();
  return {
    _docs: docs,
    async findOne(instanceId) { return docs.get(instanceId) || null; },
    async getOrCreate(instanceId) {
      if (!docs.has(instanceId)) docs.set(instanceId, { instanceId, corpusVersion: 0 });
      return docs.get(instanceId);
    },
    async incCorpusVersion(instanceId) {
      const doc = docs.get(instanceId) || { instanceId, corpusVersion: 0 };
      doc.corpusVersion = (doc.corpusVersion || 0) + 1;
      docs.set(instanceId, doc);
      return doc;
    },
    async setDepth(instanceId, depth, artifact) {
      const doc = docs.get(instanceId) || { instanceId, corpusVersion: 0 };
      doc[depth] = artifact;
      docs.set(instanceId, doc);
      return doc;
    },
  };
}

function frame(id, poleA, poleB) {
  return { id, poleA, poleB };
}

function reply(x, y) {
  return { position: { x, y } };
}

// ── selectCorpus ─────────────────────────────────────────────────────────

test('selectCorpus: every row of THIS idea, and nothing from another', async () => {
  const store = memIndexStore([
    { instanceId: COMM, kind: 'node', refId: 'n1', nodeId: 'n1', ownerHandle: 'Ada', text: 'a thought' },
    { instanceId: COMM, kind: 'node', refId: 'n2', nodeId: 'n2', ownerHandle: 'Bo', text: 'another thought, written a moment ago' },
    { instanceId: 'other-comm', kind: 'node', refId: 'n3', nodeId: 'n3', ownerHandle: 'Cy', text: 'a different idea entirely' },
  ]);
  const hits = await synthesis.selectCorpus({ store, instanceId: COMM });
  assert.equal(hits.length, 2, 'the whole idea is the corpus — there is no draft state to exclude');
  assert.deepEqual(hits.map(h => h.refId).sort(), ['n1', 'n2']);
});

test('selectCorpus: empty corpus returns []', async () => {
  const hits = await synthesis.selectCorpus({ store: memIndexStore([]), instanceId: COMM });
  assert.deepEqual(hits, []);
});

test('selectCorpus: requires instanceId', async () => {
  await assert.rejects(() => synthesis.selectCorpus({ store: memIndexStore([]), instanceId: '' }), /instanceId is required/);
});

// ── computePositional ────────────────────────────────────────────────────

test('computePositional: 2-axis orientation — poleA is the "most" end (right on x, top on y)', async () => {
  const f = [frame('fx', 'considered', 'instinctive'), frame('fy', 'collective', 'personal')];
  const posts = [{ id: 'p1', instanceId: COMM, ownerHandle: 'Ada', axisFrameIds: ['fx', 'fy'], content: { thought: 'a ritual is a decision you no longer make' } }];
  // All 5 replies in the poleA+poleA quadrant (x>=0.5, y>=0.5) → "considered+collective".
  const repliesByPost = { p1: [reply(0.9, 0.9), reply(0.8, 0.8), reply(0.7, 0.9), reply(0.6, 0.7), reply(0.9, 0.6)] };
  const store = memPositionalStore({ posts, repliesByPost, frames: f });

  const lines = await synthesis.computePositional({ store, instanceId: COMM });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'node');
  assert.equal(lines[0].nodeId, 'p1');
  assert.equal(lines[0].ownerHandle, 'Ada');
  assert.ok(lines[0].preformatted, 'renders bare, not behind a handle label');
  assert.match(lines[0].text, /instinctive↔considered × personal↔collective/, 'axis desc is poleB↔poleA per axis');
  assert.match(lines[0].text, /5 replies agree: considered\+collective\./);
});

test('computePositional: consensus vs. split — dominant cluster + dissenting minority named by the diverging axis', async () => {
  const f = [frame('fx', 'considered', 'instinctive'), frame('fy', 'collective', 'personal')];
  const posts = [{ id: 'p1', instanceId: COMM, ownerHandle: 'Ada', axisFrameIds: ['fx', 'fy'], content: { thought: 'a ritual is a decision you no longer make' } }];
  // 7 in considered+collective (A,A); 2 dissent leaning instinctive (B) but still collective (A).
  const repliesByPost = {
    p1: [
      reply(0.9, 0.9), reply(0.8, 0.8), reply(0.7, 0.9), reply(0.6, 0.7), reply(0.9, 0.6), reply(0.6, 0.6), reply(0.8, 0.7),
      reply(0.1, 0.8), reply(0.2, 0.9),
    ],
  };
  const store = memPositionalStore({ posts, repliesByPost, frames: f });

  const lines = await synthesis.computePositional({ store, instanceId: COMM });
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /7 of 9 replies cluster in considered\+collective; 2 lean instinctive\./);
});

test('computePositional: no clear majority renders as a straight split between the two largest buckets', async () => {
  const f = [frame('fx', 'considered', 'instinctive'), frame('fy', 'collective', 'personal')];
  const posts = [{ id: 'p1', instanceId: COMM, ownerHandle: 'Ada', axisFrameIds: ['fx', 'fy'], content: { thought: 't' } }];
  // 5 in considered+collective (A,A), 5 in instinctive+personal (B,B) — 50/50.
  const repliesByPost = {
    p1: [reply(0.9, 0.9), reply(0.8, 0.8), reply(0.7, 0.9), reply(0.6, 0.7), reply(0.9, 0.6),
      reply(0.1, 0.1), reply(0.2, 0.2), reply(0.1, 0.3), reply(0.3, 0.1), reply(0.05, 0.15)],
  };
  const store = memPositionalStore({ posts, repliesByPost, frames: f });

  const lines = await synthesis.computePositional({ store, instanceId: COMM });
  assert.match(lines[0].text, /the group splits between considered\+collective \(5\) and instinctive\+personal \(5\)\./);
});

test('computePositional: 1-axis renders a lean, not a quadrant', async () => {
  const f = [frame('fx', 'considered', 'instinctive')];
  const posts = [{ id: 'p1', instanceId: COMM, ownerHandle: 'Ada', axisFrameIds: ['fx'], content: { thought: 't' } }];
  const repliesByPost = { p1: [reply(0.9, 0), reply(0.8, 0), reply(0.7, 0)] };
  const store = memPositionalStore({ posts, repliesByPost, frames: f });

  const lines = await synthesis.computePositional({ store, instanceId: COMM });
  assert.match(lines[0].text, /instinctive↔considered/);
  assert.match(lines[0].text, /3 replies agree: considered\./);
  assert.doesNotMatch(lines[0].text, /\+/, '1-axis label has no quadrant "+" join');
});

test('computePositional: posts with no axes or no positioned replies contribute nothing', async () => {
  const posts = [
    { id: 'p1', instanceId: COMM, ownerHandle: 'Ada', axisFrameIds: [], content: { thought: 'no axes' } },
    { id: 'p2', instanceId: COMM, ownerHandle: 'Bo', axisFrameIds: ['fx'], content: { thought: 'no replies yet' } },
  ];
  const store = memPositionalStore({ posts, repliesByPost: {}, frames: [frame('fx', 'a', 'b')] });
  const lines = await synthesis.computePositional({ store, instanceId: COMM });
  assert.deepEqual(lines, []);
});

// ── citation assembly (relocated from synthesisChat.js) ────────────────────

test('assembleCitations: node vs reply anchor URLs, deduped by (kind, refId)', () => {
  const cites = synthesis.assembleCitations([
    { kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada' },
    { kind: 'reply', nodeId: 'p2', refId: 'e3', ownerHandle: 'Bo' },
    { kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada' }, // dup
  ]);
  assert.equal(cites.length, 2);
  assert.equal(cites[0].anchorUrl, '/synthesis/n/n1');
  assert.equal(cites[0].layer, 'thought');
  assert.equal(cites[1].anchorUrl, '/synthesis/n/p2#reply-e3');
  assert.equal(cites[1].replyId, 'e3');
});

test('renderContext: text chunks render "handle: text"; positional lines render bare', () => {
  const out = synthesis.renderContext([
    { kind: 'node', ownerHandle: 'Ada', text: 'Quorum should scale.' },
    { kind: 'reply', ownerHandle: 'Bo', text: 'Disagree.' },
    { kind: 'node', ownerHandle: 'Ada', text: 'On "t" (x↔y): 3 replies agree: y.', preformatted: true },
  ]);
  assert.match(out, /\[1\] Ada: Quorum should scale\./);
  assert.match(out, /\[2\] Bo \(reply\): Disagree\./);
  assert.match(out, /\[3\] On "t" \(x↔y\): 3 replies agree: y\./);
  assert.doesNotMatch(out, /\[3\] Ada:/);
});

// ── prepareSynthesis: empty guard + combined context ─────────────────────

test('prepareSynthesis: EMPTY GUARD — nothing published, no model call needed downstream', async () => {
  const prepared = await synthesis.prepareSynthesis({
    store: memIndexStore([]),
    positionalStore: memPositionalStore({ posts: [] }),
    instanceId: COMM, depth: 'brief',
  });
  assert.equal(prepared.empty, true);
  assert.equal(prepared.text, synthesis.EMPTY_TEXT);
  assert.deepEqual(prepared.citations, []);
  assert.equal(prepared.messages, undefined);
});

test('prepareSynthesis: combines text chunks and positional summaries into one CONTEXT, cites both', async () => {
  const textStore = memIndexStore([
    { instanceId: COMM, kind: 'node', refId: 'n1', nodeId: 'n1', ownerHandle: 'Ada', text: 'Quorum should scale with membership.' },
  ]);
  const f = [frame('fx', 'considered', 'instinctive')];
  const posStore = memPositionalStore({
    posts: [{ id: 'n2', instanceId: COMM, ownerHandle: 'Bo', axisFrameIds: ['fx'], content: { thought: 'ritual claim' } }],
    repliesByPost: { n2: [reply(0.9, 0), reply(0.8, 0)] },
    frames: f,
  });

  const prepared = await synthesis.prepareSynthesis({ store: textStore, positionalStore: posStore, instanceId: COMM, depth: 'brief' });
  assert.equal(prepared.empty, false);
  assert.equal(prepared.system, synthesis.SYNTHESIS_PROMPTS.brief);
  assert.equal(prepared.citations.length, 2);
  assert.deepEqual(prepared.citations.map(c => c.nodeId).sort(), ['n1', 'n2']);
  const content = prepared.messages[0].content;
  assert.match(content, /CONTEXT/);
  assert.match(content, /Ada: Quorum should scale with membership\./);
  assert.match(content, /On "ritual claim"/);
});

test('prepareSynthesis: rejects an unknown depth', async () => {
  await assert.rejects(
    () => synthesis.prepareSynthesis({ store: memIndexStore([]), positionalStore: memPositionalStore({ posts: [] }), instanceId: COMM, depth: 'medium' }),
    /depth must be 'brief' or 'full'/,
  );
});

// ── caching + staleness ──────────────────────────────────────────────────

test('markStale bumps corpusVersion; a cached artifact at the old version is stale', async () => {
  const store = memCacheStore();
  await synthesis.getOrCreateDoc(COMM, { store });
  await synthesis.saveDepth({ store, instanceId: COMM, depth: 'brief', text: 'The group leans X.', citations: [], model: 'claude-sonnet-5', corpusVersion: 0 });

  let doc = await synthesis.getCache(COMM, { store });
  let client = synthesis.toClientCache(doc);
  assert.equal(client.corpusVersion, 0);
  assert.equal(client.stale, false, 'freshly generated at the current version is not stale');

  await synthesis.markStale(COMM, { store }); // e.g. a new reply landed
  doc = await synthesis.getCache(COMM, { store });
  client = synthesis.toClientCache(doc);
  assert.equal(client.corpusVersion, 1);
  assert.equal(client.stale, true, 'brief.atCorpusVersion (0) no longer matches corpusVersion (1)');
  assert.equal(client.brief.text, 'The group leans X.', 'the stale artifact is still returned for display');
});

test('toClientCache: no doc at all → empty, not stale', () => {
  const client = synthesis.toClientCache(null);
  assert.deepEqual(client, { corpusVersion: 0, stale: false });
});

test('markStale is a no-op with no instanceId (never throws)', async () => {
  await synthesis.markStale(undefined, { store: memCacheStore() });
});
