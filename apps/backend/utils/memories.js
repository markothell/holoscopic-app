const crypto = require('crypto');
const Memory = require('../models/Memory');
const MemoryTag = require('../models/MemoryTag');
const Instance = require('../models/Instance');

// The single write funnel for Chorus (apps/chorus) — memories about one
// person, and the two tag vocabularies they're described with. routes/
// memorial.js is a thin wrapper over this file: request shaping, ownership
// checks, and error-status mapping, and nothing else.
//
// Everything risky lives here, in one place:
//   • `allTags` is ALWAYS the union of the three slot arrays. Nothing else may
//     write it — the wall's tag filter is a multikey index on it, so a stale
//     union means memories silently vanish from filters.
//   • Tag minting is dedupe-on-normalized-key, so "In Over My Head" and "in
//     over my head" are one tag. That's what makes the tag portrait (size ∝
//     useCount) meaningful instead of a pile of near-duplicates.
//   • `useCount` moves only through here, by DISTINCT tag per memory — a tag
//     used in both the "they were" and "I was" slots counts once.
//   • `threadId` defaults to a new memory's own id; "add to this memory"
//     inherits the target's. See PLAN §3.3 for why flat beats a link array.
//   • An audio URL must live on an allowlisted Blob host. Without this a
//     client could point a memory at arbitrary remote audio and we'd serve it
//     from a memorial page.
//   • `contributorId` and `ipHash` never leave the server — toClient() is the
//     only projection callers may use.
//
// Store-injection, same as utils/synNodes.js and utils/synIdeas.js:
// every function takes `store` defaulting to `mongoStore`, so memories.test.js
// exercises the REAL logic against in-memory fakes with no MongoDB, no Vercel
// Blob, and no Deepgram. Keep that property when adding functions here.

const TITLE_MAX = 80;
const NAME_MAX = 60;
const TEXT_MAX = 5000;
const TAG_LABEL_MAX = 24;
const TAGS_PER_SLOT_MAX = 5;
const NEW_TAGS_PER_SLOT_MAX = 2;   // how many tags one submission may coin
const WALL_PAGE_DEFAULT = 20;
const WALL_PAGE_MAX = 50;
// How long a contributor may edit their own memory. Their claim rests on a
// localStorage token, so this is a convenience window, not a security boundary.
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Vercel Blob's public host. Overridable so a self-hosted or test deployment
// can point elsewhere; never widen this to allow arbitrary hosts.
const BLOB_HOST_SUFFIX = process.env.BLOB_HOST_SUFFIX || '.public.blob.vercel-storage.com';

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

// ── Transcription hook ──────────────────────────────────────────────────────
// Injected in production by websocket-server.js, exactly like Synthesis's
// setIndex(). Default is a no-op so unit tests and any environment without
// Deepgram behave identically — and so this file never imports the HTTP client.
let transcriber = null;

function setTranscriber(fn) {
  transcriber = fn;
}

