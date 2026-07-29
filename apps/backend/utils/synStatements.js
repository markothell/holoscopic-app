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
// a claim they will stand behind and submits it. Everyone votes. At ⅔ (D12)
// the statement is marked `synthesized` and stamped onto the idea's Instance,
// and the group has reached Synthesis.
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
    return SynStatement.find({ instanceId, status: { $in: ['live', 'synthesized'] } });
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
    synthesizedAt: s.synthesizedAt || null,
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

// ── Reaching Synthesis (D12) ────────────────────────────────────────────────
// Runs after every vote. When a statement clears the bar it is marked
// `synthesized` and stamped onto the idea's Instance — the presence of
// `synthesisStatementId` IS the flag the rest of the app reads.
//
// First past the post wins: once an idea has reached Synthesis this is a no-op,
// so a later statement overtaking on votes does not silently reopen a settled
// question. Changing the group's mind is a deliberate act, not a side effect of
// someone else voting.
async function checkSynthesis({ store = mongoStore, instanceId, statement }) {
  const instance = await store.getInstance(instanceId);
  if (!instance) return null;
  if (instance.config?.synthesis?.synthesisStatementId) return null; // already settled

  const collaborators = await store.countCollaborators(instanceId);
  const needed = votesNeeded(collaborators, thresholdFor(instance));
  if (statement.voteCount < needed) return null;

  statement.status = 'synthesized';
  statement.synthesizedAt = new Date();
  await store.saveStatement(statement);

  if (!instance.config) instance.config = {};
  if (!instance.config.synthesis) instance.config.synthesis = {};
  instance.config.synthesis.synthesisStatementId = statement.id;
  instance.config.synthesis.synthesisReachedAt = statement.synthesizedAt;
  // config is a nested subdocument — Mongoose needs telling when a path inside
  // one is mutated in place rather than reassigned.
  if (typeof instance.markModified === 'function') instance.markModified('config.synthesis');
  await store.saveInstance(instance);

  return statement;
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
    synthesizedAt: null,
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

  if (!already) {
    const reached = await checkSynthesis({ store, instanceId, statement });
    if (reached) return { statement: reached, reachedSynthesis: true };
  }
  return { statement, reachedSynthesis: false };
}

// Retire a statement, freeing every slot it held — its author's, and each
// voter's. Only the author can withdraw, and a statement the group has already
// reached Synthesis on stays put.
async function withdrawStatement({ store = mongoStore, instanceId, statementId, userId }) {
  const statement = await store.getStatement(statementId);
  if (!statement || statement.instanceId !== instanceId) throw new Error('Statement not found');
  if (statement.authorId !== userId) throw new Error('Only the author can withdraw a statement');
  if (statement.status === 'synthesized') throw new Error('The group has reached Synthesis on that statement');

  statement.status = 'withdrawn';
  statement.voterIds = [];
  statement.voteCount = 0;
  await store.saveStatement(statement);
  return statement;
}

// The leaderboard: live statements most-backed first, ties broken by the
// earlier submission — the same rule that decides a race to the bar. A
// synthesized statement sorts to the very top regardless of count.
async function leaderboard({ store = mongoStore, instanceId, userId }) {
  const [statements, collaborators, instance] = await Promise.all([
    store.listLive(instanceId),
    store.countCollaborators(instanceId),
    store.getInstance(instanceId),
  ]);

  const threshold = thresholdFor(instance);
  const needed = votesNeeded(collaborators, threshold);

  const ranked = [...(statements || [])]
    .sort((a, b) => {
      if (a.status === 'synthesized' && b.status !== 'synthesized') return -1;
      if (b.status === 'synthesized' && a.status !== 'synthesized') return 1;
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      return new Date(a.createdAt) - new Date(b.createdAt);
    })
    .map(s => ({
      ...toClient(s, { userId }),
      votesNeeded: Math.max(0, needed - s.voteCount),
    }));

  const used = userId ? await slotsUsed({ store, instanceId, userId }) : 0;

  return {
    statements: ranked,
    collaboratorCount: collaborators,
    threshold,
    votesToReach: needed,
    slotsUsed: used,
    slotsTotal: slotsFor(instance),
    synthesisStatementId: instance?.config?.synthesis?.synthesisStatementId ?? null,
  };
}

module.exports = {
  submitStatement,
  voteStatement,
  withdrawStatement,
  leaderboard,
  slotsUsed,
  checkSynthesis,
  // pure helpers (exported for tests and reuse)
  votesNeeded,
  toClient,
  DEFAULT_SLOTS,
  DEFAULT_THRESHOLD,
  newId,
  mongoStore,
};
