const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');
const gather = require('./gather');

// The builder's single-round activity, end to end and offline (PRIMITIVES.md
// §9): shapes, the two reveal combos, B4's open input, B5's text-only
// post-close edits, reactions, and the on-read aggregate.

function memStore() {
  const rows = [];
  const shares = [];
  const placements = [];
  const notifications = [];
  const emails = [];
  let nextId = 1;

  return {
    _circles: rows, _shares: shares, _placements: placements,
    _notifications: notifications, _emails: emails,

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
          advanceOnComplete: true, maxLive: 3, seedDefaults: {},
          ...(fields.config || {}),
        },
      };
      rows.push(doc);
      return doc;
    },
    async saveCircle(circle) { return circle; },
    async notify(args) { notifications.push(args); },
    async sendEmail(args) { emails.push(args); },

    async findResponse(seedId, userId) {
      return shares.find(s => s.seedId === seedId && s.userId === userId && s.slot === '') || null;
    },
    async listResponses(seedId) {
      return shares.filter(s => s.seedId === seedId && s.slot === '');
    },
    async createResponse(fields) {
      const doc = { id: `sh${nextId++}`, reactedIds: [], createdAt: new Date(), ...fields };
      shares.push(doc);
      return doc;
    },
    async saveResponse(share) { return share; },

    async findPlacement(seedId, userId) {
      return placements.find(p =>
        p.seedId === seedId && p.userId === userId && p.kind === 'position'
        && p.targetId === '' && p.axis === '') || null;
    },
    async listPlacements(seedId) {
      return placements.filter(p =>
        p.seedId === seedId && p.kind === 'position' && p.targetId === ''
        && p.axis === '' && p.committedAt);
    },
    async createPlacement(fields) {
      const doc = { id: `pl${nextId++}`, ...fields };
      placements.push(doc);
      return doc;
    },
    async savePlacement(placement) { return placement; },
  };
}

let store;
beforeEach(() => {
  store = memStore();
  activities.reset();
  activities.register('gather', gather.createModule({ store }));
});

async function circleWith(members = 3) {
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'gather', title: 'Harbor', urlName: 'harbor',
    createdBy: 'u1', creatorName: 'One', creatorEmail: 'u1@example.com',
    mode: 'circle', requireInvitation: false,
  });
  for (let i = 2; i <= members; i++) {
    await circles.joinCircle({
      store, circleId: circle.id, userId: `u${i}`, username: `U${i}`, email: `u${i}@example.com`,
    });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  return circle;
}

async function ask(circle, payload, userId = 'u1') {
  await circles.addSeed({ store, circleId: circle.id, userId, payload });
  return circle.seeds[circle.seeds.length - 1];
}

const respond = (circle, seed, userId, fields = {}) =>
  gather.submitResponse({
    store, circleId: circle.id, seedId: seed.id, userId, username: userId.toUpperCase(), ...fields,
  });

// --- normalizeSeed -----------------------------------------------------------

test('normalizeSeed: the shapes and their axes rules', () => {
  const s = gather.normalizeSeed({ prompt: 'What carried you here?' });
  assert.equal(s.shape, 'story');
  assert.equal(s.reveal, 'sealed');
  assert.equal(s.reactions, true);
  assert.equal(s.editAfterClose, true);
  assert.equal(s.respondHours, null);

  assert.throws(() => gather.normalizeSeed({}), /prompt is required/);
  assert.throws(() => gather.normalizeSeed({ prompt: 'p', shape: 'nope' }), /Unknown response shape/);
  assert.throws(
    () => gather.normalizeSeed({ prompt: 'p', shape: 'story', axes: [{ poleA: 'a', poleB: 'b' }] }),
    /story ask has no axes/,
  );
  assert.throws(
    () => gather.normalizeSeed({ prompt: 'p', shape: 'placement', axes: [] }),
    /one or two axes/,
  );
  assert.throws(
    () => gather.normalizeSeed({ prompt: 'p', shape: 'placement', axes: [{ poleA: 'same', poleB: 'Same' }] }),
    /must be different/,
  );

  const timed = gather.normalizeSeed({ prompt: 'p', respondHours: 72 });
  assert.equal(timed.respondHours, 72);
  assert.throws(() => gather.normalizeSeed({ prompt: 'p', respondHours: 'soon' }), /not a number/);
});

// --- the loop ---------------------------------------------------------------