// Deliberately NOT awaited and NOT caught by callers. A transcript is a
// nice-to-have; a memory is not. If this throws, it must not reach the person
// who just pressed Share.
// The transcriber takes NAMED arguments — `{ memory }`, not the memory doc
// positionally. Passing it positionally makes `memory` undefined inside
// requestTranscript, which then reads no audio URL and returns 'no-audio'
// without a word: recorded memories simply never get transcribed, and nothing
// anywhere reports a problem. Keep this call shape and the seam test in
// memorialTranscribe.test.js that pins it.
function fireTranscription(memory) {
  if (!transcriber || !memory?.body?.audio?.url) return;
  Promise.resolve()
    .then(() => transcriber({ memory }))
    .catch(err => console.error('[memories] transcription hook failed:', err.message));
}

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async getInstance(instanceId) { return Instance.findOne({ id: instanceId }); },

  async listTags(instanceId) {
    return MemoryTag.find({ instanceId }).sort({ useCount: -1, label: 1 }).lean();
  },
  async findTagByKey(instanceId, set, key) {
    return MemoryTag.findOne({ instanceId, set, key }).lean();
  },
  async createTag(fields) {
    const doc = await MemoryTag.create(fields);
    return doc.toObject();
  },
  async bumpTagUse(instanceId, tagIds, delta) {
    if (!tagIds.length) return;
    await MemoryTag.updateMany(
      { instanceId, id: { $in: tagIds } },
      { $inc: { useCount: delta } },
    );
  },
  async setTagHidden(instanceId, tagId, hidden) {
    return MemoryTag.findOneAndUpdate({ instanceId, id: tagId }, { hidden }, { new: true }).lean();
  },

  async createMemory(fields) {
    const doc = await Memory.create(fields);
    return doc.toObject();
  },
  async findMemory(instanceId, id) {
    return Memory.findOne({ instanceId, id }).lean();
  },
  async updateMemory(instanceId, id, patch) {
    return Memory.findOneAndUpdate(
      { instanceId, id },
      { ...patch, updatedAt: new Date() },
      { new: true },
    ).lean();
  },
  async listMemories(instanceId, { tagIds, cursor, limit, statuses, sort }) {
    const query = { instanceId, status: { $in: statuses } };
    if (tagIds && tagIds.length) query.allTags = { $all: tagIds };
    // Keyset, built from whichever ordering is active. Paging on a non-unique
    // key alone silently DROPS a row whenever two compare equal and the page
    // boundary falls between them — every sort spec therefore ends in `id`.
    if (cursor) Object.assign(query, keysetFilter(sort, cursor));
    return Memory.find(query).sort(mongoSort(sort)).limit(limit).lean();
  },
  async listThread(instanceId, threadId, statuses) {
    return Memory.find({ instanceId, threadId, status: { $in: statuses } })
      .sort({ createdAt: 1 }).lean();
  },
  async countThreadSiblings(instanceId, threadIds, statuses) {
    if (!threadIds.length) return [];
    return Memory.aggregate([
      { $match: { instanceId, threadId: { $in: threadIds }, status: { $in: statuses } } },
      { $group: { _id: '$threadId', count: { $sum: 1 } } },
    ]);
  },
  async countMemories(instanceId, { tagIds, statuses }) {
    const query = { instanceId, status: { $in: statuses } };
    if (tagIds && tagIds.length) query.allTags = { $all: tagIds };
    return Memory.countDocuments(query);
  },
  async findManyByIds(instanceId, ids) {
    if (!ids.length) return [];
    return Memory.find({ instanceId, id: { $in: ids } })
      .select('id title sharerName').lean();
  },
};

// ── Normalization + validation ──────────────────────────────────────────────

// The dedupe axis for tags. Case-folded, whitespace-collapsed, punctuation
// left alone (an apostrophe in "grandma's kitchen" is meaningful).
function normalizeTagKey(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanLabel(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, TAG_LABEL_MAX);
}

// Audio may only ever be served from Blob storage we control. A memory row is
// rendered on a public memorial page — an unchecked URL here is a stored
// content-injection vector, not merely a broken player.
function assertAllowedAudioUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error('Invalid audio URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('Audio URL must be https');
  if (!parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) {
    throw new Error('Audio URL must be on the configured blob host');
  }
  return parsed.toString();
}

