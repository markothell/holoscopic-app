// circleActivities — the registry that makes utils/circles.js generic.
//
// A circle knows how to run rounds. It does not know what a round CONTAINS,
// what a seed IS, or what makes a member "done". An activity module supplies
// those, and registers itself here under the key stored on Circle.activity.
//
// This is the server-side sibling of packages/activities' REGISTRY, which maps
// an activity type to its React components. Same idea, opposite end.
//
// See apps/threshold/PLAN.md §3.4. Consumer #1 is utils/threshold.js.

// Called for hooks a module chose not to implement, so utils/circles.js can
// call all of them unconditionally rather than guarding every site.
const NOOP = async () => {};

const REQUIRED = ['normalizeSeed', 'isMemberDone'];

// Declared by a module, not a function: opt in to being NOMINATED before it
// queues (utils/circles.js PRE_QUEUE_PHASES). A nominated seed is shared with
// the circle and readable, but a free slot never opens it — somebody other
// than its author has to support it first. Absent means the old behavior: a
// posted seed goes straight into the queue.
const CAPABILITIES = { nominateFirst: false };

const OPTIONAL = {
  onPhaseOpen: NOOP,
  onPhaseClose: NOOP,
  onCycleReveal: NOOP,
  onCircleComplete: NOOP,
  // Returning null means "this person has nothing to do" — the main lever
  // against a 12-seed circle sending 400+ messages (PLAN §3.6).
  notificationFor: async () => null,
  // What the activity adds to a MEMBER's circle snapshot while a seed is
  // live — Threshold's returns { shares, myRanking, waitingShareIds }, each
  // already redacted by its own rules. Returning null adds nothing. This is
  // what keeps the snapshot one call for every activity: the generic router
  // asks the module rather than knowing any activity's nouns.
  snapshotExtras: async () => null,
  // Who has taken part in a seed's cycle, for the circle-home map — the
  // activity owns the answer because it owns the redaction rules (who may be
  // named, and when, is a property of the activity's phases). Returning null
  // means "nothing to draw for this seed"; a row is
  //   { tellerIds: string[]|null, tellerCount: number|null, iTold: boolean }
  // where tellerIds may only be non-null once naming the participants leaks
  // nothing the activity's own surfaces would not show. The layer adds seedId.
  participation: async () => null,
};

// 'nominated' / 'pending' / 'revealed' / 'skipped' are seed states the machine
// writes itself; 'idle' and 'closed' are the circle's, and both are dispatched
// to notificationFor() as a phase with no seed.
const RESERVED_PHASES = ['nominated', 'pending', 'revealed', 'skipped', 'idle', 'closed'];

const REGISTRY = new Map();

/**
 * Register an activity module.
 *
 * @param {string} key            matches Circle.activity
 * @param {object} mod
 * @param {function} mod.normalizeSeed   (payload, {circle, userId}) -> payload; throws to reject
 * @param {string[]} mod.phases          ordered per-cycle phases, e.g. ['share','rank'].
 *                                       'revealed' is terminal and implicit — never list it.
 * @param {function} mod.isMemberDone    ({circle, seed, phase, userId, store}) -> Promise<boolean>
 */
function register(key, mod) {
  if (!key || typeof key !== 'string') throw new Error('circleActivities: key required');
  if (!mod || typeof mod !== 'object') throw new Error(`circleActivities: ${key} module required`);

  for (const fn of REQUIRED) {
    if (typeof mod[fn] !== 'function') {
      throw new Error(`circleActivities: ${key} must implement ${fn}()`);
    }
  }
  if (!Array.isArray(mod.phases) || mod.phases.length === 0) {
    throw new Error(`circleActivities: ${key} must declare a non-empty phases[]`);
  }
  // The machine's own seed states, plus the circle-level states it dispatches
  // notifications under. A module listing any of them would either create a
  // phase the machine can never leave, or collide with a message about the
  // circle itself.
  for (const p of mod.phases) {
    if (RESERVED_PHASES.includes(p)) {
      throw new Error(`circleActivities: ${key} may not use reserved phase '${p}'`);
    }
  }

  REGISTRY.set(key, { ...CAPABILITIES, ...OPTIONAL, ...mod, phases: [...mod.phases] });
  return REGISTRY.get(key);
}

/**
 * Look up a module. Throws on an unknown key rather than returning null: a
 * circle referencing an activity nobody registered cannot advance, and
 * failing at the tick is how that becomes visible.
 */
function get(key) {
  const mod = REGISTRY.get(key);
  if (!mod) {
    const known = [...REGISTRY.keys()].join(', ') || 'none';
    throw new Error(`circleActivities: no module registered for '${key}' (registered: ${known})`);
  }
  return mod;
}

function has(key) {
  return REGISTRY.has(key);
}

// Test seam only — lets a spec register a stub without leaking it into the
// next file's registry.
function reset() {
  REGISTRY.clear();
}

module.exports = { register, get, has, reset, REQUIRED, RESERVED_PHASES };
