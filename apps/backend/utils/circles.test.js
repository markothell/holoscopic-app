const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');

// In-memory store implementing the funnel's data-access surface — same pattern
// as memories.test.js and synNodes.test.js. This drives the REAL machine (the
// three end conditions, the cascade guard, notification dedupe, D4's
// never-block rule) with no MongoDB and no mail, which is why it runs in
// milliseconds and offline.
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
        cycleIndex: -1,
        phaseDeadline: null,
        startedAt: null,
        completedAt: null,
        ...fields,
        config: {
          seedHours: 72,
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

async function seededCircle(store, { members = 3, config = {}, activity = 'stub' } = {}) {
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

function markDone(state, seed, phase, users) {
  for (const u of users) state.done.add(`${seed.id}:${phase}:${u}`);
}

beforeEach(() => { activities.reset(); });

// ---------------------------------------------------------------------------

test('completion path: 3 members, 3 seeds, three cycles, then complete', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  assert.equal(circle.phase, 'seeding');

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });
  assert.equal(circle.phase, 'seeding', 'still seeding while one member has not seeded');

  // The last outstanding seed is itself the completion trigger.
  await circles.addSeed({ store, circleId: circle.id, userId: 'u3', payload: { topic: 'money' } });
  assert.equal(circle.phase, 'cycle');
  assert.equal(circle.cycleIndex, 0);
  assert.equal(circle.seeds[0].phase, 'share');

  for (let i = 0; i < 3; i++) {
    const seed = circle.seeds[i];
    assert.equal(seed.phase, 'share', `seed ${i} opens on share`);

    markDone(state, seed, 'share', ['u1', 'u2', 'u3']);
    await circles.evaluate({ store, circle });
    assert.equal(seed.phase, 'rank', `seed ${i} advances to rank`);

    markDone(state, seed, 'rank', ['u1', 'u2', 'u3']);
    await circles.evaluate({ store, circle });
    assert.equal(seed.phase, 'revealed', `seed ${i} reveals`);
    assert.deepEqual(seed.result, { topic: seed.payload.topic });
  }

  assert.equal(circle.phase, 'complete');
  assert.equal(circle.status, 'complete');
  assert.deepEqual(state.revealed, circle.seeds.map(s => s.id));
  assert.equal(state.completed, 1);
  assert.ok(circle.completedAt);
});

test('deadline path advances exactly one phase per expiry, never cascading', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });
  assert.equal(circle.phase, 'seeding');

  // Nobody ever completes anything; only the clock moves.
  let now = new Date(Date.now() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(circle.phase, 'cycle');
  assert.equal(circle.seeds[0].phase, 'share');
  // The phase it just opened takes its deadline from `now`, so one expiry can
  // never run the whole circle out in a single tick.
  assert.equal(circle.cycleIndex, 0);

  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(circle.seeds[0].phase, 'rank');

  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(circle.seeds[0].phase, 'revealed');
  assert.equal(circle.cycleIndex, 1, 'reveal rolls straight into the next cycle');
  assert.equal(circle.seeds[1].phase, 'share');

  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  now = new Date(now.getTime() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });
  assert.equal(circle.phase, 'complete');
});

test('D4: the machine never blocks on a person — nobody seeds, the circle ends', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  const now = new Date(Date.now() + 73 * HOUR);
  await circles.evaluate({ store, circle, now });

  assert.equal(circle.phase, 'complete');
  assert.equal(circle.seeds.length, 0);
});

test('D4: a member who misses seeding simply has no topic', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });

  await circles.evaluate({ store, circle, now: new Date(Date.now() + 73 * HOUR) });
  assert.equal(circle.phase, 'cycle');
  assert.equal(circle.seeds.length, 1);
  assert.equal(circle.seeds[0].authorId, 'u2');

  // u1 and u3 still participate in u2's cycle — they just authored no topic.
  const seed = circle.seeds[0];
  markDone(state, seed, 'share', ['u1', 'u2', 'u3']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'rank');
});

test('manual advance: creator may, seed author may, another member may not', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });

  // Creator ends the seeding phase early, without waiting out the clock.
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'cycle');
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

  const manual = circle.transitions.filter(t => t.via === 'manual');
  assert.ok(manual.some(t => t.byUserId === 'u2'), 'the advance records who did it');
});

test('a manual advance ends exactly one phase', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });
  assert.equal(circle.seeds[0].phase, 'share');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.seeds[0].phase, 'rank');
  assert.equal(circle.seeds[1].phase, 'pending', 'the second cycle has not been touched');
});

