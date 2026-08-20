const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// The pre-queue phase (2026-08-20): an activity that declares `nominateFirst`
// is SHARED with the circle before it is QUEUED by it. Nominated first,
// accepted second — and acceptance is somebody other than the author saying
// yes. Drives the real machine over the same in-memory store shape as
// circles.test.js.
//
// The load-bearing negative is the last test: Threshold and gather do not
// declare the flag, so nothing about them may change.
// Same shape as circles.test.js#memStore — mirrors models/Circle.js defaults,
// so a field defaulted there but missing here can't hide a machine bug.
function memStore() {
  const rows = [];
  return {
    _circles: rows,
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
        config: { shareHours: 72, rankHours: 72, advanceOnComplete: true, seedDefaults: {}, ...(fields.config || {}) },
      };
      rows.push(doc);
      return doc;
    },
    async saveCircle(circle) { return circle; },
    async notify() {},
    async sendEmail() {},
  };
}

async function circleWith(store, { activity }) {
  const circle = await circles.createCircle({
    store,
    instanceId: 'inst1',
    activity,
    title: 'Harbor',
    urlName: 'harbor',
    createdBy: 'u1',
    creatorName: 'One',
    creatorEmail: 'one@example.com',
    mode: 'circle',
    requireInvitation: false,
    config: {},
  });
  for (const u of ['u2', 'u3']) {
    await circles.joinCircle({ store, circleId: circle.id, userId: u, username: u, email: `${u}@x.com` });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

function registerBoth() {
  activities.reset();
  const base = {
    phases: ['exploring'],
    async normalizeSeed(payload) { return { topic: String(payload.topic) }; },
    async isMemberDone() { return false; },
  };
  activities.register('shared', { ...base, nominateFirst: true });
  activities.register('queued', { ...base }); // the old behavior, unchanged
}

beforeEach(() => { registerBoth(); });

test('a nominated seed is shared but NOT queued, and an idle circle stays idle', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'shared' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'What holds us' } });
  const after = await store.findCircleById(circle.id);
  const seed = after.seeds[0];

  assert.equal(seed.phase, 'nominated', 'born outside the queue');
  assert.deepEqual(seed.supporterIds, ['u1'], 'posting it is still supporting it');
  // The one that would have gone wrong quietly: a nominated seed must not be
  // counted as a running cycle, or it occupies a maxLive slot forever.
  assert.deepEqual(circles.liveSeeds(after), [], 'not live');
  assert.equal(after.phase, 'idle', 'a free slot does not open a nomination');
});

test('acceptance is somebody ELSE saying yes; the author cannot accept their own', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'shared' });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'What holds us' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  // The author toggling their own support off and back on never accepts it.
  await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u1' });
  const r1 = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u1' });
  assert.equal(r1.accepted, false);
  assert.equal((await store.findCircleById(circle.id)).seeds[0].phase, 'nominated');

  // Anyone else does.
  const r2 = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u2' });
  assert.equal(r2.accepted, true, 'a second person is the whole difference');

  const after = await store.findCircleById(circle.id);
  // Accepting into an idle circle starts it in the same move.
  assert.equal(after.seeds[0].phase, 'exploring', 'accepted, queued, and opened');
  assert.equal(after.phase, 'cycle');
});

test('withdrawing support after acceptance does not put it back outside the queue', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'shared' });
  // Two nominations so the second stays queued rather than opening.
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'First' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Second' } });
  const ids = (await store.findCircleById(circle.id)).seeds.map(s => s.id);

  await circles.supportSeed({ store, circleId: circle.id, seedId: ids[0], userId: 'u2' });
  await circles.supportSeed({ store, circleId: circle.id, seedId: ids[1], userId: 'u2' });
  let after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[1].phase, 'pending', 'accepted into the queue, waiting its turn');

  await circles.supportSeed({ store, circleId: circle.id, seedId: ids[1], userId: 'u2' });
  after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[1].phase, 'pending', 'acceptance is a door, not a running total');
  assert.equal(after.seeds[1].supporterIds.length, 1, 'the support itself is still a free toggle');
});

test('a nominated seed can still be edited by its author', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'shared' });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Draft name' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', seedId, payload: { topic: 'Better name' } });
  assert.equal((await store.findCircleById(circle.id)).seeds[0].payload.topic, 'Better name');
});

test('an activity WITHOUT the flag is untouched — Threshold and gather behave as before', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'queued' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Authority' } });
  const after = await store.findCircleById(circle.id);

  assert.equal(after.seeds[0].phase, 'exploring', 'straight into the queue and straight open');
  assert.equal(after.phase, 'cycle');
  assert.equal(circles.liveSeeds(after).length, 1);
});
