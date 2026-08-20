// synthesisActivity — Synthesis as a circle activity (2026-08-20).
//
// This replaces utils/circleSessions.js, which was a side channel: a session
// was a child Instance stamped `config.synthesis.circleId`, fetched by its own
// endpoint, and faked into a Seed by the circle map so it could be drawn at
// all. Nothing generic could see it — it could not be queued, supported,
// promoted, skipped or advanced, and it sent no mail.
//
// So the direction is inverted. The circle points at the idea, through an
// ordinary seed whose payload is `{ ideaId }`, and every generic surface picks
// it up for free: the queue orders it, `participation()` draws it, the mail
// pathway notifies on it, and the facilitator verbs already work.
//
// THE SHAPE OF THE THING (settled with MO, 2026-08-20):
//
//   draft   — an idea nobody has shared. Private to its author and whoever
//             they invited by code. Invisible to every circle.
//   nominate— sharing it with a circle. It is a seed now, phase 'nominated':
//             the circle can READ and CONTRIBUTE, but it is not in the queue.
//   accept  — anyone other than the author supports it, and it enters the
//             queue as 'pending'. Handled by utils/circles.js#supportSeed.
//   open    — its turn comes up and the cycle runs.
//
// THE QUEUE IS ATTENTION, NOT ACCESS. Contributing is unlocked by the share,
// not by the cycle opening, so `phase` gates nobody here — it drives the mail,
// the map's "live" mark, and the clock. That is deliberate and is what lets a
// nominated document accumulate contributors before the group ever votes it
// up. A document can reach the middle of the map without being queued at all.
//
// A cycle ENDS when a person ends it. `isMemberDone` is always false, so
// nothing auto-completes: a synthesis has no natural finish, and until Reaching
// Synthesis is wired to close the cycle, the author or the circle creator
// closing it (utils/circles.js#advanceCircle, already theirs) is the way out.
// Re-nominating a closed idea makes a second seed pointing at the same idea,
// which is a continuation, not a fresh start — the idea keeps everything.
const activities = require('./circleActivities');

const TITLE_MAX = 120;

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
// Closed over by the module rather than taken per-hook, for the same reason
// utils/gather.js does it: the tick runs with the CIRCLE store, which knows
// nothing about nodes, entries or instances.
const mongoStore = {
  async getIdea(ideaId) {
    return require('../models/Instance').findOne({ id: ideaId }).lean();
  },
  async isIdeaMember(ideaId, userId) {
    return Boolean(await require('../models/SynMembership').findOne({ instanceId: ideaId, userId }).lean());
  },
  // Who has actually put something into this idea. Authoring a node or
  // leaving a reply both count; nothing else does, because nothing else is a
  // contribution you could point at afterwards.
  //
  // The home hub is excluded, and that exclusion is load-bearing: every reader
  // gets one seeded the first time they open the document (routes/synthesis.js
  // GET /nodes), so counting it would make merely LOOKING pull a document into
  // the middle of the circle map.
  async contributorIds(ideaId) {
    const [authors, repliers] = await Promise.all([
      require('../models/SynNode').distinct('ownerId', { instanceId: ideaId, isHome: { $ne: true } }),
      require('../models/Entry').distinct('userId', { instanceId: ideaId }),
    ]);
    return [...new Set([...authors, ...repliers])];
  },
};

// ---------------------------------------------------------------------------
// Seed payload
// ---------------------------------------------------------------------------
/**
 * `{ ideaId, title }`. The title is denormalized so the circle map and the
 * queue can label a seed without reaching across into synthesis on every read
 * — the same reason a node carries `ownerHandle`. It is a snapshot: renaming
 * the idea later does not rewrite seeds that already point at it.
 *
 * `topic` is set to the same string, because every generic circle surface
 * built so far reads `payload.topic` for a seed's label.
 */
async function normalizeSeed({ store = mongoStore } = {}, payload, { userId } = {}) {
  const ideaId = String((payload && payload.ideaId) || '').trim();
  if (!ideaId) throw new Error('Which idea are you sharing?');

  const idea = await store.getIdea(ideaId);
  if (!idea) throw new Error('Idea not found');

  // You may only share a document you are actually in. Without this, knowing
  // an id would be enough to expose someone else's private draft to a circle.
  if (userId && !(await store.isIdeaMember(ideaId, userId))) {
    throw new Error('You can only share an idea you are part of');
  }

  const title = String(payload.title || idea.name || 'Untitled idea').trim().slice(0, TITLE_MAX);
  return { ideaId, ideaCode: String(idea.slug || '').replace(/^idea-/, ''), title, topic: title };
}

// ---------------------------------------------------------------------------
// The module
// ---------------------------------------------------------------------------
function createModule({ store = mongoStore } = {}) {
  return {
    // One phase. A synthesis is not a sequence of rounds — it is a space that
    // is open, and then is not.
    phases: ['exploring'],

    // The whole point of this activity's lifecycle: shared first, queued only
    // once somebody else says yes. See utils/circles.js PRE_QUEUE_PHASES.
    nominateFirst: true,

    async normalizeSeed(payload, ctx) {
      return normalizeSeed({ store }, payload, ctx || {});
    },

    // Never. There is no "done" in a thought space, so no cycle ever completes
    // itself — a person closes it. Returning true for anyone would end the
    // cycle the moment they wrote one node.
    async isMemberDone() {
      return false;
    },

    // The map row. Attribution is public in synthesis by design, so unlike
    // Threshold's sealed phases there is nothing to withhold at any point:
    // contributors are named whenever there are any.
    async participation({ seed, viewerId }) {
      const ids = await store.contributorIds(seed.payload.ideaId);
      return { tellerIds: ids, tellerCount: ids.length, iTold: ids.includes(viewerId) };
    },

    // What the circle snapshot carries for a live synthesis seed. Deliberately
    // thin: the document lives in the synthesis app, and duplicating its
    // contents into every circle read is how the two would drift.
    async snapshotExtras({ seed, viewerId }) {
      const ids = await store.contributorIds(seed.payload.ideaId);
      return {
        synthesisIdea: {
          ideaId: seed.payload.ideaId,
          ideaCode: seed.payload.ideaCode || null,
          title: seed.payload.title,
          contributorCount: ids.length,
          iContribute: ids.includes(viewerId),
        },
      };
    },

    async notificationFor({ circle, seed, phase, userId }) {
      const unsubscribeUrl = notificationsUrl();
      const url = circleUrl(circle);
      const title = seed && seed.payload ? seed.payload.title : 'a document';

      if (phase === 'exploring') {
        // Its turn came up. Everyone gets this, including people already in
        // it — the news is that the circle is on it now, not that it exists.
        return {
          subject: `${circle.title} is on "${title}"`,
          text: `The circle has moved to "${title}". Add a thought, or read what is already there:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      if (phase === 'revealed' || phase === 'skipped') {
        // Closed is a pause, not an ending — the document keeps everything and
        // can be nominated again. Say so, so nobody reads it as deletion.
        return {
          subject: `"${title}" is closed for now`,
          text: `${circle.title} has stopped work on "${title}". Everything in it is still there, and it can go back to the circle whenever somebody puts it up again:\n\n${url}`,
          unsubscribeUrl,
        };
      }
      // 'idle' and 'closed' are the circle's own states and are the same story
      // whatever activity ran — the circle's module speaks for those.
      void userId;
      return null;
    },
  };
}

activities.register('synthesis', createModule());

module.exports = { createModule, normalizeSeed, mongoStore };
