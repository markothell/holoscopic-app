const { test } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// The host SEAT, and the three ways out from under it (2026-09-16).
//
// leave / close / delete are three different acts and the whole design rests on
// their not being one:
//   leave  — you go, the circle stays. Vacates the seat if you held it.
//   close  — the circle ends for everybody. Terminal, and the host's alone.
//   delete — erased, and only while nobody has put anything in.
//
// The cap is on HOSTING, so leaving is the ordinary way out from under it — a
// host must never have to end a group other people are still in to get a slot
// back. An unhosted circle is INACTIVE, not ended: what is already live runs
// out, the queue keeps filling, and nothing new opens until somebody takes the
// seat.

function memStore() {
  const rows = [];
  const deleted = [];
  const store = {
    _circles: rows,
    _deleted: deleted,
    // What countContributions() will report — the test's lever for "has anybody
    // put anything in this circle".
    contributions: 0,

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
          shareHours: 72, rankHours: 72, advanceOnComplete: true, ...(fields.config || {}),
        },
      };
      rows.push(doc);
      return doc;
    },
    async saveCircle(circle) { return circle; },
    async notify() {},
    async sendEmail() {},
    async countContributions() { return store.contributions; },
    async deleteCircleDoc(id) {
      deleted.push(id);
      const i = rows.findIndex(c => c.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return store;
}

function stubActivity() {
  const state = { done: new Set() };
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
  });
  return state;
}

const seedFor = (circle, topic) => circle.seeds.find(s => s.payload.topic === topic);

// urlName is unique per instance, so a test that opens two circles needs two
// names — otherwise the second call fails with "already exists" rather than
// whatever it was actually testing.
let circleSeq = 0;

async function openCircle(store, { members = 3 } = {}) {
  circleSeq += 1;
  const circle = await circles.createCircle({
    store,
    instanceId: 'inst1',
    activity: 'stub',
    title: `Authority ${circleSeq}`,
    urlName: `authority-${circleSeq}`,
    createdBy: 'u1',
    creatorName: 'One',
    creatorEmail: 'one@example.com',
    mode: 'circle',
    requireInvitation: false,
  });
  for (let i = 2; i <= members; i++) {
    await circles.joinCircle({
      store, circleId: circle.id, userId: `u${i}`, username: `U${i}`, email: `u${i}@example.com`,
    });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

/** Post a topic and get the circle to approve it into the queue. */
async function approved(store, circle, userId, topic) {
  await circles.addSeed({ store, circleId: circle.id, userId, payload: { topic } });
  const fresh = await store.findCircleById(circle.id);
  const seedId = seedFor(fresh, topic).id;
  for (const m of fresh.members) {
    if (m.userId === userId) continue;
    await circles.supportSeed({ store, circleId: circle.id, seedId, userId: m.userId });
    if (seedFor(await store.findCircleById(circle.id), topic).phase !== 'nominated') break;
  }
  return seedId;
}

// --- the seat ---------------------------------------------------------------

test('a circle written before hostId existed is still hosted by its creator', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);

  // Exactly what a row from before this field looks like.
  delete circle.hostId;
  assert.equal(circles.hostOf(circle), 'u1');

  // And absent must NOT read as vacant, or deploying this would strip every
  // existing circle's controls before any backfill ran.
  assert.equal(circles.toClient(circle, { userId: 'u1' }).isHost, true);
  assert.equal(circles.toClient(circle, { userId: 'u1' }).hasHost, true);
});

test('a vacated seat is not the same as an absent one', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);

  circle.hostId = '';
  assert.equal(circles.hostOf(circle), null);
  assert.equal(circles.toClient(circle, { userId: 'u1' }).hasHost, false);
  assert.equal(circles.toClient(circle, { userId: 'u1' }).isHost, false);
});

test('the host leaves: the seat empties and the circle carries on', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);

  const res = await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(res.deleted, false);
  assert.equal(res.closed, false);
  assert.equal(res.seatVacated, true);
  const after = await store.findCircleById(circle.id);
  assert.equal(after.phase !== 'closed', true, 'leaving is not an ending');
  assert.equal(after.members.length, 2);
  assert.equal(circles.hostOf(after), null);
});

test('an unhosted circle opens nothing new, and the queue keeps filling', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);
  await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });

  await approved(store, circle, 'u2', 'waiting');

  const after = await store.findCircleById(circle.id);
  assert.equal(after.phase, 'idle', 'nothing started');
  assert.equal(seedFor(after, 'waiting').phase, 'pending', 'it is queued, not running');
  assert.equal(circles.liveSeeds(after).length, 0);
});

