const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// THREE LISTS (MO, 2026-08-20): nominations, the queue, and what is live.
// Every ask is nominated first and needs `config.approvalsToStart` supporters
// — author + 2 by default, capped at the member count — before it joins the
// queue. This is the machine's rule for every activity, not an opt-in.
//
// Drives the real machine over the same in-memory store shape as
// circles.test.js.
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

async function circleWith(store, { activity, members = ['u2', 'u3'] }) {
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
  for (const u of members) {
    await circles.joinCircle({ store, circleId: circle.id, userId: u, username: u, email: `${u}@x.com` });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

function registerStub() {
  activities.reset();
  activities.register('stub', {
    phases: ['exploring'],
    async normalizeSeed(payload) { return { topic: String(payload.topic) }; },
    async isMemberDone() { return false; },
  });
}

beforeEach(() => { registerStub(); });

/** Everyone but the author backs it, which clears any threshold. */
async function backAll(store, circle, seedId, authorId) {
  const fresh = await store.findCircleById(circle.id);
  for (const m of fresh.members) {
    if (m.userId === authorId) continue;
    const r = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: m.userId });
    if (r.approved) return r;
  }
  return null;
}

test('a posted ask is a nomination: outside the queue, and an idle circle stays idle', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'stub' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'What holds us' } });
  const after = await store.findCircleById(circle.id);
  const seed = after.seeds[0];

  assert.equal(seed.phase, 'nominated', 'born outside the queue');
  assert.deepEqual(seed.supporterIds, ['u1'], 'posting it is still supporting it');
  assert.deepEqual(circles.queue(after).map(s => s.id), [], 'the QUEUE is the approved list, and it is empty');
  assert.deepEqual(circles.toClient(after, { userId: 'u1' }).nominations.map(s => s.id), [seed.id],
    'nominations are their own list on the wire');
  // The one that would have gone wrong quietly: a nominated seed must not be
  // counted as a running cycle, or it occupies a maxLive slot forever.
  assert.deepEqual(circles.liveSeeds(after), [], 'not live');
  assert.equal(after.phase, 'idle', 'a free slot does not open a nomination');
});

test('approval is a COUNT — author + 2 — and one other person is not enough', async () => {
  const store = memStore();
  // Five members, so the default threshold of 3 sits below the roster and
  // "not enough yet" is a state the test can actually observe.
  const circle = await circleWith(store, { activity: 'stub', members: ['u2', 'u3', 'u4', 'u5'] });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'What holds us' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  // The author is already on it, and toggling their own support proves nothing.
  const r1 = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u1' });
  assert.equal(r1.approved, false);

  // One other person is a pair, not a circle.
  await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u1' }); // back on
  const r2 = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u2' });
  assert.equal(r2.approved, false, 'two supporters is short of the threshold');
  assert.equal((await store.findCircleById(circle.id)).seeds[0].phase, 'nominated');

  // The third crosses it.
  const r3 = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u3' });
  assert.equal(r3.approved, true, 'author + 2');
  // evaluate() returns { circle, changed }; handing that wrapper back as
  // `circle` 400s at the route, which is how it was found — in a browser.
  assert.ok(Array.isArray(r3.circle.seeds), 'the returned circle is a circle');

  const after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[0].phase, 'exploring', 'approved, queued, and opened');
  assert.equal(after.phase, 'cycle');
});

test('the threshold is capped at the roster, or a small circle could never start', async () => {
  const store = memStore();
  // Two members. author + 2 is impossible, so without the cap nothing this
  // circle ever posts could run.
  const circle = await circleWith(store, { activity: 'stub', members: ['u2'] });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Just us' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  const r = await circles.supportSeed({ store, circleId: circle.id, seedId, userId: 'u2' });
  assert.equal(r.approved, true, 'both of them is the whole circle');
});

test('a facilitator promotion approves a nomination — the quiet-circle escape hatch', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'stub', members: ['u2', 'u3', 'u4', 'u5'] });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'Nobody backed it' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  await circles.promoteSeed({ store, circleId: circle.id, seedId, userId: 'u1' }); // creator
  const after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[0].phase, 'exploring', 'promoted past the threshold and opened');
});

test('withdrawing support after approval does not put it back outside the queue', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'stub' });
  // Two nominations so the second stays queued rather than opening.
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'First' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Second' } });
  const ids = (await store.findCircleById(circle.id)).seeds.map(s => s.id);

  await backAll(store, circle, ids[0], 'u1');
  await backAll(store, circle, ids[1], 'u1');
  let after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[1].phase, 'pending', 'approved into the queue, waiting its turn');

  await circles.supportSeed({ store, circleId: circle.id, seedId: ids[1], userId: 'u2' });
  after = await store.findCircleById(circle.id);
  assert.equal(after.seeds[1].phase, 'pending', 'approval is a door the group walked through, not a running total');
});

test('a nominated seed can still be edited by its author', async () => {
  const store = memStore();
  const circle = await circleWith(store, { activity: 'stub' });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'Draft name' } });
  const seedId = (await store.findCircleById(circle.id)).seeds[0].id;

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', seedId, payload: { topic: 'Better name' } });
  assert.equal((await store.findCircleById(circle.id)).seeds[0].payload.topic, 'Better name');
});

