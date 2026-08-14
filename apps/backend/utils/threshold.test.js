const { test } = require('node:test');
const assert = require('node:assert/strict');

const circles = require('./circles');
const activities = require('./circleActivities');
const threshold = require('./threshold');

// One in-memory store implementing BOTH surfaces — the circle machine's and
// Threshold's — because a real run crosses them constantly: submitting the
// last ranking advances the circle, which reveals, which reads the rankings.
function memStore() {
  const circleRows = [];
  const shares = [];
  const rankings = [];
  const notifications = [];
  const emails = [];
  let seq = 0;
  const nextId = () => `x${++seq}`;

  return {
    _circles: circleRows,
    _shares: shares,
    _rankings: rankings,
    _notifications: notifications,
    _emails: emails,

    // --- circle surface ---
    async findCircleById(id) { return circleRows.find(c => c.id === id) || null; },
    async findCircleByUrlName(instanceId, urlName) {
      return circleRows.find(c => c.instanceId === instanceId && c.urlName === urlName) || null;
    },
    async listRunningCircles() { return circleRows.filter(c => c.status === 'running'); },
    async createCircleDoc(fields) {
      const doc = {
        transitions: [], seeds: [], members: [], invitedEmails: [], requireInvitation: true,
        liveSeedId: null, phaseDeadline: null, startedAt: null, completedAt: null,
        ...fields,
        config: {
          shareHours: 72, rankHours: 72,
          advanceOnComplete: true, seedDefaults: {},
          ...(fields.config || {}),
        },
      };
      circleRows.push(doc);
      return doc;
    },
    async saveCircle(circle) { return circle; },
    async notify(a) { notifications.push(a); },
    async sendEmail(a) { emails.push(a); },

    // --- threshold surface ---
    async findShare(seedId, userId, pole) {
      return shares.find(s => s.seedId === seedId && s.userId === userId && s.pole === pole) || null;
    },
    async listShares(seedId) {
      return shares.filter(s => s.seedId === seedId);
    },
    async countSharesByUser(seedId, userId) {
      return shares.filter(s => s.seedId === seedId && s.userId === userId).length;
    },
    async createShare(fields) {
      const doc = { id: nextId(), createdAt: new Date(), transcript: { status: 'skipped', text: '' }, ...fields };
      shares.push(doc);
      return doc;
    },
    async findShareById(id) {
      return shares.find(s => s.id === id) || null;
    },
    async markTranscriptPending(id) {
      const s = shares.find(x => x.id === id);
      if (s) s.transcript = { ...s.transcript, status: 'pending' };
    },
    async attachTranscript(id, text, status) {
      const s = shares.find(x => x.id === id);
      if (s) s.transcript = { status, text };
    },
    async saveShare(share) { return share; },
    async removeShare(seedId, userId, pole) {
      const i = shares.findIndex(s => s.seedId === seedId && s.userId === userId && s.pole === pole);
      if (i >= 0) shares.splice(i, 1);
    },
    async findRanking(seedId, rankerId) {
      return rankings.find(r => r.seedId === seedId && r.rankerId === rankerId) || null;
    },
    async createRanking(fields) {
      const doc = { id: nextId(), ...fields };
      rankings.push(doc);
      return doc;
    },
    async saveRanking(r) { return r; },
    async listSubmittedRankings(seedId) {
      return rankings.filter(r => r.seedId === seedId && r.submittedAt);
    },
  };
}

// Register a module bound to THIS test's store. The production module is
// registered on require with the mongo store, so every test must replace it.
function useStore(store) {
  activities.reset();
  activities.register('threshold', threshold.createModule({ store }));
}

const SEED = { topic: 'Authority', poleA: 'Liberating', poleB: 'Constricting' };

async function runningCircle(store, { members = 3, seeds = 1, config = {} } = {}) {
  const circle = await circles.createCircle({
    store,
    instanceId: 'inst1',
    activity: 'threshold',
    title: 'Authority circle',
    urlName: 'authority',
    createdBy: 'u1',
    creatorName: 'One',
    creatorEmail: 'one@example.com',
    requireInvitation: false,
    config,
  });
  for (let i = 2; i <= members; i++) {
    await circles.joinCircle({ store, circleId: circle.id, userId: `u${i}`, username: `U${i}` });
  }
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });
  // The first topic posted into an idle circle starts running immediately; the
  // rest queue behind it. There is no seeding round to wait out (D27).
  for (let i = 1; i <= seeds; i++) {
    await circles.addSeed({
      store, circleId: circle.id, userId: `u${i}`,
      payload: { ...SEED, topic: `${SEED.topic} ${i}` },
    });
  }
  return circle;
}

// ---------------------------------------------------------------------------
// Seed validation
// ---------------------------------------------------------------------------

test('normalizeSeed: a topic and two different poles', () => {
  const seed = threshold.normalizeSeed({ topic: '  Authority ', poleA: 'Liberating', poleB: 'Constricting' });
  assert.deepEqual(seed, {
    topic: 'Authority', poleA: 'Liberating', poleB: 'Constricting',
    secondsPerNote: threshold.DEFAULT_SECONDS,
  });
});

test('normalizeSeed rejects a missing topic, a missing pole, and two identical poles', () => {
  assert.throws(() => threshold.normalizeSeed({ poleA: 'a', poleB: 'b' }), /topic is required/);
  assert.throws(() => threshold.normalizeSeed({ topic: 't', poleA: 'a' }), /Both ends/);
  // Identical ends give every ranker the same bucket twice, so agreement stops
  // meaning anything rather than merely being uninteresting.
  assert.throws(() => threshold.normalizeSeed({ topic: 't', poleA: 'Open', poleB: ' open ' }), /must be different/);
});

