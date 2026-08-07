const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// In-memory store implementing the funnel's data-access surface — same pattern
// as memories.test.js and synNodes.test.js. This drives the REAL machine (the
// three end conditions, the queue, the cascade guard, notification dedupe, D4's
// never-block rule) with no MongoDB and no mail, which is why it runs in
// milliseconds and offline.
//
// What it CANNOT see is the schema: there is no Mongoose in the loop here, so
// an enum this file never mentions stays green while every real write fails.
// scripts/check-circles.js is the standing answer to that.
function memStore() {
  const rows = [];
  const notifications = [];
  const emails = [];

  return {
    _circles: rows,
    _notifications: notifications,
    _emails: emails,

    async findCircleById(id) {
      return rows.find(c => c.id === id) || null;
    },
    async findCircleByUrlName(instanceId, urlName) {
      return rows.find(c => c.instanceId === instanceId && c.urlName === urlName) || null;
    },
    async listRunningCircles() {
      return rows.filter(c => c.status === 'running');
    },
    async createCircleDoc(fields) {
      // Mirrors the schema defaults in models/Circle.js. A field defaulted
      // there but missing here would let a machine bug that depends on it pass.
      const doc = {
        transitions: [],
        seeds: [],
        members: [],
        invitedEmails: [],
        requireInvitation: true,
        liveSeedId: null,
        phaseDeadline: null,
        startedAt: null,
        completedAt: null,
        ...fields,
        config: {
          shareHours: 72,
          rankHours: 72,
          advanceOnComplete: true,
          seedDefaults: {},
          ...(fields.config || {}),
        },
      };
      rows.push(doc);
      return doc;
    },
    async saveCircle(circle) { return circle; },
    async notify(args) { notifications.push(args); },
    async sendEmail(args) { emails.push(args); },
  };
}

// A stand-in activity: two phases, and done-ness driven by a set the test
// controls. Deliberately NOT Threshold — the machine must not know about it.
function stubActivity() {
  const state = { done: new Set(), revealed: [], completed: 0, opened: [], closed: [] };

  activities.reset();
  activities.register('stub', {
    phases: ['share', 'rank'],
    async normalizeSeed(payload) {
      if (!payload || !payload.topic) throw new Error('topic required');
      return { topic: String(payload.topic) };
    },
    async isMemberDone({ seed, phase, userId }) {
      return state.done.has(`${seed.id}:${phase}:${userId}`);
    },
    async onPhaseOpen({ seed, phase }) { state.opened.push(`${seed.id}:${phase}`); },
    async onPhaseClose({ seed, phase }) { state.closed.push(`${seed.id}:${phase}`); },
    async onCycleReveal({ seed }) {
      seed.result = { topic: seed.payload.topic };
      state.revealed.push(seed.id);
    },
    async onCircleComplete() { state.completed++; },
    async notificationFor({ phase, userId }) {
      return { subject: `${phase} for ${userId}`, text: 'body' };
    },
  });

  return state;
}

const HOUR = 60 * 60 * 1000;

