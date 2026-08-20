const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createModule, normalizeSeed } = require('./synthesisActivity');

// In-memory stand-in for the three collections the module reads. Same
// injectable-store pattern as every other funnel test here — no DB, no LLM.
function memStore({ ideas = {}, members = {}, contributors = {} } = {}) {
  return {
    async getIdea(id) { return ideas[id] || null; },
    async isIdeaMember(ideaId, userId) { return (members[ideaId] || []).includes(userId); },
    async contributorIds(ideaId) { return contributors[ideaId] || []; },
  };
}

const IDEAS = { i1: { id: 'i1', name: 'What holds us', slug: 'idea-ABC12' } };

test('normalizeSeed: points a seed at an idea and snapshots its title', async () => {
  const store = memStore({ ideas: IDEAS, members: { i1: ['alice'] } });
  const payload = await normalizeSeed({ store }, { ideaId: 'i1' }, { userId: 'alice' });

  assert.equal(payload.ideaId, 'i1');
  assert.equal(payload.ideaCode, 'ABC12', 'the slug prefix is stripped back to the shareable code');
  assert.equal(payload.title, 'What holds us');
  assert.equal(payload.topic, 'What holds us', 'every generic circle surface labels a seed from payload.topic');
});

test('normalizeSeed: you can only share a document you are in', async () => {
  const store = memStore({ ideas: IDEAS, members: { i1: ['alice'] } });
  // Knowing an id is not enough — otherwise it would expose a private draft.
  await assert.rejects(
    () => normalizeSeed({ store }, { ideaId: 'i1' }, { userId: 'stranger' }),
    /only share an idea you are part of/,
  );
  await assert.rejects(
    () => normalizeSeed({ store }, { ideaId: 'nope' }, { userId: 'alice' }),
    /Idea not found/,
  );
  await assert.rejects(
    () => normalizeSeed({ store }, {}, { userId: 'alice' }),
    /Which idea are you sharing/,
  );
});

test('the module declares nominateFirst — shared before it is queued', async () => {
  const mod = createModule({ store: memStore() });
  assert.equal(mod.nominateFirst, true);
  assert.deepEqual(mod.phases, ['exploring']);
});

test('isMemberDone is never true, so a synthesis cycle never closes itself', async () => {
  const mod = createModule({ store: memStore() });
  assert.equal(await mod.isMemberDone({ userId: 'alice' }), false);
});

test('participation names contributors — synthesis is attributed, so nothing is withheld', async () => {
  const store = memStore({ ideas: IDEAS, contributors: { i1: ['alice', 'bob'] } });
  const mod = createModule({ store });
  const seed = { id: 's1', phase: 'nominated', payload: { ideaId: 'i1', title: 'What holds us' } };

  const row = await mod.participation({ seed, viewerId: 'bob' });
  assert.deepEqual(row.tellerIds, ['alice', 'bob']);
  assert.equal(row.tellerCount, 2);
  assert.equal(row.iTold, true);

  // A nominated document nobody has touched still draws — it is the sharer's
  // spur on the circle map, which is the whole outer-ring story.
  const empty = createModule({ store: memStore({ ideas: IDEAS, contributors: { i1: [] } }) });
  const none = await empty.participation({ seed, viewerId: 'bob' });
  assert.deepEqual(none, { tellerIds: [], tellerCount: 0, iTold: false });
});

test('notificationFor: opening says the circle is on it; closing says it is a pause', async () => {
  const mod = createModule({ store: memStore() });
  const circle = { title: 'Harbor', urlName: 'harbor' };
  const seed = { payload: { title: 'What holds us' } };

  const open = await mod.notificationFor({ circle, seed, phase: 'exploring', userId: 'u' });
  assert.match(open.subject, /Harbor is on "What holds us"/);

  const closed = await mod.notificationFor({ circle, seed, phase: 'revealed', userId: 'u' });
  assert.match(closed.subject, /closed for now/);
  assert.match(closed.text, /still there/, 'closing is a pause; it must not read as deletion');

  // The circle's own states belong to the circle's module, not this one.
  assert.equal(await mod.notificationFor({ circle, seed, phase: 'idle', userId: 'u' }), null);
});