test('normalizeSeed clamps the note length', () => {
  assert.equal(threshold.normalizeSeed({ ...SEED, secondsPerNote: 5 }).secondsPerNote, threshold.MIN_SECONDS);
  assert.equal(threshold.normalizeSeed({ ...SEED, secondsPerNote: 9000 }).secondsPerNote, threshold.MAX_SECONDS);
  assert.equal(threshold.normalizeSeed({ ...SEED, secondsPerNote: 'x' }).secondsPerNote, threshold.DEFAULT_SECONDS);
});

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

test('a share upserts per pole — one each, never a second on the same side (D10)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: 'the time my manager backed me',
  });
  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'B', text: 'the time the rules stopped me',
  });
  assert.equal(store._shares.length, 2);

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: 'actually, a different story',
  });
  assert.equal(store._shares.length, 2, 'replaced rather than added');
  assert.equal(store._shares.find(s => s.pole === 'A').text, 'actually, a different story');
});

test('both sides land before the phase is asked whether it should end', async () => {
  const store = memStore();
  useStore(store);
  // ONE member, which is the case that made this visible: `isMemberDone` for
  // `share` is "has at least one story", so a member telling one story is the
  // whole circle finishing. Told as two writes, the first ends the round and
  // the second is refused on a topic that moved on milliseconds ago.
  const circle = await runningCircle(store, { members: 1 });
  const seed = circle.seeds[0];

  const written = await threshold.submitShares({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    stories: [
      { pole: 'A', text: 'the time it steadied me' },
      { pole: 'B', text: 'the time it flattened me' },
    ],
  });

  assert.equal(written.length, 2, 'both stories written');
  assert.equal(store._shares.length, 2);
  const fresh = await store.findCircleById(circle.id);
  assert.equal(fresh.seeds[0].phase, 'rank', 'and the round moved on exactly once, afterwards');
});

test('telling one side then the other separately is what the single write prevents', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 1 });
  const seed = circle.seeds[0];

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: 'the time it steadied me',
  });
  // Not a race and not a tick — submitShare evaluates completion itself, so the
  // refusal is deterministic. This is the behaviour the compose surface stages
  // around rather than one it can retry through.
  await assert.rejects(
    () => threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
      pole: 'B', text: 'the time it flattened me',
    }),
    /not open for stories/,
  );
});

test('a turn naming one side twice is refused rather than quietly keeping the last', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  await assert.rejects(
    () => threshold.submitShares({
      store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
      stories: [{ pole: 'A', text: 'one' }, { pole: 'A', text: 'two' }],
    }),
    /One story per side/,
  );
  assert.equal(store._shares.length, 0, 'and nothing was written');
});

test('a share needs words or audio, a valid pole, membership, and an open phase', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];
  const base = { store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One' };

  await assert.rejects(() => threshold.submitShare({ ...base, pole: 'A', text: '   ' }), /Say something/);
  await assert.rejects(() => threshold.submitShare({ ...base, pole: 'C', text: 'x' }), /Pick one end/);
  await assert.rejects(
    () => threshold.submitShare({ ...base, userId: 'stranger', pole: 'A', text: 'x' }),
    /Not a member/,
  );

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' }); // → rank
  await assert.rejects(() => threshold.submitShare({ ...base, pole: 'A', text: 'x' }), /not open for stories/);
});

test('a title falls back to the opening of the story', async () => {
  assert.equal(threshold.deriveTitle('', 'a short one'), 'a short one');
  assert.equal(threshold.deriveTitle('Given', 'ignored'), 'Given');
  const long = 'x'.repeat(200);
  assert.equal(threshold.deriveTitle('', long).length, 80);
  assert.ok(threshold.deriveTitle('', long).endsWith('…'));
});

test('the audio host allowlist is a suffix match and rejects everything else', () => {
  const ok = threshold.normalizeAudio({ url: 'https://abc123.public.blob.vercel-storage.com/t/a.webm' });
  assert.equal(ok.url, 'https://abc123.public.blob.vercel-storage.com/t/a.webm');
  // The blob key is stored, not re-derived at restore time: the store id lives
  // in the hostname, so a restore into a new store needs the key on its own.
  assert.equal(ok.pathname, 't/a.webm');

  assert.throws(() => threshold.normalizeAudio({ url: 'https://evil.example.com/a.webm' }), /not an allowed host/);
  assert.throws(() => threshold.normalizeAudio({ url: 'http://abc.public.blob.vercel-storage.com/a' }), /not valid/);
  assert.throws(() => threshold.normalizeAudio({ url: 'javascript:alert(1)' }), /not valid/);
  assert.throws(() => threshold.normalizeAudio({ url: '' }), /needs a url/);
});

test('a recorded share is mirrored off-site, and the mirror cannot fail the submission', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];
  const url = 'https://abc123.public.blob.vercel-storage.com/threshold/x/a.webm';

  // Vercel Blob has no snapshots, no versioning and no undelete, so a recording
  // is copied seconds after it is made rather than at the next nightly sweep —
  // the person who records once and never returns is the risk the sweep alone
  // leaves open.
  const mirrored = [];
  threshold.setBlobMirror(async ({ share }) => { mirrored.push(share.audio.url); });

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: '', audio: { url, durationMs: 8990, peaks: [0.5] },
  });
  await new Promise(r => setImmediate(r)); // the hook is fire-and-forget
  assert.deepEqual(mirrored, [url]);

  // A failing mirror must never reject a story somebody just told.
  threshold.setBlobMirror(async () => { throw new Error('S3 is down'); });
  const share = await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u2', username: 'Two',
    pole: 'A', text: '', audio: { url, durationMs: 1000, peaks: [] },
  });
  await new Promise(r => setImmediate(r));
  assert.equal(share.audio.url, url, 'the share was still written');

  threshold.setBlobMirror(null);
});