/** An open circle with members and an empty queue — where every circle starts. */
async function openCircle(store, { members = 3, config = {}, activity = 'stub' } = {}) {
  const circle = await circles.createCircle({
    store,
    instanceId: 'inst1',
    activity,
    title: 'Authority',
    urlName: 'authority',
    createdBy: 'u1',
    creatorName: 'One',
    creatorEmail: 'one@example.com',
    mode: 'circle',
    requireInvitation: false,
    config,
  });
  for (let i = 2; i <= members; i++) {
    await circles.joinCircle({
      store, circleId: circle.id, userId: `u${i}`, username: `U${i}`, email: `u${i}@example.com`,
    });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

const post = (store, circle, userId, topic, extra = {}) =>
  circles.addSeed({ store, circleId: circle.id, userId, payload: { topic }, ...extra });

const seedFor = (circle, topic) => circle.seeds.find(s => s.payload.topic === topic);

function markDone(state, seed, phase, users) {
  for (const u of users) state.done.add(`${seed.id}:${phase}:${u}`);
}

/** Walk the live cycle from share to reveal with everybody finishing. */
async function runLiveCycle(store, circle, state, users) {
  const seed = circles.activeSeed(circle);
  markDone(state, seed, 'share', users);
  await circles.evaluate({ store, circle });
  markDone(state, seed, 'rank', users);
  await circles.evaluate({ store, circle });
  return seed;
}

beforeEach(() => { activities.reset(); });

// --- the queue --------------------------------------------------------------

test('a started circle with nothing queued is idle, and the first topic starts it', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  assert.equal(circle.phase, 'idle', 'open, waiting for a topic — not seeding, not finished');
  assert.equal(circle.status, 'running');
  assert.equal(circle.liveSeedId, null);

  await post(store, circle, 'u2', 'work');
  assert.equal(circle.phase, 'cycle');
  assert.equal(circle.liveSeedId, circle.seeds[0].id);
  assert.equal(circle.seeds[0].phase, 'share');
  assert.equal(circle.seeds[0].authorId, 'u2', 'nothing waited for the other two');
});

test('the queue runs in support order, with posting order as the tiebreak (D27)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  // The first post starts running immediately; the rest queue behind it.
  await post(store, circle, 'u1', 'live');
  await post(store, circle, 'u1', 'lonely');
  await post(store, circle, 'u2', 'popular');
  await post(store, circle, 'u3', 'tied');

  // 'popular' picks up two more; 'tied' matches 'lonely' at one and loses on age.
  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'popular').id, userId: 'u1' });
  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'popular').id, userId: 'u3' });

  assert.deepEqual(
    circles.queue(circle).map(s => s.payload.topic),
    ['popular', 'lonely', 'tied'],
  );

  await runLiveCycle(store, circle, state, ['u1', 'u2', 'u3']);
  assert.equal(circles.activeSeed(circle).payload.topic, 'popular', 'the group chose what runs next');
});

test('support is one per member, reversible, and only while a topic is waiting', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'live');
  await post(store, circle, 'u2', 'queued');
  const queued = seedFor(circle, 'queued');

  // Posting is supporting: the author is already on it.
  assert.deepEqual(queued.supporterIds, ['u2']);

  const on = await circles.supportSeed({ store, circleId: circle.id, seedId: queued.id, userId: 'u3' });
  assert.equal(on.supported, true);
  assert.equal(queued.supporterIds.length, 2);

  // Twice from the same member takes it back rather than counting twice.
  const off = await circles.supportSeed({ store, circleId: circle.id, seedId: queued.id, userId: 'u3' });
  assert.equal(off.supported, false);
  assert.deepEqual(queued.supporterIds, ['u2']);

  await assert.rejects(
    () => circles.supportSeed({ store, circleId: circle.id, seedId: circle.liveSeedId, userId: 'u3' }),
    /no longer waiting/,
    'a running topic has left the queue, so there is no order to change',
  );

  await runLiveCycle(store, circle, state, ['u1', 'u2', 'u3']);
  await circles.evaluate({ store, circle });
  await assert.rejects(
    () => circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'live').id, userId: 'u3' }),
    /no longer waiting/,
  );
});

test('a member may post more than one topic — the queue filters, not a one-each rule', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'first');
  await post(store, circle, 'u1', 'second');
  await post(store, circle, 'u1', 'third');

  assert.equal(circle.seeds.length, 3);
  assert.deepEqual(circles.queue(circle).map(s => s.payload.topic), ['second', 'third']);
});

test('editing your own queued topic replaces it; somebody else cannot', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'live');
  await post(store, circle, 'u2', 'draft');
  const mine = seedFor(circle, 'draft');

  await post(store, circle, 'u2', 'better', { seedId: mine.id });
  assert.equal(circle.seeds.length, 2, 'edited rather than added');
  assert.equal(mine.payload.topic, 'better');

  await assert.rejects(
    () => post(store, circle, 'u1', 'hijacked', { seedId: mine.id }),
    /Only the author/,
  );
  await assert.rejects(
    () => post(store, circle, 'u1', 'too late', { seedId: circle.liveSeedId }),
    /already been run/,
  );
});

