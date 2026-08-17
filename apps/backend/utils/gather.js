// gather — the builder's single-round activity (PRIMITIVES.md §9): a prompt,
// one response per member, one reveal. The activity definition lives entirely
// in the SEED PAYLOAD — a circle activity built in the picker is a seed, not a
// deployment — and this one module runs every shape of it.
//
//   prompt → responses (story / placement / story + placement) → reveal
//
// Settled rules it encodes (§9 B1–B7):
//   - all contributions are NAMED — no anonymity inside a circle;
//   - reveal is 'open' (a live wall) or 'sealed' (own-only until the close);
//   - the close is everyone-responded or an optional per-seed timer
//     (payload.respondHours, read by the machine's hoursForPhase override),
//     with manual reveal as the facilitator's escape hatch;
//   - input STAYS OPEN after the close (B4) — late responses join the reveal;
//   - after the close, existing responses may change TEXT only (B5, when
//     payload.editAfterClose): positions freeze, audio is fixed from
//     submission;
//   - reactions are free and toggled (no self-react); live on an open wall,
//     post-reveal on a sealed one;
//   - the aggregate is computed ON READ (§9 gotcha 1) — seed.result is only a
//     cache stamped at reveal.
//
// Storage is the PRIMITIVE collections (P8): models/Share.js and
// models/Placement.js. Never write either outside this funnel.
//
// Every function takes `store` defaulting to `mongoStore` — same pattern as
// utils/threshold.js — so gather.test.js runs the whole loop offline.

const circles = require('./circles');
const activities = require('./circleActivities');
const { normalizeAudio } = require('./audioPayload');

const PROMPT_MAX = 200;
const CONTEXT_MAX = 1000;
const TITLE_MAX = 80;
const TEXT_MAX = 5000;
const POLE_MAX = 40;

const DEFAULT_SECONDS = 60;
const MIN_SECONDS = 15;
const MAX_SECONDS = 300;

const SHAPES = ['story', 'placement', 'story-placement'];
const SLOT = ''; // one response per member: the Share slot is constant

/** Where the circles app lives, for links in mail — its own variable for the
 *  same reason as THRESHOLD_URL (one backend serves seven apps). */
function circlesAppUrl() {
  const base = process.env.CIRCLES_URL || 'http://localhost:4007';
  return base.replace(/\/$/, '');
}

function circleUrl(circle) {
  return `${circlesAppUrl()}/c/${circle.urlName}`;
}

function notificationsUrl() {
  return `${circlesAppUrl()}/notifications`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const mongoStore = {
  ...circles.mongoStore,

  async findResponse(seedId, userId) {
    return require('../models/Share').findOne({ seedId, userId, slot: SLOT });
  },
  async listResponses(seedId) {
    return require('../models/Share').find({ seedId, slot: SLOT }).sort({ createdAt: 1 });
  },
  async createResponse(fields) {
    return require('../models/Share').create(fields);
  },
  async saveResponse(share) {
    return share.save();
  },

  async findPlacement(seedId, userId) {
    return require('../models/Placement').findOne({ seedId, userId, kind: 'position', targetId: '', axis: '' });
  },
  async listPlacements(seedId) {
    return require('../models/Placement').find({
      seedId, kind: 'position', targetId: '', axis: '', committedAt: { $ne: null },
    });
  },
  async createPlacement(fields) {
    return require('../models/Placement').create(fields);
  },
  async savePlacement(placement) {
    return placement.save();
  },
};

// ---------------------------------------------------------------------------
// Seed shape — the activity definition (PRIMITIVES.md §9's creator flow)
// ---------------------------------------------------------------------------

function normalizeSeed(payload) {
  const p = payload || {};

  const prompt = String(p.prompt || '').trim();
  if (!prompt) throw new Error('A prompt is required');
  if (prompt.length > PROMPT_MAX) throw new Error('That prompt is too long');

  const context = String(p.context || '').trim();
  if (context.length > CONTEXT_MAX) throw new Error('That context is too long');

  const shape = String(p.shape || 'story');
  if (!SHAPES.includes(shape)) throw new Error('Unknown response shape');

  // Axes: none for a story ask; one or two pole pairs when placing.
  const wantsAxes = shape !== 'story';
  const rawAxes = Array.isArray(p.axes) ? p.axes : [];
  if (!wantsAxes && rawAxes.length > 0) throw new Error('A story ask has no axes');
  if (wantsAxes && (rawAxes.length < 1 || rawAxes.length > 2)) {
    throw new Error('A placement ask needs one or two axes');
  }
  const axes = rawAxes.map(a => {
    const poleA = String((a || {}).poleA || '').trim();
    const poleB = String((a || {}).poleB || '').trim();
    if (!poleA || !poleB) throw new Error('Both ends of an axis are required');
    if (poleA.length > POLE_MAX || poleB.length > POLE_MAX) throw new Error('Those axis labels are too long');
    if (poleA.toLowerCase() === poleB.toLowerCase()) {
      throw new Error('The two ends of an axis must be different');
    }
    return { poleA, poleB };
  });

  const reveal = p.reveal === 'open' ? 'open' : 'sealed';
  const reactions = p.reactions === undefined ? true : Boolean(p.reactions);
  const editAfterClose = p.editAfterClose === undefined ? true : Boolean(p.editAfterClose);

  // The optional timer (B2). null = closes only on everyone-responded or by
  // hand. The machine reads this key straight off the payload —
  // utils/circles.js#hoursForPhase's per-seed override.
  let respondHours = null;
  if (p.respondHours !== undefined && p.respondHours !== null && p.respondHours !== '') {
    const h = Number(p.respondHours);
    if (!Number.isFinite(h)) throw new Error('That timer is not a number of hours');
    respondHours = Math.min(8760, Math.max(1, Math.round(h)));
  }

  let seconds = Number(p.secondsPerNote);
  if (!Number.isFinite(seconds)) seconds = DEFAULT_SECONDS;
  seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));

  return { prompt, context, shape, axes, reveal, reactions, editAfterClose, respondHours, secondsPerNote: seconds };
}

