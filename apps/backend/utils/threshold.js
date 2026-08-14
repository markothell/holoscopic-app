// threshold — the write funnel for Threshold, and the circle activity module
// that teaches utils/circles.js how to run it.
//
// Never write ThresholdShare or ThresholdRanking outside this file. The phase
// gate, the upsert keys, the complete-or-nothing submit rule, the blob host
// allowlist and the reveal computation all live here.
//
// Design: apps/threshold/PLAN.md. The parts that constrain this file:
//
//   §5.2  A ranking is a whole-set judgment. Drafts save freely; a SUBMIT
//         requires every share placed, or the agreement denominator silently
//         depends on who bothered.
//   §6.1  The threshold is a GRADIENT. `agreement` is stored per share; no
//         band classification ever is, so retuning where the line sits is a
//         re-render rather than a migration.
//   §8.1  Attribution is withheld SERVER-SIDE while ranking. Shipping names to
//         the browser and hiding them in CSS is the failure this prevents.

const activities = require('./circleActivities');
const circles = require('./circles');

// ── Injected side effects ───────────────────────────────────────────────────
//
// Injected rather than imported, exactly as utils/memories.js does it, so this
// funnel never pulls in an HTTP client or an S3 client and stays testable with
// no network. Both are wired in websocket-server.js#loadAPIRoutes.
//
// Both are FIRE AND FORGET and structurally unable to fail a submission: a
// share that recorded successfully must never be rejected because a mirror or a
// transcript was slow. The person is standing there with a story they just told.
let blobMirror = null;
function setBlobMirror(fn) { blobMirror = fn; }

let transcriber = null;
function setTranscriber(fn) { transcriber = fn; }

function fireBlobMirror(share) {
  if (!blobMirror || !share?.audio?.url) return;
  Promise.resolve()
    .then(() => blobMirror({ share }))
    .catch(err => console.error('[threshold] blob mirror hook failed:', err.message));
}

function fireTranscribe(share, store) {
  if (!transcriber || !share?.audio?.url) return;
  Promise.resolve()
    .then(() => transcriber({
      share,
      // Only marked pending once Deepgram has ACCEPTED the job. Setting it
      // before would leave a share stuck on 'pending' forever whenever the
      // enqueue was skipped or refused, which is the normal state in local dev.
      markPending: () => store.markTranscriptPending(share.id),
    }))
    .catch(err => console.error('[threshold] transcription hook failed:', err.message));
}

const DEFAULT_SECONDS = 60;
const MIN_SECONDS = 15;
const MAX_SECONDS = 300;
const TITLE_MAX = 80;
const TEXT_MAX = 2000;

const POLES = ['A', 'B'];

/**
 * Where Threshold lives, for links in mail.
 *
 * Its OWN variable rather than utils/email.js#appUrl(), which falls back to the
 * first entry of CLIENT_URL — one backend serves five apps, so that first entry
 * is whichever app happens to be listed first, and circle mail would link
 * people into a different product.
 */
function thresholdUrl() {
  const base = process.env.THRESHOLD_URL || 'http://localhost:4006';
  return base.replace(/\/$/, '');
}

/**
 * EVERY EMAIL LINKS TO THE CIRCLE, never to a phase surface (§9.1).
 *
 * A round advances on a 60s tick and the mail is read whenever somebody opens
 * their inbox, so a link to `/t/<urlName>/rank` is the most likely thing in the
 * system to be stale by the time it is clicked. The circle page reads the
 * snapshot and routes to whatever is actually live, which is the one link that
 * cannot go wrong.
 */
function circleUrl(circle) {
  return `${thresholdUrl()}/t/${circle.urlName}`;
}

