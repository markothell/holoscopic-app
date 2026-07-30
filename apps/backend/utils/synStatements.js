const crypto = require('crypto');
const SynStatement = require('../models/SynStatement');
const SynMembership = require('../models/SynMembership');
const Instance = require('../models/Instance');

// The write funnel for the synthesis mechanism: statements, the shared slot
// budget, and the threshold check that decides when a group has reached
// Synthesis. Store-injected like utils/synNodes.js and utils/synIdeas.js, so
// the two things most worth getting right — the budget boundary and the
// threshold arithmetic — are unit-testable with no MongoDB.
//
// THE LOOP. The Union (utils/synUnion.js) reads an idea's whole published
// corpus and says where the group stands. A collaborator edits that read into
// a claim they will stand behind and submits it. Everyone votes.
//
// SYNTHESIS IS A LIVING MEASURE, NOT A LATCH (D12, revised). It is not a
// statement winning — it is the GROUP finding shared understanding, and a group
// can find it, lose it, and find better. So nothing here is ever frozen:
// `synthesisState` is RECOMPUTED from the current votes on every read and every
// write. A group that has gathered behind one wording is *in synthesis*; if
// backing drains away, or new collaborators join and raise the bar, it simply
// is not any more, and the measure says so.
//
// This is what makes the third who never voted matter. They can read what the
// group settled on, disagree, put up better words, and pull the group somewhere
// else — no reopening ceremony, because nothing ever closed.
//
// THE BUDGET (D14) is the one rule that shapes behaviour here: each
// collaborator holds THREE slots per idea, and authoring a live statement and
// backing someone else's each consume one. Backing another member's wording
// therefore costs exactly what floating your own costs — which is the point,
// since it makes converging on shared language a real choice rather than a
// free one. Withdrawing a statement or removing a vote frees the slot.

const DEFAULT_SLOTS = 3;
const DEFAULT_THRESHOLD = 2 / 3;
const TEXT_MAX = 500;

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async getStatement(id) { return SynStatement.findOne({ id }); },
  async insertStatement(fields) { return SynStatement.create(fields); },
  async saveStatement(doc) { return doc.save(); },
  async listLive(instanceId) {
    return SynStatement.find({ instanceId, status: 'live' });
  },
  // Every statement this user is currently holding a slot on: authored-and-live,
  // or voted-for. One read serves the whole budget calculation.
  async listHeldBy(instanceId, userId) {
    return SynStatement.find({
      instanceId,
      status: 'live',
      $or: [{ authorId: userId }, { voterIds: userId }],
    });
  },
  async countCollaborators(instanceId) {
    return SynMembership.countDocuments({ instanceId });
  },
  async getInstance(instanceId) { return Instance.findOne({ id: instanceId }); },
  async saveInstance(doc) { return doc.save(); },
};

// ── Serializer ──────────────────────────────────────────────────────────────
// Never redacted — the group is pseudonymous and every statement is attributed
// by handle (D3).
function toClient(s, { userId } = {}) {
  return {
    id: s.id,
    instanceId: s.instanceId,
    authorId: s.authorId,
    authorHandle: s.authorHandle,
    text: s.text,
    sourceUnionId: s.sourceUnionId || null,
    status: s.status,
    voteCount: s.voteCount,
    votedByMe: userId ? (s.voterIds || []).includes(userId) : false,
    mine: userId ? s.authorId === userId : false,
    createdAt: s.createdAt,
  };
}

// ── Idea config helpers ─────────────────────────────────────────────────────
function slotsFor(instance) {
  return instance?.config?.synthesis?.statementSlots ?? DEFAULT_SLOTS;
}

function thresholdFor(instance) {
  return instance?.config?.synthesis?.synthesisThreshold ?? DEFAULT_THRESHOLD;
}

// How many collaborators must back a statement for the group to have reached
// Synthesis. Ceil, so ⅔ of 4 collaborators is 3 rather than 2.67 — the bar is
// never cleared by a fraction of a person.
function votesNeeded(collaboratorCount, threshold) {
  return Math.max(1, Math.ceil(collaboratorCount * threshold));
}

// ── The budget ──────────────────────────────────────────────────────────────
// Authored-and-live plus voted-for. A statement you wrote AND voted on counts
// once — the `$or` read returns one document, and one document is one slot.
async function slotsUsed({ store = mongoStore, instanceId, userId }) {
  const held = await store.listHeldBy(instanceId, userId);
  return (held || []).length;
}

