// circles — the write funnel and round machine for Circle documents.
//
// Never write the circles collection outside this file, for the same reason
// utils/entries.js and utils/memories.js exist: the phase machine's invariants
// (who may advance, what a deadline means, when mail goes out, notification
// dedupe) all live here, and a direct write desyncs them silently.
//
// The machine is generic. Everything activity-specific comes from the module
// registered in utils/circleActivities.js under Circle.activity.
//
// Design: apps/threshold/PLAN.md §3. Three things there are load-bearing here:
//
//   §3.3  A phase ends on COMPLETE, DEADLINE, or MANUAL — all three always
//         live, and any phase's clock may be omitted entirely.
//   §3.3  The topic list is a QUEUE that is always open (D27), one cycle live
//         at a time (D28), and a circle ends only when its facilitator closes
//         it (D29). An empty queue is idle: the machine parks there and starts
//         again the moment somebody posts.
//   §3.5  Advancement runs on a locked periodic tick, NOT sweep-on-read. The
//         premise is that nobody has the page open; the transition is what
//         generates the email that brings people back. sweepCircles() is that
//         tick's body. evaluate() is also called on read, as a fallback.
//
// Every function takes `store` defaulting to `mongoStore`, so circles.test.js
// exercises the real machine with no MongoDB — same pattern as memories.js.

const crypto = require('node:crypto');
const activities = require('./circleActivities');

const HOUR_MS = 60 * 60 * 1000;

// One evaluate() call applies transitions until the machine settles. A deadline
// long in the past can legitimately cascade several phases, so the loop has to
// keep going — but it must never spin. Every phase it opens takes a deadline
// computed from `now`, so a real cascade is bounded by the seed count; this
// ceiling only catches a module bug.
const MAX_STEPS = 200;

// Terminal seed phases. 'skipped' is one of them: a dropped topic keeps its
// stories and its computed result, and differs from 'revealed' only in saying
// the group never finished sorting it (D30).
const DONE_PHASES = ['revealed', 'skipped'];

// Before the queue (2026-08-20). A seed an activity declares `nominateFirst`
// for is born 'nominated': shared with the circle and readable, but NOT in the
// queue and never opened by a free slot. Somebody other than its author
// supporting it is what accepts it into the queue as 'pending' — nominated
// first, accepted second. Only then does the ordinary machine see it.
//
// Threshold and gather do not declare the flag, so their seeds are born
// 'pending' exactly as before and nothing about them changes.
const PRE_QUEUE_PHASES = ['nominated'];

function isPreQueue(seed) {
  return PRE_QUEUE_PHASES.includes(seed.phase);
}

// A seed that has not started its cycle: waiting in the queue, or not yet
// accepted into it. Everywhere the machine used to ask `phase === 'pending'`
// to mean "hasn't run", it has to ask this instead, or a nominated seed reads
// as a LIVE cycle and occupies a maxLive slot without ever having opened.
function notStarted(seed) {
  return seed.phase === 'pending' || isPreQueue(seed);
}

function generateId() {
  return crypto.randomUUID().substring(0, 8);
}

function deadlineFrom(now, hours) {
  if (hours == null) return null; // no clock for this phase (D16)
  return new Date(now.getTime() + hours * HOUR_MS);
}

// The module that runs a seed's cycle: the seed's own `activity` when set,
// else the circle's. A circle may hold mixed activities (PRIMITIVES.md §9) —
// every seed written before seeds[].activity existed reads null and resolves
// to the circle's module, exactly as before.
function modFor(circle, seed = null) {
  return activities.get((seed && seed.activity) || circle.activity);
}

// config.shareHours for phase 'share', and so on. Keeping the convention
// implicit is what lets a new activity declare its own phase names without
// touching this file. A seed PAYLOAD carrying the same key overrides the
// circle's config — the clock is an activity-creation setting for builder
// seeds (PRIMITIVES.md §9 B2), and payload is already the per-seed home.
function hoursForPhase(circle, phase, seed = null) {
  const key = `${phase}Hours`;
  if (seed && seed.payload && seed.payload[key] !== undefined) return seed.payload[key];
  const v = circle.config ? circle.config[key] : undefined;
  return v === undefined ? null : v;
}

function currentDeadline(circle) {
  const seed = activeSeed(circle);
  return seed ? (seed.phaseDeadline || null) : null;
}

// How many cycles may run at once (PRIMITIVES.md §9 B1). Undefined on every
// circle written before config.maxLive existed — reads as 1, the original
// one-cycle-at-a-time machine.
function maxLive(circle) {
  const v = circle.config ? circle.config.maxLive : undefined;
  return v == null ? 1 : Math.max(1, Number(v) || 1);
}

