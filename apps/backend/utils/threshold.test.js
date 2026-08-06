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
        cycleIndex: -1, phaseDeadline: null, startedAt: null, completedAt: null,
        ...fields,
        config: {
          seedHours: 72, shareHours: 72, rankHours: 72,
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
  for (let i = 1; i <= seeds; i++) {
    await circles.addSeed({
      store, circleId: circle.id, userId: `u${i}`,
      payload: { ...SEED, topic: `${SEED.topic} ${i}` },
    });
  }
  if (circle.phase === 'seeding') {
    await circles.advanceCircle({ store, circleId: circle.id, userId: 'u1' });
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

test('a reveal with nobody ranking is empty rather than wrong', async () => {
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
  assert.deepEqual(seed.result.shares, []);
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

  assert.equal(circle.phase, 'cycle', 'the last seed triggered the first cycle');

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

  assert.equal(circle.phase, 'complete');

  const final = threshold.circleResult(circle);
  assert.equal(final.topics.length, 3);
  assert.deepEqual(final.topics.map(t => t.topic), ['Authority', 'Money', 'Family']);
  // Everyone ranked identically, so every topic is fully coherent.
  assert.equal(final.topics.every(t => t.meanCoherence === 1), true);
  assert.ok(final.mostContested);
});

test('circleResult reports the topic that split the group hardest', async () => {
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
  assert.equal(final.mostContested, circle.seeds[1].id);
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

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