async function assertHasSlot({ store, instanceId, userId, instance }) {
  const used = await slotsUsed({ store, instanceId, userId });
  const total = slotsFor(instance);
  if (used >= total) {
    throw new Error(`You are holding all ${total} of your statement slots`);
  }
}

// ── The Synthesis measure (D12, living) ─────────────────────────────────────

// Rank live statements: most-backed first, ties broken by the earlier
// submission. Pure, so the leaderboard and the measure agree by construction.
function rank(statements) {
  return [...(statements || [])].sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

// Where the group stands RIGHT NOW. Derived from current votes every time —
// never read from a stored flag, so it cannot drift from the votes it claims
// to summarize.
//
// `share` is the fraction of collaborators gathered behind the single
// best-backed wording. That is the measure the group is actually moving: not
// how one statement is doing, but how much of the group has found the same
// words. `inSynthesis` is simply that share standing at or above the bar.
async function synthesisState({ store = mongoStore, instanceId, statements, instance }) {
  const [live, collaborators, inst] = await Promise.all([
    statements ?? store.listLive(instanceId),
    store.countCollaborators(instanceId),
    instance ?? store.getInstance(instanceId),
  ]);

  const threshold = thresholdFor(inst);
  const needed = votesNeeded(collaborators, threshold);
  const ranked = rank(live);
  const leading = ranked[0] ?? null;
  const backing = leading?.voteCount ?? 0;

  // Everyone who has spent at least one slot — the other half of the story,
  // and the one that names the people who have yet to weigh in at all.
  const engaged = new Set();
  for (const s of live || []) {
    engaged.add(s.authorId);
    for (const v of s.voterIds || []) engaged.add(v);
  }

  return {
    collaboratorCount: collaborators,
    threshold,
    votesToReach: needed,
    leadingStatementId: leading?.id ?? null,
    backing,
    share: collaborators > 0 ? backing / collaborators : 0,
    inSynthesis: backing >= needed && backing > 0,
    stillToWeighIn: Math.max(0, collaborators - engaged.size),
  };
}

// Mirrors the CURRENT measure onto the idea's Instance so cheap reads
// (/me/ideas, the ideas list) don't each have to recompute it. This is a CACHE
// of a derived value, never the source of truth: synthesisState is. It moves in
// both directions — a group that drops back below the bar has the stamp
// cleared, because the alternative is an ideas list claiming a synthesis the
// votes no longer support.
async function syncSynthesisStamp({ store = mongoStore, instanceId, state, instance }) {
  const inst = instance ?? await store.getInstance(instanceId);
  if (!inst) return null;
  if (!inst.config) inst.config = {};
  if (!inst.config.synthesis) inst.config.synthesis = {};
  const syn = inst.config.synthesis;

  const nextId = state.inSynthesis ? state.leadingStatementId : null;
  const wasId = syn.synthesisStatementId ?? null;
  if (nextId === wasId) return { changed: false, entered: false, left: false };

  syn.synthesisStatementId = nextId;
  // Timestamp the START of the current run. Moving from one statement straight
  // to another is still one continuous run of the group being in synthesis, so
  // the clock only resets when the group was outside it.
  if (nextId && !wasId) syn.synthesisReachedAt = new Date();
  if (!nextId) syn.synthesisReachedAt = null;

  // config is a nested subdocument — Mongoose needs telling when a path inside
  // one is mutated in place rather than reassigned.
  if (typeof inst.markModified === 'function') inst.markModified('config.synthesis');
  await store.saveInstance(inst);

  return { changed: true, entered: !!nextId && !wasId, left: !nextId && !!wasId };
}

// ── Funnel ──────────────────────────────────────────────────────────────────

// Put a statement to the group. Costs one slot.
async function submitStatement({
  store = mongoStore, instanceId, userId, authorHandle, text, sourceUnionId = null,
}) {
  if (!instanceId) throw new Error('instanceId is required');
  if (!userId || !authorHandle) throw new Error('author is required');
  const clean = String(text || '').trim().slice(0, TEXT_MAX);
  if (!clean) throw new Error('A statement needs some text');

  const instance = await store.getInstance(instanceId);
  await assertHasSlot({ store, instanceId, userId, instance });

  return store.insertStatement({
    id: newId(),
    instanceId,
    authorId: userId,
    authorHandle,
    text: clean,
    sourceUnionId,
    status: 'live',
    voterIds: [],
    voteCount: 0,
  });
}

// Back a statement, or take that backing away. A toggle, like entries.js's
// voteEntry — and like it, voteCount is derived from voterIds, never tracked
// separately.
//
// Voting for your OWN statement is allowed and costs nothing extra: authoring
// it already spent the slot. That differs from entries.js (which blocks
// self-votes on a shared map) because here the author's support is the default
// reading of putting something forward, and a statement standing at zero while
// its author obviously backs it would misreport the group.
async function voteStatement({ store = mongoStore, instanceId, statementId, userId }) {
  const statement = await store.getStatement(statementId);
  if (!statement || statement.instanceId !== instanceId) throw new Error('Statement not found');
  if (statement.status === 'withdrawn') throw new Error('That statement was withdrawn');

  const voters = statement.voterIds || [];
  const already = voters.includes(userId);

  if (already) {
    statement.voterIds = voters.filter(v => v !== userId);
  } else {
    // Only a NEW vote costs a slot. Authoring already paid for the author's
    // own statement, so voting on it is free — the `$or` read counts the
    // document once either way.
    if (statement.authorId !== userId) {
      const instance = await store.getInstance(instanceId);
      await assertHasSlot({ store, instanceId, userId, instance });
    }
    statement.voterIds = [...voters, userId];
  }
  statement.voteCount = statement.voterIds.length;
  await store.saveStatement(statement);

  // Recompute from scratch — a vote can carry the group INTO synthesis or,
  // when it is withdrawn from the leading wording, back out of it.
  const state = await synthesisState({ store, instanceId });
  const stamp = await syncSynthesisStamp({ store, instanceId, state });

  return {
    statement,
    state,
    enteredSynthesis: !!stamp?.entered,
    leftSynthesis: !!stamp?.left,
  };
}

// Retire a statement, freeing every slot it held — its author's, and each
// voter's. Only the author can withdraw.
//
// Withdrawing the group's current synthesis is ALLOWED: they are your words,
// and the measure is living, so the group simply drops back below the bar and
// re-converges on something else. Freezing an author's own sentence in place
// because others agreed with it would make agreement a trap.
async function withdrawStatement({ store = mongoStore, instanceId, statementId, userId }) {
  const statement = await store.getStatement(statementId);
  if (!statement || statement.instanceId !== instanceId) throw new Error('Statement not found');
  if (statement.authorId !== userId) throw new Error('Only the author can withdraw a statement');

  statement.status = 'withdrawn';
  statement.voterIds = [];
  statement.voteCount = 0;
  await store.saveStatement(statement);

  const state = await synthesisState({ store, instanceId });
  const stamp = await syncSynthesisStamp({ store, instanceId, state });

  return { statement, state, leftSynthesis: !!stamp?.left };
}

// The voting surface: live statements most-backed first (ties to the earlier
// submission), wrapped in the group's current measure. Everything the UI needs
// to draw the meter and the budget comes back in one read.
async function leaderboard({ store = mongoStore, instanceId, userId }) {
  const [statements, instance] = await Promise.all([
    store.listLive(instanceId),
    store.getInstance(instanceId),
  ]);

  const state = await synthesisState({ store, instanceId, statements, instance });

  const ranked = rank(statements).map(s => ({
    ...toClient(s, { userId }),
    votesNeeded: Math.max(0, state.votesToReach - s.voteCount),
    // The share of the group gathered behind THIS wording — what the meter
    // fills to when this statement is the leading one.
    share: state.collaboratorCount > 0 ? s.voteCount / state.collaboratorCount : 0,
    isLeading: s.id === state.leadingStatementId,
    isSynthesis: state.inSynthesis && s.id === state.leadingStatementId,
  }));

  const used = userId ? await slotsUsed({ store, instanceId, userId }) : 0;

  return {
    ...state,
    statements: ranked,
    slotsUsed: used,
    slotsTotal: slotsFor(instance),
  };
}

module.exports = {
  submitStatement,
  voteStatement,
  withdrawStatement,
  leaderboard,
  slotsUsed,
  synthesisState,
  syncSynthesisStamp,
  // pure helpers (exported for tests and reuse)
  rank,
  votesNeeded,
  toClient,
  DEFAULT_SLOTS,
  DEFAULT_THRESHOLD,
  newId,
  mongoStore,
};
