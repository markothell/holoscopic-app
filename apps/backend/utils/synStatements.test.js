const { test } = require('node:test');
const assert = require('node:assert/strict');

const statements = require('./synStatements');

// In-memory store over the funnel's data-access surface — same pattern as
// synNodes.test.js / synIdeas.test.js. Exercises the REAL funnel (the shared
// slot budget, the ⅔ threshold, the tie-break) with no MongoDB.
function memStore({ collaborators = 3, slots = 3, threshold = 2 / 3 } = {}) {
  const docs = new Map();
  const instance = {
    id: 'idea1',
    config: {
      synthesis: {
        statementSlots: slots,
        synthesisThreshold: threshold,
        synthesisStatementId: null,
        synthesisReachedAt: null,
      },
    },
  };
  let clock = 0;
  return {
    _docs: docs,
    _instance: instance,
    async getStatement(id) { return docs.get(id) || null; },
    async insertStatement(fields) {
      const doc = { ...fields, createdAt: new Date(++clock * 1000), updatedAt: new Date() };
      docs.set(doc.id, doc);
      return doc;
    },
    async saveStatement(doc) { docs.set(doc.id, doc); return doc; },
    async listLive(instanceId) {
      return [...docs.values()].filter(d => d.instanceId === instanceId && d.status === 'live');
    },
    async listHeldBy(instanceId, userId) {
      return [...docs.values()].filter(
        d => d.instanceId === instanceId && d.status === 'live'
          && (d.authorId === userId || (d.voterIds || []).includes(userId)),
      );
    },
    async countCollaborators() { return collaborators; },
    async getInstance() { return instance; },
    async saveInstance(doc) { return doc; },
  };
}

const IDEA = 'idea1';
const author = { userId: 'alice', authorHandle: 'Ally' };

async function submit(store, text, who = author) {
  return statements.submitStatement({ store, instanceId: IDEA, ...who, text });
}

// ── The budget (D14) ────────────────────────────────────────────────────────

test('slot budget: authoring and voting draw on ONE shared allowance', async () => {
  const store = memStore({ slots: 3 });
  await submit(store, 'first');                       // alice: 1 authored
  const bobs = await submit(store, 'second', { userId: 'bob', authorHandle: 'Bo' });
  const cals = await submit(store, 'third', { userId: 'cal', authorHandle: 'Cal' });

  // Alice backs two of someone else's — that's her remaining two slots.
  await statements.voteStatement({ store, instanceId: IDEA, statementId: bobs.id, userId: 'alice' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: cals.id, userId: 'alice' });

  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 3);
});

test('slot budget: the 3rd slot is allowed and the 4th is refused', async () => {
  const store = memStore({ slots: 3 });
  await submit(store, 'one');
  await submit(store, 'two');
  await submit(store, 'three');
  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 3);

  await assert.rejects(() => submit(store, 'four'), /holding all 3 of your statement slots/);
});

test('slot budget: voting on a 4th statement past the budget is refused', async () => {
  const store = memStore({ slots: 3 });
  await submit(store, 'one');
  await submit(store, 'two');
  await submit(store, 'three');
  const other = await submit(store, 'theirs', { userId: 'bob', authorHandle: 'Bo' });

  await assert.rejects(
    () => statements.voteStatement({ store, instanceId: IDEA, statementId: other.id, userId: 'alice' }),
    /holding all 3 of your statement slots/,
  );
});

test('slot budget: withdrawing frees the slot it held', async () => {
  const store = memStore({ slots: 3 });
  await submit(store, 'one');
  await submit(store, 'two');
  const third = await submit(store, 'three');

  await statements.withdrawStatement({ store, instanceId: IDEA, statementId: third.id, userId: 'alice' });
  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 2);
  await assert.doesNotReject(() => submit(store, 'a replacement'));
});

test('slot budget: un-voting frees the slot', async () => {
  const store = memStore({ slots: 3 });
  const theirs = await submit(store, 'theirs', { userId: 'bob', authorHandle: 'Bo' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: theirs.id, userId: 'alice' });
  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 1);

  await statements.voteStatement({ store, instanceId: IDEA, statementId: theirs.id, userId: 'alice' });
  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 0, 'toggled off');
});