// The live set, derived from seed phases rather than stored — a seed is live
// once its cycle opened and until it reveals. liveSeedId mirrors the first of
// these for single-live readers.
function liveSeeds(circle) {
  return circle.seeds.filter(s => !notStarted(s) && !DONE_PHASES.includes(s.phase));
}

function activeSeed(circle) {
  if (circle.phase !== 'cycle') return null;
  if (circle.liveSeedId) {
    const s = circle.seeds.find(x => x.id === circle.liveSeedId);
    if (s && !notStarted(s) && !DONE_PHASES.includes(s.phase)) return s;
  }
  return liveSeeds(circle)[0] || null;
}

/**
 * The queue, in the order it will run (D27).
 *
 * A promoted topic beats the support order, promotions run in the order they
 * were made, and posting order is the tiebreak under support — so a topic
 * nobody supports never overtakes one somebody did, and two equally supported
 * topics run oldest first.
 */
function queue(circle) {
  return circle.seeds
    .filter(s => s.phase === 'pending')
    .sort((a, b) => {
      const pa = a.promotedAt ? a.promotedAt.getTime() : null;
      const pb = b.promotedAt ? b.promotedAt.getTime() : null;
      if (pa !== null || pb !== null) {
        if (pa === null) return 1;
        if (pb === null) return -1;
        if (pa !== pb) return pa - pb;
      }
      const sa = (a.supporterIds || []).length;
      const sb = (b.supporterIds || []).length;
      if (sa !== sb) return sb - sa;
      return a.order - b.order;
    });
}