test('a story ask closes when everyone has responded, and the reveal attributes', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, { prompt: 'A first job', shape: 'story' });
  assert.equal(seed.phase, 'respond');
  assert.equal(seed.phaseDeadline, null); // no timer unless asked for (B2)

  await respond(circle, seed, 'u1', { text: 'Paper round.' });
  await respond(circle, seed, 'u2', { text: 'Dish pit.' });
  assert.equal(seed.phase, 'respond');

  await respond(circle, seed, 'u3', { text: 'Lifeguard.' });
  assert.equal(seed.phase, 'revealed'); // write-triggered: the last responder sees it now
  const t = circle.transitions.find(x => x.seedId === seed.id && x.to === 'revealed');
  assert.equal(t.via, 'complete');
  // seed.result is the reveal-time cache.
  assert.equal(seed.result.responses, 3);
});

test('sealed: own-only until the close, everything attributed after', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, { prompt: 'p', shape: 'story', reveal: 'sealed' });
  await respond(circle, seed, 'u1', { text: 'mine' });
  await respond(circle, seed, 'u2', { text: 'theirs' });

  const forU1 = await gather.listResponses({ store, circle, seed, viewerId: 'u1' });
  assert.equal(forU1.length, 1);
  assert.equal(forU1[0].text, 'mine');

  await respond(circle, seed, 'u3', { text: 'third' }); // closes it
  const after = await gather.listResponses({ store, circle, seed, viewerId: 'u1' });
  assert.equal(after.length, 3);
  assert.ok(after.every(r => r.username)); // named — no anonymity inside a circle
});

test('open wall: everything visible as it lands', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, { prompt: 'p', shape: 'story', reveal: 'open' });
  await respond(circle, seed, 'u2', { text: 'first' });

  const forU1 = await gather.listResponses({ store, circle, seed, viewerId: 'u1' });
  assert.equal(forU1.length, 1);
  assert.equal(forU1[0].username, 'U2');
});

test('a placement ask requires a position and aggregates mean and spread on read', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, {
    prompt: 'Where do we stand?', shape: 'placement',
    axes: [{ poleA: 'hopeful', poleB: 'wary' }],
  });

  await assert.rejects(respond(circle, seed, 'u1', { text: 'note only' }), /position is required/);

  await respond(circle, seed, 'u1', { position: { x: 0 } });
  await respond(circle, seed, 'u2', { position: { x: 1 } });
  await respond(circle, seed, 'u3', { position: { x: 0.5 }, text: 'torn' });

  assert.equal(seed.phase, 'revealed');
  const agg = await gather.aggregateFor({ store, seed });
  assert.equal(agg.responses, 3);
  assert.equal(agg.x.mean, 0.5);
  assert.ok(Math.abs(agg.x.spread - Math.sqrt(1 / 6)) < 1e-9);
  assert.equal(agg.y, undefined); // one axis → no y stats

  // The reveal carries each dot with its teller.
  const rows = await gather.listResponses({ store, circle, seed, viewerId: 'u1' });
  const u2row = rows.find(r => r.userId === 'u2');
  assert.equal(u2row.position.x, 1);
});

test('story-placement wants both; y defaults to the middle on one axis', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, {
    prompt: 'p', shape: 'story-placement', axes: [{ poleA: 'a', poleB: 'b' }],
  });
  await assert.rejects(respond(circle, seed, 'u1', { position: { x: 0.2 } }), /words or a voice/);
  await respond(circle, seed, 'u1', { position: { x: 0.2 }, text: 'story' });
  const placement = await store.findPlacement(seed.id, 'u1');
  assert.equal(placement.position.y, 0.5);
});

test('B4: input stays open after the reveal — a late response joins the artifact', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, { prompt: 'p', shape: 'story' });
  await respond(circle, seed, 'u1', { text: 'one' });
  await respond(circle, seed, 'u2', { text: 'two' });
  assert.equal(seed.phase, 'revealed');

  // u3 joins the circle after the close and still contributes — with a
  // position-less story AND even a position on a placement ask (a late dot).
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u3', username: 'U3' });
  await respond(circle, seed, 'u3', { text: 'late' });
  const rows = await gather.listResponses({ store, circle, seed, viewerId: 'u1' });
  assert.equal(rows.length, 3);
});

