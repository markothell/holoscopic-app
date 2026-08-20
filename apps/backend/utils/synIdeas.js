const crypto = require('crypto');
const Instance = require('../models/Instance');
const SynMembership = require('../models/SynMembership');

// The write funnel for Synthesis idea + membership plumbing: drafting an idea
// (a child Instance of the lazily-created `synthesis` parent — mirrors
// utils/oasGames.js#createRoomInstance), and joining one (the ≤50-collaborator
// gate, plan §8). Mirrors the store-injection
// pattern in utils/synNodes.js so the risky bits — the member cap, code
// uniqueness, and the public/private join rule — are unit-testable without a
// live MongoDB. Production always uses `mongoStore`; routes/synthesis.js never
// touches Instance/SynMembership directly for these operations.
//
// AN IDEA IS THE UNIT HERE, and it is defined by its thought space rather than
// by its membership: a title, the map that grows under it, and eventually a
// statement the group reaches Synthesis on. It is deliberately NOT its own
// model — it IS an Instance (parentInstanceId -> the `synthesis` parent), so it
// inherits multi-tenant scoping for free: every SynNode/SynFrame write
// elsewhere just reads req.instanceId. This file owns instance *creation*,
// *membership*, and the roster/browse reads over them.

const MEMBER_CAP = 50;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1, mirrors OaS
const PARENT_SLUG = 'synthesis';
// An idea's Instance slug is `idea-<code>`. Derive the code back out via
// SLUG_PREFIX.length rather than a literal offset — the old `uni-` prefix was
// four characters and a hardcoded slice(4) silently truncated the code the
// day the prefix changed length.
const SLUG_PREFIX = 'idea-';
const HANDLE_MAX = 40;
const TITLE_MAX = 80;
// Mirrors the schema defaults in models/Instance.js (config.synthesis) so a
// serializer can fill them in for an instance written before the block existed.
const DEFAULT_THRESHOLD = 2 / 3;
const DEFAULT_SLOTS = 3;

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function slugFor(code) {
  return `${SLUG_PREFIX}${String(code).toLowerCase()}`;
}