function isGatherSeed(circle, seed) {
  return ((seed && seed.activity) || circle.activity) === 'gather';
}

function assertGatherSeed(circle, seed) {
  if (!isGatherSeed(circle, seed)) throw new Error('That is not a gather activity');
}

function seedDone(seed) {
  return circles.DONE_PHASES.includes(seed.phase);
}

// ---------------------------------------------------------------------------
// Responding — the one write a member makes
// ---------------------------------------------------------------------------

function normalizePosition(seed, position) {
  const p = position || {};
  const clamp = v => Math.min(1, Math.max(0, Number(v)));
  const x = Number(p.x);
  if (!Number.isFinite(x)) throw new Error('A position is required for this ask');
  const twoAxes = (seed.payload.axes || []).length === 2;
  let y = Number(p.y);
  if (twoAxes) {
    if (!Number.isFinite(y)) throw new Error('This ask places on two axes');
  } else {
    y = 0.5;
  }
  return { x: clamp(x), y: clamp(y) };
}

/**
 * Submit or update my response. One per member per seed, upserted.
 *
 * Input is open during 'respond' AND after the reveal (B4 — a late response
 * joins the artifact). What may still CHANGE after the close narrows to text
 * (B5): positions freeze, and audio is fixed from the submission that first
 * carried it.
 */
