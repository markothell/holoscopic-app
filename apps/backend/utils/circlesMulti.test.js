const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// The multi-live and mixed-activity machine (PRIMITIVES.md §9 B1): maxLive
// concurrent cycles, per-seed activity modules, and per-seed payload clocks.
// Same offline memStore pattern as circles.test.js.

function memStore() {
  const rows = [];
  const notifications = [];
  const emails = [];
  return {
    _circles: rows,
    _notifications: notifications,
    _emails: emails,
    async findCircleById(id) { return rows.find(c => c.id === id) || null; },
    async findCircleByUrlName(instanceId, urlName) {
      return rows.find(c => c.instanceId === instanceId && c.urlName === urlName) || null;
    },
    async listRunningCircles() { return rows.filter(c => c.status === 'running'); },
    async createCircleDoc(fields) {
      const doc = {
        transitions: [], seeds: [], members: [], invitedEmails: [],
        requireInvitation: true, liveSeedId: null, phaseDeadline: null,
        startedAt: null, completedAt: null,
        ...fields,
        config: {
          shareHours: 72, rankHours: 72, advanceOnComplete: true,
          maxLive: 1, seedDefaults: {},
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

// Two stub activities with different phase lists, so a mixed circle exercises
// per-seed module resolution: 'twostep' is share→rank, 'oneshot' is a single
// 'respond' phase whose clock comes off the seed payload.
function stubActivities() {
  const state = { done: new Set(), revealed: [], notified: [] };

  activities.reset();
  activities.register('twostep', {
    phases: ['share', 'rank'],
    async normalizeSeed(payload) {
      if (!payload || !payload.topic) throw new Error('topic required');
      return { topic: String(payload.topic) };
    },
    async isMemberDone({ seed, phase, userId }) {
      return state.done.has(`${seed.id}:${phase}:${userId}`);
    },
    async onCycleReveal({ seed }) { state.revealed.push(seed.id); },
    async notificationFor({ seed, phase, userId }) {
      state.notified.push(`${seed ? seed.id : 'circle'}:${phase}:${userId}`);
      return { subject: `[two] ${phase}`, text: 'body' };
    },
  });
  activities.register('oneshot', {
    phases: ['respond'],
    async normalizeSeed(payload) {
      if (!payload || !payload.prompt) throw new Error('prompt required');
      const out = { prompt: String(payload.prompt) };
      if (payload.respondHours !== undefined) out.respondHours = payload.respondHours;
      return out;
    },
    async isMemberDone({ seed, phase, userId }) {
      return state.done.has(`${seed.id}:${phase}:${userId}`);
    },
    async onCycleReveal({ seed }) { state.revealed.push(seed.id); },
    async notificationFor({ seed, phase, userId }) {
      state.notified.push(`${seed ? seed.id : 'circle'}:${phase}:${userId}`);
      return { subject: `[one] ${phase}`, text: 'body' };
    },
  });

  return state;
}

async function openCircle(store, { members = 3, config = {}, activity = 'twostep' } = {}) {
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity, title: 'Harbor', urlName: 'harbor',
    createdBy: 'u1', creatorName: 'One', mode: 'circle', requireInvitation: false, config,
  });
  for (let i = 2; i <= members; i++) {
    await circles.joinCircle({ store, circleId: circle.id, userId: `u${i}`, username: `U${i}` });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

const seedFor = (circle, key, value) =>
  circle.seeds.find(s => s.payload[key] === value);

function markDone(state, seed, phase, users) {
  for (const u of users) state.done.add(`${seed.id}:${phase}:${u}`);
}

let store; let state;
beforeEach(() => { store = memStore(); state = stubActivities(); });

test('maxLive 1 preserves the original machine: the queue waits for the live cycle', async () => {
  const circle = await openCircle(store);
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });

  assert.equal(circles.liveSeeds(circle).length, 1);
  assert.equal(seedFor(circle, 'topic', 'a').phase, 'share');
  assert.equal(seedFor(circle, 'topic', 'b').phase, 'pending');
});

test('maxLive 3 runs three cycles at once and holds the fourth', async () => {
  const circle = await openCircle(store, { config: { maxLive: 3 } });
  for (const t of ['a', 'b', 'c', 'd']) {
    await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: t } });
  }
  const live = circles.liveSeeds(circle);
  assert.equal(live.length, 3);
  assert.deepEqual(live.map(s => s.payload.topic), ['a', 'b', 'c']);
  assert.equal(seedFor(circle, 'topic', 'd').phase, 'pending');
  assert.equal(circle.phase, 'cycle');
  // liveSeedId mirrors the first live seed for single-live readers.
  assert.equal(circle.liveSeedId, live[0].id);
});