test('promote beats the support order, and promotions keep their own order (D30)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'live');
  await post(store, circle, 'u1', 'popular');
  await post(store, circle, 'u2', 'promoted');
  await post(store, circle, 'u3', 'also-promoted');

  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'popular').id, userId: 'u2' });
  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'popular').id, userId: 'u3' });

  const now = new Date();
  await circles.promoteSeed({
    store, circleId: circle.id, seedId: seedFor(circle, 'promoted').id, userId: 'u1', now,
  });
  await circles.promoteSeed({
    store,
    circleId: circle.id,
    seedId: seedFor(circle, 'also-promoted').id,
    userId: 'u1',
    now: new Date(now.getTime() + 1000),
  });

  assert.deepEqual(
    circles.queue(circle).map(s => s.payload.topic),
    ['promoted', 'also-promoted', 'popular'],
    'the facilitator\'s judgment beats the count, in the order it was exercised',
  );

  await assert.rejects(
    () => circles.promoteSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'popular').id, userId: 'u3' }),
    /Only the circle creator/,
  );

  await runLiveCycle(store, circle, state, ['u1', 'u2', 'u3']);
  assert.equal(circles.activeSeed(circle).payload.topic, 'promoted');
});

test('promoting into an idle circle starts it', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2, config: { advanceOnComplete: false } });

  // advanceOnComplete off, so the first post queues without starting anything…
  circle.phase = 'idle';
  await post(store, circle, 'u2', 'a');
  assert.equal(circle.phase, 'cycle', 'an idle circle always starts on the queue, whatever the config');
});

// --- the cycle machine ------------------------------------------------------

test('three topics run one at a time, then the circle goes idle rather than finishing', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'work');
  await post(store, circle, 'u2', 'family');
  await post(store, circle, 'u3', 'money');

  assert.equal(circle.phase, 'cycle');
  assert.equal(circles.queue(circle).length, 2, 'one live, two waiting — never in parallel (D28)');

  for (let i = 0; i < 3; i++) {
    const seed = circles.activeSeed(circle);
    assert.equal(seed.phase, 'share', `cycle ${i} opens on share`);

    markDone(state, seed, 'share', ['u1', 'u2', 'u3']);
    await circles.evaluate({ store, circle });
    assert.equal(seed.phase, 'rank', `cycle ${i} advances to rank`);

    markDone(state, seed, 'rank', ['u1', 'u2', 'u3']);
    await circles.evaluate({ store, circle });
    assert.equal(seed.phase, 'revealed', `cycle ${i} reveals`);
    assert.deepEqual(seed.result, { topic: seed.payload.topic });
  }

  // D29 — an empty queue is a pause, not an ending.
  assert.equal(circle.phase, 'idle');
  assert.equal(circle.status, 'running');
  assert.equal(circle.completedAt, null);
  assert.equal(state.completed, 0, 'onCircleComplete is for closing, not for running out');
  assert.equal(state.revealed.length, 3);
});

test('an idle circle starts again the moment somebody posts (D29)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'first');
  await runLiveCycle(store, circle, state, ['u1', 'u2']);
  assert.equal(circle.phase, 'idle');

  await post(store, circle, 'u2', 'week six');
  assert.equal(circle.phase, 'cycle');
  assert.equal(circles.activeSeed(circle).payload.topic, 'week six');
});

test('deadline path advances exactly one phase per expiry, never cascading', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'work');
  await post(store, circle, 'u2', 'family');
  const first = circle.seeds[0];

  // Nobody ever completes anything; only the clock moves.
  let now = new Date(Date.now() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(first.phase, 'rank');
  // The phase it just opened takes its deadline from `now`, so one expiry can
  // never run the whole circle out in a single tick.
  assert.equal(circle.seeds[1].phase, 'pending');

  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(first.phase, 'revealed');
  assert.equal(circle.seeds[1].phase, 'share', 'the reveal rolls straight into the next topic');

  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(circle.phase, 'idle', 'and then waits, rather than closing itself');
});