test('transcription: enqueued on a recorded share, and it cannot fail the write', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];
  const url = 'https://abc123.public.blob.vercel-storage.com/threshold/x/a.webm';

  const queued = [];
  threshold.setTranscriber(async ({ share, markPending }) => {
    queued.push(share.id);
    // Only marked pending once the vendor ACCEPTS — a share stuck on 'pending'
    // forever is what setting it earlier would produce whenever the enqueue is
    // skipped, which is the normal local state.
    await markPending();
  });

  const share = await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: '', audio: { url, durationMs: 5000, peaks: [] },
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(queued, [share.id]);
  assert.equal(store._shares.find(s => s.id === share.id).transcript.status, 'pending');

  // A dead vendor must never reject a story somebody just told.
  threshold.setTranscriber(async () => { throw new Error('Deepgram exploded'); });
  const second = await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u2', username: 'Two',
    pole: 'A', text: '', audio: { url, durationMs: 5000, peaks: [] },
  });
  await new Promise(r => setImmediate(r));
  assert.equal(second.audio.url, url, 'the share was still written');

  threshold.setTranscriber(null);
});

test('attachTranscript stores text, and an empty one is marked failed', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];
  const url = 'https://abc123.public.blob.vercel-storage.com/threshold/x/a.webm';

  const share = await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: '', audio: { url, durationMs: 5000, peaks: [] },
  });

  await threshold.attachTranscript({ store, shareId: share.id, text: '  So many burgers  ' });
  let row = store._shares.find(s => s.id === share.id);
  assert.equal(row.transcript.text, 'So many burgers');
  assert.equal(row.transcript.status, 'ready');

  // Deepgram returning nothing usable is a failure, not a valid empty result —
  // otherwise a share reads as "transcribed, and they said nothing".
  await threshold.attachTranscript({ store, shareId: share.id, text: '' });
  row = store._shares.find(s => s.id === share.id);
  assert.equal(row.transcript.status, 'failed');

  await assert.rejects(
    () => threshold.attachTranscript({ store, shareId: 'nope', text: 'x' }),
    /Share not found/,
  );
});

test('the transcript callback token is per-share and cannot be forged', () => {
  process.env.GAME_TOKEN_SECRET = process.env.GAME_TOKEN_SECRET || 'test-secret';
  const t = require('./thresholdTranscribe');

  const good = t.callbackToken('share-1');
  assert.equal(t.verifyCallbackToken('share-1', good), true);

  // Deepgram is not authenticated to us — anyone who learns the URL could POST
  // a transcript, so this token is the only thing standing between a stranger
  // and rewriting what somebody said.
  assert.equal(t.verifyCallbackToken('share-2', good), false, 'a token for one share must not work on another');
  assert.equal(t.verifyCallbackToken('share-1', 'forged'), false);
  assert.equal(t.verifyCallbackToken('share-1', ''), false);
  assert.equal(t.verifyCallbackToken('share-1', null), false);
});

test('a typed share never calls the mirror', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  let calls = 0;
  threshold.setBlobMirror(async () => { calls++; });
  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One',
    pole: 'A', text: 'typed, no audio',
  });
  await new Promise(r => setImmediate(r));
  assert.equal(calls, 0);
  threshold.setBlobMirror(null);
});

// ---------------------------------------------------------------------------
// Visibility (D9 / D17)
// ---------------------------------------------------------------------------

test('a stranger who knows the urlName still cannot read the stories', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  assert.equal(seed.phase, 'rank', 'everyone shared, so the stories are open to the circle');

  // A urlName is chosen by a facilitator and travels in links — a name, not a
  // secret. Every circle in a Threshold deployment shares one instance, so
  // membership is the only boundary between two of them.
  await assert.rejects(
    () => threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'outsider' }),
    /Not a member/,
  );
  await assert.rejects(
    () => threshold.listShares({ store, circle, seedId: seed.id, viewerId: null }),
    /Not a member/,
  );

  // And a member is unaffected.
  const wire = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'u2' });
  assert.equal(wire.length, 3);
});

test('during the share phase you see only your own stories (D17)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  // Only two of three, so the phase is still open — once the last person
  // shares it advances to rank and everything becomes visible at once.
  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  assert.equal(seed.phase, 'share');

  const mine = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'u2' });
  assert.equal(mine.length, 1, 'u1 has shared, but u2 cannot see it yet');
  assert.equal(mine[0].isMine, true);
  assert.equal(mine[0].text, 'story from u2');

  // Someone who has not shared at all sees nothing — no anchor either way.
  const none = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'u3' });
  assert.deepEqual(none, []);
});

test('while ranking, every story is visible and nobody else is named (D9)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  assert.equal(seed.phase, 'rank', 'everyone shared, so the phase advanced');

  const wire = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'u2' });
  assert.equal(wire.length, 3);

  const others = wire.filter(s => !s.isMine);
  assert.equal(others.length, 2);
  for (const s of others) {
    assert.equal(s.userId, undefined, 'no author id crosses the wire');
    assert.equal(s.username, undefined, 'no author name crosses the wire');
  }
  // Redaction is server-side: the payload itself must not carry the names.
  assert.equal(JSON.stringify(others).includes('U1'), false);
  assert.equal(JSON.stringify(others).includes('U3'), false);

  const own = wire.find(s => s.isMine);
  assert.equal(own.username, 'U2', 'you can always see your own');
});