/** D31 — a logged-in settings page, so there is nothing to sign and nothing to forge. */
function notificationsUrl() {
  return `${thresholdUrl()}/notifications`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const mongoStore = {
  ...circles.mongoStore,

  async findShare(seedId, userId, pole) {
    return require('../models/ThresholdShare').findOne({ seedId, userId, pole });
  },
  async listShares(seedId) {
    return require('../models/ThresholdShare').find({ seedId }).sort({ createdAt: 1 });
  },
  async countSharesByUser(seedId, userId) {
    return require('../models/ThresholdShare').countDocuments({ seedId, userId });
  },
  async createShare(fields) {
    return require('../models/ThresholdShare').create(fields);
  },
  async saveShare(share) {
    return share.save();
  },
  async removeShare(seedId, userId, pole) {
    return require('../models/ThresholdShare').deleteOne({ seedId, userId, pole });
  },

  async findRanking(seedId, rankerId) {
    return require('../models/ThresholdRanking').findOne({ seedId, rankerId });
  },
  async createRanking(fields) {
    return require('../models/ThresholdRanking').create(fields);
  },
  async saveRanking(ranking) {
    return ranking.save();
  },
  async listSubmittedRankings(seedId) {
    return require('../models/ThresholdRanking').find({ seedId, submittedAt: { $ne: null } });
  },

  async findShareById(id) {
    return require('../models/ThresholdShare').findOne({ id });
  },
  async markTranscriptPending(id) {
    return require('../models/ThresholdShare').updateOne(
      { id }, { $set: { 'transcript.status': 'pending' } },
    );
  },
  async attachTranscript(id, text, status) {
    return require('../models/ThresholdShare').updateOne(
      { id }, { $set: { 'transcript.status': status, 'transcript.text': text } },
    );
  },
};

// ---------------------------------------------------------------------------
// Seed shape
// ---------------------------------------------------------------------------

/** A topic and a polarity. Validated here because the circle treats it as opaque. */
function normalizeSeed(payload) {
  const p = payload || {};

  const topic = String(p.topic || '').trim();
  if (!topic) throw new Error('A topic is required');
  if (topic.length > 120) throw new Error('That topic is too long');

  const poleA = String(p.poleA || '').trim();
  const poleB = String(p.poleB || '').trim();
  if (!poleA || !poleB) throw new Error('Both ends of the polarity are required');
  if (poleA.length > 40 || poleB.length > 40) throw new Error('Those labels are too long');
  // Two identical ends give every ranker the same bucket twice, so agreement
  // becomes meaningless rather than merely uninteresting.
  if (poleA.toLowerCase() === poleB.toLowerCase()) {
    throw new Error('The two ends of the polarity must be different');
  }

  let seconds = Number(p.secondsPerNote);
  if (!Number.isFinite(seconds)) seconds = DEFAULT_SECONDS;
  seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));

  return { topic, poleA, poleB, secondsPerNote: seconds };
}

function poleLabel(seed, pole) {
  const payload = seed.payload || {};
  return pole === 'A' ? (payload.poleA || 'one side') : (payload.poleB || 'the other side');
}

// ---------------------------------------------------------------------------
// Shares
// ---------------------------------------------------------------------------

function assertPole(pole) {
  if (!POLES.includes(pole)) throw new Error('Pick one end of the polarity');
  return pole;
}

function seedById(circle, seedId) {
  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed) throw new Error('Topic not found in this circle');
  return seed;
}

function assertMember(circle, userId) {
  if (!circle.members.some(m => m.userId === userId)) {
    throw new Error('Not a member of this circle');
  }
}

/**
 * Who may tell a story on this topic, and when.
 *
 * The live cycle's share phase, obviously. Plus **an author on their own topic
 * while it is still queued**: people propose a topic because something happened
 * to them, so the moment of proposing is the moment they have the story, and a
 * topic can sit in the queue for weeks before it runs.
 *
 * Deliberately NOT everybody on a queued topic. A topic nobody backs never
 * runs, and asking eleven people to tell a story that may never be read is
 * asking for work the queue exists to let them skip. Their turn is when it runs.
 *
 * Nothing leaks either way: listShares() returns own-stories-only for both
 * 'pending' and 'share', so a story told early is as unread as one told on time
 * (D17).
 */
function assertOpenForStories(seed, userId) {
  if (seed.phase === 'share') return;
  if (seed.phase === 'pending' && seed.authorId === userId) return;
  throw new Error('This topic is not open for stories');
}