async function submitResponse({
  store = mongoStore, circleId, seedId, userId, username = '',
  title = '', text = '', audio = null, position = null,
}) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  if (circle.phase === 'closed') throw new Error('This circle has finished');
  circles.assertMember(circle, userId);

  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed) throw new Error('Topic not found in this circle');
  assertGatherSeed(circle, seed);
  if (seed.phase === 'pending') throw new Error('This activity has not started');

  const done = seedDone(seed);
  const cfg = seed.payload;
  const existing = await store.findResponse(seedId, userId);

  const cleanTitle = String(title || '').trim().slice(0, TITLE_MAX);
  const cleanText = String(text || '').trim();
  if (cleanText.length > TEXT_MAX) throw new Error('That story is too long');

  const wantsStory = cfg.shape !== 'placement';
  const wantsPlacement = cfg.shape !== 'story';

  if (done && existing) {
    // B5 — the post-close window on an existing response is text-only.
    if (!cfg.editAfterClose) throw new Error('This activity no longer takes edits');
    if (audio) throw new Error('A recording is fixed once submitted');
    if (position) throw new Error('Positions are fixed once the activity closes');
    if (wantsStory && !cleanText && !existing.audio) throw new Error('A story needs words or a voice');
    existing.title = cleanTitle;
    existing.text = cleanText;
    await store.saveResponse(existing);
    return { circle, seed, share: toClientResponse(existing, { attributed: true, isMine: true }) };
  }

  // Open input: first submission, resubmission during respond, or a LATE
  // first response after the reveal (B4).
  const cleanAudio = audio ? normalizeAudio(audio) : null;
  if (existing && audio && existing.audio) throw new Error('A recording is fixed once submitted');

  let pos = null;
  if (wantsPlacement) {
    // A resubmission may keep its committed position; a first response
    // must place.
    if (position) pos = normalizePosition(seed, position);
    else {
      const held = existing ? await store.findPlacement(seedId, userId) : null;
      if (!held) throw new Error('A position is required for this ask');
    }
  } else if (position) {
    throw new Error('This ask has no axes');
  }

  if (wantsStory && !cleanText && !cleanAudio && !(existing && existing.audio)) {
    throw new Error('A story needs words or a voice');
  }

  let share = existing;
  if (share) {
    // A moved position drops the reactions it collected — they endorsed a
    // spot that no longer exists (§9 gotcha 2; live only on an open wall).
    if (pos && share.reactedIds && share.reactedIds.length) {
      const held = await store.findPlacement(seedId, userId);
      const moved = !held || held.position.x !== pos.x || held.position.y !== pos.y;
      if (moved) share.reactedIds = [];
    }
    share.title = cleanTitle;
    share.text = cleanText;
    if (cleanAudio && !share.audio) share.audio = cleanAudio;
    if (username) share.username = username;
    await store.saveResponse(share);
  } else {
    share = await store.createResponse({
      instanceId: circle.instanceId,
      circleId: circle.id,
      seedId,
      userId,
      username: username || 'Member',
      slot: SLOT,
      title: cleanTitle,
      text: cleanText,
      audio: cleanAudio,
      transcript: { status: 'skipped', text: '' },
      reactedIds: [],
    });
  }

  if (pos) {
    let placement = await store.findPlacement(seedId, userId);
    if (placement) {
      placement.position = pos;
      placement.committedAt = placement.committedAt || new Date();
      if (username) placement.username = username;
      await store.savePlacement(placement);
    } else {
      await store.createPlacement({
        instanceId: circle.instanceId,
        circleId: circle.id,
        seedId,
        userId,
        username: username || 'Member',
        kind: 'position',
        targetId: '',
        axis: '',
        position: pos,
        committedAt: new Date(),
      });
    }
  }

  // Write-triggered advancement: the member who responds last should see the
  // reveal now, not on the next tick.
  const { circle: after } = await circles.evaluate({ store, circle });
  const seedAfter = after.seeds.find(s => s.id === seedId) || seed;
  return {
    circle: after,
    seed: seedAfter,
    share: toClientResponse(share, { attributed: true, isMine: true }),
  };
}

/**
 * Toggle my reaction on a response. Free, no self-react (§9). Live on an open
 * wall from the moment a response lands; on a sealed ask only once revealed.
 */
async function reactToResponse({ store = mongoStore, circleId, seedId, shareId, userId }) {
  const circle = await store.findCircleById(circleId);
  if (!circle) throw new Error('Circle not found');
  circles.assertMember(circle, userId);

  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed) throw new Error('Topic not found in this circle');
  assertGatherSeed(circle, seed);

  const cfg = seed.payload;
  if (!cfg.reactions) throw new Error('This activity has no reactions');
  if (cfg.reveal !== 'open' && !seedDone(seed)) {
    throw new Error('Reactions open at the reveal');
  }

  const rows = await store.listResponses(seedId);
  const share = rows.find(r => r.id === shareId);
  if (!share) throw new Error('Response not found');
  if (share.userId === userId) throw new Error('Your own story does not need your reaction');

  const ids = share.reactedIds || [];
  const at = ids.indexOf(userId);
  if (at >= 0) ids.splice(at, 1); else ids.push(userId);
  share.reactedIds = ids;
  await store.saveResponse(share);

  return { share: toClientResponse(share, { attributed: true, isMine: false, viewerId: userId }) };
}

// ---------------------------------------------------------------------------
// Reading — visibility is the reveal setting, enforced here (never client-side)
// ---------------------------------------------------------------------------

/**
 * The responses a viewer may see right now. 'open' shows everything from the
 * moment it lands; 'sealed' is own-only until the close, then everything —
 * always attributed either way (no anonymity inside a circle).
 */
async function listResponses({ store = mongoStore, circle, seed, viewerId = null }) {
  const rows = await store.listResponses(seed.id);
  const open = seed.payload.reveal === 'open' || seedDone(seed);
  const placements = await store.listPlacements(seed.id);
  const posFor = new Map(placements.map(p => [p.userId, p.position]));

  return rows
    .filter(r => open || r.userId === viewerId)
    .map(r => toClientResponse(r, {
      attributed: true,
      isMine: r.userId === viewerId,
      viewerId,
      position: posFor.get(r.userId) || null,
    }));
}