test('after the reveal every story is attributed', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);
  for (const u of ['u1', 'u2']) {
    await threshold.submitRanking({
      store, circleId: circle.id, seedId: seed.id, userId: u,
      placements: ids.map(id => ({ shareId: id, pole: 'A' })),
    });
  }
  assert.equal(seed.phase, 'revealed');

  const wire = await threshold.listShares({ store, circle, seedId: seed.id, viewerId: 'u2' });
  assert.equal(wire.every(s => s.username), true);
});

test('the map: participation follows the redaction ladder (D9/D17)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3, seeds: 2 });
  const [first, second] = circle.seeds;

  // First topic all the way through: everyone shares, everyone ranks.
  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: first.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);
  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitRanking({
      store, circleId: circle.id, seedId: first.id, userId: u,
      placements: ids.map(id => ({ shareId: id, pole: 'A' })),
    });
  }
  assert.equal(first.phase, 'revealed');
  assert.equal(second.phase, 'share', 'the queue started the next topic');

  // Second topic mid-share: only u1 has a story in. Third topic queued, with
  // the author's early story on it (D34).
  await threshold.submitShare({
    store, circleId: circle.id, seedId: second.id, userId: 'u1', username: 'U1',
    pole: 'B', text: 'early on the live one',
  });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u1',
    payload: { ...SEED, topic: 'Queued topic' },
  });
  const third = circle.seeds[2];
  await threshold.submitShare({
    store, circleId: circle.id, seedId: third.id, userId: 'u1', username: 'U1',
    pole: 'A', text: 'told while queued',
  });

  const rows = await circles.participation({ circle, viewerId: 'u2' });
  const by = Object.fromEntries(rows.map(r => [r.seedId, r]));

  // Revealed: attributed, like the reveal itself.
  assert.deepEqual(new Set(by[first.id].tellerIds), new Set(['u1', 'u2', 'u3']));
  assert.equal(by[first.id].tellerCount, 3);
  assert.equal(by[first.id].iTold, true);

  // Mid-share and pending: no roster, and not even a count — listShares is
  // own-only in both, so a count would say who has moved.
  for (const row of [by[second.id], by[third.id]]) {
    assert.equal(row.tellerIds, null);
    assert.equal(row.tellerCount, null);
    assert.equal(row.iTold, false);
  }

  // The teller still sees their own moves.
  const mine = await circles.participation({ circle, viewerId: 'u1' });
  assert.equal(mine.find(r => r.seedId === second.id).iTold, true);
  assert.equal(mine.find(r => r.seedId === third.id).iTold, true);

  // Rank phase: the count becomes public, the roster does not.
  for (const u of ['u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: second.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  assert.equal(second.phase, 'rank');
  const ranked = await circles.participation({ circle, viewerId: 'u2' });
  const liveRow = ranked.find(r => r.seedId === second.id);
  assert.equal(liveRow.tellerIds, null);
  assert.equal(liveRow.tellerCount, 3);
  assert.equal(liveRow.iTold, true);

  // Membership is the boundary, like listShares.
  await assert.rejects(
    () => circles.participation({ circle, viewerId: 'stranger' }),
    /Not a member/,
  );
});

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

test('a draft saves partially; a submit demands every story placed', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);

  // Sorting as you listen: two placed, one still unheard.
  const draft = await threshold.saveRankingDraft({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1',
    placements: [{ shareId: ids[0], pole: 'A' }, { shareId: ids[1], pole: 'B' }],
  });
  assert.equal(draft.submittedAt, null);
  assert.equal(draft.placements.length, 2);

  await assert.rejects(
    () => threshold.submitRanking({
      store, circleId: circle.id, seedId: seed.id, userId: 'u1',
      placements: [{ shareId: ids[0], pole: 'A' }],
    }),
    /2 still unsorted/,
  );

  // Rearranging right up to submit is the point.
  const submitted = await threshold.submitRanking({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1',
    placements: ids.map((id, i) => ({ shareId: id, pole: i === 0 ? 'B' : 'A' })),
  });
  assert.ok(submitted.submittedAt);
  assert.equal(submitted.placements[0].pole, 'B', 'the final submit wins over the draft');
});

test('a ranking cannot be resubmitted or edited after submit', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `s${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);
  const full = ids.map(id => ({ shareId: id, pole: 'A' }));

  await threshold.submitRanking({ store, circleId: circle.id, seedId: seed.id, userId: 'u1', placements: full });
  await assert.rejects(
    () => threshold.submitRanking({ store, circleId: circle.id, seedId: seed.id, userId: 'u1', placements: full }),
    /already submitted/,
  );
  await assert.rejects(
    () => threshold.saveRankingDraft({ store, circleId: circle.id, seedId: seed.id, userId: 'u1', placements: full }),
    /already submitted/,
  );
});

test('placements are rejected for unknown or duplicated stories', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];
  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u, pole: 'A', text: `s${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);

  await assert.rejects(
    () => threshold.saveRankingDraft({
      store, circleId: circle.id, seedId: seed.id, userId: 'u1',
      placements: [{ shareId: 'nope', pole: 'A' }],
    }),
    /not in this topic/,
  );
  await assert.rejects(
    () => threshold.saveRankingDraft({
      store, circleId: circle.id, seedId: seed.id, userId: 'u1',
      placements: [{ shareId: ids[0], pole: 'A' }, { shareId: ids[0], pole: 'B' }],
    }),
    /same story twice/,
  );
});