// A title is what the ranking surface has to compare, so a share always gets
// one — falling back to the opening of the story rather than showing "Untitled"
// on a card somebody has to make a judgment about.
function deriveTitle(title, text) {
  const given = String(title || '').trim();
  if (given) return given.slice(0, TITLE_MAX);
  const body = String(text || '').trim().replace(/\s+/g, ' ');
  if (!body) return '';
  return body.length <= TITLE_MAX ? body : `${body.slice(0, TITLE_MAX - 1)}…`;
}

/**
 * Post or replace your story for one end of one seed's polarity.
 *
 * Upserts on (seedId, userId, pole) — D10 gives you one per pole, so this is
 * "replace my liberating story", never "add a second".
 */
async function submitShare({
  store = mongoStore, circleId, seedId, userId, username,
  pole, title = '', text = '', audio = null,
}) {
  const [share] = await submitShares({
    store, circleId, seedId, userId, username,
    stories: [{ pole, title, text, audio }],
  });
  return share;
}

/**
 * Tell BOTH sides in one write — the whole of a person's turn, committed once.
 *
 * This exists because completion is evaluated after a write, and a person who
 * has told one story looks finished (`isMemberDone` for `share` is "has at
 * least one"). Two sequential single-pole writes therefore end the round on the
 * FIRST one wherever that person was the last the phase was waiting for — and
 * the second story is refused by `assertOpenForStories`, on a topic that moved
 * on a hundred milliseconds ago. In a one-member circle it happens every time.
 *
 * So the compose surface stages, the pole screen commits, and everything a
 * member has to say lands before the machine is asked whether they are done.
 * The alternative — teaching the machine that a member with one story might not
 * be finished — needs a stored "I am done" flag per member per seed, and a
 * phase that then waits on the deadline for everyone who closes the tab after
 * telling one story. Committing once is the same guarantee without the state.
 */
async function submitShares({
  store = mongoStore, circleId, seedId, userId, username, stories = [],
}) {
  if (!Array.isArray(stories) || stories.length === 0) {
    throw new Error('Say something — record a note or write it');
  }

  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertMember(circle, userId);

  const seed = seedById(circle, seedId);
  assertOpenForStories(seed, userId);
  for (const s of stories) assertPole(s.pole);
  // One story per pole (D10), so a payload naming a pole twice is a client bug
  // rather than a second story — refuse it instead of silently keeping the last.
  if (new Set(stories.map(s => s.pole)).size !== stories.length) {
    throw new Error('One story per side');
  }

  // The name the circle already knows you by, set when you joined it. Preferred
  // over anything the caller passes: a story is attributed at the reveal (D9),
  // and the name on it should be the one beside you in the member list rather
  // than whatever the writing request happened to carry.
  const member = circle.members.find(m => m.userId === userId);
  const name = member?.username || username;

  const written = [];
  for (const story of stories) {
    written.push(await writeShare({ store, circle, seed, seedId, userId, username: name, story }));
  }

  // Evaluated ONCE, after every story is in. The person who finishes last
  // should see ranking open rather than wait up to a minute for the tick —
  // same contract as circles#addSeed and submitRanking below — but "finished"
  // has to mean the whole turn.
  await circles.evaluate({ store, circle });
  return written;
}

/** One pole's story, written without asking whether the phase should end. */
async function writeShare({ store, circle, seedId, userId, username, story }) {
  const { pole, title = '', text = '', audio = null } = story;
  const body = String(text || '').trim().slice(0, TEXT_MAX);
  const media = audio ? normalizeAudio(audio) : null;
  if (!body && !media) throw new Error('Say something — record a note or write it');

  const existing = await store.findShare(seedId, userId, pole);
  let share;
  if (existing) {
    existing.title = deriveTitle(title, body);
    existing.text = body;
    if (media) existing.audio = media;
    await store.saveShare(existing);
    share = existing;
  } else {
    share = await store.createShare({
      instanceId: circle.instanceId,
      circleId: circle.id,
      seedId,
      userId,
      username: username || 'Member',
      pole,
      title: deriveTitle(title, body),
      text: body,
      audio: media,
    });
  }

  // Copied off-site seconds after it is created, not at the next nightly
  // sweep. The person who records once and never returns is the whole risk the
  // sweep alone leaves open, and audio is the one thing here with no second
  // take — Vercel Blob has no snapshots, no versioning and no undelete.
  fireBlobMirror(share);
  fireTranscribe(share, store);

  return share;
}