test('D4: the machine never blocks on a person — nobody posts, the circle waits', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await circles.evaluate({ store, circle, now: new Date(Date.now() + 500 * HOUR) });

  assert.equal(circle.phase, 'idle');
  assert.equal(circle.seeds.length, 0);
  assert.equal(circle.status, 'running', 'nobody is waiting on topic twelve, because nobody promised one');
});

test('D4: an empty share round reveals empty and moves on', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'work');
  const seed = circle.seeds[0];

  await circles.evaluate({ store, circle, now: new Date(Date.now() + 73 * HOUR) });
  await circles.evaluate({ store, circle, now: new Date(Date.now() + 146 * HOUR) });
  assert.equal(seed.phase, 'revealed', 'nobody shared and nobody sorted, and it still ended');
});

test('manual advance: creator may, seed author may, another member may not', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u2', 'family');
  assert.equal(circle.seeds[0].phase, 'share');

  // u2 authored the live seed, so this cycle is theirs to move on.
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u2' });
  assert.equal(circle.seeds[0].phase, 'rank');

  // u3 is a member but neither the creator nor this topic's author.
  await assert.rejects(
    () => circles.advanceCircle({ store, circleId: circle.id, userId: 'u3' }),
    /creator or this topic's author/,
  );
  assert.equal(circle.seeds[0].phase, 'rank', 'the rejected call changed nothing');

  // The creator may advance any cycle, whoever authored it.
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.seeds[0].phase, 'revealed');

  const manual = circle.transitions.filter(t => t.via === 'manual');
  assert.ok(manual.some(t => t.byUserId === 'u2'), 'the advance records who did it');
});

test('a manual advance ends exactly one phase', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'work');
  await post(store, circle, 'u2', 'family');
  assert.equal(circle.seeds[0].phase, 'share');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.seeds[0].phase, 'rank');
  assert.equal(circle.seeds[1].phase, 'pending', 'the queued topic has not been touched');
});

test('advancing an idle circle has nothing to advance', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });
  await assert.rejects(
    () => circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' }),
    /no topic running/,
  );
});

test('advanceOnComplete false: completion is ignored, only the clock and the author advance', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2, config: { advanceOnComplete: false } });

  await post(store, circle, 'u1', 'work');
  const seed = circle.seeds[0];

  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'share', 'still share — completion is switched off');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(seed.phase, 'rank');
});

test('a phase with no clock ends only on completion or by hand (D16)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2, config: { shareHours: null } });

  await post(store, circle, 'u1', 'work');
  const seed = circle.seeds[0];
  assert.equal(seed.phaseDeadline, null);

  await circles.evaluate({ store, circle, now: new Date(Date.now() + 500 * HOUR) });
  assert.equal(seed.phase, 'share', 'no clock, so no expiry however long we wait');

  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'rank');
});

// --- facilitator tools ------------------------------------------------------

test('skip reveals what the topic has and moves to the next (D30)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'stuck');
  await post(store, circle, 'u2', 'next');
  const stuck = circle.seeds[0];

  await assert.rejects(
    () => circles.skipSeed({ store, circleId: circle.id, userId: 'u2' }),
    /Only the circle creator/,
  );

  await circles.skipSeed({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(stuck.phase, 'skipped');
  assert.ok(stuck.revealedAt, 'a skipped topic is revealed, not deleted');
  assert.deepEqual(stuck.result, { topic: 'stuck' }, 'nobody\'s story is thrown away');
  assert.deepEqual(state.revealed, [stuck.id]);

  assert.equal(circle.phase, 'cycle');
  assert.equal(circles.activeSeed(circle).payload.topic, 'next');
});

test('skipping the last topic leaves the circle idle, not finished', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'only');
  await circles.skipSeed({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(circle.phase, 'idle');
  assert.equal(circle.status, 'running');
});

test('close is the only way a circle ends, and only the creator may (D29)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  await post(store, circle, 'u1', 'work');
  await runLiveCycle(store, circle, state, ['u1', 'u2', 'u3']);
  assert.equal(circle.phase, 'idle');

  await assert.rejects(
    () => circles.closeCircle({ store, circleId: circle.id, userId: 'u2' }),
    /Only the circle creator/,
  );
  assert.equal(circle.phase, 'idle');

  await circles.closeCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'closed');
  assert.equal(circle.status, 'complete');
  assert.ok(circle.completedAt);
  assert.equal(state.completed, 1);

  // And a closed circle refuses everything.
  await assert.rejects(() => post(store, circle, 'u1', 'after'), /has finished/);
  await assert.rejects(
    () => circles.joinCircle({ store, circleId: circle.id, userId: 'u9', username: 'Nine' }),
    /has finished/,
  );
  await assert.rejects(
    () => circles.closeCircle({ store, circleId: circle.id, userId: 'u1' }),
    /has finished/,
  );
});