// ---------------------------------------------------------------------------
// The gradient (§6.1, D15)
// ---------------------------------------------------------------------------

test('the reveal is a gradient, hand-computed', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 4 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2', 'u3', 'u4']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  const [s1, s2, s3, s4] = store._shares.map(s => s.id);

  // Four rankers. Constructed so the expected output is checkable by hand:
  //   s1 → A,A,A,A   agreement 4/4 = 1.00   coherence 1.00   unanimous
  //   s2 → A,A,A,B   agreement 3/4 = 0.75   coherence 0.50
  //   s3 → A,A,B,B   agreement 2/4 = 0.50   coherence 0.00   dead split
  //   s4 → B,B,B,B   agreement 0/4 = 0.00   coherence 1.00   unanimous
  const votes = {
    u1: { [s1]: 'A', [s2]: 'A', [s3]: 'A', [s4]: 'B' },
    u2: { [s1]: 'A', [s2]: 'A', [s3]: 'A', [s4]: 'B' },
    u3: { [s1]: 'A', [s2]: 'A', [s3]: 'B', [s4]: 'B' },
    u4: { [s1]: 'A', [s2]: 'B', [s3]: 'B', [s4]: 'B' },
  };
  for (const [user, placement] of Object.entries(votes)) {
    await threshold.submitRanking({
      store, circleId: circle.id, seedId: seed.id, userId: user,
      placements: Object.entries(placement).map(([shareId, pole]) => ({ shareId, pole })),
    });
  }

  assert.equal(seed.phase, 'revealed');
  const result = seed.result;
  assert.equal(result.rankers, 4);

  // Sorted by agreement descending: pole A at the top, pole B at the bottom,
  // the contested middle literally in the middle.
  assert.deepEqual(result.shares.map(r => r.shareId), [s1, s2, s3, s4]);
  assert.deepEqual(result.shares.map(r => r.agreement), [1, 0.75, 0.5, 0]);
  assert.deepEqual(result.shares.map(r => r.coherence), [1, 0.5, 0, 1]);
  assert.deepEqual(result.shares[2].splits, { a: 2, b: 2 });

  // Both ends count as unanimous — agreement is a position, coherence a magnitude.
  assert.equal(result.unanimous, 2);
  assert.equal(result.meanCoherence, (1 + 0.5 + 0 + 1) / 4);

  // No band classification is stored — that is a render-time choice (D15).
  assert.equal('bands' in result, false);
  assert.equal('width' in result, false);
});

test('a reveal nobody ranked keeps its stories, unplaced rather than absent', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1', username: 'One', pole: 'A', text: 'x',
  });
  // Force through share and rank without a single ranking submitted.
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(seed.phase, 'revealed');
  assert.equal(seed.result.rankers, 0);
  assert.equal(seed.result.meanCoherence, null);

  // The story was told, so it is part of the record — it simply has no
  // position, which is what `agreement: null` says. Returning [] here made the
  // reveal show nothing and the circle-final bar report "0 stories" for a topic
  // that had one, which is exactly the claim skipping is supposed to disprove.
  assert.equal(seed.result.shares.length, 1);
  assert.equal(seed.result.shares[0].agreement, null);
  assert.equal(seed.result.shares[0].coherence, null);
  assert.deepEqual(seed.result.shares[0].splits, { a: 0, b: 0 });
  assert.equal(seed.result.unanimous, 0);
});

test('a reveal with no stories at all is empty', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  assert.equal(seed.phase, 'revealed');
  assert.deepEqual(seed.result.shares, []);
  assert.equal(seed.result.meanCoherence, null);
});

test('a story nobody placed reads as unplaced, not as unanimous pole B', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u, pole: 'A', text: `s${u}`,
    });
  }
  const ids = store._shares.map(s => s.id);
  await threshold.submitRanking({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1',
    placements: ids.map(id => ({ shareId: id, pole: 'A' })),
  });

  // A third story arrives after that ranking was submitted — impossible via the
  // routes, but the denominator has to be per-share for the arithmetic to hold.
  const late = await store.createShare({
    instanceId: 'inst1', circleId: circle.id, seedId: seed.id,
    userId: 'u9', username: 'Nine', pole: 'A', title: 'late', text: 'late',
  });

  const result = await threshold.computeResult({ store, seed });
  const lateRow = result.shares.find(r => r.shareId === late.id);
  assert.equal(lateRow.agreement, null);
  assert.equal(lateRow.coherence, null);
  assert.equal(result.meanCoherence, 1, 'the unplaced story is left out of the mean');
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

