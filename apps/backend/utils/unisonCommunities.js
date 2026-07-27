const crypto = require('crypto');
const Instance = require('../models/Instance');
const UnisonMembership = require('../models/UnisonMembership');

// The write funnel for Unison community + membership plumbing: creating a
// community (a child Instance of the lazily-created `unison` parent —
// mirrors utils/oasGames.js#createRoomInstance), and joining one (the ≤50-
// member gate + pseudonymous handle assignment, plan §8). Mirrors the
// store-injection pattern in utils/unisonNodes.js so the risky bits — the
// member cap and handle uniqueness — are unit-testable without a live
// MongoDB. Production always uses `mongoStore`; routes/unison.js never
// touches Instance/UnisonMembership directly for these operations.
//
// A community is deliberately NOT its own model — it IS an Instance
// (parentInstanceId -> the `unison` parent), so it inherits multi-tenant
// scoping for free: every UnisonNode/UnisonFrame write elsewhere just reads
// req.instanceId. This file only owns instance *creation* and *membership*.

const MEMBER_CAP = 50;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1, mirrors OaS
const PARENT_SLUG = 'unison';
const HANDLE_MAX = 40;

function newId() {
  return crypto.randomUUID().substring(0, 8);
}

function randomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

function slugFor(code) {
  return `uni-${String(code).toLowerCase()}`;
}

// ── Store: default Mongoose-backed implementation ───────────────────────────
const mongoStore = {
  async findInstanceBySlug(slug) { return Instance.findOne({ slug }); },
  async createInstance(fields) { return Instance.create(fields); },
  async countMembers(instanceId) { return UnisonMembership.countDocuments({ instanceId }); },
  async findMembership(instanceId, userId) { return UnisonMembership.findOne({ instanceId, userId }); },
  async findMembershipByHandle(instanceId, handleLower) {
    return UnisonMembership.findOne({ instanceId, handleLower });
  },
  async createMembership(fields) { return UnisonMembership.create(fields); },
};

// ── Serializers ──────────────────────────────────────────────────────────
function toClientCommunity(instance) {
  return {
    id: instance.id,
    name: instance.name,
    slug: instance.slug,
    code: instance.slug.startsWith('uni-') ? instance.slug.slice(4).toUpperCase() : instance.slug,
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
function normHandle(raw) {
  return String(raw || '').trim().slice(0, HANDLE_MAX);
}

function validateHandle(handle) {
  if (!handle) throw new Error('A handle is required');
  if (handle.length < 2) throw new Error('Handle must be at least 2 characters');
}

// Lazily creates/returns the `unison` top-level Instance every community is
// parented to (same lazy-parent trick as On the Spectrum's `spectrum`
// instance, but created on first use here instead of a seed script since
// Unison has no admin-run bootstrap step yet). gameNumber stays null so it's
// excluded from Instance.getDefault() and from edition dashboards.
async function getOrCreateParentInstance({ store = mongoStore } = {}) {
  const existing = await store.findInstanceBySlug(PARENT_SLUG);
  if (existing) return existing;
  return store.createInstance({
    id: newId(),
    name: 'Unison',
    slug: PARENT_SLUG,
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
  throw new Error('Could not generate a unique community code');
}

// Create a community — a child Instance of the `unison` parent (slug
// `uni-<code>`) — and seed the creator as its first member (role 'admin')
// under their chosen handle.
async function createCommunity({ store = mongoStore, userId, handle, name }) {
  if (!userId) throw new Error('userId is required');
  const cleanHandle = normHandle(handle);
  validateHandle(cleanHandle);

  const parent = await getOrCreateParentInstance({ store });
  const code = await generateUniqueCode({ store });
  const communityName = String(name || '').trim().slice(0, 80) || `Community ${code}`;

  const instance = await store.createInstance({
    id: newId(),
    name: communityName,
    slug: slugFor(code),
    domains: [],
    access: { mode: 'invite', inviteCodes: [] },
    parentInstanceId: parent.id,
    gameNumber: null,
  });

  const membership = await store.createMembership({
    id: newId(),
    instanceId: instance.id,
    userId,
    handle: cleanHandle,
    handleLower: cleanHandle.toLowerCase(),
    role: 'admin',
  });

  return { instance, membership };
}

// Join an existing community by its shareable code. Enforces the ≤50-member
// gate (plan §8) and per-community handle uniqueness (case-insensitive).
// Re-joining (an existing membership) is a no-op that returns the existing
// membership unchanged — mirrors OaS's joinGame rejoin behavior, except the
// handle can't be silently reassigned (it's the identity everyone else's
// links already point at).
async function joinCommunity({ store = mongoStore, code, userId, handle }) {
  if (!userId) throw new Error('userId is required');
  if (!code) throw new Error('A community code is required');
  const instance = await store.findInstanceBySlug(slugFor(code));
  if (!instance) throw new Error('Community not found');

  const existing = await store.findMembership(instance.id, userId);
  if (existing) return { instance, membership: existing };

  const count = await store.countMembers(instance.id);
  if (count >= MEMBER_CAP) throw new Error('Community is full');

  const cleanHandle = normHandle(handle);
  validateHandle(cleanHandle);
  const clash = await store.findMembershipByHandle(instance.id, cleanHandle.toLowerCase());
  if (clash) throw new Error('That handle is taken in this community');

  const membership = await store.createMembership({
    id: newId(),
    instanceId: instance.id,
    userId,
    handle: cleanHandle,
    handleLower: cleanHandle.toLowerCase(),
    role: 'member',
  });

  return { instance, membership };
}

module.exports = {
  createCommunity,
  joinCommunity,
  getOrCreateParentInstance,
  toClientCommunity,
  toClientMembership,
  MEMBER_CAP,
  newId,
  mongoStore,
};