// Normalizes the submitted body into the stored shape and decides `kind`.
// A memory with neither text nor audio is meaningless and is rejected here
// rather than at the route, so every write path gets the same rule.
function normalizeBody(raw = {}) {
  const text = String(raw.text || '').trim().slice(0, TEXT_MAX);
  const rawAudio = raw.audio || {};
  const hasAudio = Boolean(rawAudio.url);

  if (!text && !hasAudio) throw new Error('A memory needs a story — typed or recorded');

  const body = {
    kind: text && hasAudio ? 'both' : (hasAudio ? 'audio' : 'text'),
    text,
    audio: {},
  };

  if (hasAudio) {
    body.audio = {
      url: assertAllowedAudioUrl(rawAudio.url),
      pathname: String(rawAudio.pathname || ''),
      mimeType: String(rawAudio.mimeType || ''),
      sizeBytes: Number(rawAudio.sizeBytes) || 0,
      // Client-measured on purpose — iOS mp4 often has no duration metadata.
      durationMs: Number(rawAudio.durationMs) || 0,
      peaks: Array.isArray(rawAudio.peaks)
        ? rawAudio.peaks.slice(0, 128).map(n => Number(n) || 0)
        : [],
      transcript: { text: '', status: 'skipped', provider: '', updatedAt: null },
    };
  }
  return body;
}

// ── Tags ────────────────────────────────────────────────────────────────────

// Materialize the curator's seed lists from Instance.config.memorial into
// MemoryTag docs. Idempotent — safe to call on every config read, which is how
// a curator adding a seed tag in the platform admin makes it appear in the
// picker without a deploy.
async function syncSeedTags({ store = mongoStore, instanceId, config }) {
  const pairs = [
    ['role', config?.seedRoleTags || []],
    ['experience', config?.seedExperienceTags || []],
  ];
  const created = [];
  for (const [set, labels] of pairs) {
    for (const raw of labels) {
      const label = cleanLabel(raw);
      if (!label) continue;
      const key = normalizeTagKey(label);
      const existing = await store.findTagByKey(instanceId, set, key);
      if (existing) continue;
      created.push(await store.createTag({
        id: newId(), instanceId, set, label, key, origin: 'seeded', useCount: 0, hidden: false,
        createdAt: new Date(),
      }));
    }
  }
  return created;
}

// Turn submitted labels into tag ids, minting contributed tags as needed.
//
// Clients send LABELS, never ids, for the three prompt slots. That makes a
// custom tag and a picked tag the exact same code path — the difference is
// only whether the key already exists — which is why "add your own" can live
// inside the same search field as the picker with no extra plumbing.
//
// `cache` MUST be shared across the slots of a single submission, and slots
// MUST be resolved sequentially. The subject and self slots draw from the same
// `role` vocabulary, so "she was stubborn and I was stubborn" resolves the
// same key twice: run concurrently, both lookups miss, both mint, and the
// unique index on {instanceId,set,key} rejects the second write — a 500 on a
// perfectly good memory. See resolveSlots().
async function resolveTagLabels({ store = mongoStore, instanceId, set, labels, allowCustom = true, cache = new Map() }) {
  const seen = new Set();
  const cleaned = [];
  for (const raw of labels || []) {
    const label = cleanLabel(raw);
    if (!label) continue;
    const key = normalizeTagKey(label);
    if (seen.has(key)) continue;      // same tag twice in one slot
    seen.add(key);
    cleaned.push({ label, key });
    if (cleaned.length >= TAGS_PER_SLOT_MAX) break;
  }

  const ids = [];
  let minted = 0;
  for (const { label, key } of cleaned) {
    const cacheKey = `${set} ${key}`;
    if (cache.has(cacheKey)) {
      ids.push(cache.get(cacheKey));
      continue;
    }
    const existing = await store.findTagByKey(instanceId, set, key);
    if (existing) {
      cache.set(cacheKey, existing.id);
      ids.push(existing.id);
      continue;
    }
    if (!allowCustom) continue;       // curator locked the vocabulary
    if (minted >= NEW_TAGS_PER_SLOT_MAX) continue;
    minted += 1;
    const doc = await store.createTag({
      id: newId(), instanceId, set, label, key, origin: 'contributed', useCount: 0, hidden: false,
      createdAt: new Date(),
    });
    cache.set(cacheKey, doc.id);
    ids.push(doc.id);
  }
  return ids;
}