test('B5: after the close an existing response edits text only', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, {
    prompt: 'p', shape: 'story-placement', axes: [{ poleA: 'a', poleB: 'b' }],
  });
  await respond(circle, seed, 'u1', { text: 'v1', position: { x: 0.1 } });
  await respond(circle, seed, 'u2', { text: 'w', position: { x: 0.9 } });
  assert.equal(seed.phase, 'revealed');

  // Text edit lands.
  await respond(circle, seed, 'u1', { text: 'v2' });
  assert.equal((await store.findResponse(seed.id, 'u1')).text, 'v2');

  // A moved position and a new recording are both refused.
  await assert.rejects(
    respond(circle, seed, 'u1', { text: 'v3', position: { x: 0.8 } }),
    /Positions are fixed/,
  );
  await assert.rejects(
    respond(circle, seed, 'u1', { text: 'v3', audio: { url: 'https://x.public.blob.vercel-storage.com/a.webm' } }),
    /recording is fixed/,
  );
  // And the position genuinely did not move.
  assert.equal((await store.findPlacement(seed.id, 'u1')).position.x, 0.1);
});

test('B5: editAfterClose off refuses post-close edits but still takes late responses', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, { prompt: 'p', shape: 'story', editAfterClose: false });
  await respond(circle, seed, 'u1', { text: 'one' });
  await respond(circle, seed, 'u2', { text: 'two' });
  assert.equal(seed.phase, 'revealed');

  await assert.rejects(respond(circle, seed, 'u1', { text: 'changed' }), /no longer takes edits/);

  await circles.joinCircle({ store, circleId: circle.id, userId: 'u3', username: 'U3' });
  await respond(circle, seed, 'u3', { text: 'late still lands' });
  assert.equal((await store.listResponses(seed.id)).length, 3);
});

test('audio is fixed from submission, even before the close', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, { prompt: 'p', shape: 'story' });
  await respond(circle, seed, 'u1', {
    audio: { url: 'https://x.public.blob.vercel-storage.com/a.webm', durationMs: 4000 },
  });
  await assert.rejects(
    respond(circle, seed, 'u1', {
      audio: { url: 'https://x.public.blob.vercel-storage.com/b.webm' },
    }),
    /recording is fixed/,
  );
  // A text edit alongside the kept recording is fine.
  await respond(circle, seed, 'u1', { text: 'and some words' });
  const share = await store.findResponse(seed.id, 'u1');
  assert.equal(share.text, 'and some words');
  assert.ok(share.audio.url.endsWith('a.webm'));
});

test('reactions: live on an open wall, at the reveal on a sealed one, never on yourself', async () => {
  const circle = await circleWith(3);
  const open = await ask(circle, { prompt: 'open', shape: 'story', reveal: 'open' });
  const { share } = await respond(circle, open, 'u1', { text: 'mine' });

  // Live on the open wall.
  const { share: reacted } = await gather.reactToResponse({
    store, circleId: circle.id, seedId: open.id, shareId: share.id, userId: 'u2',
  });
  assert.equal(reacted.reactionCount, 1);

  // Toggled back off.
  const { share: untoggled } = await gather.reactToResponse({
    store, circleId: circle.id, seedId: open.id, shareId: share.id, userId: 'u2',
  });
  assert.equal(untoggled.reactionCount, 0);

  // Never on your own.
  await assert.rejects(
    gather.reactToResponse({ store, circleId: circle.id, seedId: open.id, shareId: share.id, userId: 'u1' }),
    /your own story/i,
  );

  // Sealed: reactions wait for the reveal.
  const sealed = await ask(circle, { prompt: 'sealed', shape: 'story', reveal: 'sealed' }, 'u2');
  const { share: s1 } = await respond(circle, sealed, 'u1', { text: 'a' });
  await assert.rejects(
    gather.reactToResponse({ store, circleId: circle.id, seedId: sealed.id, shareId: s1.id, userId: 'u2' }),
    /open at the reveal/,
  );
});

test('a moved position drops the reactions it collected (§9 gotcha 2)', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, {
    prompt: 'p', shape: 'story-placement', reveal: 'open',
    axes: [{ poleA: 'a', poleB: 'b' }],
  });
  const { share } = await respond(circle, seed, 'u1', { text: 's', position: { x: 0.2 } });
  await gather.reactToResponse({
    store, circleId: circle.id, seedId: seed.id, shareId: share.id, userId: 'u2',
  });

  // A text-only resubmission keeps the reaction; a moved dot loses it.
  await respond(circle, seed, 'u1', { text: 's2', position: { x: 0.2 } });
  assert.equal((await store.findResponse(seed.id, 'u1')).reactedIds.length, 1);
  await respond(circle, seed, 'u1', { text: 's2', position: { x: 0.7 } });
  assert.equal((await store.findResponse(seed.id, 'u1')).reactedIds.length, 0);
});