test('a member takes the vacant seat and the queue starts moving', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);
  await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });
  await approved(store, circle, 'u2', 'waiting');

  await circles.claimHost({ store, circleId: circle.id, userId: 'u2' });

  const after = await store.findCircleById(circle.id);
  assert.equal(circles.hostOf(after), 'u2');
  assert.equal(after.phase, 'cycle', 'the queue moves the moment there is a host');
  assert.equal(seedFor(after, 'waiting').phase, 'share');
});

test('the seat cannot be taken while somebody holds it', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);

  await assert.rejects(
    circles.claimHost({ store, circleId: circle.id, userId: 'u2' }),
    /already has a host/,
  );
});

test('only the host may close, and a former host may not', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);
  await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });

  await assert.rejects(
    circles.closeCircle({ store, circleId: circle.id, userId: 'u1' }),
    /Only the circle host/,
  );
});

// --- delete -----------------------------------------------------------------

test('delete removes a circle nobody has put anything into', async () => {
  stubActivity();
  const store = memStore();
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'stub', title: 'Typo', urlName: 'typo',
    createdBy: 'u1', creatorName: 'One', requireInvitation: false,
  });

  const res = await circles.deleteCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(res.deleted, true);
  assert.deepEqual(store._deleted, [circle.id]);
  assert.equal(await store.findCircleById(circle.id), null);
});

test('delete is refused once anybody has contributed', async () => {
  stubActivity();
  const store = memStore();
  // The seed has to stay NOMINATED, or `openedAt` would be what refuses the
  // delete rather than the contribution rows this test is about. Any circle of
  // two or more does that: approvalsToStart is min(max(2, ceil(size/3)), size),
  // so a seed wants two backers and the author's own support supplies one.
  // (A SOLO circle is the exception — its threshold collapses to 1, which is
  // what lets a circle with nobody left to ask start anything at all.)
  const circle = await openCircle(store, { members: 4 });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'queued' } });
  store.contributions = 1;

  const fresh = await store.findCircleById(circle.id);
  assert.equal(fresh.seeds.every(s => !s.openedAt), true, 'nothing opened');

  await assert.rejects(
    circles.deleteCircle({ store, circleId: circle.id, userId: 'u1' }),
    /close it instead/,
  );
  assert.deepEqual(store._deleted, []);
});

test('delete is refused once a cycle has opened, even with nothing collected', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);
  await approved(store, circle, 'u1', 'ran');

  // contributions stays 0: the circle demonstrably ran, which is enough.
  await assert.rejects(
    circles.deleteCircle({ store, circleId: circle.id, userId: 'u1' }),
    /close it instead/,
  );
});

test('only the host may delete', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store);

  await assert.rejects(
    circles.deleteCircle({ store, circleId: circle.id, userId: 'u2' }),
    /Only the circle host/,
  );
});

// --- the last member out ----------------------------------------------------

test('the last member out deletes a circle that never collected anything', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 1 });

  const res = await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(res.deleted, true);
  assert.equal(res.closed, false);
  assert.equal(await store.findCircleById(circle.id), null);
});

test('the last member out closes a circle whose cycle has run', async () => {
  stubActivity();
  const store = memStore();
  const circle = await openCircle(store, { members: 1 });
  await approved(store, circle, 'u1', 'ran');

  const res = await circles.leaveCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(res.deleted, false);
  assert.equal(res.closed, true);
  const after = await store.findCircleById(circle.id);
  assert.equal(after.phase, 'closed');
  assert.equal(after.members.length, 0);
  assert.deepEqual(store._deleted, [], 'closed on the way out, never erased');
});

test('holdsContributions consults the rows only once seeds exist', async () => {
  // A circle with NO seeds holds nothing by construction: every contribution is
  // keyed by seedId, so there is nothing for one to belong to. That short
  // circuit is why this branch needs its own test rather than falling out of a
  // leave/delete scenario.
  stubActivity();
  const store = memStore();
  const empty = await openCircle(store, { members: 1 });
  store.contributions = 99;
  assert.equal(await circles.holdsContributions({ store, circle: empty }), false,
    'no seeds means nothing to have contributed to');

  // With a seed that never opened, the rows are what decide. DEFENSIVE DEPTH
  // rather than a state the product reaches today — every activity writes
  // against a live seed, so `openedAt` normally answers first. This is what
  // keeps delete honest if one ever writes before its cycle opens.
  //
  // Two or more members keeps the seed nominated: approvalsToStart is
  // min(max(2, ceil(size/3)), size), so it wants two backers and the author
  // supplies exactly one.
  const circle = await openCircle(store, { members: 4 });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'queued' } });
  const fresh = await store.findCircleById(circle.id);
  assert.equal(fresh.seeds.every(s => !s.openedAt), true, 'nothing has opened');

  store.contributions = 0;
  assert.equal(await circles.holdsContributions({ store, circle: fresh }), false);
  store.contributions = 1;
  assert.equal(await circles.holdsContributions({ store, circle: fresh }), true);
});