// Resolve all three prompt slots for one submission. Sequential and
// cache-sharing on purpose — see the note on resolveTagLabels. `undefined`
// labels mean "leave this slot alone" (the edit path); an empty array means
// "clear it".
async function resolveSlots({ store = mongoStore, instanceId, allowCustom, slots }) {
  const cache = new Map();
  const out = {};
  for (const [name, { set, labels, current }] of Object.entries(slots)) {
    out[name] = labels === undefined
      ? (current || [])
      : await resolveTagLabels({ store, instanceId, set, labels, allowCustom, cache });
  }
  return out;
}

async function listTags({ store = mongoStore, instanceId, includeHidden = false }) {
  const tags = await store.listTags(instanceId);
  const visible = includeHidden ? tags : tags.filter(t => !t.hidden);
  return {
    role: visible.filter(t => t.set === 'role').map(toClientTag),
    experience: visible.filter(t => t.set === 'experience').map(toClientTag),
  };
}

async function setTagHidden({ store = mongoStore, instanceId, tagId, hidden }) {
  return store.setTagHidden(instanceId, tagId, Boolean(hidden));
}

// ── Serializers ─────────────────────────────────────────────────────────────

function toClientTag(tag) {
  return { id: tag.id, set: tag.set, label: tag.label, useCount: tag.useCount || 0, origin: tag.origin };
}

// The ONLY client-facing projection of a memory. `contributorId`, `ipHash`,
// and `flaggerIds` are private to the server and must never appear in a
// response — the first is a device fingerprint, the second identifies a
// household, and the third would expose who reported whom.
//
// `tagMap` (id -> tag doc) resolves labels for display; unknown or hidden ids
// simply drop out, which is what makes retiring a tag safe for existing
// memories.
function toClient(memory, { tagMap = new Map(), contributorId = null, threadCount = 0, replyTo = null } = {}) {
  const labelsFor = (ids) => (ids || [])
    .map(id => tagMap.get(id))
    .filter(t => t && !t.hidden)
    .map(toClientTag);

  const audio = memory.body?.audio;
  return {
    id: memory.id,
    title: memory.title,
    sharerName: memory.sharerName || '',
    anonymous: !memory.sharerName,
    subjectTags: labelsFor(memory.subjectTags),
    selfTags: labelsFor(memory.selfTags),
    experienceTags: labelsFor(memory.experienceTags),
    body: {
      kind: memory.body?.kind || 'text',
      text: memory.body?.text || '',
      audio: audio && audio.url ? {
        url: audio.url,
        mimeType: audio.mimeType,
        durationMs: audio.durationMs,
        peaks: audio.peaks || [],
        transcript: {
          text: audio.transcript?.text || '',
          status: audio.transcript?.status || 'skipped',
        },
      } : null,
    },
    threadId: memory.threadId,
    replyToId: memory.replyToId || null,
    // Enough of the parent to say "Added to <title>" without a second fetch.
    // Without it the wall renders an addition as if it were an independent
    // memory — and since "add to this memory" prefills the parent's title,
    // that reads as the same story posted twice.
    replyTo: replyTo ? {
      id: replyTo.id,
      title: replyTo.title,
      sharerName: replyTo.sharerName || '',
      anonymous: !replyTo.sharerName,
    } : null,
    threadCount,
    status: memory.status,
    flagCount: memory.flagCount || 0,
    // Lets the client offer Edit/Delete without ever learning who owns what.
    isMine: Boolean(contributorId && memory.contributorId === contributorId),
    createdAt: memory.createdAt,
  };
}

async function tagMapFor({ store = mongoStore, instanceId }) {
  const tags = await store.listTags(instanceId);
  return new Map(tags.map(t => [t.id, t]));
}

// ── Threads ─────────────────────────────────────────────────────────────────