test('closing mid-cycle reveals the live topic on the way out', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'unfinished');
  const seed = circle.seeds[0];
  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'rank');

  await circles.closeCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(seed.phase, 'revealed', 'its stories and rankings exist, so its result is readable');
  assert.deepEqual(seed.result, { topic: 'unfinished' });
  assert.equal(circle.phase, 'closed');
});

test('single mode is a one-topic circle that closes itself on reveal (D1, D33)', async () => {
  const state = stubActivity();
  const store = memStore();

  const circle = await circles.createCircle({
    store,
    instanceId: 'inst1',
    activity: 'stub',
    title: 'Authority',
    createdBy: 'u1',
    creatorName: 'One',
    mode: 'single',
    requireInvitation: false,
    seedPayload: { topic: 'authority' },
  });
  assert.equal(circle.seeds.length, 1);
  assert.equal(circle.urlName, 'authority');

  await circles.joinCircle({ store, circleId: circle.id, userId: 'u2', username: 'U2' });
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(circle.phase, 'cycle', 'starts on its one topic, with no queue to wait for');
  await assert.rejects(() => post(store, circle, 'u1', 'another'), /single-topic circle/);

  await runLiveCycle(store, circle, state, ['u1', 'u2']);

  // The only place the two modes differ, and it is the ending, not the mechanic.
  assert.equal(circle.phase, 'closed');
  assert.equal(circle.status, 'complete');
  assert.equal(state.completed, 1);
});

test('single mode requires a seed at creation', async () => {
  stubActivity();
  const store = memStore();
  await assert.rejects(
    () => circles.createCircle({
      store, instanceId: 'inst1', activity: 'stub', title: 'T',
      createdBy: 'u1', mode: 'single',
    }),
    /single mode requires a seed/,
  );
});

// --- joining late (D32) -----------------------------------------------------

test('a member who joins in week six takes full part in the live cycle', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'early');
  await runLiveCycle(store, circle, state, ['u1', 'u2']);
  await post(store, circle, 'u2', 'current');
  const live = circles.activeSeed(circle);

  await circles.joinCircle({ store, circleId: circle.id, userId: 'u6', username: 'Six', email: 'six@example.com' });

  // The circle now waits on them like anybody else — nothing raced ahead
  // because they were not there when it opened.
  markDone(state, live, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(live.phase, 'share', 'the newcomer is a member, so the round waits for them');

  markDone(state, live, 'share', ['u6']);
  await circles.evaluate({ store, circle });
  assert.equal(live.phase, 'rank');

  // And they can support and post like anybody else.
  await post(store, circle, 'u6', 'mine');
  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'mine').id, userId: 'u1' });
  assert.equal(seedFor(circle, 'mine').supporterIds.length, 2);

  // Every past reveal is still there to read.
  assert.equal(circle.seeds.filter(s => s.phase === 'revealed').length, 1);
});

// --- notifications ----------------------------------------------------------

