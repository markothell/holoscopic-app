// gather — the builder's single-round activity (PRIMITIVES.md §9): a prompt,
// one response per member, one reveal. The activity definition lives entirely
// in the SEED PAYLOAD — a circle activity built in the picker is a seed, not a
// deployment — and this one module runs every shape of it.
//
//   prompt → responses (story / placement / story + placement / words) → reveal
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
// Storage is the PRIMITIVE collections (P8): models/Share.js,
// models/Placement.js and models/Vocabulary.js (the words shape: pick ≤k /
// coin ≤j from a seeded word set, revealed as the portrait — words sized by
// count). Never write any of them outside this funnel.
//
// Every function takes `store` defaulting to `mongoStore` — same pattern as
// utils/threshold.js — so gather.test.js runs the whole loop offline.

const circles = require('./circles');
const activities = require('./circleActivities');
const { normalizeAudio } = require('./audioPayload');

// ── Injected side effects ───────────────────────────────────────────────────
//
// Injected rather than imported, exactly as utils/threshold.js and
// utils/memories.js do it, so this funnel never pulls in an HTTP client or an
// S3 client and stays testable with no network. Both are wired in
// websocket-server.js#loadAPIRoutes.
//
// Both are FIRE AND FORGET and structurally unable to fail a submission: a
// response that recorded successfully must never be rejected because a mirror
// or a transcript was slow. They fire exactly once per share, because audio is
// fixed from submission (B5) — the recording a share carries is the recording
// it dies with.
let blobMirror = null;
function setBlobMirror(fn) { blobMirror = fn; }

let transcriber = null;
function setTranscriber(fn) { transcriber = fn; }

function fireBlobMirror(share) {
  if (!blobMirror || !share?.audio?.url) return;
  Promise.resolve()
    .then(() => blobMirror({ share }))
    .catch(err => console.error('[gather] blob mirror hook failed:', err.message));
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
    .catch(err => console.error('[gather] transcription hook failed:', err.message));
}

const PROMPT_MAX = 200;
const CONTEXT_MAX = 1000;
const TITLE_MAX = 80;
const TEXT_MAX = 5000;
const POLE_MAX = 40;

const DEFAULT_SECONDS = 60;
const MIN_SECONDS = 15;
const MAX_SECONDS = 300;

// The words shape (pick ≤k / coin ≤j from a seeded vocabulary).
const WORD_MAX = 24;          // MemoryTag's label ceiling, kept
const SEED_WORDS_MAX = 40;    // the creator's list
const PICK_DEFAULT = 5;       // k
const PICK_LIMIT = 10;
const COIN_DEFAULT = 2;       // j — Chorus's per-submission cap, kept
const COIN_LIMIT = 5;

const SHAPES = ['story', 'placement', 'story-placement', 'words'];
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
  async findResponseById(id) {
    return require('../models/Share').findOne({ id });
  },
  async markTranscriptPending(id) {
    return require('../models/Share').updateOne(
      { id }, { $set: { 'transcript.status': 'pending' } },
    );
  },
  async attachTranscript(id, text, status) {
    return require('../models/Share').updateOne(
      { id }, { $set: { 'transcript.status': status, 'transcript.text': text } },
    );
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

  async listWords(scopeId) {
    return require('../models/Vocabulary').find({ scopeId, set: '' });
  },
  async findWordByKey(scopeId, key) {
    return require('../models/Vocabulary').findOne({ scopeId, set: '', key });
  },
  async createWord(fields) {
    return require('../models/Vocabulary').create(fields);
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

  // Axes: none for a story or words ask; one or two pole pairs when placing.
  const wantsAxes = shape === 'placement' || shape === 'story-placement';
  const rawAxes = Array.isArray(p.axes) ? p.axes : [];
  if (!wantsAxes && rawAxes.length > 0) throw new Error(`A ${shape} ask has no axes`);
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

  const base = { prompt, context, shape, axes, reveal, reactions, editAfterClose, respondHours };

  // S1 — which act the respond surface leads with, on story-bearing shapes:
  // voice-first is the circle default; 'text' flips to the compose sheet for
  // short-reply asks. S3 — which input a two-axis ask offers: place anywhere,
  // or Synthesis's four named quadrants. Both are creator choices in the
  // builder; the machine and the storage are identical either way.
  if (shape === 'story' || shape === 'story-placement') {
    base.telling = p.telling === 'text' ? 'text' : 'voice';
  }
  if (wantsAxes) {
    base.placing = p.placing === 'quadrants' ? 'quadrants' : 'free';
  }

  // The words shape: the creator's seed list plus the two caps (pick ≤k,
  // coin ≤j). The list here is the canonical source — Vocabulary rows are
  // materialized from it once the seed goes live (ensureVocabulary), and a
  // seed is only editable while pending, so the two can never disagree after.
  if (shape === 'words') {
    const rawWords = Array.isArray(p.words) ? p.words : [];
    const seen = new Set();
    const words = [];
    for (const raw of rawWords) {
      const label = cleanWordLabel(raw);
      if (!label) continue;
      const key = normalizeWordKey(label);
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(label);
    }
    if (!words.length) throw new Error('A words ask needs seed words');
    if (words.length > SEED_WORDS_MAX) throw new Error('That word list is too long');

    let pickMax = Math.round(Number(p.pickMax));
    if (!Number.isFinite(pickMax)) pickMax = PICK_DEFAULT;
    pickMax = Math.min(PICK_LIMIT, Math.max(1, pickMax));

    let coinMax = Math.round(Number(p.coinMax));
    if (!Number.isFinite(coinMax)) coinMax = COIN_DEFAULT;
    coinMax = Math.min(COIN_LIMIT, Math.max(0, coinMax));

    return { ...base, words, pickMax, coinMax };
  }
  if (Array.isArray(p.words) && p.words.length) {
    throw new Error(`A ${shape} ask has no word list`);
  }

  let seconds = Number(p.secondsPerNote);
  if (!Number.isFinite(seconds)) seconds = DEFAULT_SECONDS;
  seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));

  return { ...base, secondsPerNote: seconds };
}