// Recount a thread's LIVE members and stamp the number onto every member,
// including the hidden ones so unhiding restores a correct value.
//
// Must run after ANY change to a thread's live membership: a new addition, a
// curator hiding or unhiding, a sharer withdrawing. Miss one and the "most
// connected" sort quietly orders the wall by a number that used to be true.
async function syncThreadCount({ store = mongoStore, instanceId, threadId }) {
  if (!threadId) return 0;
  const members = await store.listThread(instanceId, threadId, ['live', 'hidden', 'removed']);
  const liveCount = members.filter(m => m.status === 'live').length;
  await Promise.all(members.map(m => store.updateMemory(instanceId, m.id, { threadCount: liveCount })));
  return liveCount;
}

// ── Memories ────────────────────────────────────────────────────────────────

// Create a memory. `replyToId` is the "add to this memory" gesture: the new
// memory joins the target's thread (never the target's own id — threads are
// flat, so adding to a reply puts you in the same cluster, not a sub-branch).
async function createMemory({
  store = mongoStore,
  instanceId,
  contributorId,
  title,
  sharerName,
  subjectTagLabels = [],
  selfTagLabels = [],
  experienceTagLabels = [],
  body: rawBody,
  replyToId = null,
  ipHash = '',
  config = null,
}) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!contributorId) throw new Error('contributorId is required');

  const cleanTitle = String(title || '').trim().slice(0, TITLE_MAX);
  if (!cleanTitle) throw new Error('Give the memory a short name');

  const body = normalizeBody(rawBody);
  const allowCustom = config?.allowCustomTags !== false;

  const { subjectTags, selfTags, experienceTags } = await resolveSlots({
    store, instanceId, allowCustom,
    slots: {
      subjectTags:    { set: 'role',       labels: subjectTagLabels },
      selfTags:       { set: 'role',       labels: selfTagLabels },
      experienceTags: { set: 'experience', labels: experienceTagLabels },
    },
  });

  // Distinct union — a tag chosen in both role slots is one use, not two.
  const allTags = [...new Set([...subjectTags, ...selfTags, ...experienceTags])];

  let threadId = null;
  if (replyToId) {
    const target = await store.findMemory(instanceId, replyToId);
    if (!target) throw new Error('That memory no longer exists');
    threadId = target.threadId;
  }

  const id = newId();
  const memory = await store.createMemory({
    id,
    instanceId,
    title: cleanTitle,
    sharerName: String(sharerName || '').trim().slice(0, NAME_MAX),
    contributorId,
    subjectTags, selfTags, experienceTags, allTags,
    body,
    threadId: threadId || id,          // standalone memories head their own thread
    replyToId: replyToId || null,
    status: 'live',                     // D3: live on submit, curator removes
    flagCount: 0, flaggerIds: [],
    ipHash,
    createdAt: new Date(), updatedAt: new Date(),
  });

  await store.bumpTagUse(instanceId, allTags, 1);
  // Stamps the new size onto every member of the thread, this memory included.
  const liveCount = await syncThreadCount({ store, instanceId, threadId: memory.threadId });
  memory.threadCount = liveCount;
  fireTranscription(memory);
  return memory;
}