test('notifications: one per member per phase, and a re-evaluate does not re-send', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 3 });

  // An open circle with nothing queued asks for a topic — the one thing anybody
  // can do about it.
  assert.equal(store._emails.length, 3, 'going idle mails all three members');

  await post(store, circle, 'u1', 'work');
  const seed = circle.seeds[0];
  const afterOpen = store._emails.length;
  assert.equal(afterOpen, 6, 'the share phase opening mails all three again');

  // A second tick that changes nothing must not mail again.
  await circles.evaluate({ store, circle });
  assert.equal(store._emails.length, afterOpen);

  markDone(state, seed, 'share', ['u1', 'u2', 'u3']);
  await circles.evaluate({ store, circle });
  assert.equal(store._emails.length, afterOpen + 3, 'the rank phase mails once');

  await circles.evaluate({ store, circle });
  assert.equal(store._emails.length, afterOpen + 3, 'and re-evaluating does not repeat it');
});

test('passing through idle on the way to the next topic does not mail about idling', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'first');
  await post(store, circle, 'u2', 'second');

  const before = store._emails.length;
  await runLiveCycle(store, circle, state, ['u1', 'u2']);

  // reveal + the next share phase, and nothing asking for a topic there is one of.
  const subjects = store._emails.slice(before).map(e => e.subject);
  assert.equal(subjects.filter(s => s.startsWith('idle')).length, 0);
  assert.ok(subjects.some(s => s.startsWith('revealed')));
  assert.ok(subjects.some(s => s.startsWith('share')));
});

test('notificationFor returning null suppresses that member entirely', async () => {
  activities.reset();
  activities.register('stub', {
    phases: ['share'],
    async normalizeSeed(p) { return p; },
    async isMemberDone() { return false; },
    async notificationFor({ userId }) {
      return userId === 'u2' ? null : { subject: 's', text: 't' };
    },
  });

  const store = memStore();
  const circle = await openCircle(store, { members: 3 });
  await post(store, circle, 'u1', 'a');

  const recipients = store._emails.map(e => e.to);
  assert.ok(!recipients.includes('u2@example.com'));
  assert.ok(recipients.includes('u3@example.com'));
});

test('every phase notifies under ONE type, never one derived from the phase name', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await post(store, circle, 'u1', 'a');
  await runLiveCycle(store, circle, state, ['u1', 'u2']);
  await circles.closeCircle({ store, circleId: circle.id, userId: 'u1' });

  // Notification.type is a CLOSED enum. `circle_${phase}` fails validation for
  // any phase nobody added to it, and utils/notify.js swallows the error — so
  // the notifications just never appear. The registry's whole promise is that
  // a new activity declares its own phase names without touching the machine,
  // which only holds if the type does not depend on them.
  const types = new Set(store._notifications.map(n => n.type));
  assert.deepEqual([...types], ['circle_phase']);
  assert.ok(store._notifications.every(n => n.refType === 'circle' && n.refId === circle.id));
});

test('an opted-out member still gets the in-app notification, just no mail', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });
  circle.members.find(m => m.userId === 'u2').emailOptOut = true;

  // Only mail sent AFTER the opt-out counts — the idle notice already went out.
  const before = store._emails.length;
  const notifiedBefore = store._notifications.length;

  await post(store, circle, 'u1', 'a');

  const sent = store._emails.slice(before);
  const notified = store._notifications.slice(notifiedBefore);
  assert.ok(!sent.some(e => e.to === 'u2@example.com'), 'no mail after opting out');
  assert.ok(sent.some(e => e.to === 'one@example.com'), 'everyone else still mailed');
  assert.ok(notified.some(n => n.userId === 'u2'), 'the in-app notification still arrives');
});

test('a failing notification never rolls back the transition', async () => {
  activities.reset();
  activities.register('stub', {
    phases: ['share'],
    async normalizeSeed(p) { return p; },
    async isMemberDone() { return false; },
    async notificationFor() { throw new Error('mail vendor down'); },
  });

  const store = memStore();
  const circle = await openCircle(store, { members: 2 });
  await post(store, circle, 'u1', 'a');

  assert.equal(circle.phase, 'cycle', 'the transition stands');
  assert.equal(circle.seeds[0].phase, 'share');
});