test('advanceOnComplete false: completion is ignored, only the clock and the author advance', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2, config: { advanceOnComplete: false } });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });
  assert.equal(circle.phase, 'seeding', 'everyone seeded, but completion does not advance');

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'cycle');

  const seed = circle.seeds[0];
  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'share', 'still share — completion is switched off');
});

test('a phase with no clock ends only on completion or by hand (D16)', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2, config: { shareHours: null } });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });

  const seed = circle.seeds[0];
  assert.equal(seed.phaseDeadline, null);

  await circles.evaluate({ store, circle, now: new Date(Date.now() + 500 * HOUR) });
  assert.equal(seed.phase, 'share', 'no clock, so no expiry however long we wait');

  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  assert.equal(seed.phase, 'rank');
});

test('single mode is a one-seed circle and skips seeding entirely (D1)', async () => {
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

  assert.equal(circle.phase, 'cycle', 'never passes through seeding');
  assert.equal(circle.seeds[0].phase, 'share');

  const seed = circle.seeds[0];
  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });
  markDone(state, seed, 'rank', ['u1', 'u2']);
  await circles.evaluate({ store, circle });

  assert.equal(circle.phase, 'complete');
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

test('notifications: one per member per phase, and a re-evaluate does not re-send', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 3 });

  // Opening the seeding phase is itself a transition, and mails.
  assert.equal(store._emails.length, 3, 'seeding opening mails all three members');

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'work' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'family' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u3', payload: { topic: 'money' } });

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
  const circle = await seededCircle(store, { members: 3 });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  const recipients = store._emails.map(e => e.to);
  assert.ok(!recipients.includes('u2@example.com'));
  assert.ok(recipients.includes('u3@example.com'));
});

test('every phase notifies under ONE type, never one derived from the phase name', async () => {
  const state = stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });
  const seed = circle.seeds[0];
  markDone(state, seed, 'share', ['u1', 'u2']);
  await circles.evaluate({ store, circle });

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
  const circle = await seededCircle(store, { members: 2 });
  circle.members.find(m => m.userId === 'u2').emailOptOut = true;

  // Only mail sent AFTER the opt-out counts — seeding already went out.
  const before = store._emails.length;
  const notifiedBefore = store._notifications.length;

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

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
  const circle = await seededCircle(store, { members: 2 });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'cycle', 'the advance stands');
  assert.equal(circle.seeds[0].phase, 'share');
});

test('sweepCircles advances every running circle and survives a broken one', async () => {
  const state = stubActivity();
  const store = memStore();

  const a = await seededCircle(store, { members: 2 });
  await circles.addSeed({ store, circleId: a.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: a.id, userId: 'u2', payload: { topic: 'b' } });

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

test('a member with no email is skipped for mail but still notified', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 1 });
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u9', username: 'Nine' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.ok(store._notifications.some(n => n.userId === 'u9'));
  assert.equal(store._emails.filter(e => !e.to).length, 0, 'never mails an empty address');
});

test('seeding is closed to non-members and outside its phase', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });

  await assert.rejects(
    () => circles.addSeed({ store, circleId: circle.id, userId: 'stranger', payload: { topic: 'x' } }),
    /Not a member/,
  );

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  await assert.rejects(
    () => circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'late' } }),
    /Seeding is not open/,
  );
});

test('re-seeding replaces your own topic rather than adding a second', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'first' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'second' } });

  assert.equal(circle.seeds.length, 1);
  assert.equal(circle.seeds[0].payload.topic, 'second');
});

test('normalizeSeed rejections propagate', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });

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

test('toClient never leaks member emails', async () => {
  stubActivity();
  const store = memStore();
  const circle = await seededCircle(store, { members: 2 });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });

  const wire = circles.toClient(circle, { userId: 'u2' });
  assert.equal(JSON.stringify(wire).includes('@example.com'), false);
  assert.equal(wire.isCreator, false);
  assert.equal(wire.isMember, true);
  assert.equal(wire.mySeed, null);

  const asCreator = circles.toClient(circle, { userId: 'u1' });
  assert.equal(asCreator.isCreator, true);
  assert.equal(asCreator.mySeed.payload.topic, 'a');
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
  for (const reserved of ['pending', 'revealed']) {
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
  const circle = await seededCircle(store, { members: 2, activity: 'minimal' });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'a' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { topic: 'b' } });
  assert.equal(circle.phase, 'complete', 'isMemberDone always true runs it straight through');
  assert.equal(store._emails.length, 0, 'no notificationFor means no mail');
});