// Edit your own memory. Tags are re-resolved wholesale and useCount is moved
// by the DELTA — tags dropped in the edit lose a use, tags added gain one, and
// tags kept are untouched. Getting this wrong skews the tag portrait
// permanently, since nothing ever recomputes counts from scratch.
async function editMemory({
  store = mongoStore,
  instanceId,
  id,
  contributorId,
  title,
  sharerName,
  subjectTagLabels,
  selfTagLabels,
  experienceTagLabels,
  body: rawBody,
  config = null,
  now = Date.now(),
}) {
  const memory = await store.findMemory(instanceId, id);
  if (!memory) throw new Error('Memory not found');
  if (memory.contributorId !== contributorId) throw new Error('Not yours to edit');
  if (now - new Date(memory.createdAt).getTime() > EDIT_WINDOW_MS) {
    throw new Error('This memory can no longer be edited');
  }

  const patch = {};
  if (title !== undefined) {
    const cleanTitle = String(title).trim().slice(0, TITLE_MAX);
    if (!cleanTitle) throw new Error('Give the memory a short name');
    patch.title = cleanTitle;
  }
  if (sharerName !== undefined) patch.sharerName = String(sharerName || '').trim().slice(0, NAME_MAX);
  if (rawBody !== undefined) patch.body = normalizeBody(rawBody);

  const touchesTags = subjectTagLabels !== undefined
    || selfTagLabels !== undefined
    || experienceTagLabels !== undefined;

  let added = [];
  let removed = [];
  if (touchesTags) {
    const allowCustom = config?.allowCustomTags !== false;
    const { subjectTags, selfTags, experienceTags } = await resolveSlots({
      store, instanceId, allowCustom,
      slots: {
        subjectTags:    { set: 'role',       labels: subjectTagLabels,    current: memory.subjectTags },
        selfTags:       { set: 'role',       labels: selfTagLabels,       current: memory.selfTags },
        experienceTags: { set: 'experience', labels: experienceTagLabels, current: memory.experienceTags },
      },
    });
    const allTags = [...new Set([...subjectTags, ...selfTags, ...experienceTags])];
    const before = new Set(memory.allTags || []);
    const after = new Set(allTags);
    added = [...after].filter(t => !before.has(t));
    removed = [...before].filter(t => !after.has(t));

    Object.assign(patch, { subjectTags, selfTags, experienceTags, allTags });
  }

  const updated = await store.updateMemory(instanceId, id, patch);
  if (added.length) await store.bumpTagUse(instanceId, added, 1);
  if (removed.length) await store.bumpTagUse(instanceId, removed, -1);
  return updated;
}

// A contributor removing their own memory. Soft — the document survives so the
// thread it sits in keeps its shape, and so a mis-tap is recoverable.
async function deleteOwnMemory({ store = mongoStore, instanceId, id, contributorId }) {
  const memory = await store.findMemory(instanceId, id);
  if (!memory) throw new Error('Memory not found');
  if (memory.contributorId !== contributorId) throw new Error('Not yours to delete');
  if (memory.status !== 'live') return memory;
  await store.bumpTagUse(instanceId, memory.allTags || [], -1);
  const updated = await store.updateMemory(instanceId, id, {
    status: 'removed', hiddenReason: 'withdrawn by sharer',
  });
  await syncThreadCount({ store, instanceId, threadId: memory.threadId });
  return updated;
}

// Curator moderation. Hiding pulls a memory off the wall and out of the tag
// counts; unhiding restores both. Idempotent in each direction so a
// double-tapped button can't double-count.
async function setMemoryStatus({ store = mongoStore, instanceId, id, status, reason = '' }) {
  const memory = await store.findMemory(instanceId, id);
  if (!memory) throw new Error('Memory not found');
  if (memory.status === status) return memory;

  const wasCounted = memory.status === 'live';
  const willCount = status === 'live';
  if (wasCounted && !willCount) await store.bumpTagUse(instanceId, memory.allTags || [], -1);
  if (!wasCounted && willCount) await store.bumpTagUse(instanceId, memory.allTags || [], 1);

  const updated = await store.updateMemory(instanceId, id, { status, hiddenReason: reason });
  // Hiding or restoring changes how many LIVE memories the thread has, so the
  // whole thread's stored count has to move with it.
  await syncThreadCount({ store, instanceId, threadId: memory.threadId });
  return updated;
}

// A visitor report. Deliberately does NOT auto-hide at any threshold — it only
// sorts the curator queue. On a memorial, coordinated flagging is a likelier
// failure than unmoderated content.
async function flagMemory({ store = mongoStore, instanceId, id, contributorId }) {
  const memory = await store.findMemory(instanceId, id);
  if (!memory) throw new Error('Memory not found');
  const flaggers = memory.flaggerIds || [];
  if (contributorId && flaggers.includes(contributorId)) return memory;
  return store.updateMemory(instanceId, id, {
    flaggerIds: [...flaggers, contributorId].filter(Boolean),
    flagCount: (memory.flagCount || 0) + 1,
  });
}