test('a real 3-person circle: seed, share, rank, reveal, three cycles, complete', async () => {
  const store = memStore();
  useStore(store);

  const circle = await circles.createCircle({
    store, instanceId: 'inst1', activity: 'threshold',
    title: 'Sharing circle', urlName: 'sc', createdBy: 'u1',
    creatorName: 'One', creatorEmail: 'one@example.com', requireInvitation: false,
  });
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u2', username: 'Two', email: 'two@example.com' });
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u3', username: 'Three', email: 'three@example.com' });
  await circles.startCircle({ store, circleId: circle.id, userId: 'u1' });

  await circles.addSeed({ store, circleId: circle.id, userId: 'u1', payload: { ...SEED, topic: 'Authority' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u2', payload: { ...SEED, topic: 'Money', poleA: 'Freeing', poleB: 'Binding' } });
  await circles.addSeed({ store, circleId: circle.id, userId: 'u3', payload: { ...SEED, topic: 'Family', poleA: 'Holding', poleB: 'Holding back' } });

  assert.equal(circle.phase, 'cycle', 'the FIRST topic started the first cycle');
  assert.equal(circle.liveSeedId, circle.seeds[0].id);
  assert.equal(circles.queue(circle).length, 2, 'the other two wait their turn (D28)');

  for (let i = 0; i < 3; i++) {
    const seed = circle.seeds[i];
    assert.equal(seed.phase, 'share', `cycle ${i} opens on share`);

    for (const u of ['u1', 'u2', 'u3']) {
      await threshold.submitShare({
        store, circleId: circle.id, seedId: seed.id, userId: u, username: u,
        pole: u === 'u3' ? 'B' : 'A', text: `${u} on ${seed.payload.topic}`,
      });
    }
    assert.equal(seed.phase, 'rank', `cycle ${i} advances once everyone has shared`);

    const ids = (await store.listShares(seed.id)).map(s => s.id);
    for (const u of ['u1', 'u2', 'u3']) {
      await threshold.submitRanking({
        store, circleId: circle.id, seedId: seed.id, userId: u,
        placements: ids.map((id, n) => ({ shareId: id, pole: n === 0 ? 'A' : 'B' })),
      });
    }
    assert.equal(seed.phase, 'revealed', `cycle ${i} reveals once everyone has ranked`);
    assert.equal(seed.result.rankers, 3);
  }

  // Running out of topics is a pause, not an ending (D29).
  assert.equal(circle.phase, 'idle');

  const final = threshold.circleResult(circle);
  assert.equal(final.topics.length, 3);
  assert.deepEqual(final.topics.map(t => t.topic), ['Authority', 'Money', 'Family']);
  // Everyone ranked identically, so every topic is fully coherent.
  assert.equal(final.topics.every(t => t.meanCoherence === 1), true);
  assert.equal(final.topics.some(t => t.skipped), false);
  // No ranking of any kind — this is a record of a conversation (D25).
  assert.equal('mostContested' in final, false);

  await circles.closeCircle({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(circle.phase, 'closed');
  assert.equal(threshold.circleResult(circle).topics.length, 3, 'and the record still reads');
});

test('circleResult carries every story position, and names no winner (D25)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2, seeds: 2 });

  // Cycle 0: the two rankers agree. Cycle 1: they disagree on everything.
  const plans = [
    { u1: 'A', u2: 'A' },
    { u1: 'A', u2: 'B' },
  ];
  for (let i = 0; i < 2; i++) {
    const seed = circle.seeds[i];
    for (const u of ['u1', 'u2']) {
      await threshold.submitShare({
        store, circleId: circle.id, seedId: seed.id, userId: u, username: u, pole: 'A', text: `${u}-${i}`,
      });
    }
    const ids = (await store.listShares(seed.id)).map(s => s.id);
    for (const u of ['u1', 'u2']) {
      await threshold.submitRanking({
        store, circleId: circle.id, seedId: seed.id, userId: u,
        placements: ids.map(id => ({ shareId: id, pole: plans[i][u] })),
      });
    }
  }

  const final = threshold.circleResult(circle);
  assert.equal(final.topics[0].meanCoherence, 1);
  assert.equal(final.topics[1].meanCoherence, 0);

  // Every story's position travels, so the final screen can size its bar at
  // whatever cutoff the reader is holding — no band classification is stored
  // or served (D15).
  assert.deepEqual(final.topics[0].agreements, [1, 1]);
  assert.deepEqual(final.topics[1].agreements, [0.5, 0.5]);

  // And there is deliberately no headline: a sharing circle names no winner
  // and ranks no topic (D25).
  assert.equal('mostContested' in final, false);
  const asJson = JSON.stringify(final);
  assert.equal(/contested|winner|rank(ing)?Of/i.test(asJson), false);
});

test('an author may tell their story on their own topic while it is queued', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3, seeds: 2 });
  const queued = circle.seeds[1];
  assert.equal(queued.phase, 'pending');

  // People propose a topic BECAUSE something happened to them, and a topic can
  // sit in the queue for weeks before it runs.
  await threshold.submitShare({
    store, circleId: circle.id, seedId: queued.id, userId: 'u2', username: 'U2',
    pole: 'A', text: 'the reason I put this topic up',
  });
  assert.equal(store._shares.length, 1);

  // Everybody else waits for it to run — a topic nobody backs never runs, and
  // asking them for a story that may never be read is the work the queue exists
  // to let them skip.
  await assert.rejects(
    () => threshold.submitShare({
      store, circleId: circle.id, seedId: queued.id, userId: 'u3', username: 'U3',
      pole: 'A', text: 'early',
    }),
    /not open for stories/,
  );

  // And nothing leaks: a story told early is as unread as one told on time.
  const seen = await threshold.listShares({ store, circle, seedId: queued.id, viewerId: 'u3' });
  assert.deepEqual(seen, []);
  const own = await threshold.listShares({ store, circle, seedId: queued.id, viewerId: 'u2' });
  assert.equal(own.length, 1);

  // The author can take it back for as long as they could have told it.
  await threshold.deleteShare({ store, circleId: circle.id, seedId: queued.id, userId: 'u2', pole: 'A' });
  assert.equal(store._shares.length, 0);
});

test('opening the rank phase places every story on the side its teller chose (D22)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];

  const poles = { u1: 'A', u2: 'B', u3: 'A' };
  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u,
      pole: poles[u], text: `${u} told it`,
    });
  }
  assert.equal(seed.phase, 'rank', 'the last story advanced the phase');

  // One draft each, holding their own story on their own side — and nobody
  // else's, because that is the question ranking is about to ask them.
  for (const u of ['u1', 'u2', 'u3']) {
    const draft = await store.findRanking(seed.id, u);
    assert.ok(draft, `${u} has a draft ranking`);
    assert.equal(draft.submittedAt, null, 'a draft, never a submission');
    assert.equal(draft.placements.length, 1);
    const own = store._shares.find(s => s.seedId === seed.id && s.userId === u);
    assert.deepEqual(draft.placements[0], { shareId: own.id, pole: poles[u] });
  }

  // A draft is not a submission, so it feeds neither advancement nor the
  // gradient — the cycle is still waiting on all three rankings.
  assert.equal(seed.phase, 'rank');
  assert.equal((await store.listSubmittedRankings(seed.id)).length, 0);
});