test('reactions off is off', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, { prompt: 'p', shape: 'story', reveal: 'open', reactions: false });
  const { share } = await respond(circle, seed, 'u1', { text: 'mine' });
  await assert.rejects(
    gather.reactToResponse({ store, circleId: circle.id, seedId: seed.id, shareId: share.id, userId: 'u2' }),
    /no reactions/,
  );
});

test('the timer closes a sealed ask and mails the reveal', async () => {
  const circle = await circleWith(3);
  const seed = await ask(circle, { prompt: 'Slow one', shape: 'story', respondHours: 48 });
  await respond(circle, seed, 'u1', { text: 'only me' });

  const later = new Date(Date.now() + 49 * 60 * 60 * 1000);
  await circles.evaluate({ store, circle, now: later });
  assert.equal(seed.phase, 'revealed');
  const t = circle.transitions.find(x => x.seedId === seed.id && x.to === 'revealed');
  assert.equal(t.via, 'deadline');
  assert.ok(store._emails.some(e => e.subject.includes('Where the circle landed')));
});

test('the ask mail names the asker and skips people who already answered', async () => {
  const circle = await circleWith(3);
  await ask(circle, { prompt: 'A first job', shape: 'story' }, 'u2');
  const askMails = store._emails.filter(e => e.subject.includes('asks: A first job'));
  // u2 (the asker, not yet responded) still gets one — suppression is about
  // having ANSWERED, and posting is not answering.
  assert.equal(askMails.length, 3);
  assert.ok(askMails[0].subject.startsWith('U2 asks'));
});

test('snapshotExtras: sealed hides the aggregate until the close, then serves it', async () => {
  const circle = await circleWith(2);
  const seed = await ask(circle, {
    prompt: 'p', shape: 'placement', axes: [{ poleA: 'a', poleB: 'b' }],
  });
  await respond(circle, seed, 'u1', { position: { x: 0 } });

  const mod = activities.get('gather');
  const mid = await mod.snapshotExtras({ circle, seed, viewerId: 'u1' });
  assert.equal(mid.aggregate, null);
  assert.equal(mid.responses.length, 1); // own only
  assert.ok(mid.myResponse);

  await respond(circle, seed, 'u2', { position: { x: 1 } });
  const done = await mod.snapshotExtras({ circle, seed, viewerId: 'u1' });
  assert.equal(done.aggregate.x.mean, 0.5);
  assert.equal(done.responses.length, 2);
});

test('participation follows the reveal setting', async () => {
  const circle = await circleWith(3);
  const mod = activities.get('gather');

  const sealed = await ask(circle, { prompt: 'sealed', shape: 'story', reveal: 'sealed' });
  await respond(circle, sealed, 'u1', { text: 'x' });
  const midRow = await mod.participation({ seed: sealed, viewerId: 'u1' });
  assert.deepEqual(midRow, { tellerIds: null, tellerCount: null, iTold: true });

  const open = await ask(circle, { prompt: 'open', shape: 'story', reveal: 'open' }, 'u2');
  await respond(circle, open, 'u2', { text: 'y' });
  const openRow = await mod.participation({ seed: open, viewerId: 'u1' });
  assert.deepEqual(openRow, { tellerIds: ['u2'], tellerCount: 1, iTold: false });
});

test('a gather ask runs beside a threshold-style seed in one circle', async () => {
  // A second module standing in for threshold, so the mixed case is proven
  // without importing the real app.
  activities.register('twostep', {
    phases: ['share', 'rank'],
    async normalizeSeed(p) { return { topic: String(p.topic) }; },
    async isMemberDone() { return false; },
  });
  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'twostep', title: 'Mixed', urlName: 'mixed',
    createdBy: 'u1', creatorName: 'One', mode: 'circle', requireInvitation: false,
    config: { maxLive: 3, shareHours: 72, rankHours: 72 },
  });
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u2', username: 'U2' });
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { topic: 'story time' } });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u2', activity: 'gather',
    payload: { prompt: 'Quick ask', shape: 'story' },
  });

  const askSeed = circle.seeds.find(s => s.activity === 'gather');
  assert.equal(askSeed.phase, 'respond');
  await respond(circle, askSeed, 'u1', { text: 'a' });
  await respond(circle, askSeed, 'u2', { text: 'b' });
  assert.equal(askSeed.phase, 'revealed');
  // The threshold-style seed is untouched by the gather cycle ending.
  assert.equal(circle.seeds.find(s => s.activity === null).phase, 'share');
  assert.equal(circle.phase, 'cycle');
});