// Attach transcripts asynchronously (Deepgram callback). Never throws on a
// missing memory — a late callback for a deleted memory is normal, not an
// error worth surfacing.
async function attachTranscript({ store = mongoStore, instanceId, id, text, status = 'ready', provider = 'deepgram' }) {
  const memory = await store.findMemory(instanceId, id);
  if (!memory || !memory.body?.audio?.url) return null;
  return store.updateMemory(instanceId, id, {
    'body.audio.transcript': {
      text: String(text || ''),
      status,
      provider,
      updatedAt: new Date(),
    },
  });
}

// ── Read paths ──────────────────────────────────────────────────────────────

// ── Sorting ─────────────────────────────────────────────────────────────────
//
// Three orderings, each a full keyset spec rather than a bare sort. Every key
// list ends in `id` so the ordering is total: without a unique tiebreaker two
// rows can compare equal, and a page boundary falling between them drops one
// silently. That bug is invisible until a memory nobody can find turns out to
// exist in the database.
//
// `connected` sorts on the denormalized threadCount, which is why that field is
// maintained on every member of a thread — a per-request aggregate could not be
// paginated this way.
const SORTS = {
  newest:    { keys: ['createdAt', 'id'], dirs: [-1, -1] },
  oldest:    { keys: ['createdAt', 'id'], dirs: [1, 1] },
  connected: { keys: ['threadCount', 'createdAt', 'id'], dirs: [-1, -1, -1] },
};

const DEFAULT_SORT = 'newest';

function sortSpec(name) {
  return SORTS[name] ? name : DEFAULT_SORT;
}

function mongoSort(name) {
  const { keys, dirs } = SORTS[sortSpec(name)];
  return Object.fromEntries(keys.map((k, i) => [k, dirs[i]]));
}

// The generic "everything strictly after this row in the current ordering"
// predicate: for each key, all earlier keys equal and this one past the cursor.
function keysetFilter(name, cursor) {
  const { keys, dirs } = SORTS[sortSpec(name)];
  const or = [];
  for (let i = 0; i < keys.length; i++) {
    const clause = {};
    for (let j = 0; j < i; j++) clause[keys[j]] = cursor[keys[j]];
    clause[keys[i]] = dirs[i] < 0 ? { $lt: cursor[keys[i]] } : { $gt: cursor[keys[i]] };
    or.push(clause);
  }
  return { $or: or };
}

// Opaque cursor: the sort's key values joined by "|", prefixed with the sort
// name. Carrying the sort means a cursor minted under one ordering can't be
// replayed against another and quietly return nonsense.
function encodeCursor(name, memory) {
  const { keys } = SORTS[sortSpec(name)];
  const parts = keys.map(k => (k === 'createdAt'
    ? new Date(memory.createdAt).toISOString()
    : String(memory[k] ?? '')));
  return [sortSpec(name), ...parts].join('|');
}

function decodeCursor(name, raw) {
  if (!raw) return null;
  const parts = String(raw).split('|');
  const [cursorSort, ...values] = parts;
  const spec = SORTS[sortSpec(name)];
  // A junk or mismatched cursor is ignored rather than errored: the reader just
  // gets page one, which is a far better outcome than a broken wall.
  if (cursorSort !== sortSpec(name) || values.length !== spec.keys.length) return null;

  const cursor = {};
  for (let i = 0; i < spec.keys.length; i++) {
    const key = spec.keys[i];
    if (key === 'createdAt') {
      const date = new Date(values[i]);
      if (Number.isNaN(date.getTime())) return null;
      cursor[key] = date;
    } else if (key === 'threadCount') {
      const n = Number(values[i]);
      if (!Number.isFinite(n)) return null;
      cursor[key] = n;
    } else {
      if (!values[i]) return null;
      cursor[key] = values[i];
    }
  }
  return cursor;
}