test('a member with no email is skipped for mail but still notified', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 1 });
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u9', username: 'Nine' });

  await post(store, circle, 'u1', 'a');

  assert.ok(store._notifications.some(n => n.userId === 'u9'));
  assert.equal(store._emails.filter(e => !e.to).length, 0, 'never mails an empty address');
});

// --- the tick ---------------------------------------------------------------

test('sweepCircles advances every running circle and survives a broken one', async () => {
  const state = stubActivity();
  const store = memStore();

  const a = await openCircle(store, { members: 2 });
  await post(store, a, 'u1', 'a');

  const b = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'Other', urlName: 'other',
    createdBy: 'v1', creatorName: 'V', requireInvitation: false,
  });
  await circles.startCircle({ store, circleId: b.id, userId: 'v1' });
  // Point this one at an activity nobody registered — evaluate() throws for it.
  b.activity = 'gone';

  markDone(state, a.seeds[0], 'share', ['u1', 'u2']);
  const result = await circles.sweepCircles({ store });

  assert.equal(result.examined, 2);
  assert.equal(result.advanced, 1, 'the healthy circle advanced');
  assert.equal(a.seeds[0].phase, 'rank');
});

test('an idle circle is still swept, and costs nothing when the queue is empty', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  const result = await circles.sweepCircles({ store });
  assert.equal(result.examined, 1, 'idle is running, so the tick still looks at it');
  assert.equal(result.advanced, 0);
  assert.equal(circle.phase, 'idle');
});

// --- membership and creation ------------------------------------------------

test('posting a topic is closed to non-members', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await assert.rejects(
    () => post(store, circle, 'stranger', 'x'),
    /Not a member/,
  );
  await assert.rejects(
    () => circles.supportSeed({ store, circleId: circle.id, seedId: 'nope', userId: 'stranger' }),
    /Not a member/,
  );
});

test('normalizeSeed rejections propagate', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });

  await assert.rejects(
    () => circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: {} }),
    /topic required/,
  );
  assert.equal(circle.seeds.length, 0);
});

test('invitation gate', async () => {
  stubActivity();
  const store = memStore();
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'Closed', urlName: 'closed',
    createdBy: 'u1', creatorName: 'One',
    requireInvitation: true, invitedEmails: ['Yes@Example.com '],
  });

  await assert.rejects(
    () => circles.joinCircle({ store, circleId: circle.id, userId: 'u2', username: 'U2', email: 'no@example.com' }),
    /invitation only/,
  );
  // Invited emails are normalized on the way in, so case and whitespace match.
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u3', username: 'U3', email: 'yes@example.com' });
  assert.ok(circle.members.some(m => m.userId === 'u3'));
});

test('duplicate urlName in the same instance is refused, another instance is fine', async () => {
  stubActivity();
  const store = memStore();
  await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'Authority', createdBy: 'u1', creatorName: 'One',
  });
  await assert.rejects(
    () => circles.createCircle({
      store, instanceId: 'inst1', activity: 'stub', title: 'Authority', createdBy: 'u1', creatorName: 'One',
    }),
    /already exists/,
  );
  const other = await circles.createCircle({
    store, instanceId: 'inst2', activity: 'stub', title: 'Authority', createdBy: 'u1', creatorName: 'One',
  });
  assert.equal(other.urlName, 'authority');
});

test('creating against an unregistered activity fails at creation', async () => {
  activities.reset();
  const store = memStore();
  await assert.rejects(
    () => circles.createCircle({
      store, instanceId: 'inst1', activity: 'nope', title: 'T', createdBy: 'u1', creatorName: 'One',
    }),
    /no module registered/,
  );
});

test('a circle mode may open with its creator\'s first topic already queued', async () => {
  stubActivity();
  const store = memStore();
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'T', urlName: 'tee',
    createdBy: 'u1', creatorName: 'One', requireInvitation: false,
    seedPayload: { topic: 'opening' },
  });
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(circle.phase, 'cycle', 'no idle gap before the thing it was created to discuss');
  assert.equal(circles.activeSeed(circle).payload.topic, 'opening');
});