test('pre-placement is idempotent and never touches a submitted ranking', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u, pole: 'A', text: u,
    });
  }
  const ids = (await store.listShares(seed.id)).map(s => s.id);

  // u1 finishes the whole sort and sends it in.
  await threshold.submitRanking({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1',
    placements: ids.map(id => ({ shareId: id, pole: 'B' })),
  });
  const submitted = await store.findRanking(seed.id, 'u1');
  const before = JSON.stringify(submitted.placements);

  // Running the boundary again must change nothing for either of them: u1's
  // ranking is sent, and u2's already holds their own story.
  await threshold.preplaceOwnStories({ store, circle, seed });

  assert.equal(JSON.stringify((await store.findRanking(seed.id, 'u1')).placements), before);
  assert.equal((await store.findRanking(seed.id, 'u2')).placements.length, 1);
});

test('a skipped topic keeps every story, and reveals them attributed (D30)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2, seeds: 2 });
  const dropped = circle.seeds[0];

  await threshold.submitShare({
    store, circleId: circle.id, seedId: dropped.id, userId: 'u2', username: 'Two',
    pole: 'A', text: 'told before the group moved on',
  });

  await circles.skipSeed({ store, circleId: circle.id, userId: 'u1' });
  assert.equal(dropped.phase, 'skipped');

  // The story is still there and now carries its author, exactly as a revealed
  // one does — the group stopping is not a reason to hide who spoke.
  //
  // The name is `U2`, the one this circle joined them under, rather than the
  // `Two` this write passed: a story is attributed at the reveal, and the name
  // on it has to be the one beside them in the member list. What made that
  // worth enforcing is that no client sends a name at all, so the request's
  // idea of who you are was the string 'Member' for every story ever written
  // through the app.
  const shares = await threshold.listShares({ store, circle, seedId: dropped.id, viewerId: 'u1' });
  assert.equal(shares.length, 1);
  assert.equal(shares[0].text, 'told before the group moved on');
  assert.equal(shares[0].username, 'U2');

  // Nobody ranked it, so it reveals empty rather than wrong.
  assert.equal(dropped.result.rankers, 0);
  assert.equal(circles.activeSeed(circle).id, circle.seeds[1].id, 'and the next topic is running');
});

test('circleResult reads mid-circle and says which topics were skipped (D29)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3, seeds: 3 });

  // A record of the conversation so far — nothing has finished yet.
  assert.deepEqual(threshold.circleResult(circle).topics, []);
  assert.equal(threshold.circleResult(circle).phase, 'cycle');

  await circles.skipSeed({ store, circleId: circle.id, userId: 'u1' });

  const mid = threshold.circleResult(circle);
  assert.equal(mid.topics.length, 1, 'readable long before the circle ends');
  assert.equal(mid.topics[0].skipped, true);
  assert.equal(mid.mode, 'circle');
});

test('the queue: support decides what runs next, and a late joiner takes full part (D27, D32)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2, seeds: 1 });

  // u3 arrives in week six, posts a topic, and u2 backs it over u1's older one.
  await circles.joinCircle({ store, circleId: circle.id, userId: 'u3', username: 'Three' });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u1', payload: { ...SEED, topic: 'Older' },
  });
  await circles.addSeed({
    store, circleId: circle.id, userId: 'u3', payload: { ...SEED, topic: 'Newcomer' },
  });
  const newcomer = circle.seeds.find(s => s.payload.topic === 'Newcomer');
  await circles.supportSeed({ store, circleId: circle.id, seedId: newcomer.id, userId: 'u2' });

  assert.deepEqual(circles.queue(circle).map(s => s.payload.topic), ['Newcomer', 'Older']);

  // The live cycle waits for them like anybody else.
  const live = circles.activeSeed(circle);
  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: live.id, userId: u, username: u, pole: 'A', text: `${u}`,
    });
  }
  assert.equal(live.phase, 'share', 'the newcomer is a member, so the round waits for them');

  await threshold.submitShare({
    store, circleId: circle.id, seedId: live.id, userId: 'u3', username: 'Three', pole: 'B', text: 'mine',
  });
  assert.equal(live.phase, 'rank');

  // Everything except their own story reads as waiting on them — the marker is
  // that difference, derived and never stored (D32). Their own is already
  // placed, because telling it placed it (D22).
  const shares = await threshold.listShares({ store, circle, seedId: live.id, viewerId: 'u3' });
  const mine = await store.findRanking(live.id, 'u3');
  assert.equal(shares.length, 3);
  assert.equal(mine.placements.length, 1);
  const placed = new Set(mine.placements.map(p => p.shareId));
  assert.deepEqual(shares.filter(s => !placed.has(s.id)).length, 2);
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