function toClientResponse(share, { attributed = true, isMine = false, viewerId = null, position = null } = {}) {
  const out = {
    id: share.id,
    seedId: share.seedId,
    title: share.title || '',
    text: share.text || '',
    audio: share.audio || null,
    transcript: share.transcript && share.transcript.status !== 'skipped' ? share.transcript : null,
    reactionCount: (share.reactedIds || []).length,
    iReacted: viewerId ? (share.reactedIds || []).includes(viewerId) : false,
    isMine,
    createdAt: share.createdAt,
    position,
  };
  if (attributed) {
    out.userId = share.userId;
    out.username = share.username;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The aggregate — computed on read, never trusted from a stored snapshot
// ---------------------------------------------------------------------------

function computeAggregate({ seed, placements, responseCount }) {
  const cfg = seed.payload;
  const out = { responses: responseCount, computedAt: new Date() };
  if (cfg.shape === 'story') return out;

  const stats = values => {
    if (!values.length) return { mean: null, spread: null, count: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    return { mean, spread, count: values.length };
  };

  const xs = placements.map(p => p.position.x).filter(Number.isFinite);
  out.x = stats(xs);
  if ((cfg.axes || []).length === 2) {
    out.y = stats(placements.map(p => p.position.y).filter(Number.isFinite));
  }
  return out;
}

async function aggregateFor({ store = mongoStore, seed }) {
  const [placements, rows] = await Promise.all([
    store.listPlacements(seed.id),
    store.listResponses(seed.id),
  ]);
  return computeAggregate({ seed, placements, responseCount: rows.length });
}

// ---------------------------------------------------------------------------
// The activity module
// ---------------------------------------------------------------------------

/**
 * Builds the module utils/circles.js drives. It closes over its OWN store
 * rather than using the one circles passes into each hook — the tick runs
 * with the circle store, which knows nothing about shares or placements
 * (same reasoning as utils/threshold.js#createModule).
 */
function createModule({ store = mongoStore } = {}) {
  return {
    phases: ['respond'],

    async normalizeSeed(payload) {
      return normalizeSeed(payload);
    },

    async isMemberDone({ seed, userId }) {
      return Boolean(await store.findResponse(seed.id, userId));
    },

    // { responses, myResponse, aggregate } — names distinct from Threshold's
    // extras, since both can flat-merge into the same snapshot.
    async snapshotExtras({ circle, seed, viewerId }) {
      const responses = await listResponses({ store, circle, seed, viewerId });
      const mine = responses.find(r => r.isMine) || null;
      const open = seed.payload.reveal === 'open' || seedDone(seed);
      return {
        responses,
        myResponse: mine,
        aggregate: open ? await aggregateFor({ store, seed }) : null,
      };
    },

    // The circle-home map row. Open wall: everything is already visible, so
    // tellers are named from the first response. Sealed: own flag only until
    // the close — even a count would say who has moved (Threshold's rule).
    async participation({ seed, viewerId }) {
      if (seed.phase === 'pending') return null;
      const rows = await store.listResponses(seed.id);
      const iTold = rows.some(r => r.userId === viewerId);
      if (seed.payload.reveal === 'open' || seedDone(seed)) {
        return { tellerIds: rows.map(r => r.userId), tellerCount: rows.length, iTold };
      }
      return { tellerIds: null, tellerCount: null, iTold };
    },

    // A cache only — every reader recomputes (§9 gotcha 1). Stamped so the
    // circle record can show where things stood at the reveal.
    async onCycleReveal({ seed }) {
      seed.result = await aggregateFor({ store, seed });
    },

    async notificationFor({ circle, seed, phase, userId }) {
      const unsubscribeUrl = notificationsUrl();
      const url = circleUrl(circle);

      if (phase === 'idle') {
        return {
          subject: `${circle.title} is open for an activity`,
          text: `Nothing is running in ${circle.title}. Start an activity when you have one to ask:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      if (phase === 'closed') {
        return {
          subject: `${circle.title} has closed`,
          text: `${circle.title} has finished. Everything it made is still there to read:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      if (!seed) return null;

      const prompt = seed.payload.prompt;
      const author = circle.members.find(m => m.userId === seed.authorId);
      const askedBy = author ? author.username : 'A member';

      if (phase === 'respond') {
        // The main volume lever: nothing for people who already answered.
        if (await store.findResponse(seed.id, userId)) return null;
        return {
          subject: `${askedBy} asks: ${prompt}`,
          text: `${askedBy} started an activity in ${circle.title}:\n\n“${prompt}”\n\nAdd your response:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      if (phase === 'revealed') {
        return {
          subject: `Where the circle landed on “${prompt}”`,
          text: `Everyone's responses to “${prompt}” are open in ${circle.title}:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      if (phase === 'skipped') {
        return {
          subject: `“${prompt}” has moved on`,
          text: `${circle.title} moved past “${prompt}”. What it gathered is still there:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      return null;
    },
  };
}

activities.register('gather', createModule());

module.exports = {
  normalizeSeed,
  submitResponse,
  reactToResponse,
  listResponses,
  aggregateFor,
  computeAggregate,
  createModule,
  mongoStore,
  SHAPES,
};