// Authoring already spent the slot; a self-vote must not spend a second one,
// or putting something forward would silently cost double.
test('slot budget: voting on your own statement costs no extra slot', async () => {
  const store = memStore({ slots: 3 });
  const mine = await submit(store, 'mine');
  await statements.voteStatement({ store, instanceId: IDEA, statementId: mine.id, userId: 'alice' });

  assert.equal(await statements.slotsUsed({ store, instanceId: IDEA, userId: 'alice' }), 1);
  const stored = await store.getStatement(mine.id);
  assert.equal(stored.voteCount, 1);
});

// ── Reaching Synthesis (D12) ────────────────────────────────────────────────

test('threshold: votesNeeded rounds UP — a fraction of a collaborator never clears the bar', () => {
  assert.equal(statements.votesNeeded(3, 2 / 3), 2);
  assert.equal(statements.votesNeeded(4, 2 / 3), 3, '2.67 rounds to 3');
  assert.equal(statements.votesNeeded(6, 2 / 3), 4);
  assert.equal(statements.votesNeeded(1, 2 / 3), 1, 'a lone collaborator still needs their own vote');
});

test('the measure: just under the bar, the group is not in synthesis', async () => {
  const store = memStore({ collaborators: 6 }); // needs 4
  const s = await submit(store, 'where we land');
  for (const u of ['alice', 'bob', 'cal']) {
    await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: u });
  }
  const state = await statements.synthesisState({ store, instanceId: IDEA });
  assert.equal(state.backing, 3);
  assert.equal(state.inSynthesis, false);
  assert.equal(state.share, 0.5);
  assert.equal(store._instance.config.synthesis.synthesisStatementId, null);
});

test('the measure: at exactly the bar the group is in synthesis, and the idea is stamped', async () => {
  const store = memStore({ collaborators: 6 }); // needs 4
  const s = await submit(store, 'where we land');
  let result;
  for (const u of ['alice', 'bob', 'cal', 'dee']) {
    result = await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: u });
  }
  assert.equal(result.enteredSynthesis, true);
  assert.equal(result.state.inSynthesis, true);
  assert.equal(result.state.leadingStatementId, s.id);
  // The statement itself carries no winner flag — synthesis is the group's.
  assert.equal(result.statement.status, 'live');
  assert.equal(store._instance.config.synthesis.synthesisStatementId, s.id);
  assert.ok(store._instance.config.synthesis.synthesisReachedAt);
});

// The heart of the living measure: backing drains away and the group is
// simply no longer in synthesis. Nothing had to be reopened.
test('the measure: losing backing drops the group back out of synthesis', async () => {
  const store = memStore({ collaborators: 3 }); // needs 2
  const s = await submit(store, 'we agree for now');
  await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'alice' });
  const entered = await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' });
  assert.equal(entered.enteredSynthesis, true);
  assert.equal(store._instance.config.synthesis.synthesisStatementId, s.id);

  // Bob toggles his backing off.
  const left = await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' });
  assert.equal(left.leftSynthesis, true);
  assert.equal(left.state.inSynthesis, false);
  assert.equal(store._instance.config.synthesis.synthesisStatementId, null, 'the stamp clears too');
});

// The third who never voted can still move the group. No ceremony.
test('the measure: a better-backed statement takes over as the group synthesis', async () => {
  const store = memStore({ collaborators: 4, slots: 9 }); // needs 3
  const first = await submit(store, 'first wording');
  const better = await submit(store, 'better wording');

  for (const u of ['alice', 'bob', 'cal']) {
    await statements.voteStatement({ store, instanceId: IDEA, statementId: first.id, userId: u });
  }
  assert.equal(store._instance.config.synthesis.synthesisStatementId, first.id);

  // The quiet fourth reads it, disagrees, and backs the other wording — and
  // two others move across with them.
  for (const u of ['dee', 'alice', 'bob']) {
    await statements.voteStatement({ store, instanceId: IDEA, statementId: better.id, userId: u });
  }
  // alice and bob moving across also drops `first` below the bar.
  for (const u of ['alice', 'bob']) {
    await statements.voteStatement({ store, instanceId: IDEA, statementId: first.id, userId: u });
  }

  const state = await statements.synthesisState({ store, instanceId: IDEA });
  assert.equal(state.leadingStatementId, better.id, 'the group moved');
  assert.equal(state.inSynthesis, true);
  assert.equal(store._instance.config.synthesis.synthesisStatementId, better.id);
});