// The dedupe axis for words — MemoryTag's normalization, kept: case-folded,
// whitespace-collapsed, punctuation left alone (an apostrophe is meaningful).
function normalizeWordKey(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanWordLabel(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, WORD_MAX);
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
// The vocabulary — a words ask's shared word set (PRIMITIVES.md §4.3)
// ---------------------------------------------------------------------------

/**
 * Materialize the seed's word list into Vocabulary rows, idempotently — the
 * syncSeedTags move, smaller: a seed freezes when it goes live, so this only
 * ever ADDS rows that are not there yet (first live read or write), and the
 * unique (scopeId, set, key) index turns a concurrent double-create into a
 * re-read. Returns every row for the seed, contributed words included.
 */
async function ensureVocabulary({ store, circle, seed }) {
  const rows = await store.listWords(seed.id);
  const have = new Set(rows.map(r => r.key));
  const labels = seed.payload.words || [];
  for (let i = 0; i < labels.length; i++) {
    const key = normalizeWordKey(labels[i]);
    if (have.has(key)) continue;
    let created;
    try {
      created = await store.createWord({
        instanceId: circle.instanceId,
        circleId: circle.id,
        scopeId: seed.id,
        set: '',
        label: labels[i],
        key,
        origin: 'seeded',
        createdBy: '',
        seedRank: i,
      });
    } catch (err) {
      created = await store.findWordByKey(seed.id, key);
      if (!created) throw err;
    }
    have.add(key);
    rows.push(created);
  }
  return rows;
}

/**
 * Turn the labels a member picked into Vocabulary ids — labels on the wire
 * (§4.3), ids in storage. Unknown labels are coined against the member's
 * budget (coin ≤j, spent permanently: a coined word joins the shared set and
 * is never deleted, so dropping it from your response does not refund it).
 */
async function resolveWordIds({ store, circle, seed, userId, labels }) {
  const cfg = seed.payload;
  const picked = [];
  const seen = new Set();
  for (const raw of labels || []) {
    const label = cleanWordLabel(raw);
    if (!label) continue;
    const key = normalizeWordKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ label, key });
  }
  if (!picked.length) throw new Error('Pick at least one word');
  if (picked.length > cfg.pickMax) throw new Error(`This ask takes up to ${cfg.pickMax} words`);

  const rows = await ensureVocabulary({ store, circle, seed });
  const byKey = new Map(rows.map(r => [r.key, r]));
  const fresh = picked.filter(w => !byKey.has(w.key));
  if (fresh.length) {
    const minted = rows.filter(r => r.createdBy === userId).length;
    if (minted + fresh.length > cfg.coinMax) {
      throw new Error(cfg.coinMax > 0
        ? `This ask takes up to ${cfg.coinMax} new words of your own`
        : 'This ask picks from its list only');
    }
    for (const w of fresh) {
      let row;
      try {
        row = await store.createWord({
          instanceId: circle.instanceId,
          circleId: circle.id,
          scopeId: seed.id,
          set: '',
          label: w.label,
          key: w.key,
          origin: 'contributed',
          createdBy: userId,
        });
      } catch (err) {
        row = await store.findWordByKey(seed.id, w.key);
        if (!row) throw err;
      }
      byKey.set(w.key, row);
    }
  }
  return picked.map(w => byKey.get(w.key).id);
}

