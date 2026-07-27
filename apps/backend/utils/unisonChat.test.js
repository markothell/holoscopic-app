const { test } = require('node:test');
const assert = require('node:assert/strict');

const chat = require('./unisonChat');

const COMM = 'comm1';

// A model that would THROW if its stream were ever called — proves the silence
// guard never invokes the model, and that citation assembly needs no model output.
function tripwireModel() {
  return {
    embedConfigured: true,
    async *stream() { throw new Error('model.stream must not be called'); },
  };
}

// Inject a fake retrieval set so prepareAnswer's ranking-independent logic
// (citation assembly, silence guard, prompt shaping) is exercised directly.
function fakeRetrieve(hits) {
  return async () => hits;
}

test('prepareAnswer: citations come from the retrieval set, deduped, rank-ordered', async () => {
  const hits = [
    { score: 0.91, kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada', text: 'Quorum should scale.' },
    { score: 0.62, kind: 'reply', nodeId: 'p9', refId: 'e5', ownerHandle: 'Bo', text: 'Disagree — size is the wrong axis.' },
    { score: 0.40, kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada', text: 'dup of n1' },
  ];
  const prepared = await chat.prepareAnswer({
    model: tripwireModel(), retrieve: fakeRetrieve(hits),
    instanceId: COMM, query: 'How should quorum work?',
  });

  assert.equal(prepared.silent, false);
  assert.deepEqual(prepared.citations, [
    { kind: 'node', nodeId: 'n1', ownerHandle: 'Ada', anchorUrl: '/unison/n/n1', layer: 'thought' },
    { kind: 'reply', nodeId: 'p9', ownerHandle: 'Bo', anchorUrl: '/unison/n/p9#reply-e5', replyId: 'e5' },
  ], 'assembled from retrieval set, deduped by (kind,refId), in rank order');

  assert.equal(prepared.system, chat.SYSTEM_PROMPT);
  const last = prepared.messages[prepared.messages.length - 1];
  assert.equal(last.role, 'user');
  assert.match(last.content, /CONTEXT/);
  assert.match(last.content, /Ada: Quorum should scale\./);
  assert.match(last.content, /Bo \(reply\): Disagree/);
  assert.match(last.content, /Question: How should quorum work\?/);
});

test('prepareAnswer: REFUSE-WHEN-SILENT — empty corpus deflects without calling the model', async () => {
  const prepared = await chat.prepareAnswer({
    model: tripwireModel(), retrieve: fakeRetrieve([]),
    instanceId: COMM, query: 'What does the group think about taxes?',
  });
  assert.equal(prepared.silent, true);
  assert.equal(prepared.refusal, chat.SILENT_ANSWER);
  assert.deepEqual(prepared.citations, []);
  assert.equal(prepared.messages, undefined, 'no prompt is built when the corpus is silent');
});

test('prepareAnswer: hits below the relevance floor count as silence (no hallucinated opinion)', async () => {
  const weak = [
    { score: 0.05, kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada', text: 'unrelated' },
    { score: 0.10, kind: 'node', nodeId: 'n2', refId: 'n2', ownerHandle: 'Bo', text: 'also unrelated' },
  ];
  const prepared = await chat.prepareAnswer({
    model: tripwireModel(), retrieve: fakeRetrieve(weak),
    instanceId: COMM, query: 'anything?', minScore: 0.15,
  });
  assert.equal(prepared.silent, true, 'weak-only retrieval is treated as silence');
  assert.deepEqual(prepared.citations, []);
});

test('prepareAnswer: mixes relevant hits and drops sub-floor ones from the context', async () => {
  const hits = [
    { score: 0.80, kind: 'node', nodeId: 'a', refId: 'a', ownerHandle: 'Ada', text: 'strong' },
    { score: 0.05, kind: 'node', nodeId: 'b', refId: 'b', ownerHandle: 'Bo', text: 'noise' },
  ];
  const prepared = await chat.prepareAnswer({
    model: tripwireModel(), retrieve: fakeRetrieve(hits),
    instanceId: COMM, query: 'q', minScore: 0.15,
  });
  assert.equal(prepared.silent, false);
  assert.equal(prepared.citations.length, 1, 'only the above-floor hit is cited');
  assert.equal(prepared.citations[0].nodeId, 'a');
  assert.doesNotMatch(prepared.messages[prepared.messages.length - 1].content, /noise/);
});

test('prepareAnswer: prior history is included as prior turns', async () => {
  const hits = [{ score: 0.9, kind: 'node', nodeId: 'a', refId: 'a', ownerHandle: 'Ada', text: 'ctx' }];
  const history = [
    { role: 'user', content: 'earlier question' },
    { role: 'assistant', content: 'earlier answer' },
  ];
  const prepared = await chat.prepareAnswer({
    model: tripwireModel(), retrieve: fakeRetrieve(hits),
    instanceId: COMM, query: 'follow-up', history,
  });
  assert.equal(prepared.messages[0].content, 'earlier question');
  assert.equal(prepared.messages[1].content, 'earlier answer');
  assert.match(prepared.messages[2].content, /follow-up/);
});

test('prepareAnswer: empty question is rejected', async () => {
  await assert.rejects(
    () => chat.prepareAnswer({ model: tripwireModel(), retrieve: fakeRetrieve([]), instanceId: COMM, query: '   ' }),
    /A question is required/,
  );
});

test('assembleCitations: node vs reply anchor URLs', () => {
  const cites = chat.assembleCitations([
    { kind: 'node', nodeId: 'n1', refId: 'n1', ownerHandle: 'Ada' },
    { kind: 'reply', nodeId: 'p2', refId: 'e3', ownerHandle: 'Bo' },
  ]);
  assert.equal(cites[0].anchorUrl, '/unison/n/n1');
  assert.equal(cites[1].anchorUrl, '/unison/n/p2#reply-e3');
});