test('only the creator can start, and only once', async () => {
  stubActivity();
  const store = memStore();
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'T', createdBy: 'u1',
    creatorName: 'One', requireInvitation: false,
  });

  await assert.rejects(
    () => circles.startCircle({ store, circleId: circle.id, userId: 'u2' }),
    /Only the creator/,
  );
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  await assert.rejects(
    () => circles.startCircle({ store, circleId: circle.id, userId: 'u1' }),
    /already started/,
  );
});

// --- the wire shape ---------------------------------------------------------

test('toClient never leaks member emails, and never the supporter roster', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 2 });
  await post(store, circle, 'u1', 'a');
  await post(store, circle, 'u1', 'b');
  await post(store, circle, 'u1', 'c');
  await circles.supportSeed({ store, circleId: circle.id, seedId: seedFor(circle, 'b').id, userId: 'u2' });

  const wire = circles.toClient(circle, { userId: 'u2' });
  assert.equal(JSON.stringify(wire).includes('@example.com'), false);
  assert.equal(wire.isCreator, false);
  assert.equal(wire.isMember, true);
  assert.deepEqual(wire.mySeedIds, []);
  assert.equal(wire.liveSeedId, circle.seeds[0].id);

  // Who supported a topic is nobody's business; the count is all the queue uses.
  assert.equal(JSON.stringify(wire).includes('supporterIds'), false);
  const [b, c] = wire.queue;
  assert.equal(b.supporterCount, 2);
  assert.equal(b.iSupport, true, 'but I can see my own support, to take it back');
  assert.equal(c.supporterCount, 1);
  assert.equal(c.iSupport, false);

  const asCreator = circles.toClient(circle, { userId: 'u1' });
  assert.equal(asCreator.isCreator, true);
  assert.deepEqual(asCreator.mySeedIds, circle.seeds.map(s => s.id));
  // Posting is supporting, so an author always reads as supporting their own.
  assert.equal(asCreator.queue[1].iSupport, true);
});

// --- registry ---------------------------------------------------------------

test('the registry rejects a module missing a required hook', () => {
  activities.reset();
  assert.throws(
    () => activities.register('bad', { phases: ['a'], async isMemberDone() { return true; } }),
    /must implement normalizeSeed/,
  );
});

test('the registry rejects reserved phase names', () => {
  activities.reset();
  // The seed's own terminal states, plus the two the circle dispatches under.
  for (const reserved of ['pending', 'revealed', 'skipped', 'idle', 'closed']) {
    assert.throws(
      () => activities.register('bad', {
        phases: ['share', reserved],
        async normalizeSeed(p) { return p; },
        async isMemberDone() { return true; },
      }),
      /reserved phase/,
    );
  }
});

test('the registry rejects an empty phase list', () => {
  activities.reset();
  assert.throws(
    () => activities.register('bad', {
      phases: [],
      async normalizeSeed(p) { return p; },
      async isMemberDone() { return true; },
    }),
    /non-empty phases/,
  );
});

test('unimplemented optional hooks are filled with no-ops', async () => {
  activities.reset();
  const mod = activities.register('minimal', {
    phases: ['only'],
    async normalizeSeed(p) { return p; },
    async isMemberDone() { return true; },
  });
  assert.equal(typeof mod.onCycleReveal, 'function');
  assert.equal(await mod.notificationFor({}), null);

  // And the machine runs end to end against a module that implements nothing else.
  const store = memStore();
  const circle = await openCircle(store, { members: 2, activity: 'minimal' });
  await post(store, circle, 'u1', 'a');
  await post(store, circle, 'u2', 'b');
  assert.equal(circle.phase, 'idle', 'isMemberDone always true runs both straight through');
  assert.equal(circle.seeds.filter(s => s.phase === 'revealed').length, 2);
  assert.equal(store._emails.length, 0, 'no notificationFor means no mail');
});