// The wall. Keyset-paginated (not skip/limit — a wall that grows while you
// scroll would repeat rows under an offset). `tagIds` narrows by AND across
// all three slots at once via the denormalized allTags index.
async function listWall({
  store = mongoStore,
  instanceId,
  tagIds = [],
  cursor = null,
  limit = WALL_PAGE_DEFAULT,
  contributorId = null,
  includeHidden = false,
  sort = DEFAULT_SORT,
}) {
  const order = sortSpec(sort);
  const statuses = includeHidden ? ['live', 'hidden'] : ['live'];
  const size = Math.min(Math.max(Number(limit) || WALL_PAGE_DEFAULT, 1), WALL_PAGE_MAX);
  const rows = await store.listMemories(instanceId, {
    tagIds: tagIds.filter(Boolean),
    cursor: decodeCursor(order, cursor),
    limit: size + 1,               // one extra row tells us if there's more
    statuses,
    sort: order,
  });

  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;
  const tagMap = await tagMapFor({ store, instanceId });

  // Parent titles in one query rather than per row. Thread sizes are read off
  // the row itself — see Memory.threadCount.
  const parentIds = [...new Set(page.map(m => m.replyToId).filter(Boolean))];
  const [parents, total] = await Promise.all([
    store.findManyByIds(instanceId, parentIds),
    store.countMemories(instanceId, { tagIds: tagIds.filter(Boolean), statuses }),
  ]);
  const parentBy = new Map(parents.map(p => [p.id, p]));

  return {
    memories: page.map(m => toClient(m, {
      tagMap,
      contributorId,
      threadCount: m.threadCount || 1,
      replyTo: m.replyToId ? parentBy.get(m.replyToId) || null : null,
    })),
    nextCursor: hasMore ? encodeCursor(order, page[page.length - 1]) : null,
    sort: order,
    // The real number, not the page size — a memorial's memory count is a
    // figure people read and repeat, so it must not change with pagination.
    total,
  };
}

// A single memory plus everything linked to it. "Linked memories appear
// whenever one of them is selected" is literally this query — opening any
// member of a thread shows the whole cluster, with the requested memory first.
async function getMemoryWithThread({
  store = mongoStore,
  instanceId,
  id,
  contributorId = null,
  includeHidden = false,
}) {
  const statuses = includeHidden ? ['live', 'hidden'] : ['live'];
  const memory = await store.findMemory(instanceId, id);
  if (!memory || !statuses.includes(memory.status)) return null;

  const thread = await store.listThread(instanceId, memory.threadId, statuses);
  const tagMap = await tagMapFor({ store, instanceId });
  const opts = { tagMap, contributorId, threadCount: thread.length };

  // Every memory in a thread was added to another memory in that same thread,
  // so the parent is already in hand — resolving replyTo here costs nothing.
  const byId = new Map(thread.map(m => [m.id, m]));
  const withParent = (m) => toClient(m, {
    ...opts,
    replyTo: m.replyToId ? byId.get(m.replyToId) || null : null,
  });

  return {
    memory: withParent(memory),
    thread: thread.filter(m => m.id !== memory.id).map(withParent),
  };
}

module.exports = {
  setTranscriber,
  syncThreadCount,
  SORTS,
  DEFAULT_SORT,
  sortSpec,
  createMemory,
  editMemory,
  deleteOwnMemory,
  setMemoryStatus,
  flagMemory,
  attachTranscript,
  listWall,
  getMemoryWithThread,
  listTags,
  setTagHidden,
  syncSeedTags,
  resolveTagLabels,
  normalizeTagKey,
  assertAllowedAudioUrl,
  normalizeBody,
  toClient,
  toClientTag,
  mongoStore,
  EDIT_WINDOW_MS,
  TAGS_PER_SLOT_MAX,
  NEW_TAGS_PER_SLOT_MAX,
};