test('the measure: stillToWeighIn counts collaborators who have spent no slot', async () => {
  const store = memStore({ collaborators: 5 });
  const s = await submit(store, 'a claim');                     // alice engaged
  await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' });
  const state = await statements.synthesisState({ store, instanceId: IDEA });
  assert.equal(state.stillToWeighIn, 3, 'five collaborators, two have acted');
});

// They are your words. Agreement must not become a trap.
test('withdraw: only the author may — and may even withdraw the current synthesis', async () => {
  const store = memStore({ collaborators: 3 }); // needs 2
  const s = await submit(store, 'mine');
  await assert.rejects(
    () => statements.withdrawStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' }),
    /Only the author/,
  );

  await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'alice' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' });
  assert.equal(store._instance.config.synthesis.synthesisStatementId, s.id);

  const result = await statements.withdrawStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'alice' });
  assert.equal(result.leftSynthesis, true);
  assert.equal(store._instance.config.synthesis.synthesisStatementId, null);
});

// ── Leaderboard ─────────────────────────────────────────────────────────────

test('leaderboard: ranks by votes, breaks ties on the earlier submission', async () => {
  const store = memStore({ collaborators: 6, slots: 9 }); // needs 4
  const early = await submit(store, 'early');
  const late = await submit(store, 'late');
  const top = await submit(store, 'top');

  await statements.voteStatement({ store, instanceId: IDEA, statementId: early.id, userId: 'bob' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: late.id, userId: 'cal' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: top.id, userId: 'bob' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: top.id, userId: 'cal' });

  const board = await statements.leaderboard({ store, instanceId: IDEA, userId: 'alice' });
  assert.deepEqual(board.statements.map(s => s.text), ['top', 'early', 'late']);
  assert.equal(board.votesToReach, 4);
  assert.equal(board.statements[0].votesNeeded, 2, 'top has 2 of the 4 it needs');
  assert.equal(board.statements[0].mine, true);
});

test('leaderboard: a synthesized statement pins to the top and reports my slot usage', async () => {
  const store = memStore({ collaborators: 3, slots: 3 }); // needs 2
  const settled = await submit(store, 'settled');
  const loud = await submit(store, 'loud but late', { userId: 'bob', authorHandle: 'Bo' });

  await statements.voteStatement({ store, instanceId: IDEA, statementId: settled.id, userId: 'bob' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: settled.id, userId: 'cal' });
  await statements.voteStatement({ store, instanceId: IDEA, statementId: loud.id, userId: 'cal' });

  const board = await statements.leaderboard({ store, instanceId: IDEA, userId: 'alice' });
  assert.equal(board.statements[0].text, 'settled');
  assert.equal(board.statements[0].isSynthesis, true, 'the leading wording, above the bar');
  assert.equal(board.leadingStatementId, settled.id);
  assert.equal(board.inSynthesis, true);
  assert.equal(board.slotsTotal, 3);
  // Slots stay held while the statement is live — which it always is, since
  // synthesis never freezes anything. The group can still move.
  assert.equal(board.slotsUsed, 1, 'alice still holds the slot she authored with');
});

test('leaderboard: reports each statement\'s share of the group and the distance to the bar', async () => {
  const store = memStore({ collaborators: 4, slots: 9 }); // needs 3
  const s = await submit(store, 'a wording');
  await statements.voteStatement({ store, instanceId: IDEA, statementId: s.id, userId: 'bob' });

  const board = await statements.leaderboard({ store, instanceId: IDEA, userId: 'alice' });
  const row = board.statements[0];
  assert.equal(row.voteCount, 1);
  assert.equal(row.share, 0.25, 'one of four collaborators');
  assert.equal(row.votesNeeded, 2, 'two more to carry the group');
  assert.equal(row.isLeading, true);
  assert.equal(row.isSynthesis, false, 'leading is not the same as reaching');
  assert.equal(board.share, 0.25, 'the group meter tracks its best-backed wording');
});

test('submitStatement: requires text', async () => {
  const store = memStore();
  await assert.rejects(() => submit(store, '   '), /needs some text/);
});