function nextInQueue(circle) {
  return queue(circle)[0] || null;
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

function assertOpen(circle) {
  if (circle.phase === 'closed') throw new Error('This circle has finished');
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const mongoStore = {
  async findCircleById(id) {
    return require('../models/Circle').findOne({ id });
  },
  async findCircleByUrlName(instanceId, urlName) {
    return require('../models/Circle').findOne({ instanceId, urlName });
  },
  async listRunningCircles() {
    return require('../models/Circle').find({ status: 'running' });
  },
  async createCircleDoc(fields) {
    return require('../models/Circle').create(fields);
  },
  async saveCircle(circle) {
    // seeds[].payload and seeds[].result are Mixed, and Mongoose cannot detect
    // an in-place mutation of a Mixed path. Without this a computed result is
    // written to the object, reported as saved, and silently absent on the next
    // read — the classic Mixed bug.
    if (typeof circle.markModified === 'function') circle.markModified('seeds');
    return circle.save();
  },
  async notify(args) {
    return require('./notify').notify(args);
  },
  async sendEmail(args) {
    return require('./email').sendEmail(args);
  },
};

// ---------------------------------------------------------------------------
// Creation and membership
// ---------------------------------------------------------------------------

/**
 * Create a circle in 'draft'.
 *
 * In 'single' mode the creator's seed is required here — a standalone run of
 * the activity is a one-seed circle, not a second code path (PLAN §1, D1). In
 * 'circle' mode a seed passed here starts the queue off, and is optional: an
 * empty circle opens idle and runs whatever its members post first.
 */
async function createCircle({
  store = mongoStore,
  instanceId,
  activity,
  title,
  urlName,
  createdBy,
  creatorName,
  creatorEmail = '',
  mode = 'circle',
  config = {},
  seedPayload = null,
  invitedEmails = [],
  requireInvitation = true,
}) {
  if (!instanceId) throw new Error('instanceId required');
  if (!createdBy) throw new Error('createdBy required');
  if (!title || !title.trim()) throw new Error('title required');

  // Throws on an unregistered activity — refuse to create a circle nothing can run.
  const mod = activities.get(activity);

  const slug = String(urlName || title)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  if (!slug) throw new Error('urlName required');

  const existing = await store.findCircleByUrlName(instanceId, slug);
  if (existing) throw new Error('A circle with that name already exists');

  const seeds = [];
  if (mode === 'single' && !seedPayload) throw new Error('single mode requires a seed');
  if (seedPayload) {
    seeds.push({
      id: generateId(),
      authorId: createdBy,
      order: 0,
      payload: await mod.normalizeSeed(seedPayload, { userId: createdBy }),
      phase: 'pending',
      supporterIds: [createdBy],
      promotedAt: null,
      notifiedPhases: [],
    });
  }

  return store.createCircleDoc({
    id: generateId(),
    instanceId,
    activity,
    title: title.trim(),
    urlName: slug,
    createdBy,
    mode,
    status: 'draft',
    phase: 'draft',
    config: { ...config },
    members: [{
      userId: createdBy,
      username: creatorName || 'Host',
      email: (creatorEmail || '').toLowerCase().trim(),
    }],
    invitedEmails: invitedEmails.map(e => String(e).toLowerCase().trim()).filter(Boolean),
    requireInvitation,
    seeds,
    liveSeedId: null,
  });
}

/**
 * Idempotent. Re-joining updates the stored name/email rather than duplicating.
 *
 * Joining in week six is the ordinary way in, not an edge case (D32): a circle
 * that never closes and a queue that never shuts mean there is no "too late",
 * and nothing is withheld for having missed the beginning.
 */
async function joinCircle({ store = mongoStore, circleId, userId, username, email = '' }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertOpen(circle);

  const normalized = (email || '').toLowerCase().trim();
  const existing = circle.members.find(m => m.userId === userId);

  if (!existing) {
    if (circle.requireInvitation) {
      const invited = normalized && circle.invitedEmails.includes(normalized);
      if (!invited) throw new Error('This circle is invitation only');
    }
    circle.members.push({
      userId,
      username: username || 'Member',
      email: normalized,
      joinedAt: new Date(),
    });
  } else {
    if (username) existing.username = username;
    if (normalized) existing.email = normalized;
  }

  await store.saveCircle(circle);
  return circle;
}

/**
 * Post a topic. Any member, any time — the queue never closes (D27).
 *
 * A member may post more than one: the queue is filtered by support rather than
 * by a one-each rule, which is the review a seeding round never had. Passing
 * `seedId` edits one of your own topics instead, allowed right up to the moment
 * its cycle opens — a topic you thought better of is worth more than an
 * immutability rule nothing depends on.
 */
async function addSeed({ store = mongoStore, circleId, userId, payload, seedId = null, activity = null }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertOpen(circle);
  assertMember(circle, userId);

  if (seedId) {
    const mine = seedById(circle, seedId);
    if (mine.authorId !== userId) throw new Error('Only the author can change this topic');
    if (!notStarted(mine)) throw new Error('This topic has already been run');
    // An edit keeps the seed's activity — its own module re-validates.
    mine.payload = await modFor(circle, mine).normalizeSeed(payload, { circle, userId });
  } else {
    // A seed may run a different activity than the circle's own (PRIMITIVES.md
    // §9). Throws on an unregistered key, same as circle creation.
    const key = activity && activity !== circle.activity ? activity : null;
    const mod = activities.get(key || circle.activity);
    const normalized = await mod.normalizeSeed(payload, { circle, userId });
    // D1: a one-off runs its single topic and has no queue to add to.
    if (circle.mode === 'single' && circle.seeds.length > 0) {
      throw new Error('This is a single-topic circle');
    }
    circle.seeds.push({
      id: generateId(),
      authorId: userId,
      order: circle.seeds.length,
      activity: key,
      payload: normalized,
      // 'nominated' for an activity that asks to be accepted before it queues
      // (see PRE_QUEUE_PHASES). Everything else is born in the queue, as it
      // always was.
      phase: mod.nominateFirst ? 'nominated' : 'pending',
      // Posting a topic is supporting it. Otherwise the first thing every
      // author does is support their own, and the count means the same thing
      // with an extra step in front of it.
      supporterIds: [userId],
      promotedAt: null,
      notifiedPhases: [],
    });
  }

  await store.saveCircle(circle);
  // An idle circle starts on the topic that just arrived — that is what makes
  // idle a pause rather than an ending (D29).
  return evaluate({ store, circle });
}

/**
 * Mute or unmute this circle's mail, for me.
 *
 * Per-circle rather than global, because the thing somebody wants to stop is
 * usually one group and not the platform (D31). It suppresses MAIL ONLY — the
 * in-app notification still lands, so muting a circle never means missing what
 * happened in it, only not being told by email.
 *
 * `invitedEmails` is a join-time gate and never a mail list, so every recipient
 * of circle mail is a member with an account. That is what lets this be an
 * ordinary authenticated write, with nothing signed and no unauthenticated
 * endpoint to defend.
 */
async function setEmailOptOut({ store = mongoStore, circleId, userId, optOut }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');

  const me = circle.members.find(m => m.userId === userId);
  if (!me) throw new Error('Not a member of this circle');

  me.emailOptOut = Boolean(optOut);
  await store.saveCircle(circle);
  return { circle, emailOptOut: me.emailOptOut };
}

/**
 * Toggle my support for a queued topic. One per member, freely taken back.
 *
 * Only while it is still pending: supporting a topic that is already running or
 * already revealed asks the queue to reorder something that has left it.
 */
async function supportSeed({ store = mongoStore, circleId, seedId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertOpen(circle);
  assertMember(circle, userId);

  const seed = seedById(circle, seedId);
  if (!notStarted(seed)) throw new Error('This topic is no longer waiting');

  const supporters = seed.supporterIds || [];
  const at = supporters.indexOf(userId);
  if (at >= 0) supporters.splice(at, 1); else supporters.push(userId);
  seed.supporterIds = supporters;

  // ACCEPTANCE (2026-08-20). A nominated seed is one person's offer; the queue
  // is what the group decided to spend time on. Anyone other than the author
  // saying yes is the whole difference, so that support is what moves it into
  // the queue. The author's own support (stamped at post time) never counts —
  // otherwise every nomination would accept itself on arrival.
  const accepted = isPreQueue(seed) && at < 0 && userId !== seed.authorId;
  if (accepted) seed.phase = 'pending';

  await store.saveCircle(circle);
  // Accepting into an idle circle can start the cycle in the same move.
  // evaluate() returns { circle, changed } — unwrap it, or every caller gets
  // the wrapper where it expected a circle.
  if (accepted) {
    const { circle: after } = await evaluate({ store, circle });
    return { circle: after, supported: true, accepted };
  }
  return { circle, supported: at < 0, accepted: false };
}

/**
 * Move a queued topic to the front, over the support order (D30).
 *
 * Creator only, and it does not interrupt the live cycle — one cycle runs at a
 * time (D28), so this decides what runs NEXT. Promotions keep their own order
 * among themselves, so promoting two in a row runs them in that order.
 */
async function promoteSeed({ store = mongoStore, circleId, seedId, userId, now = new Date() }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  assertOpen(circle);
  if (circle.createdBy !== userId) throw new Error('Only the circle creator can promote a topic');

  const seed = seedById(circle, seedId);
  if (seed.phase !== 'pending') throw new Error('This topic is no longer waiting');
  seed.promotedAt = now;

  await store.saveCircle(circle);
  // An idle circle promotes and starts in one move.
  return evaluate({ store, circle, now });
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/**
 * Creator only. draft → running, on the top of the queue if anything is in it.
 *
 * A circle started with an empty queue opens IDLE rather than waiting for a
 * seeding round: the first topic anybody posts is the first cycle. Nothing
 * waits for everybody.
 */
async function startCircle({ store = mongoStore, circleId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.createdBy !== userId) throw new Error('Only the creator can start this circle');
  if (circle.phase !== 'draft') throw new Error('This circle has already started');

  const now = new Date();
  circle.status = 'running';
  circle.startedAt = now;

  const pending = [];
  const first = nextInQueue(circle);
  if (first) {
    await beginCycle({ store, circle, seed: first, now, pending, via: 'manual', byUserId: userId });
  } else {
    goIdle({ circle, now, pending, via: 'manual', byUserId: userId, from: 'draft' });
  }

  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  // A cycle whose share phase has no clock and no other members can already be
  // finished; let the machine settle before returning.
  return evaluate({ store, circle, now });
}

/**
 * Drop the live topic and move on (D30). Creator only.
 *
 * A skipped topic REVEALS what it has rather than being deleted — somebody
 * already told a story on it, and the circle moving past their topic is not a
 * reason to throw their story away.
 */
async function skipSeed({ store = mongoStore, circleId, userId, seedId = null, now = new Date() }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.createdBy !== userId) throw new Error('Only the circle creator can skip a topic');

  const seed = seedId
    ? liveSeeds(circle).find(s => s.id === seedId) || null
    : activeSeed(circle);
  if (!seed) throw new Error('There is no topic running');

  const mod = modFor(circle, seed);
  const pending = [];
  await revealSeed({ store, mod, circle, seed, now, pending, via: 'manual', byUserId: userId, as: 'skipped' });
  await afterCycle({ store, circle, now, pending, via: 'manual', byUserId: userId });

  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  // Settles onto the next topic in the queue, if the circle is still open.
  return evaluate({ store, circle, now });
}

/**
 * End the circle. Creator only, and the only way a circle finishes (D29).
 *
 * A live cycle is revealed on the way out rather than left mid-sort: its
 * stories exist and its rankings exist, so the alternative is a topic whose
 * result nobody can ever read.
 */
async function closeCircle({ store = mongoStore, circleId, userId, now = new Date() }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.createdBy !== userId) throw new Error('Only the circle creator can close this circle');
  if (circle.phase === 'draft') throw new Error('This circle has not started');
  assertOpen(circle);

  const pending = [];

  // Every live cycle is revealed on the way out, not just the first — with
  // maxLive > 1 there may be several mid-flight, and each has stories worth
  // keeping.
  for (const seed of liveSeeds(circle)) {
    const mod = modFor(circle, seed);
    await revealSeed({ store, mod, circle, seed, now, pending, via: 'manual', byUserId: userId, as: 'revealed' });
  }
  await closeNow({ store, mod: modFor(circle), circle, now, pending, via: 'manual', byUserId: userId });

  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  return { circle, changed: true };
}

/**
 * Manual advance — a first-class control, not a rescue hatch (PLAN §3.3).
 *
 * The creator may advance any phase. The author of the live seed may advance
 * their own cycle: in a Sharing Circle they are the author of the activity
 * being run, which is what makes the control theirs to hold.
 */
async function advanceCircle({ store = mongoStore, circleId, userId, seedId = null }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.phase === 'draft') throw new Error('This circle has not started');
  assertOpen(circle);
  if (circle.phase === 'idle') throw new Error('There is no topic running');

  // With maxLive > 1 several cycles run at once, so a manual advance names its
  // seed; without one it targets the first live cycle, exactly as before.
  const seed = seedId
    ? liveSeeds(circle).find(s => s.id === seedId) || null
    : activeSeed(circle);
  if (seedId && !seed) throw new Error('That topic is not running');

  const isCreator = circle.createdBy === userId;
  const isSeedAuthor = Boolean(seed && seed.authorId === userId);
  if (!isCreator && !isSeedAuthor) {
    throw new Error('Only the circle creator or this topic\'s author can move the group on');
  }

  return evaluate({ store, circle, force: { via: 'manual', byUserId: userId, seedId: seed ? seed.id : null } });
}

/**
 * Why some live cycle should transition right now, or null. Checks every live
 * seed (deadline first, then completion), then whether a free slot and a
 * queued topic mean a new cycle should start. With maxLive at its default of
 * 1 this reproduces the original machine exactly: a live cycle blocks the
 * queue, and an idle circle starts the top of it.
 */
async function nextTransition({ store, circle, now }) {
  if (circle.phase === 'draft' || circle.phase === 'closed') return null;

  const live = liveSeeds(circle);

  for (const seed of live) {
    const dl = seed.phaseDeadline;
    if (dl && now.getTime() >= dl.getTime()) return { seed, via: 'deadline', byUserId: null };
  }
  if (circle.config.advanceOnComplete) {
    for (const seed of live) {
      if (await everyoneDone({ store, circle, seed })) return { seed, via: 'complete', byUserId: null };
    }
  }
  if (live.length < maxLive(circle)) {
    const next = nextInQueue(circle);
    if (next) return { seed: next, start: true, via: 'queue', byUserId: null };
  }
  return null;
}

/**
 * Apply transitions until the machine settles.
 *
 * `force` applies to the FIRST iteration only — a manual advance ends exactly
 * one phase, and the loop then continues on its own terms (the phase it opened
 * may itself be already complete, e.g. a share round nobody can contribute to).
 */
async function evaluate({ store = mongoStore, circle, now = new Date(), force = null }) {
  const pending = [];
  let changed = false;
  let forced = force;

  for (let i = 0; i < MAX_STEPS; i++) {
    let reason = null;
    if (forced) {
      // A manual advance ends exactly one phase of exactly one seed; the loop
      // then continues on its own terms.
      const s = forced.seedId
        ? liveSeeds(circle).find(x => x.id === forced.seedId) || null
        : activeSeed(circle);
      if (s) reason = { seed: s, via: forced.via, byUserId: forced.byUserId };
      forced = null;
      if (!reason) continue;
    } else {
      reason = await nextTransition({ store, circle, now });
    }
    if (!reason) break;

    await step({ store, circle, now, pending, ...reason });
    changed = true;
    if (circle.phase === 'closed') break;
  }

  if (!changed) return { circle, changed: false };

  // Save BEFORE mailing. utils/email.js's contract is that a send is always a
  // side effect of something that already succeeded (PLAN §3.6); a transition
  // that mailed and then failed to persist would mail again on the next tick.
  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  return { circle, changed: true };
}

async function everyoneDone({ store, circle, seed }) {
  // A circle with no members would satisfy "everyone is done" vacuously and
  // race through every phase the moment it started.
  if (circle.members.length === 0) return false;
  if (!seed) return false;

  const mod = modFor(circle, seed);
  for (const m of circle.members) {
    const done = await mod.isMemberDone({ store, circle, seed, phase: seed.phase, userId: m.userId });
    if (!done) return false;
  }
  return true;
}

/** Apply exactly one transition, to the named seed. */
async function step({ store, circle, now, pending, seed, start, via, byUserId }) {
  // A queued topic reached a free slot: open its cycle.
  if (start) {
    return beginCycle({ circle, seed, now, pending, via, byUserId, store });
  }

  if (!seed || notStarted(seed) || DONE_PHASES.includes(seed.phase)) return;

  const mod = modFor(circle, seed);
  const idx = mod.phases.indexOf(seed.phase);

  // Still phases left in this cycle: move to the next one.
  if (idx >= 0 && idx < mod.phases.length - 1) {
    const next = mod.phases[idx + 1];
    await mod.onPhaseClose({ store, circle, seed, phase: seed.phase });
    circle.transitions.push({ at: now, from: seed.phase, to: next, via, byUserId, seedId: seed.id });
    seed.phase = next;
    seed.phaseDeadline = deadlineFrom(now, hoursForPhase(circle, next, seed));
    await mod.onPhaseOpen({ store, circle, seed, phase: next });
    pending.push({ seed, phase: next });
    return;
  }

  // Last phase done — reveal, then let the queue fill the freed slot.
  if (idx >= 0) await mod.onPhaseClose({ store, circle, seed, phase: seed.phase });
  await revealSeed({ store, mod, circle, seed, now, pending, via, byUserId, as: 'revealed' });
  return afterCycle({ store, circle, now, pending, via, byUserId });
}

/**
 * End one cycle. `as` is 'revealed' normally and 'skipped' when a facilitator
 * dropped it — both terminal, both keeping every story and computing a result,
 * and the distinction is only whether the group finished sorting it.
 */
async function revealSeed({ store, mod, circle, seed, now, pending, via, byUserId, as = 'revealed' }) {
  circle.transitions.push({ at: now, from: seed.phase, to: as, via, byUserId, seedId: seed.id });
  seed.phase = as;
  seed.revealedAt = now;
  seed.phaseDeadline = null;
  await mod.onCycleReveal({ store, circle, seed });
  pending.push({ seed, phase: as });
}

/**
 * Where a circle goes when a cycle ends: on running (other cycles still
 * live), idle, or closed if it was a one-off.
 *
 * D33 — revealing the only topic closes a single-mode circle, because closing
 * is a facilitator's act and a one-off has a creator who ran it once and will
 * not come back. Leaving it idle would show "waiting" on an activity that is
 * over. It is the only place the two modes behave differently.
 */
async function afterCycle({ store, circle, now, pending, via, byUserId }) {
  if (circle.mode === 'single') {
    return closeNow({ store, mod: modFor(circle), circle, now, pending, via, byUserId });
  }
  const live = liveSeeds(circle);
  circle.liveSeedId = live[0] ? live[0].id : null;
  // Other cycles still running: the circle stays in 'cycle', and nothing asks
  // for a topic while there is plainly something to do.
  if (live.length > 0) return;
  return goIdle({ circle, now, pending, via, byUserId, from: 'cycle' });
}

/**
 * Park. An open circle with nothing queued is a pause, not an ending (D29) —
 * it starts again the moment somebody posts a topic, and the notification is
 * the ask for one.
 */
function goIdle({ circle, now, pending, via, byUserId, from }) {
  circle.phase = 'idle';
  circle.status = 'running';
  circle.liveSeedId = null;
  circle.phaseDeadline = null;
  circle.transitions.push({ at: now, from, to: 'idle', via, byUserId, seedId: null });
  // Only ASK for a topic when there is genuinely none. Every cycle ends by
  // passing through idle on its way to the next one, and mailing "the circle
  // needs a topic" a millisecond before "here is the next topic" is how a
  // correct machine sends nonsense.
  if (!nextInQueue(circle)) pending.push({ seed: null, phase: 'idle' });
}

async function beginCycle({ circle, seed, now, pending, via, byUserId, store }) {
  const mod = modFor(circle, seed);
  const first = mod.phases[0];

  circle.phase = 'cycle';
  circle.status = 'running';
  circle.phaseDeadline = null; // cycle clocks live on the seed
  // The first live seed keeps the pointer; later concurrent cycles are found
  // through liveSeeds() rather than stored.
  if (!circle.liveSeedId) circle.liveSeedId = seed.id;

  seed.phase = first;
  seed.openedAt = now;
  seed.phaseDeadline = deadlineFrom(now, hoursForPhase(circle, first, seed));

  circle.transitions.push({ at: now, from: 'pending', to: first, via, byUserId, seedId: seed.id });
  if (mod.onPhaseOpen) await mod.onPhaseOpen({ store, circle, seed, phase: first });
  pending.push({ seed, phase: first });
}

/** The end of a circle. Only closeCircle() and D33's one-off reach this. */
async function closeNow({ store, mod, circle, now, pending, via, byUserId }) {
  const from = circle.phase;
  circle.phase = 'closed';
  circle.status = 'complete';
  circle.completedAt = now;
  circle.phaseDeadline = null;
  circle.liveSeedId = null;
  circle.transitions.push({ at: now, from, to: 'closed', via, byUserId, seedId: null });
  await mod.onCircleComplete({ store, circle });
  pending.push({ seed: null, phase: 'closed' });
}

// ---------------------------------------------------------------------------
// Notification dispatch
// ---------------------------------------------------------------------------

/**
 * Fan a settled transition out to the members who now have something to do.
 *
 * Runs after the save, and can never fail the transition: a phase that
 * advanced and then failed to mail is a missed email, while a phase that
 * rolled back because of a bad address is a stuck circle.
 */
async function dispatch({ store, circle, pending }) {
  for (const { seed, phase } of pending) {
    // Dedupe per (seed, phase) so a retry after a partial failure cannot mail
    // the whole circle twice (PLAN §3.6).
    if (seed) {
      if (seed.notifiedPhases.includes(phase)) continue;
      seed.notifiedPhases.push(phase);
    }

    // The seed's own module writes its messages; circle-level phases (idle,
    // closed) have no seed and fall to the circle's module.
    const mod = modFor(circle, seed);
    for (const member of circle.members) {
      try {
        const msg = await mod.notificationFor({ store, circle, seed, phase, userId: member.userId });
        if (!msg) continue; // nothing for this person to do — the main volume lever

        // ONE type for every phase of every activity — never `circle_${phase}`.
        // Notification.type is a closed enum, so a type derived from the phase
        // name fails validation for any activity whose phases nobody added to
        // it, and utils/notify.js catches and logs rather than throwing: the
        // notifications simply never appear. Caught by the integration check,
        // invisible to every unit test with a stubbed notify.
        await store.notify({
          userId: member.userId,
          type: 'circle_phase',
          message: msg.subject,
          refType: 'circle',
          refId: circle.id,
        });

        if (member.email && !member.emailOptOut) {
          // `unsubscribeUrl` is the module's to supply — the machine has no
          // idea which app's settings page a member of THIS circle should be
          // sent to, and guessing one is how mail ends up pointing at the
          // wrong product.
          await store.sendEmail({
            to: member.email,
            subject: msg.subject,
            text: msg.text,
            headers: msg.unsubscribeUrl ? { 'List-Unsubscribe': `<${msg.unsubscribeUrl}>` } : undefined,
          });
        }
      } catch (err) {
        console.error(`[circles] notify failed for ${member.userId} on ${circle.id}:`, err.message);
      }
    }
  }

  if (pending.some(p => p.seed)) {
    await store.saveCircle(circle).catch(() => {}); // persist notifiedPhases
  }
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * Body of the periodic tick (PLAN §3.5). Call under utils/jobs.js#withLock.
 *
 * This is the primary advancement path, not a fallback: Threshold's premise is
 * that nobody has the page open, so a circle waiting on sweep-on-read would sit
 * dead forever and never send the mail that brings anyone back.
 */
async function sweepCircles({ store = mongoStore, now = new Date() } = {}) {
  const running = await store.listRunningCircles();
  let advanced = 0;

  for (const circle of running) {
    try {
      const { changed } = await evaluate({ store, circle, now });
      if (changed) advanced++;
    } catch (err) {
      // One broken circle must not stop the sweep for every other circle.
      console.error(`[circles] sweep failed for ${circle.id}:`, err.message);
    }
  }

  return { examined: running.length, advanced };
}

/**
 * Who has taken part in what — the circle-home map's data, one row per seed
 * that the activity module chooses to answer for. The LAYER contributes the
 * iteration, the membership gate and the seedId; the MODULE contributes the
 * row, because the activity owns the redaction ladder (threshold's: done →
 * attributed, rank → count only, share/pending → own flag only). A module
 * without the hook yields an empty map, which renders as members alone —
 * correct for an activity that has no participation story yet.
 */
async function participation({ circle, viewerId = null }) {
  assertMember(circle, viewerId);
  const rows = await Promise.all(
    circle.seeds.map(async seed => {
      const row = await modFor(circle, seed).participation({ circle, seed, viewerId });
      return row ? { seedId: seed.id, ...row } : null;
    }),
  );
  return rows.filter(Boolean);
}

/**
 * The one-call snapshot: sweep, serialize, and — for a member — attach the
 * participation map and whatever the ACTIVITY adds for the live seed (its
 * `snapshotExtras` hook; Threshold's carries shares, myRanking and the
 * waiting marker, each already redacted by its own rules). Both the generic
 * router and an activity's own router serve exactly this, so the payload
 * cannot drift between the two front doors.
 */
async function snapshot({ store = mongoStore, circle, viewerId = null }) {
  // Sweep on read, as a fallback to the tick — a page load should never show
  // a phase the clock has already ended.
  await evaluate({ store, circle });
  const payload = toClient(circle, { userId: viewerId });
  if (payload.isMember) {
    // Extras for EVERY live seed, each from its own module. The first live
    // seed's extras are also flat-merged, which is the whole payload a
    // single-live activity (Threshold) has always seen; `seedExtras` is the
    // keyed form a multi-live client reads.
    const live = liveSeeds(circle);
    const seedExtras = {};
    for (const seed of live) {
      const extras = await modFor(circle, seed).snapshotExtras({ circle, seed, viewerId });
      if (extras) seedExtras[seed.id] = extras;
    }
    const first = activeSeed(circle);
    if (first && seedExtras[first.id]) Object.assign(payload, seedExtras[first.id]);
    if (Object.keys(seedExtras).length) payload.seedExtras = seedExtras;
    payload.participation = await participation({ circle, viewerId });
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/** Member emails never cross the wire. */
function toClient(circle, { userId = null } = {}) {
  const seed = activeSeed(circle);
  const forViewer = s => toClientSeed(s, { userId });
  return {
    id: circle.id,
    activity: circle.activity,
    title: circle.title,
    urlName: circle.urlName,
    mode: circle.mode,
    status: circle.status,
    phase: circle.phase,
    phaseDeadline: seed ? seed.phaseDeadline : null,
    liveSeedId: circle.liveSeedId || null,
    // The full live set — equals [liveSeedId] on a single-live circle.
    liveSeedIds: liveSeeds(circle).map(s => s.id),
    maxLive: maxLive(circle),
    seedCount: circle.seeds.length,
    memberCount: circle.members.length,
    members: circle.members.map(m => ({ userId: m.userId, username: m.username })),
    currentSeed: seed ? forViewer(seed) : null,
    seeds: circle.seeds.map(forViewer),
    // The queue in the order it will run, so the client renders the order the
    // machine will actually take rather than re-deriving the sort and drifting.
    queue: queue(circle).map(forViewer),
    // Every topic this member posted — a member may post more than one, since
    // the queue is filtered by support rather than by a one-each rule.
    mySeedIds: userId ? circle.seeds.filter(s => s.authorId === userId).map(s => s.id) : [],
    isCreator: userId ? circle.createdBy === userId : false,
    isMember: userId ? circle.members.some(m => m.userId === userId) : false,
    // Mine only. Another member's mail preference is theirs.
    myEmailOptOut: userId
      ? Boolean(circle.members.find(m => m.userId === userId)?.emailOptOut)
      : false,
    startedAt: circle.startedAt,
    completedAt: circle.completedAt,
  };
}

function toClientSeed(seed, { userId = null } = {}) {
  const supporters = seed.supporterIds || [];
  return {
    id: seed.id,
    authorId: seed.authorId,
    order: seed.order,
    // null = the circle's own activity, and the client may treat it so.
    activity: seed.activity || null,
    payload: seed.payload,
    phase: seed.phase,
    // A count and a flag, never the roster: who supported a topic is nobody's
    // business, and the count is the only part the queue's order depends on.
    supporterCount: supporters.length,
    iSupport: userId ? supporters.includes(userId) : false,
    promotedAt: seed.promotedAt || null,
    openedAt: seed.openedAt,
    phaseDeadline: seed.phaseDeadline,
    revealedAt: seed.revealedAt,
    result: seed.result || null,
  };
}

module.exports = {
  createCircle,
  joinCircle,
  addSeed,
  supportSeed,
  promoteSeed,
  setEmailOptOut,
  skipSeed,
  closeCircle,
  startCircle,
  advanceCircle,
  evaluate,
  sweepCircles,
  participation,
  snapshot,
  notStarted,
  toClient,
  toClientSeed,
  activeSeed,
  liveSeeds,
  maxLive,
  modFor,
  queue,
  nextInQueue,
  currentDeadline,
  assertMember,
  mongoStore,
  MAX_STEPS,
  DONE_PHASES,
  PRE_QUEUE_PHASES,
};