// The blob host allowlist — an unchecked audio URL is stored content-injection
// on a page other people load. Moved to utils/audioPayload.js when Synthesis
// became the second writer (synthesis D20): a security control lives once.
// Re-exported below so this module's surface is unchanged.
const { normalizeAudio } = require('./audioPayload');

/** Withdraw one of your stories, for as long as you could have told it. */
async function deleteShare({ store = mongoStore, circleId, seedId, userId, pole }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  const seed = seedById(circle, seedId);
  assertOpenForStories(seed, userId);
  assertPole(pole);
  await store.removeShare(seedId, userId, pole);
  return { ok: true };
}

/**
 * The shares for a seed, at the visibility its phase allows.
 *
 *   share phase — YOUR OWN ONLY. Reading everyone else's story before telling
 *                 yours anchors the whole group on whoever posted first (D17).
 *   rank phase  — all of them, with authorship withheld (D9).
 *   revealed    — all of them, attributed.
 *
 * Membership is the access boundary here, and it is checked on the way IN
 * rather than left to the caller. A circle's urlName is chosen by a facilitator
 * and travels in links, so it is a name, not a secret — anybody signed in to
 * this instance could otherwise read a group's stories by guessing one. The
 * instance is not the boundary: every circle in a Threshold deployment shares
 * it, so this check is the only thing standing between two circles.
 */
async function listShares({ store = mongoStore, circle, seedId, viewerId = null }) {
  assertMember(circle, viewerId);
  const seed = seedById(circle, seedId);
  const all = await store.listShares(seedId);

  if (seed.phase === 'share' || seed.phase === 'pending') {
    return all.filter(s => s.userId === viewerId).map(s => toClientShare(s, { viewerId, attributed: true }));
  }

  // A skipped topic is revealed too — the group stopped sorting it, which is
  // not a reason to keep its authors hidden from the stories that got told.
  const attributed = circles.DONE_PHASES.includes(seed.phase);
  return all.map(s => toClientShare(s, { viewerId, attributed }));
}

/**
 * Redaction happens HERE, never in the client (§8.1).
 *
 * Note what this cannot do: in a small circle a recorded voice identifies its
 * speaker whatever the payload says. The compose surface has to tell people
 * that before they record — this function makes the claim true of the data,
 * not of the medium.
 */
function toClientShare(share, { viewerId = null, attributed = false } = {}) {
  const mine = Boolean(viewerId) && share.userId === viewerId;
  const out = {
    id: share.id,
    seedId: share.seedId,
    pole: share.pole,
    title: share.title,
    text: share.text,
    audio: share.audio || null,
    transcript: share.transcript || { status: 'skipped', text: '' },
    isMine: mine,
    createdAt: share.createdAt,
  };
  if (attributed || mine) {
    out.userId = share.userId;
    out.username = share.username;
  }
  return out;
}

/**
 * Attach a transcript that arrived from Deepgram.
 *
 * Separate from submitShare because it is a CALLBACK path: the caller is a
 * webhook authenticated by an HMAC, not a member of the circle, so none of the
 * phase or membership gates above apply. A transcript may legitimately land
 * after the share phase has closed, or after the whole cycle has revealed.
 */
async function attachTranscript({ store = mongoStore, shareId, text, status = 'ready' }) {
  const share = await store.findShareById(shareId);
  if (!share) throw new Error('Share not found');
  const clean = String(text || '').trim().slice(0, TEXT_MAX);
  await store.attachTranscript(shareId, clean, clean ? status : 'failed');
  return { ok: true, status: clean ? status : 'failed' };
}

// ---------------------------------------------------------------------------
// Rankings
// ---------------------------------------------------------------------------