/**
 * The picker + portrait list a viewer may see. Sealed before the close, a
 * contributed word would say who has moved and roughly what they said, so the
 * viewer gets the seed list plus only their OWN coinages (the response
 * visibility rule, applied to the vocabulary); open or done, everything.
 * Counts are computed on read from the responses that picked each word (§9
 * gotcha 1) and withheld while sealed.
 */
async function vocabularyFor({ store, circle, seed, viewerId = null }) {
  const rows = await ensureVocabulary({ store, circle, seed });
  const open = seed.payload.reveal === 'open' || seedDone(seed);

  let counts = null;
  if (open) {
    counts = new Map();
    for (const share of await store.listResponses(seed.id)) {
      for (const id of share.wordIds || []) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  return rows
    .filter(r => !r.hidden)
    .filter(r => open || r.origin === 'seeded' || r.createdBy === viewerId)
    .sort((a, b) =>
      (counts ? (counts.get(b.id) || 0) - (counts.get(a.id) || 0) : 0)
      || (a.seedRank ?? 9999) - (b.seedRank ?? 9999)
      || a.label.localeCompare(b.label))
    .map(r => ({
      id: r.id,
      label: r.label,
      origin: r.origin,
      mine: Boolean(viewerId && r.createdBy === viewerId),
      count: counts ? counts.get(r.id) || 0 : null,
    }));
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
  title = '', text = '', audio = null, position = null, words = null,
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

  const wantsStory = cfg.shape === 'story' || cfg.shape === 'story-placement';
  const wantsPlacement = cfg.shape === 'placement' || cfg.shape === 'story-placement';
  const wantsWords = cfg.shape === 'words';

  if (done && existing) {
    // B5 — the post-close window on an existing response is text-only.
    if (!cfg.editAfterClose) throw new Error('This activity no longer takes edits');
    if (audio) throw new Error('A recording is fixed once submitted');
    if (position) throw new Error('Positions are fixed once the activity closes');
    if (words) throw new Error('Words are fixed once the activity closes');
    if (wantsStory && !cleanText && !existing.audio) throw new Error('A story needs words or a voice');
    existing.title = cleanTitle;
    existing.text = cleanText;
    await store.saveResponse(existing);
    return { circle, seed, share: toClientResponse(existing, { attributed: true, isMine: true }) };
  }

  // Open input: first submission, resubmission during respond, or a LATE
  // first response after the reveal (B4).
  if (audio && wantsWords) throw new Error('A words ask has no recording');
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

  let wordIds = null;
  if (wantsWords) {
    // A resubmission may keep its picked words; a first response must pick.
    if (words) wordIds = await resolveWordIds({ store, circle, seed, userId, labels: words });
    else if (!existing || !(existing.wordIds || []).length) throw new Error('Pick at least one word');
  } else if (words) {
    throw new Error('This ask has no word list');
  }

  if (wantsStory && !cleanText && !cleanAudio && !(existing && existing.audio)) {
    throw new Error('A story needs words or a voice');
  }

  // Fixed-from-submission (B5) means this is true at most once in a share's
  // life — the one moment the mirror and the transcriber have anything to do.
  const newRecording = Boolean(cleanAudio && !(existing && existing.audio));

  let share = existing;
  if (share) {
    // A moved position drops the reactions it collected — they endorsed a
    // spot that no longer exists (§9 gotcha 2; live only on an open wall).
    if (pos && share.reactedIds && share.reactedIds.length) {
      const held = await store.findPlacement(seedId, userId);
      const moved = !held || held.position.x !== pos.x || held.position.y !== pos.y;
      if (moved) share.reactedIds = [];
    }
    // A changed word set is the same case: the reaction endorsed words that
    // are no longer the response.
    if (wordIds && share.reactedIds && share.reactedIds.length) {
      const before = new Set(share.wordIds || []);
      const changed = wordIds.length !== before.size || wordIds.some(id => !before.has(id));
      if (changed) share.reactedIds = [];
    }
    share.title = cleanTitle;
    share.text = cleanText;
    if (cleanAudio && !share.audio) share.audio = cleanAudio;
    if (wordIds) share.wordIds = wordIds;
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
      wordIds: wordIds || [],
      reactedIds: [],
    });
  }

  if (newRecording) {
    fireBlobMirror(share);
    fireTranscribe(share, store);
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
    share: toClientResponse(share, {
      attributed: true, isMine: true,
      wordsById: await wordsByIdFor({ store, seed }),
    }),
  };
}

