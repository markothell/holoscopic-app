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
// Design: apps/threshold/PLAN.md §3. Two things there are load-bearing here:
//
//   §3.3  A phase ends on COMPLETE, DEADLINE, or MANUAL — all three always
//         live, and any phase's clock may be omitted entirely.
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

function generateId() {
  return crypto.randomUUID().substring(0, 8);
}

function deadlineFrom(now, hours) {
  if (hours == null) return null; // no clock for this phase (D16)
  return new Date(now.getTime() + hours * HOUR_MS);
}

// config.shareHours for phase 'share', and so on. Keeping the convention
// implicit is what lets a new activity declare its own phase names without
// touching this file.
function hoursForPhase(circle, phase) {
  const key = `${phase}Hours`;
  const v = circle.config ? circle.config[key] : undefined;
  return v === undefined ? null : v;
}

function currentDeadline(circle) {
  if (circle.phase === 'seeding') return circle.phaseDeadline || null;
  if (circle.phase === 'cycle') {
    const seed = circle.seeds[circle.cycleIndex];
    return seed ? (seed.phaseDeadline || null) : null;
  }
  return null;
}

function activeSeed(circle) {
  if (circle.phase !== 'cycle') return null;
  return circle.seeds[circle.cycleIndex] || null;
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
 * In 'single' mode the creator's seed is required here and the seeding phase is
 * skipped entirely — a standalone run of the activity is a one-seed circle
 * (PLAN §1, D1). In 'circle' mode a seed passed here is ignored.
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
  if (mode === 'single') {
    if (!seedPayload) throw new Error('single mode requires a seed');
    seeds.push({
      id: generateId(),
      authorId: createdBy,
      order: 0,
      payload: await mod.normalizeSeed(seedPayload, { userId: createdBy }),
      phase: 'pending',
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
    cycleIndex: -1,
  });
}

/** Idempotent. Re-joining updates the stored name/email rather than duplicating. */
async function joinCircle({ store = mongoStore, circleId, userId, username, email = '' }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.status === 'complete') throw new Error('This circle has finished');

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
 * Post or replace your seed. One per member, only while seeding is open.
 *
 * Replacing your own is allowed right up to the phase ending — a topic you
 * thought better of is worth more than an immutability rule nothing depends on.
 */
async function addSeed({ store = mongoStore, circleId, userId, payload }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.phase !== 'seeding') throw new Error('Seeding is not open');
  if (!circle.members.some(m => m.userId === userId)) throw new Error('Not a member of this circle');

  const mod = activities.get(circle.activity);
  const normalized = await mod.normalizeSeed(payload, { circle, userId });

  const mine = circle.seeds.find(s => s.authorId === userId);
  if (mine) {
    mine.payload = normalized;
  } else {
    circle.seeds.push({
      id: generateId(),
      authorId: userId,
      order: circle.seeds.length,
      payload: normalized,
      phase: 'pending',
      notifiedPhases: [],
    });
  }

  await store.saveCircle(circle);
  // Posting the last outstanding seed is itself a completion trigger.
  return evaluate({ store, circle });
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/** Creator only. draft → seeding, or straight into cycle 0 in single mode. */
async function startCircle({ store = mongoStore, circleId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.createdBy !== userId) throw new Error('Only the creator can start this circle');
  if (circle.phase !== 'draft') throw new Error('This circle has already started');

  const now = new Date();
  circle.status = 'running';
  circle.startedAt = now;

  const pending = [];
  if (circle.mode === 'single') {
    await beginCycle({ store, circle, index: 0, now, pending, via: 'manual', byUserId: userId });
  } else {
    circle.phase = 'seeding';
    circle.phaseDeadline = deadlineFrom(now, circle.config.seedHours);
    circle.transitions.push({ at: now, from: 'draft', to: 'seeding', via: 'manual', byUserId: userId });
    pending.push({ seed: null, phase: 'seeding' });
  }

  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  // A single-mode circle whose share phase has no clock and no other members
  // can already be finished; let the machine settle before returning.
  return evaluate({ store, circle, now });
}

/**
 * Manual advance — a first-class control, not a rescue hatch (PLAN §3.3).
 *
 * The creator may advance any phase. The author of the live seed may advance
 * their own cycle: in a Sharing Circle they are the author of the activity
 * being run, which is what makes the control theirs to hold.
 */
async function advanceCircle({ store = mongoStore, circleId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.phase === 'draft') throw new Error('This circle has not started');
  if (circle.phase === 'complete') throw new Error('This circle has finished');

  const seed = activeSeed(circle);
  const isCreator = circle.createdBy === userId;
  const isSeedAuthor = Boolean(seed && seed.authorId === userId);
  if (!isCreator && !isSeedAuthor) {
    throw new Error('Only the circle creator or this topic\'s author can move the group on');
  }

  return evaluate({ store, circle, force: { via: 'manual', byUserId: userId } });
}

/**
 * Apply transitions until the machine settles.
 *
 * `force` applies to the FIRST iteration only — a manual advance ends exactly
 * one phase, and the loop then continues on its own terms (the phase it opened
 * may itself be already complete, e.g. a share round nobody can contribute to).
 */
async function evaluate({ store = mongoStore, circle, now = new Date(), force = null }) {
  const mod = activities.get(circle.activity);
  const pending = [];
  let changed = false;
  let forced = force;

  for (let i = 0; i < MAX_STEPS; i++) {
    const reason = forced || await endReasonFor({ store, mod, circle, now });
    forced = null;
    if (!reason) break;

    await step({ store, mod, circle, now, pending, ...reason });
    changed = true;
    if (circle.phase === 'complete') break;
  }

  if (!changed) return { circle, changed: false };

  // Save BEFORE mailing. utils/email.js's contract is that a send is always a
  // side effect of something that already succeeded (PLAN §3.6); a transition
  // that mailed and then failed to persist would mail again on the next tick.
  await store.saveCircle(circle);
  await dispatch({ store, circle, pending });
  return { circle, changed: true };
}

/** Why the current phase should end right now, or null. */
async function endReasonFor({ store, mod, circle, now }) {
  if (circle.phase === 'draft' || circle.phase === 'complete') return null;

  const deadline = currentDeadline(circle);
  if (deadline && now.getTime() >= deadline.getTime()) return { via: 'deadline', byUserId: null };

  if (circle.config.advanceOnComplete && await everyoneDone({ store, mod, circle })) {
    return { via: 'complete', byUserId: null };
  }
  return null;
}

async function everyoneDone({ store, mod, circle }) {
  // A circle with no members would satisfy "everyone is done" vacuously and
  // race through every phase the moment it started.
  if (circle.members.length === 0) return false;

  if (circle.phase === 'seeding') {
    return circle.members.every(m => circle.seeds.some(s => s.authorId === m.userId));
  }

  const seed = activeSeed(circle);
  if (!seed) return false;

  for (const m of circle.members) {
    const done = await mod.isMemberDone({ store, circle, seed, phase: seed.phase, userId: m.userId });
    if (!done) return false;
  }
  return true;
}

/** Apply exactly one transition. */
async function step({ store, mod, circle, now, pending, via, byUserId }) {
  if (circle.phase === 'seeding') {
    circle.transitions.push({ at: now, from: 'seeding', to: 'cycle', via, byUserId, seedId: null });
    // D4: the machine never blocks on a person. A member who missed the
    // seeding deadline simply has no topic; nobody seeding at all ends it.
    if (circle.seeds.length === 0) return completeCircle({ store, mod, circle, now, pending, via, byUserId });
    return beginCycle({ circle, index: 0, now, pending, via, byUserId, mod, store });
  }

  if (circle.phase !== 'cycle') return;

  const seed = activeSeed(circle);
  if (!seed) return completeCircle({ store, mod, circle, now, pending, via, byUserId });

  const idx = mod.phases.indexOf(seed.phase);

  // Still phases left in this cycle: move to the next one.
  if (idx >= 0 && idx < mod.phases.length - 1) {
    const next = mod.phases[idx + 1];
    await mod.onPhaseClose({ store, circle, seed, phase: seed.phase });
    circle.transitions.push({ at: now, from: seed.phase, to: next, via, byUserId, seedId: seed.id });
    seed.phase = next;
    seed.phaseDeadline = deadlineFrom(now, hoursForPhase(circle, next));
    await mod.onPhaseOpen({ store, circle, seed, phase: next });
    pending.push({ seed, phase: next });
    return;
  }

  // Last phase done — reveal, then move to the next seed.
  if (idx >= 0) await mod.onPhaseClose({ store, circle, seed, phase: seed.phase });
  circle.transitions.push({ at: now, from: seed.phase, to: 'revealed', via, byUserId, seedId: seed.id });
  seed.phase = 'revealed';
  seed.revealedAt = now;
  seed.phaseDeadline = null;
  await mod.onCycleReveal({ store, circle, seed });
  pending.push({ seed, phase: 'revealed' });

  const nextIndex = circle.cycleIndex + 1;
  if (nextIndex < circle.seeds.length) {
    return beginCycle({ circle, index: nextIndex, now, pending, via, byUserId, mod, store });
  }
  return completeCircle({ store, mod, circle, now, pending, via, byUserId });
}

async function beginCycle({ circle, index, now, pending, via, byUserId, mod, store }) {
  const module_ = mod || activities.get(circle.activity);
  const seed = circle.seeds[index];
  const first = module_.phases[0];

  circle.phase = 'cycle';
  circle.status = 'running';
  circle.phaseDeadline = null; // cycle clocks live on the seed
  circle.cycleIndex = index;

  seed.phase = first;
  seed.openedAt = now;
  seed.phaseDeadline = deadlineFrom(now, hoursForPhase(circle, first));

  circle.transitions.push({ at: now, from: 'pending', to: first, via, byUserId, seedId: seed.id });
  if (module_.onPhaseOpen) await module_.onPhaseOpen({ store, circle, seed, phase: first });
  pending.push({ seed, phase: first });
}

async function completeCircle({ store, mod, circle, now, pending, via, byUserId }) {
  circle.phase = 'complete';
  circle.status = 'complete';
  circle.completedAt = now;
  circle.phaseDeadline = null;
  circle.transitions.push({ at: now, from: 'cycle', to: 'complete', via, byUserId, seedId: null });
  await mod.onCircleComplete({ store, circle });
  pending.push({ seed: null, phase: 'complete' });
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

    const mod = activities.get(circle.activity);
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
          await store.sendEmail({ to: member.email, subject: msg.subject, text: msg.text });
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

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/** Member emails never cross the wire. */
function toClient(circle, { userId = null } = {}) {
  const seed = activeSeed(circle);
  return {
    id: circle.id,
    activity: circle.activity,
    title: circle.title,
    urlName: circle.urlName,
    mode: circle.mode,
    status: circle.status,
    phase: circle.phase,
    phaseDeadline: circle.phase === 'seeding' ? circle.phaseDeadline : (seed ? seed.phaseDeadline : null),
    cycleIndex: circle.cycleIndex,
    seedCount: circle.seeds.length,
    memberCount: circle.members.length,
    members: circle.members.map(m => ({ userId: m.userId, username: m.username })),
    currentSeed: seed ? toClientSeed(seed) : null,
    seeds: circle.seeds.map(toClientSeed),
    mySeed: userId ? (circle.seeds.find(s => s.authorId === userId) || null) : null,
    isCreator: userId ? circle.createdBy === userId : false,
    isMember: userId ? circle.members.some(m => m.userId === userId) : false,
    startedAt: circle.startedAt,
    completedAt: circle.completedAt,
  };
}

function toClientSeed(seed) {
  return {
    id: seed.id,
    authorId: seed.authorId,
    order: seed.order,
    payload: seed.payload,
    phase: seed.phase,
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
  startCircle,
  advanceCircle,
  evaluate,
  sweepCircles,
  toClient,
  toClientSeed,
  activeSeed,
  currentDeadline,
  mongoStore,
  MAX_STEPS,
};