function normalizePlacements(placements, validShareIds) {
  if (!Array.isArray(placements)) throw new Error('Placements must be a list');

  const seen = new Set();
  const out = [];
  for (const p of placements) {
    const shareId = String((p && p.shareId) || '');
    if (!validShareIds.has(shareId)) throw new Error('Placed a story that is not in this topic');
    if (seen.has(shareId)) throw new Error('Placed the same story twice');
    seen.add(shareId);
    out.push({ shareId, pole: assertPole(p.pole) });
  }
  return out;
}

async function loadRankingContext({ store, circleId, seedId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertMember(circle, userId);

  const seed = seedById(circle, seedId);
  if (seed.phase !== 'rank') throw new Error('This topic is not open for sorting');

  const shares = await store.listShares(seedId);
  return { circle, seed, shares, validIds: new Set(shares.map(s => s.id)) };
}

/** Save progress. Partial is fine — this is what "sort as you listen" writes. */
async function saveRankingDraft({ store = mongoStore, circleId, seedId, userId, placements }) {
  const ctx = await loadRankingContext({ store, circleId, seedId, userId });
  const normalized = normalizePlacements(placements, ctx.validIds);

  const existing = await store.findRanking(seedId, userId);
  if (existing) {
    if (existing.submittedAt) throw new Error('You have already submitted this ranking');
    existing.placements = normalized;
    await store.saveRanking(existing);
    return existing;
  }
  return store.createRanking({
    instanceId: ctx.circle.instanceId,
    circleId: ctx.circle.id,
    seedId,
    rankerId: userId,
    placements: normalized,
    submittedAt: null,
  });
}

/**
 * When ranking opens, every story is already placed by whoever told it (D22).
 *
 * Choosing a pole is how you entered the compose surface, so you answered this
 * question at submit; asking again is asking a question you have answered. It
 * also keeps your own story out of "waiting on you", which would read as work
 * outstanding on a story you told.
 *
 * THIS IS THE ONE PLACE IT HAPPENS. The first cut did it in the ranking client
 * and again in the snapshot's waiting marker, and two clients that have to
 * agree is a bug waiting for a third — with only one of them, submit either
 * refuses a sort that looks complete, or the circle page overstates what is
 * waiting by however many stories you told.
 *
 * A draft, never a submission: `submittedAt` stays null, so this touches
 * neither the gradient (only submitted rankings feed it) nor advancement (only
 * `submittedAt` makes a member done). It is idempotent — a placement already
 * there is left alone, and a submitted ranking is never touched.
 */
async function preplaceOwnStories({ store = mongoStore, circle, seed }) {
  const shares = await store.listShares(seed.id);

  const byAuthor = new Map();
  for (const s of shares) {
    if (!byAuthor.has(s.userId)) byAuthor.set(s.userId, []);
    byAuthor.get(s.userId).push({ shareId: s.id, pole: s.pole });
  }

  for (const [userId, mine] of byAuthor) {
    const existing = await store.findRanking(seed.id, userId);
    if (!existing) {
      await store.createRanking({
        instanceId: circle.instanceId,
        circleId: circle.id,
        seedId: seed.id,
        rankerId: userId,
        placements: mine,
        submittedAt: null,
      });
      continue;
    }
    if (existing.submittedAt) continue;
    const already = new Set(existing.placements.map(p => p.shareId));
    const missing = mine.filter(p => !already.has(p.shareId));
    if (missing.length === 0) continue;
    existing.placements = [...existing.placements, ...missing];
    await store.saveRanking(existing);
  }
}

/**
 * Final submit. Complete or nothing.
 *
 * A partial ranking would make each share's agreement denominator depend on who
 * bothered to place it, which biases the result invisibly — so an unplaced
 * story is refused here rather than quietly treated as an abstention.
 */
async function submitRanking({ store = mongoStore, circleId, seedId, userId, placements }) {
  const ctx = await loadRankingContext({ store, circleId, seedId, userId });
  const normalized = normalizePlacements(placements, ctx.validIds);

  if (normalized.length !== ctx.shares.length) {
    const missing = ctx.shares.length - normalized.length;
    throw new Error(`Place every story before submitting — ${missing} still unsorted`);
  }

  const existing = await store.findRanking(seedId, userId);
  let ranking;
  if (existing) {
    if (existing.submittedAt) throw new Error('You have already submitted this ranking');
    existing.placements = normalized;
    existing.submittedAt = new Date();
    await store.saveRanking(existing);
    ranking = existing;
  } else {
    ranking = await store.createRanking({
      instanceId: ctx.circle.instanceId,
      circleId: ctx.circle.id,
      seedId,
      rankerId: userId,
      placements: normalized,
      submittedAt: new Date(),
    });
  }

  // The last outstanding ranking is itself the completion trigger.
  await circles.evaluate({ store, circle: ctx.circle });
  return ranking;
}

// ---------------------------------------------------------------------------
// The reveal
// ---------------------------------------------------------------------------

/**
 * The gradient (§6.1, D15).
 *
 *   agreement = placements on pole A / placements on this share
 *   coherence = |2·agreement − 1|      1 = unanimous, 0 = split down the middle
 *
 * The per-share denominator is the number of rankers who actually placed THAT
 * share, not the ranker count. Submitted rankings are complete, so those are
 * the same number today — but a share added after somebody submitted would
 * otherwise read as unanimously pole B rather than as unplaced.
 */
async function computeResult({ store = mongoStore, seed }) {
  const [shares, rankings] = await Promise.all([
    store.listShares(seed.id),
    store.listSubmittedRankings(seed.id),
  ]);

  const rankers = rankings.length;
  // Only an ABSENCE OF STORIES gives an empty result. A topic with stories that
  // nobody sorted still enumerates them, each with `agreement: null` — they were
  // told, so they are part of the record, and the reveal and the circle-final
  // bar both read their counts off this list. Short-circuiting on `rankers === 0`
  // instead made a skipped topic report "0 stories" on a screen built to prove
  // that skipping keeps them (D30).
  if (shares.length === 0) {
    return {
      computedAt: new Date(),
      rankers,
      shares: [],
      unanimous: 0,
      meanCoherence: null,
    };
  }

  const tally = new Map(shares.map(s => [s.id, { a: 0, b: 0 }]));
  for (const ranking of rankings) {
    for (const p of ranking.placements) {
      const row = tally.get(p.shareId);
      if (!row) continue; // a share withdrawn after this ranking was submitted
      if (p.pole === 'A') row.a++; else row.b++;
    }
  }

  const rows = shares.map(s => {
    const { a, b } = tally.get(s.id);
    const placed = a + b;
    const agreement = placed === 0 ? null : a / placed;
    return {
      shareId: s.id,
      agreement,
      coherence: agreement === null ? null : Math.abs(2 * agreement - 1),
      splits: { a, b },
    };
  });

  // Descending agreement: pole A at the top, the contested middle in the
  // middle, pole B at the bottom. One axis, and it IS the threshold display.
  rows.sort((x, y) => (y.agreement ?? -1) - (x.agreement ?? -1));

  const scored = rows.filter(r => r.coherence !== null);
  const meanCoherence = scored.length
    ? scored.reduce((sum, r) => sum + r.coherence, 0) / scored.length
    : null;

  return {
    computedAt: new Date(),
    rankers,
    shares: rows,
    unanimous: scored.filter(r => r.coherence === 1).length,
    meanCoherence,
  };
}

/**
 * The circle-final rollup, computed on read rather than stored: every seed's
 * result already holds what it needs, and N is the member count.
 *
 * Readable at ANY time (D29). A circle has no completion condition, so this is
 * the record of the conversation so far rather than a terminal state somebody
 * unlocks — a circle three topics in has a three-topic record.
 */
function circleResult(circle) {
  const topics = circle.seeds
    .filter(s => circles.DONE_PHASES.includes(s.phase) && s.result)
    .sort((a, b) => new Date(a.revealedAt || 0) - new Date(b.revealedAt || 0))
    .map(s => ({
      seedId: s.id,
      topic: (s.payload || {}).topic || '',
      poleA: (s.payload || {}).poleA || '',
      poleB: (s.payload || {}).poleB || '',
      rankers: s.result.rankers,
      unanimous: s.result.unanimous,
      shareCount: s.result.shares.length,
      meanCoherence: s.result.meanCoherence,
      // Every story's position on the one axis, so the final screen can size
      // its three-part bar at whatever cutoff the reader is holding. Sending
      // the positions rather than three counts is D15 all the way out to the
      // last screen: no band classification is stored OR served, so the cutoff
      // stays a view parameter here exactly as it is on the per-cycle reveal.
      agreements: s.result.shares.map(r => r.agreement),
      // The group moved on before finishing this one. Worth saying on the
      // graph, since a low ranker count here means something different.
      skipped: s.phase === 'skipped',
      revealedAt: s.revealedAt || null,
    }));

  return {
    // D33 — a one-off has one node, and a graph of one node is not a graph, so
    // the client routes /result to that cycle's reveal instead. The mode is
    // what tells it which screen to draw.
    mode: circle.mode,
    phase: circle.phase,
    // Oldest first: a record of a conversation reads in the order it happened.
    topics,
    // There is deliberately NO most-contested id here, and no ranking of any
    // kind (D25). This screen is a record of a conversation, so it names no
    // winner and draws no conclusion — an earlier cut computed one and PLAN
    // §6.3 said to take it out when this screen was built. Adding it back is
    // adding a verdict to a sharing circle.
  };
}

// ---------------------------------------------------------------------------
// The circle activity module
// ---------------------------------------------------------------------------

/**
 * Builds the module utils/circles.js drives.
 *
 * It closes over its OWN store rather than using the one circles passes into
 * each hook: the tick calls sweepCircles() with the circle store, which knows
 * nothing about shares or rankings. Ignoring the passed store is what keeps
 * isMemberDone correct no matter who triggered the evaluation.
 */
function createModule({ store = mongoStore } = {}) {
  return {
    phases: ['share', 'rank'],

    async normalizeSeed(payload) {
      return normalizeSeed(payload);
    },

    async isMemberDone({ seed, phase, userId }) {
      if (phase === 'share') {
        return (await store.countSharesByUser(seed.id, userId)) > 0;
      }
      if (phase === 'rank') {
        const ranking = await store.findRanking(seed.id, userId);
        return Boolean(ranking && ranking.submittedAt);
      }
      return true;
    },

    // The member's live-seed enrichment for the one-call snapshot: the
    // stories as this viewer may see them (listShares' ladder), their own
    // ranking, and the derived waiting marker (D32 — derived, never stored;
    // a member who joined in week six has no ranking, so everything reads as
    // waiting, with no special case).
    async snapshotExtras({ circle, seed, viewerId }) {
      const shares = await listShares({ store, circle, seedId: seed.id, viewerId });
      const ranking = await store.findRanking(seed.id, viewerId);
      const myRanking = ranking
        ? { placements: ranking.placements, submittedAt: ranking.submittedAt }
        : null;
      const placed = new Set((ranking?.placements || []).map(p => p.shareId));
      const waitingShareIds = seed.phase === 'rank'
        ? shares.filter(s => !placed.has(s.id)).map(s => s.id)
        : [];
      return { shares, myRanking, waitingShareIds };
    },

    // Who told a story on what, for the circle-home map — the SAME redaction
    // ladder as listShares (D9/D17): a finished topic attributes its tellers
    // (the reveal already does), a rank round is a count only (every story is
    // already readable anonymously, so how many exist is public; whose they
    // are is not), and a share or pending round says nothing beyond your own
    // flag — listShares is own-only there, so even a count would say who has
    // moved. The activity answers this, not the circle layer, because the
    // ladder is a property of Threshold's phases.
    async participation({ seed, viewerId }) {
      const shares = await store.listShares(seed.id);
      const tellerIds = [...new Set(shares.map(s => s.userId))];
      const iTold = Boolean(viewerId) && tellerIds.includes(viewerId);
      if (circles.DONE_PHASES.includes(seed.phase)) {
        return { tellerIds, tellerCount: tellerIds.length, iTold };
      }
      if (seed.phase === 'rank') {
        return { tellerIds: null, tellerCount: tellerIds.length, iTold };
      }
      return { tellerIds: null, tellerCount: null, iTold };
    },

    // The boundary where every story becomes a placement its teller already
    // made (D22). Runs once per cycle, on the transition into ranking.
    async onPhaseOpen({ circle, seed, phase }) {
      if (phase !== 'rank') return;
      await preplaceOwnStories({ store, circle, seed });
    },

    async onCycleReveal({ seed }) {
      seed.result = await computeResult({ store, seed });
    },

    async notificationFor({ circle, seed, phase, userId }) {
      const topic = seed ? (seed.payload || {}).topic : '';
      // Every message ends the same way: where to go, and how to stop being
      // told. The unsubscribe url also becomes the List-Unsubscribe header.
      const sign = body => ({
        text: `${body}\n\n${circleUrl(circle)}\n\nTo stop emails from this circle: ${notificationsUrl()}`,
        unsubscribeUrl: notificationsUrl(),
      });

      // The queue is empty and the circle is waiting for somebody to think of
      // something. This is the ask a seeding round used to make once, made
      // whenever it is actually true (D27, D29).
      if (phase === 'idle') {
        return {
          subject: `${circle.title}: the circle is open for a topic`,
          ...sign(`Nothing is running right now. Post a topic and the two ends of its polarity, or back one somebody else has already put up — the most-backed topic goes next.`),
        };
      }
      if (phase === 'share') {
        // Skip anyone who already shared — the main lever against a 12-seed
        // circle sending 400+ messages.
        if (await store.countSharesByUser(seed.id, userId) > 0) return null;
        return {
          subject: `${circle.title}: share a story about ${topic}`,
          ...sign(`${topic} — ${poleLabel(seed, 'A')} or ${poleLabel(seed, 'B')}. Tell us about a time it was one of those. Record up to ${(seed.payload || {}).secondsPerNote || DEFAULT_SECONDS} seconds, or type it.`),
        };
      }
      if (phase === 'rank') {
        const ranking = await store.findRanking(seed.id, userId);
        if (ranking && ranking.submittedAt) return null;
        return {
          subject: `${circle.title}: sort the stories about ${topic}`,
          ...sign(`Everyone has shared. Listen, then put each story on the side you think it belongs — ${poleLabel(seed, 'A')} or ${poleLabel(seed, 'B')}.`),
        };
      }
      if (phase === 'revealed') {
        return {
          subject: `${circle.title}: where the group landed on ${topic}`,
          ...sign(`The sorting is in. See which stories everyone read the same way, and which ones split the group.`),
        };
      }
      if (phase === 'skipped') {
        // A skipped topic keeps every story and reveals what it has, so this is
        // an invitation to read it rather than an apology for dropping it.
        return {
          subject: `${circle.title}: ${topic} has moved on`,
          ...sign(`The circle moved on from ${topic}. The stories people told are there, with wherever the sorting had got to.`),
        };
      }
      if (phase === 'closed') {
        return {
          subject: `${circle.title} has closed`,
          ...sign(`The circle is finished. Every topic it ran is there together — a record of the conversation.`),
        };
      }
      return null;
    },
  };
}

// Registered on require. routes/threshold.js pulls this in, and it is mounted
// inside loadAPIRoutes() BEFORE startJobs() runs — so the tick can never reach
// a threshold circle whose module is missing.
activities.register('threshold', createModule());

module.exports = {
  normalizeSeed,
  assertMember,
  submitShare,
  submitShares,
  deleteShare,
  listShares,
  toClientShare,
  saveRankingDraft,
  submitRanking,
  preplaceOwnStories,
  assertOpenForStories,
  computeResult,
  circleResult,
  createModule,
  normalizeAudio,
  deriveTitle,
  poleLabel,
  circleUrl,
  notificationsUrl,
  setBlobMirror,
  setTranscriber,
  attachTranscript,
  mongoStore,
  DEFAULT_SECONDS,
  MIN_SECONDS,
  MAX_SECONDS,
};