// The label lookup a words-shape response renders with; null on other shapes.
async function wordsByIdFor({ store, seed }) {
  if (seed.payload.shape !== 'words') return null;
  return new Map((await store.listWords(seed.id)).map(r => [r.id, r]));
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

  return {
    share: toClientResponse(share, {
      attributed: true, isMine: false, viewerId: userId,
      wordsById: await wordsByIdFor({ store, seed }),
    }),
  };
}

/**
 * Attach a transcript that arrived from Deepgram.
 *
 * Called by the /api/circles/hooks/deepgram callback, which authenticates on
 * its own HMAC — so no phase or membership gates apply, and none should: a
 * transcript may legitimately land after the reveal, after the circle closes,
 * whenever Deepgram gets around to it. An empty transcript is recorded as
 * 'failed' rather than retried — silence transcribes to nothing every time.
 */
async function attachTranscript({ store = mongoStore, shareId, text, status = 'ready' }) {
  const share = await store.findResponseById(shareId);
  if (!share) throw new Error('Response not found');
  const clean = String(text || '').trim().slice(0, TEXT_MAX);
  await store.attachTranscript(shareId, clean, clean ? status : 'failed');
  return { ok: true, status: clean ? status : 'failed' };
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
  const wordsById = await wordsByIdFor({ store, seed });

  return rows
    .filter(r => open || r.userId === viewerId)
    .map(r => toClientResponse(r, {
      attributed: true,
      isMine: r.userId === viewerId,
      viewerId,
      position: posFor.get(r.userId) || null,
      wordsById,
    }));
}

function toClientResponse(share, {
  attributed = true, isMine = false, viewerId = null, position = null, wordsById = null,
} = {}) {
  const out = {
    id: share.id,
    seedId: share.seedId,
    title: share.title || '',
    text: share.text || '',
    audio: share.audio || null,
    transcript: share.transcript && share.transcript.status !== 'skipped' ? share.transcript : null,
    words: wordsById
      ? (share.wordIds || []).map(id => wordsById.get(id)).filter(Boolean)
          .map(w => ({ id: w.id, label: w.label }))
      : [],
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

function computeAggregate({ seed, placements, responseCount, shares = [], words = [] }) {
  const cfg = seed.payload;
  const out = { responses: responseCount, computedAt: new Date() };
  if (cfg.shape === 'story') return out;

  // The portrait — words sized by count (§9). Only words somebody picked;
  // the full pickable list is the vocabulary, served separately.
  if (cfg.shape === 'words') {
    const counts = new Map();
    for (const s of shares) {
      for (const id of s.wordIds || []) counts.set(id, (counts.get(id) || 0) + 1);
    }
    out.words = words
      .filter(w => !w.hidden && counts.has(w.id))
      .map(w => ({ id: w.id, label: w.label, count: counts.get(w.id) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return out;
  }

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
  const [placements, rows, words] = await Promise.all([
    store.listPlacements(seed.id),
    store.listResponses(seed.id),
    seed.payload.shape === 'words' ? store.listWords(seed.id) : [],
  ]);
  return computeAggregate({ seed, placements, responseCount: rows.length, shares: rows, words });
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

    // { responses, myResponse, aggregate, vocabulary } — names distinct from
    // Threshold's extras, since both can flat-merge into the same snapshot.
    async snapshotExtras({ circle, seed, viewerId }) {
      const responses = await listResponses({ store, circle, seed, viewerId });
      const mine = responses.find(r => r.isMine) || null;
      const open = seed.payload.reveal === 'open' || seedDone(seed);
      return {
        responses,
        myResponse: mine,
        aggregate: open ? await aggregateFor({ store, seed }) : null,
        vocabulary: seed.payload.shape === 'words'
          ? await vocabularyFor({ store, circle, seed, viewerId })
          : null,
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
  attachTranscript,
  listResponses,
  vocabularyFor,
  aggregateFor,
  computeAggregate,
  createModule,
  mongoStore,
  setBlobMirror,
  setTranscriber,
  SHAPES,
};