// The shareable code carried by an idea's slug, or the slug itself if it
// somehow lacks the prefix.
function codeFor(slug) {
  return String(slug).startsWith(SLUG_PREFIX)
    ? String(slug).slice(SLUG_PREFIX.length).toUpperCase()
    : String(slug);
}

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async findInstanceBySlug(slug) { return Instance.findOne({ slug }); },
  async createInstance(fields) { return Instance.create(fields); },
  async countMembers(instanceId) { return SynMembership.countDocuments({ instanceId }); },
  async findMembership(instanceId, userId) { return SynMembership.findOne({ instanceId, userId }); },
  async createMembership(fields) { return SynMembership.create(fields); },
  // The roster. Ordered by join time so the drafter (member #1) reads first.
  async listMembers(instanceId) {
    return SynMembership.find({ instanceId }).sort({ joinedAt: 1 });
  },
  // The browse directory (D13) — public ideas only, newest first. Scoped to
  // this deployment's children so another game's instances can never appear.
  async listPublicInstances(parentInstanceId, { limit = 50, skip = 0 } = {}) {
    return Instance.find({ parentInstanceId, 'config.synthesis.visibility': 'public' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  },
};

// ── Serializers ──────────────────────────────────────────────────────────
// An idea's `title` is the Instance's `name` — the same string that labels the
// home hub at the centre of every collaborator's map (utils/synNodes.js#seedHomeHub).
function toClientIdea(instance) {
  const syn = instance.config?.synthesis ?? {};
  return {
    id: instance.id,
    title: instance.name,
    slug: instance.slug,
    code: codeFor(instance.slug),
    visibility: syn.visibility ?? 'private',
    synthesisThreshold: syn.synthesisThreshold ?? DEFAULT_THRESHOLD,
    statementSlots: syn.statementSlots ?? DEFAULT_SLOTS,
    // Presence of a statement id IS the "reached Synthesis" flag (D12).
    synthesisStatementId: syn.synthesisStatementId ?? null,
    synthesisReached: !!syn.synthesisStatementId,
    synthesisReachedAt: syn.synthesisReachedAt ?? null,
    createdAt: instance.createdAt,
  };
}

function toClientMembership(m) {
  return {
    id: m.id,
    instanceId: m.instanceId,
    userId: m.userId,
    handle: m.handle,
    role: m.role,
    joinedAt: m.joinedAt,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
// The member's display name, capped. Never client-chosen any more (the caller
// reads it off the account) and never unique — see models/SynMembership.js.
function normDisplayName(raw) {
  return String(raw || '').trim().slice(0, HANDLE_MAX) || 'Member';
}

// Lazily creates/returns the `synthesis` top-level Instance every community is
// parented to (same lazy-parent trick as On the Spectrum's `spectrum`
// instance, but created on first use here instead of a seed script since
// Synthesis has no admin-run bootstrap step yet). gameNumber stays null so it's
// excluded from Instance.getDefault() and from edition dashboards.
async function getOrCreateParentInstance({ store = mongoStore } = {}) {
  const existing = await store.findInstanceBySlug(PARENT_SLUG);
  if (existing) return existing;
  return store.createInstance({
    id: newId(),
    name: 'Synthesis',
    slug: PARENT_SLUG,
    app: 'synthesis',
    domains: [],
    access: { mode: 'invite', inviteCodes: [] },
    parentInstanceId: null,
    gameNumber: null,
  });
}

async function generateUniqueCode({ store = mongoStore } = {}) {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const clash = await store.findInstanceBySlug(slugFor(code));
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique idea code');
}

// Draft an idea — a child Instance of the `synthesis` parent (slug
// `idea-<code>`) — and seed the drafter as its first collaborator (role
// 'admin') under their account name. `visibility` defaults to private; a
// public idea additionally appears in the browse directory and accepts
// open joins (D13).
async function createIdea({ store = mongoStore, userId, displayName, title, visibility = 'private' }) {
  if (!userId) throw new Error('userId is required');
  const cleanHandle = normDisplayName(displayName);
  const cleanTitle = String(title || '').trim().slice(0, TITLE_MAX);
  if (!cleanTitle) throw new Error('A title is required');
  if (visibility !== 'public' && visibility !== 'private') {
    throw new Error('visibility must be public or private');
  }

  const parent = await getOrCreateParentInstance({ store });
  const code = await generateUniqueCode({ store });

  const instance = await store.createInstance({
    id: newId(),
    name: cleanTitle,
    slug: slugFor(code),
    app: 'synthesis',
    domains: [],
    access: { mode: 'invite', inviteCodes: [] },
    parentInstanceId: parent.id,
    gameNumber: null,
    config: {
      synthesis: {
        visibility,
        synthesisThreshold: DEFAULT_THRESHOLD,
        statementSlots: DEFAULT_SLOTS,
        synthesisStatementId: null,
        synthesisReachedAt: null,
      },
    },
  });

  const membership = await store.createMembership({
    id: newId(),
    instanceId: instance.id,
    userId,
    handle: cleanHandle,
    role: 'admin',
  });

  return { instance, membership };
}

// Join an existing idea by its shareable code. Enforces the ≤50-collaborator
// gate (plan §8). Re-joining is a no-op returning the existing membership
// unchanged — mirrors OaS's joinGame rejoin behavior.
//
// The code is the only credential either way (D13): holding it is what gets a
// private idea open, and a public idea is additionally discoverable through
// the browse directory, which hands out the same code. So visibility changes
// how you FIND an idea, and the join path below stays one path.
async function joinIdea({ store = mongoStore, code, userId, displayName }) {
  if (!userId) throw new Error('userId is required');
  if (!code) throw new Error('An idea code is required');
  const instance = await store.findInstanceBySlug(slugFor(code));
  if (!instance) throw new Error('Idea not found');

  const existing = await store.findMembership(instance.id, userId);
  if (existing) return { instance, membership: existing };

  const count = await store.countMembers(instance.id);
  if (count >= MEMBER_CAP) throw new Error('This idea is full');

  const membership = await store.createMembership({
    id: newId(),
    instanceId: instance.id,
    userId,
    handle: normDisplayName(displayName),
    role: 'member',
  });

  return { instance, membership };
}

/**
 * Mint the membership row for someone whose access came from a CIRCLE rather
 * than from joining (2026-08-20). Called the first time they write, never for
 * a read — a row here means "has contributed", which is what the people list
 * shows and what the circle map counts.
 *
 * Idempotent, and it deliberately does NOT re-check access: the caller
 * (routes/synthesis.js#requireMember) is the one predicate, and duplicating
 * the check here would be two places to get it wrong. It does hold the member
 * cap, because that is this file's rule and applies however you arrived.
 */
async function joinViaCircle({ store = mongoStore, instanceId, userId, displayName }) {
  if (!instanceId || !userId) throw new Error('instanceId and userId are required');
  const existing = await store.findMembership(instanceId, userId);
  if (existing) return existing;

  const count = await store.countMembers(instanceId);
  if (count >= MEMBER_CAP) throw new Error('This idea is full');

  return store.createMembership({
    id: newId(),
    instanceId,
    userId,
    handle: normDisplayName(displayName),
    role: 'member',
  });
}

// The collaborator roster for an idea — the social page's data (handle, role,
// joined). Contribution counts are layered on in routes/synthesis.js, which
// owns the SynNode/Entry reads; this funnel stays membership-only.
async function listCollaborators({ store = mongoStore, instanceId }) {
  if (!instanceId) throw new Error('instanceId is required');
  const members = await store.listMembers(instanceId);
  return members.map(toClientMembership);
}

// The browse directory (D13): public ideas across the deployment, newest
// first. Private ideas never appear here — the query filters on visibility
// server-side, and there is no client-supplied filter to get around it.
async function listPublicIdeas({ store = mongoStore, limit = 50, skip = 0 } = {}) {
  const parent = await getOrCreateParentInstance({ store });
  const instances = await store.listPublicInstances(parent.id, { limit, skip });
  return Promise.all(instances.map(async instance => ({
    ...toClientIdea(instance),
    collaboratorCount: await store.countMembers(instance.id),
  })));
}

module.exports = {
  joinViaCircle,
  createIdea,
  joinIdea,
  listCollaborators,
  listPublicIdeas,
  getOrCreateParentInstance,
  toClientIdea,
  toClientMembership,
  codeFor,
  MEMBER_CAP,
  DEFAULT_THRESHOLD,
  DEFAULT_SLOTS,
  newId,
  mongoStore,
};