test('one cycle completing frees its slot for the queue, and the circle never idles between', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  for (const t of ['a', 'b', 'c']) {
    await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: t } });
  }
  const a = seedFor(circle, 'topic', 'a');
  const idleBefore = state.notified.filter(n => n.includes(':idle:')).length;
  // Everyone finishes 'a' through both phases; 'b' is untouched.
  markDone(state, a, 'share', ['u1', 'u2', 'u3']);
  markDone(state, a, 'rank', ['u1', 'u2', 'u3']);
  await circles.evaluate({ store, circle });

  assert.equal(a.phase, 'revealed');
  assert.equal(seedFor(circle, 'topic', 'b').phase, 'share'); // still live, untouched
  assert.equal(seedFor(circle, 'topic', 'c').phase, 'share'); // took the freed slot
  assert.equal(circle.phase, 'cycle');
  // No NEW idle notification fired while other cycles were live (the one at
  // circle start, before any seeds existed, is correct and expected).
  assert.equal(state.notified.filter(n => n.includes(':idle:')).length, idleBefore);
});

test('a mixed circle runs each seed on its own module and phase list', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'story' } });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u2', payload: { prompt: 'ask' }, activity: 'oneshot',
  });

  const topic = seedFor(circle, 'topic', 'story');
  const ask = seedFor(circle, 'prompt', 'ask');
  assert.equal(topic.phase, 'share');
  assert.equal(ask.phase, 'respond');
  assert.equal(ask.activity, 'oneshot');
  assert.equal(topic.activity, null);

  // The oneshot completes independently of the twostep.
  markDone(state, ask, 'respond', ['u1', 'u2', 'u3']);
  await circles.evaluate({ store, circle });
  assert.equal(ask.phase, 'revealed');
  assert.equal(topic.phase, 'share');
  assert.deepEqual(state.revealed, [ask.id]);
});

test('a seed payload clock overrides the circle config, and no key means no clock', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u1',
    payload: { prompt: 'timed', respondHours: 2 }, activity: 'oneshot',
  });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u1',
    payload: { prompt: 'clockless' }, activity: 'oneshot',
  });

  const timed = seedFor(circle, 'prompt', 'timed');
  const clockless = seedFor(circle, 'prompt', 'clockless');
  assert.ok(timed.phaseDeadline instanceof Date);
  assert.equal(clockless.phaseDeadline, null);

  // The timer ends only the timed one.
  const later = new Date(Date.now() + 3 * 60 * 60 * 1000);
  await circles.evaluate({ store, circle, now: later });
  assert.equal(timed.phase, 'revealed');
  assert.equal(clockless.phase, 'respond');
  const t = circle.transitions.find(x => x.seedId === timed.id && x.to === 'revealed');
  assert.equal(t.via, 'deadline');
});

test('manual advance names its seed and leaves the others alone', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });
  const b = seedFor(circle, 'topic', 'b');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1', seedId: b.id });
  assert.equal(b.phase, 'rank');
  assert.equal(seedFor(circle, 'topic', 'a').phase, 'share');
});

test('the seed author may advance their own cycle, and only theirs', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'mine' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u3', payload: { topic: 'theirs' } });
  const mine = seedFor(circle, 'topic', 'mine');
  const theirs = seedFor(circle, 'topic', 'theirs');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u2', seedId: mine.id });
  assert.equal(mine.phase, 'rank');
  await assert.rejects(
    circles.advanceCircle({ store, circleId: circle.id, userId: 'u2', seedId: theirs.id }),
    /creator or this topic/,
  );
});

test('closing the circle reveals every live cycle, not just the first', async () => {
  const circle = await openCircle(store, { config: { maxLive: 3 } });
  for (const t of ['a', 'b', 'c']) {
    await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: t } });
  }
  await circles.closeCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'closed');
  for (const t of ['a', 'b', 'c']) {
    assert.equal(seedFor(circle, 'topic', t).phase, 'revealed');
  }
  assert.equal(state.revealed.length, 3);
});

test('skip names its seed under maxLive > 1', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'keep' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'drop' } });
  const drop = seedFor(circle, 'topic', 'drop');

  await circles.skipSeed({ store, circleId: circle.id, userId: 'u1', seedId: drop.id });
  assert.equal(drop.phase, 'skipped');
  assert.equal(seedFor(circle, 'topic', 'keep').phase, 'share');
  assert.equal(circle.phase, 'cycle');
});

test('the circle goes idle only when the LAST live cycle ends', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });

  const idleBefore = state.notified.filter(n => n.includes(':idle:')).length;
  for (const t of ['a', 'b']) {
    const s = seedFor(circle, 'topic', t);
    markDone(state, s, 'share', ['u1', 'u2', 'u3']);
    markDone(state, s, 'rank', ['u1', 'u2', 'u3']);
  }
  await circles.evaluate({ store, circle });

  assert.equal(circle.phase, 'idle');
  assert.equal(circle.liveSeedId, null);
  // Exactly one NEW idle ask (per member), after the LAST reveal — never
  // between the two.
  assert.equal(state.notified.filter(n => n.includes(':idle:')).length - idleBefore, 3);
});

test('the wire shape carries the live set and the ceiling', async () => {
  const circle = await openCircle(store, { config: { maxLive: 2 } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });

  const wire = circles.toClient(circle, { userId: 'u1' });
  assert.equal(wire.maxLive, 2);
  assert.equal(wire.liveSeedIds.length, 2);
  assert.equal(wire.liveSeedId, wire.liveSeedIds[0]);
  const askWire = wire.seeds.find(s => s.payload.topic === 'a');
  assert.equal(askWire.activity, null);
});
