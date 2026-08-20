// circleSessions — D17's bridge: a circle owns synthesis sessions.
//
// A session IS an idea (a child Instance, utils/synIdeas.js) whose
// `config.synthesis.circleId` points at the owning circle, and whose
// membership MIRRORS the circle's members — there is no separate join. The
// mirror is eager on create and re-run on every list, idempotently, so a
// member who joined the circle in week six is in every session the next time
// anyone looks, and the session simply appears in their synthesis ideas list.
//
// A circle may run as many sessions as it wants (D17 — MO overrode the
// one-per-circle draft). Participation is what the circle-home map draws:
// a session's contributors are the circle members who have WRITTEN a node
// or replied in it — the respond/borrow engagement that pulls a session from
// one member's solo spur into the middle of the circle. Synthesis is
// attributed by design, so contributor ids are not a redaction concern.
//
// Never write SynMembership outside this file or utils/synIdeas.js.

const synIdeas = require('./synIdeas');

function newId() {
  return require('crypto').randomUUID().replace(/-/g, '').slice(0, 12);
}

const mongoStore = {
  ...synIdeas.mongoStore,

  async listCircleSessionInstances(circleId) {
    return require('../models/Instance')
      .find({ 'config.synthesis.circleId': circleId })
      .sort({ createdAt: -1 });
  },
  async saveInstance(instance) { return instance.save(); },
  async authorIds(instanceId) {
    return require('../models/SynNode').distinct('ownerId', { instanceId });
  },
  async replierIds(instanceId) {
    return require('../models/Entry').distinct('userId', { instanceId });
  },
};

function assertCircleMember(circle, userId) {
  if (!circle.members.some(m => m.userId === userId)) {
    throw new Error('Not a member of this circle');
  }
}

/**
 * Bring a session's membership up to the circle's. Idempotent; never removes
 * (someone who left a circle keeps their session identity — their thoughts
 * are attributed to it, and synthesis never redacts).
 */
async function mirrorMembers({ store = mongoStore, circle, instance }) {
  for (const member of circle.members) {
    const existing = await store.findMembership(instance.id, member.userId);
    if (existing) continue;
    await store.createMembership({
      id: newId(),
      instanceId: instance.id,
      userId: member.userId,
      handle: String(member.username || 'Member').trim().slice(0, 24) || 'Member',
      role: member.userId === circle.createdBy ? 'admin' : 'member',
    });
  }
}

/**
 * Start a session for the circle. Any member may — sessions are the circle's
 * shared instruments, not a facilitator privilege. Display names come from
 * the circle roster; the whole circle is mirrored in immediately.
 */
async function createSession({ store = mongoStore, circle, userId, title }) {
  assertCircleMember(circle, userId);
  const creator = circle.members.find(m => m.userId === userId);

  const { instance, membership } = await synIdeas.createIdea({
    store,
    userId,
    displayName: creator.username,
    title,
    visibility: 'private',
  });

  // The ownership stamp. Set through the instance document rather than a
  // second create-path parameter, so synIdeas.createIdea stays bridge-blind.
  instance.config = {
    ...instance.config,
    synthesis: { ...(instance.config?.synthesis ?? {}), circleId: circle.id },
  };
  if (typeof instance.markModified === 'function') instance.markModified('config');
  await store.saveInstance(instance);

  await mirrorMembers({ store, circle, instance });
  return { instance, membership };
}

/**
 * The circle's sessions, each with the participation the circle-home map
 * draws: contributorIds = circle members who wrote a node or replied.
 * Heals the mirror on every read.
 */
async function listSessions({ store = mongoStore, circle, viewerId }) {
  assertCircleMember(circle, viewerId);
  const instances = await store.listCircleSessionInstances(circle.id);
  const memberIds = new Set(circle.members.map(m => m.userId));

  return Promise.all(instances.map(async instance => {
    await mirrorMembers({ store, circle, instance });
    const [authors, repliers] = await Promise.all([
      store.authorIds(instance.id),
      store.replierIds(instance.id),
    ]);
    const contributorIds = [...new Set([...authors, ...repliers])]
      .filter(id => memberIds.has(id));
    return {
      ...synIdeas.toClientIdea(instance),
      contributorIds,
      contributorCount: contributorIds.length,
      iContribute: contributorIds.includes(viewerId),
    };
  }));
}

module.exports = { createSession, listSessions, mirrorMembers, mongoStore };