test('every message links to the circle and says how to stop (D31, §9.1)', async () => {
  const store = memStore();
  useStore(store);
  process.env.THRESHOLD_URL = 'https://threshold.example';
  const circle = await runningCircle(store, { members: 2 });
  const mod = activities.get('threshold');
  const seed = circle.seeds[0];

  for (const [phase, s2] of [['idle', null], ['share', seed], ['rank', seed], ['revealed', seed], ['skipped', seed], ['closed', null]]) {
    const msg = await mod.notificationFor({ circle, seed: s2, phase, userId: 'u2' });
    assert.ok(msg, `${phase} produces a message`);

    // The circle page, never a phase surface: a round advances on a 60s tick,
    // so a link to /rank is the likeliest thing in the system to be stale by
    // the time somebody opens their inbox.
    assert.ok(msg.text.includes('https://threshold.example/t/authority'), `${phase} links to the circle`);
    assert.equal(msg.text.includes('/rank'), false, `${phase} does not link to a phase surface`);

    // And how to stop — which also becomes the List-Unsubscribe header.
    assert.equal(msg.unsubscribeUrl, 'https://threshold.example/notifications');
    assert.ok(msg.text.includes(msg.unsubscribeUrl));
  }
  delete process.env.THRESHOLD_URL;
});

test('muting a circle stops the mail and keeps the notification (D31)', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  circle.members.forEach(m => { m.email = `${m.userId}@example.com`; });

  await circles.setEmailOptOut({ store, circleId: circle.id, userId: 'u2', optOut: true });
  assert.equal(circles.toClient(circle, { userId: 'u2' }).myEmailOptOut, true);
  assert.equal(circles.toClient(circle, { userId: 'u3' }).myEmailOptOut, false, 'mine only');

  const mailBefore = store._emails.length;
  const notesBefore = store._notifications.length;
  await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });

  const sent = store._emails.slice(mailBefore).map(e => e.to);
  const notified = store._notifications.slice(notesBefore).map(n => n.userId);
  assert.equal(sent.includes('u2@example.com'), false, 'no mail');
  assert.ok(notified.includes('u2'), 'muting a circle never means missing what happened in it');

  // And the mail that did go carries the header, once per recipient.
  const withHeader = store._emails.slice(mailBefore).filter(e => e.headers?.['List-Unsubscribe']);
  assert.equal(withHeader.length, sent.length);
  assert.match(withHeader[0].headers['List-Unsubscribe'], /^<https?:\/\/.+\/notifications>$/);

  await assert.rejects(
    () => circles.setEmailOptOut({ store, circleId: circle.id, userId: 'stranger', optOut: true }),
    /Not a member/,
  );
});

test('the share nudge skips people who already shared', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const mod = activities.get('threshold');
  const seed = circle.seeds[0];

  await threshold.submitShare({
    store, circleId: circle.id, seedId: seed.id, userId: 'u2', username: 'Two', pole: 'A', text: 'done already',
  });

  assert.equal(await mod.notificationFor({ circle, seed, phase: 'share', userId: 'u2' }), null);
  const forU3 = await mod.notificationFor({ circle, seed, phase: 'share', userId: 'u3' });
  assert.match(forU3.subject, /share a story about Authority/);
  assert.match(forU3.text, /Liberating|Constricting/);
});

test('the rank nudge names both poles and skips people who submitted', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 2 });
  const mod = activities.get('threshold');
  const seed = circle.seeds[0];

  for (const u of ['u1', 'u2']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u, pole: 'A', text: `s${u}`,
    });
  }
  const ids = (await store.listShares(seed.id)).map(s => s.id);
  await threshold.submitRanking({
    store, circleId: circle.id, seedId: seed.id, userId: 'u1',
    placements: ids.map(id => ({ shareId: id, pole: 'A' })),
  });

  assert.equal(await mod.notificationFor({ circle, seed, phase: 'rank', userId: 'u1' }), null);
  const forU2 = await mod.notificationFor({ circle, seed, phase: 'rank', userId: 'u2' });
  assert.match(forU2.text, /Liberating/);
  assert.match(forU2.text, /Constricting/);
});

test('the one-call snapshot: layer assembles, module enriches, redaction holds', async () => {
  const store = memStore();
  useStore(store);
  const circle = await runningCircle(store, { members: 3 });
  const seed = circle.seeds[0];
  for (const u of ['u1', 'u2', 'u3']) {
    await threshold.submitShare({
      store, circleId: circle.id, seedId: seed.id, userId: u, username: u.toUpperCase(),
      pole: 'A', text: `story from ${u}`,
    });
  }
  assert.equal(seed.phase, 'rank');

  // A member mid-rank: stories present and anonymous, ranking pre-placed with
  // their own story (D22), waiting marker derived, participation attached.
  const mine = await circles.snapshot({ store, circle, viewerId: 'u2' });
  assert.equal(mine.isMember, true);
  assert.equal(mine.shares.length, 3);
  for (const s of mine.shares.filter(x => !x.isMine)) {
    assert.equal(s.userId, undefined, 'anonymous while ranking');
  }
  assert.equal(mine.myRanking.submittedAt, null, 'a draft, from pre-placement');
  assert.equal(mine.waitingShareIds.length, 2, 'own story placed itself');
  assert.equal(mine.participation.length, 1);
  assert.equal(mine.participation[0].tellerCount, 3);

  // A stranger gets the shell alone: no stories, no ranking, no participation.
  const shell = await circles.snapshot({ store, circle, viewerId: 'outsider' });
  assert.equal(shell.isMember, false);
  assert.equal(shell.shares, undefined);
  assert.equal(shell.participation, undefined);
  assert.equal(shell.title, 'Authority circle', 'the shell stays readable');
});
