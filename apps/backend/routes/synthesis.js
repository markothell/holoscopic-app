const express = require('express');
const router = express.Router();

const Instance = require('../models/Instance');
const SynNode = require('../models/SynNode');
const SynFrame = require('../models/SynFrame');
const SynMembership = require('../models/SynMembership');
const User = require('../models/User');
const Entry = require('../models/Entry');
const nodeFunnel = require('../utils/synNodes');
const entryUtils = require('../utils/entries');
const ideaFunnel = require('../utils/synIdeas');
const statementFunnel = require('../utils/synStatements');
const requireEmailVerified = require('../middleware/requireEmailVerified');
const synthesis = require('../utils/synUnion');
const { getSynthesisModel } = require('../llm/chatModel');

// Synthesis — M0 REST surface: community/membership plumbing (create/join a
// community, the ≤50-member gate, pseudonymous handles) plus a member's own
// private DAG (create root/child, marry, reparent, edit content, set axes,
// delete). Thin wrappers over utils/synNodes.js and
// utils/synIdeas.js, the single write funnels — this file adds no
// funnel logic beyond request shaping, ownership checks, and error-status
// mapping. Mounted behind resolveInstance + enforceVerifiedUser in
// websocket-server.js#loadAPIRoutes, exactly like every other identity-
// bearing router (see routes/oas.js).
//
// Two different addressing schemes, on purpose:
//   - /ideas* routes address an idea by its shareable CODE
//     (mirrors OaS room codes — you don't have an x-instance-id for an
//     idea until you've drafted or joined one).
//   - /nodes* and /frames* routes operate against req.instanceId — the
//     community instance resolved by the x-instance-id header, exactly like
//     Topic/Activity elsewhere in the app (root CLAUDE.md's Multi-Tenancy
//     section). Once a client has created/joined a community it sends that
//     community's instance id as x-instance-id for every following request.
//
// M1 (built here): the networking loop — respond/borrow (the two-record
// write, D2), the public reply thread on a post, free reply upvotes (D9), and
// the idea's feed of thoughts (D10), plus the sockets/synthesis.js
// broadcast room. Private-first stays the privacy contract: owner-scoped
// mutation paths remain owner-scoped, and the only cross-member READ paths
// (/feed, /nodes/:id/post) are scoped to the idea and gated by membership.
//
// M2 (built here): promote (borrowed -> own) is wired into the EXISTING
// content-edit path — PATCH /nodes/:id with a `content` body is the single
// "make it mine" gesture (utils/synNodes.js#editContent calls
// promoteIfBorrowed internally). No separate promote route.
//
// DEFERRED TO M3+ (not built here): anything LLM.

function userIdFrom(req) {
  return req.headers['x-user-id'] || null;
}

// The member's display name, read off the Holoscopic account. Pseudonymity was
// dropped 2026-08-20 (see models/SynMembership.js): a client no longer chooses
// a per-idea handle, so this is the only source, and it is server-trusted like
// everything else attribution depends on.
async function displayNameFor(userId) {
  const user = await User.findOne({ id: userId }).lean();
  const name = user && (user.name || '').trim();
  if (name) return name.slice(0, 40);
  const local = user && user.email ? String(user.email).split('@')[0] : '';
  return (local || 'Member').slice(0, 40);
}

async function requireUser(req, res) {
  const userId = userIdFrom(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  return userId;
}

// THE ONE ACCESS PREDICATE (2026-08-20). Every read and every write in this
// file goes through here, and it is the only thing standing between one
// group's document and another's — so it lives in exactly one function.
//
// You may work in an idea if EITHER:
//   • you hold a SynMembership row in it — you drafted it, or joined by code;
//   • or a circle you belong to holds a seed pointing at it. Sharing a
//     document with a circle is what opens it to that circle, and nothing
//     else has to happen for its members to read and add to it.
//
// The second clause is why SynMembership stopped meaning "who is allowed in"
// and started meaning "who has contributed": access is derived, and a row is
// written LAZILY, the first time you actually put something in. So the people
// list is contributors, because contributors are the only rows that exist.
//
// Callers that only READ pass { write: false } and get no row minted for
// looking. Everything that writes takes the row, because that write needs an
// author, and returns it — the server-trusted display name on every node
// comes from here and never from the client, so attribution can't be spoofed.
const Circle = require('../models/Circle');

async function circleGrantsAccess(instanceId, userId) {
  const circle = await Circle.findOne({
    'members.userId': userId,
    seeds: { $elemMatch: { activity: 'synthesis', 'payload.ideaId': instanceId } },
  }).select('id').lean();
  return Boolean(circle);
}

// The /ideas/:code routes address an idea by its shareable code rather than by
// the resolved x-instance-id, so they cannot use requireMember directly. This
// is the SAME predicate against a named instance — read-only, and it must stay
// in step with requireMember below.
async function mayReadIdea(instanceId, userId) {
  if (!userId) return false;
  if (await SynMembership.findOne({ instanceId, userId })) return true;
  return circleGrantsAccess(instanceId, userId);
}

async function requireMember(req, res, { write = true } = {}) {
  const userId = await requireUser(req, res);
  if (!userId) return null;

  const existing = await SynMembership.findOne({ instanceId: req.instanceId, userId });
  if (existing) return existing;

  if (!(await circleGrantsAccess(req.instanceId, userId))) {
    res.status(403).json({ error: 'This document has not been shared with you' });
    return null;
  }
  if (!write) {
    // A reader who has contributed nothing. Real access, no row — a viewer is
    // not a name on the contributor list.
    return {
      instanceId: req.instanceId,
      userId,
      handle: await displayNameFor(userId),
      role: 'member',
      isReader: true,
    };
  }
  return ideaFunnel.joinViaCircle({
    instanceId: req.instanceId, userId, displayName: await displayNameFor(userId),
  });
}

// Loads a node this caller owns. 404s (not 403s) when the node exists but
// belongs to someone else, so a probing request can't distinguish "doesn't
// exist" from "not yours" — the private-first contract (plan §8) enforced
// server-side, per node, on every mutation path below.
async function loadOwnedNode(req, res) {
  const userId = await requireUser(req, res);
  if (!userId) return null;
  const node = await SynNode.findOne({ id: req.params.id, instanceId: req.instanceId });
  if (!node || node.ownerId !== userId) {
    res.status(404).json({ error: 'Node not found' });
    return null;
  }
  return node;
}

// Funnel validation errors that are the caller's fault (400), not a bug.
const BAD_REQUEST_ERRORS = new Set([
  "kind must be 'topic' or 'thought'",
  'owner is required',
  'instanceId is required',
  'A thought carries at most two axes',
  'Parent not found',
  'parentIds must reference nodes owned by the same author',
  'A node cannot be its own parent',
  'That edge would create a cycle in the map',
  'marry needs exactly two parents',
  'A marriage needs two distinct parents',
  'createChild needs a parentId',
  'A node has at most two parents',
  'Only thoughts carry axes',
  'A spectrum needs both poles',
  'The poles must differ',
  'A handle is required',
  'Handle must be at least 2 characters',
  'An idea code is required',
  'A title is required',
  'A statement needs some text',
  'author is required',
  'visibility must be public or private',
  'userId is required',
  // M1 networking
  'sourceNodeId is required',
  'A response needs a stance in [0,1]',
  'Cannot vote on your own entry',
  // S1 union
  "depth must be 'brief' or 'full'",
]);

const NOT_FOUND_ERRORS = new Set(['Node not found', 'Spectrum not found', 'Idea not found', 'Entry not found', 'Statement not found']);
// 409: the caller is out of slots (D14), or is acting on a settled statement.
const CONFLICT_ERRORS = new Set(['This idea is full']);
const CONFLICT_PATTERNS = [/holding all \d+ of your statement slots/, /statement was withdrawn/];
// M1 shape guard: you can respond to a thought, not to a hub.
const FORBIDDEN_ERRORS = new Set([
  'Only a thought can be responded to',
  "The idea's own hub stays put",
]);

function fail(res, error) {
  if (NOT_FOUND_ERRORS.has(error.message)) return res.status(404).json({ error: error.message });
  if (FORBIDDEN_ERRORS.has(error.message)) return res.status(403).json({ error: error.message });
  if (CONFLICT_ERRORS.has(error.message) || CONFLICT_PATTERNS.some(p => p.test(error.message))) {
    return res.status(409).json({ error: error.message });
  }
  if (error.message === 'Only the author can withdraw a statement') return res.status(403).json({ error: error.message });
  if (BAD_REQUEST_ERRORS.has(error.message)) return res.status(400).json({ error: error.message });
  console.error('[synthesis]', error);
  res.status(500).json({ error: 'Something went wrong' });
}

// Resolve 0–2 axis specs ({frameId} to borrow, or {poleA, poleB} to coin) to
// frame ids via the shared community vocabulary (utils/synNodes.js's
// resolveFrame — dedupes per community, orientation-free).
async function resolveAxes(req, specs, membership) {
  if (specs === undefined) return undefined;
  if (!Array.isArray(specs)) throw new Error('A thought carries at most two axes');
  if (specs.length > 2) throw new Error('A thought carries at most two axes');
  const ids = [];
  for (const spec of specs) {
    const frame = await nodeFunnel.resolveFrame({
      instanceId: req.instanceId,
      parentInstanceId: req.instance.parentInstanceId || null,
      spec,
      userId: membership.userId,
      username: membership.handle,
    });
    ids.push(frame.id);
  }
  return ids;
}

// ── Ideas + collaborators ───────────────────────────────────────────────
// An idea IS a child Instance of the `synthesis` parent. These routes address
// one by its shareable CODE rather than by instance id, because you have no
// instance id until you have drafted or joined something.

// Draft an idea and join it as its first (admin) collaborator under the given
// handle. Seeds the idea's title as the home hub at the centre of the
// drafter's map — the map is the idea's thought space, so it starts with the
// idea in it.
//
// Confirmed address required, on BOTH create and join — unlike On a Spectrum,
// where only creating is gated. The difference is the tempo: a Spectrum room is
// people together passing a code around, where an unopened confirmation email
// must not stop somebody joining the game in front of them. Joining an idea is
// enrolling in a small, long-running group of pseudonymous writers who will be
// reading each other for weeks, which is the same act as enrolling in a
// sequence and carries the same reason to be reachable.
router.post('/ideas', requireEmailVerified, async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { instance, membership } = await ideaFunnel.createIdea({
      userId,
      displayName: await displayNameFor(userId),
      title: req.body.title,
      visibility: req.body.visibility,
    });
    await nodeFunnel.seedHomeHub({
      instanceId: instance.id,
      ownerId: userId,
      ownerHandle: membership.handle,
      title: instance.name,
    });
    res.status(201).json({
      idea: ideaFunnel.toClientIdea(instance),
      membership: ideaFunnel.toClientMembership(membership),
    });
  } catch (error) {
    fail(res, error);
  }
});

// ── The circle bridge ───────────────────────────────────────────────────────
//
// There is no bridge here any more (2026-08-20). D17's version lived in this
// file: two `/circles/:circleId/sessions` routes over utils/circleSessions.js,
// which made a session an Instance stamped `config.synthesis.circleId` and
// mirrored the circle roster into it. Nothing generic could see it, so the
// circle map had to fake a Seed to draw it at all.
//
// The direction is inverted now. A circle points at an idea through an
// ORDINARY SEED — `POST /api/circles/:id/seeds` with `activity: 'synthesis'`
// and `payload: { ideaId }` — and utils/synthesisActivity.js supplies what
// that seed means. So sharing, queueing, support, participation, the mail and
// the facilitator verbs are all the generic circle surface, and this file
// keeps its one job: ideas, nodes, replies, statements and the Union.

// Join an existing idea by its shareable code. The ≤50-collaborator gate and
// per-idea handle uniqueness are enforced in utils/synIdeas.js. Joining seeds
// the same home hub, so a new collaborator's map opens on the idea rather
// than on nothing.
router.post('/ideas/:code/join', requireEmailVerified, async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { instance, membership } = await ideaFunnel.joinIdea({
      code: req.params.code, userId, displayName: await displayNameFor(userId),
    });
    await nodeFunnel.seedHomeHub({
      instanceId: instance.id,
      ownerId: userId,
      ownerHandle: membership.handle,
      title: instance.name,
    });
    res.status(201).json({
      idea: ideaFunnel.toClientIdea(instance),
      membership: ideaFunnel.toClientMembership(membership),
    });
  } catch (error) {
    fail(res, error);
  }
});

// The browse directory (D13): public ideas only. Deliberately mounted BEFORE
// `/ideas/:code` so the literal path wins over the code parameter.
//
// Signed-in accounts only. "Public" means any ACCOUNT can find and join an
// idea — it does not mean open to the internet. The rows carry each idea's
// join code, which is the credential that gets you in, so an unauthenticated
// read here would hand out the whole directory's keys.
router.get('/ideas/public', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const ideas = await ideaFunnel.listPublicIdeas({ limit, skip });
    res.json({ ideas });
  } catch (error) {
    fail(res, error);
  }
});

// Look up an idea by code (the join-page preview) plus my membership if I've
// already joined it.
router.get('/ideas/:code', async (req, res) => {
  try {
    const instance = await Instance.findOne({ slug: `idea-${String(req.params.code).toLowerCase()}` });
    if (!instance) return res.status(404).json({ error: 'Idea not found' });
    const userId = userIdFrom(req);
    const [membership, collaboratorCount] = await Promise.all([
      userId ? SynMembership.findOne({ instanceId: instance.id, userId }) : null,
      SynMembership.countDocuments({ instanceId: instance.id }),
    ]);
    res.json({
      idea: { ...ideaFunnel.toClientIdea(instance), collaboratorCount },
      membership: membership ? ideaFunnel.toClientMembership(membership) : null,
    });
  } catch (error) {
    fail(res, error);
  }
});

// The collaborator roster — who is working on this idea (the social page).
// Members only: the roster names people, and an idea's participants are
// visible to its participants rather than to the whole deployment.
router.get('/ideas/:code/collaborators', async (req, res) => {
  try {
    const instance = await Instance.findOne({ slug: `idea-${String(req.params.code).toLowerCase()}` });
    if (!instance) return res.status(404).json({ error: 'Idea not found' });
    const userId = await requireUser(req, res);
    if (!userId) return;
    if (!(await mayReadIdea(instance.id, userId))) {
      return res.status(403).json({ error: 'This document has not been shared with you' });
    }

    const roster = await ideaFunnel.listCollaborators({ instanceId: instance.id });
    // Contribution counts per collaborator. Every thought counts — there is no
    // draft state to exclude.
    const collaborators = await Promise.all(roster.map(async m => {
      const [thoughts, replies] = await Promise.all([
        SynNode.countDocuments({
          instanceId: instance.id, ownerId: m.userId, kind: 'thought',
        }),
        Entry.countDocuments({ instanceId: instance.id, userId: m.userId }),
      ]);
      return { ...m, thoughtCount: thoughts, replyCount: replies };
    }));
    res.json({ collaborators });
  } catch (error) {
    fail(res, error);
  }
});

// One collaborator's map, as it exists inside THIS idea — the social page's
// way into someone's thinking rather than just their name.
//
// PUBLISHED NODES ONLY. This is the one place another member's map is
// readable, and the private-first contract holds exactly as it does on /feed:
// drafts never leave their author's own map. The filter is here, server-side,
// and the caller cannot widen it.
router.get('/ideas/:code/collaborators/:userId/map', async (req, res) => {
  try {
    const instance = await Instance.findOne({ slug: `idea-${String(req.params.code).toLowerCase()}` });
    if (!instance) return res.status(404).json({ error: 'Idea not found' });
    const userId = await requireUser(req, res);
    if (!userId) return;
    if (!(await mayReadIdea(instance.id, userId))) {
      return res.status(403).json({ error: 'This document has not been shared with you' });
    }

    // Addressed by userId, not by name: a display name is not unique any more.
    const theirs = await SynMembership.findOne({
      instanceId: instance.id,
      userId: String(req.params.userId),
    });
    if (!theirs) return res.status(404).json({ error: 'No such collaborator' });

    // Their whole map. The elaborate hub-skeleton reconstruction that used to
    // live here existed only to rebuild structure around published thoughts
    // while hubs stayed private; with no per-node gate the map is simply all
    // of their nodes, and it hangs together on its own.
    const nodes = await SynNode
      .find({ instanceId: instance.id, ownerId: theirs.userId })
      .sort({ createdAt: -1 });

    res.json({
      collaborator: ideaFunnel.toClientMembership(theirs),
      nodes: nodes.map(nodeFunnel.toClient),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Every document I can open — the app's home surface. Two sources, because
// there are two ways in (the requireMember predicate above): ideas I drafted
// or joined, AND ideas shared with a circle I belong to. Without the second,
// somebody whose circle was handed a document would follow the link and find
// nothing there, since they have contributed and so have no membership row.
router.get('/me/ideas', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const memberships = await SynMembership.find({ userId }).sort({ joinedAt: -1 });
    const byUser = new Map(memberships.map(m => [m.instanceId, m]));

    // Ideas reachable through a circle, minus the ones already covered.
    const myCircles = await Circle.find({ 'members.userId': userId })
      .select('seeds.activity seeds.payload.ideaId').lean();
    const viaCircle = new Set();
    for (const c of myCircles) {
      for (const seed of c.seeds || []) {
        if (seed.activity === 'synthesis' && seed.payload && seed.payload.ideaId
            && !byUser.has(seed.payload.ideaId)) {
          viaCircle.add(seed.payload.ideaId);
        }
      }
    }

    const wantedIds = [...byUser.keys(), ...viaCircle];
    const instances = await Instance.find({ id: { $in: wantedIds } });
    const byId = new Map(instances.map(i => [i.id, i]));
    const ideas = await Promise.all(
      wantedIds
        .filter(id => byId.has(id))
        .map(async id => {
          const m = byUser.get(id);
          const instance = byId.get(id);
          const [collaboratorCount, lastNode] = await Promise.all([
            SynMembership.countDocuments({ instanceId: instance.id }),
            SynNode.findOne({ instanceId: instance.id }).sort({ updatedAt: -1 }).select('updatedAt'),
          ]);
          return {
            ...ideaFunnel.toClientIdea(instance),
            // null when a circle is what opened this to me and I have not put
            // anything in yet — the row is written on my first contribution.
            membership: m ? ideaFunnel.toClientMembership(m) : null,
            collaboratorCount,
            // 'admin' is the drafter — the one who started the idea.
            draftedByMe: Boolean(m && m.role === 'admin'),
            lastActivityAt: lastNode?.updatedAt ?? instance.createdAt,
          };
        }),
    );
    res.json({ ideas });
  } catch (error) {
    fail(res, error);
  }
});

// ── My private map ─────────────────────────────────────────────────────
// SynNode.find({ instanceId, ownerId }) — the flat indexed personal-map
// scan (plan §2). Private-first: this is MY map only; there is no "view
// another member's map" route in M0 (that's the M1 feed/post view).

router.get('/nodes', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const nodes = await SynNode
      .find({ instanceId: req.instanceId, ownerId: membership.userId })
      .sort({ createdAt: 1 });
    res.json({ nodes: nodes.map(nodeFunnel.toClient) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/nodes/:id', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    res.json({ node: nodeFunnel.toClient(node) });
  } catch (error) {
    fail(res, error);
  }
});

// Create a root (no parentId in the body) or a child (parentId given) — a
// topic hub or a thought. `axes` (0-2 specs) resolves/coins frames via the
// shared community vocabulary before the node itself is created.
router.post('/nodes', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const axisFrameIds = await resolveAxes(req, req.body.axes, membership);
    const args = {
      instanceId: req.instanceId,
      ownerId: membership.userId,
      ownerHandle: membership.handle,
      kind: req.body.kind,
      content: req.body.content,
      axisFrameIds,
    };
    const node = req.body.parentId
      ? await nodeFunnel.createChild({ ...args, parentId: req.body.parentId })
      : await nodeFunnel.createRoot(args);
    res.status(201).json({ node: nodeFunnel.toClient(node) });
  } catch (error) {
    fail(res, error);
  }
});

// Marry two of my own nodes into a join node (plan D4/MAP-2: tap one
// node, tap a second, then Marry). Cross-owner marriages are rejected inside
// the funnel (assertSameOwner) since ownerId here is always the caller.
router.post('/nodes/marry', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const axisFrameIds = await resolveAxes(req, req.body.axes, membership);
    const node = await nodeFunnel.marry({
      instanceId: req.instanceId,
      ownerId: membership.userId,
      ownerHandle: membership.handle,
      kind: req.body.kind || 'thought',
      content: req.body.content,
      axisFrameIds,
      parentIds: req.body.parentIds,
    });
    res.status(201).json({ node: nodeFunnel.toClient(node) });
  } catch (error) {
    fail(res, error);
  }
});

// Edit content and/or replace axes on an existing node of mine.
router.patch('/nodes/:id', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    const membership = await requireMember(req, res);
    if (!membership) return;

    let updated = node;
    if (req.body.content !== undefined) {
      updated = await nodeFunnel.editContent({ nodeId: node.id, content: req.body.content });
    }
    if (req.body.axes !== undefined) {
      const axisFrameIds = await resolveAxes(req, req.body.axes, membership);
      updated = await nodeFunnel.setAxes({ nodeId: node.id, axisFrameIds });
    }
    res.json({ node: nodeFunnel.toClient(updated) });
  } catch (error) {
    fail(res, error);
  }
});

// Re-file a node under new parent(s) — 0 (root), 1 (child), or 2 (marriage).
// Cycle guard + same-owner invariant enforced in utils/synNodes.js.
router.patch('/nodes/:id/parent', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    const updated = await nodeFunnel.reparent({ nodeId: node.id, newParentIds: req.body.parentIds });
    res.json({ node: nodeFunnel.toClient(updated) });
  } catch (error) {
    fail(res, error);
  }
});

// Delete one of my own nodes. Children are ORPHANED, not cascaded — they stay
// on the map as their own root and the move gesture re-files them (see
// utils/synNodes.js#deleteNode). The idea's home hub refuses.
router.delete('/nodes/:id', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    await nodeFunnel.deleteNode({ nodeId: node.id });
    res.json({ deleted: node.id });
  } catch (error) {
    fail(res, error);
  }
});

// ── M1: read → borrow → the networking loop ────────────────────────────
// Attribution is always named; replies are public (toClient, never
// toRedacted — D3/D6). Broadcasts (node_created on create,
// reply_upserted here) are emitted from the funnel, not these routes.

// The idea's feed: every thought in it, recency-first,
// carrying topic + author fields for the frontend's switchable lenses (D10).
// Idea-scoped; the caller has already been checked for membership.
router.get('/feed', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const feed = await nodeFunnel.feed({ instanceId: req.instanceId });
    res.json({ feed });
  } catch (error) {
    fail(res, error);
  }
});

// A post + its public reply thread (the comment section / reply map,
// D6). Read-only and member-visible: every node in an idea is a post to
// everyone who can read the idea.
router.get('/nodes/:id/post', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const node = await SynNode.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const replies = await entryUtils.listByActivity(node.id);
    res.json({
      post: nodeFunnel.toClient(node),
      replies: replies.map(entryUtils.toClient),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Respond to a thought — the two-record write (D2): a public reply
// Entry on the post AND a borrowed node on my own map (structure-mirrored, D8).
// Re-responding upserts both (no duplicate reply, no duplicate borrow).
router.post('/nodes/:id/respond', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const { reply, borrowed } = await nodeFunnel.respond({
      instanceId: req.instanceId,
      responderId: membership.userId,
      responderHandle: membership.handle,
      sourceNodeId: req.params.id,
      position: req.body.position,
      text: req.body.text,
    });
    res.status(201).json({
      reply: entryUtils.toClient(reply),
      node: borrowed ? nodeFunnel.toClient(borrowed) : null,
    });
  } catch (error) {
    fail(res, error);
  }
});

// Toggle a free upvote on a reply (D9) — reuses the Entry vote mechanic, no
// economy. Second call by the same user un-votes.
router.post('/nodes/:id/replies/:entryId/upvote', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const entry = await nodeFunnel.upvoteReply({
      instanceId: req.instanceId,
      sourceNodeId: req.params.id,
      entryId: req.params.entryId,
      userId: membership.userId,
    });
    res.json({ reply: entryUtils.toClient(entry) });
  } catch (error) {
    fail(res, error);
  }
});

// ── S1: the union — "The Group" ──────────────────────────
// Replaces the M3 "Ask the Group" Q&A (question box, per-user SynThread)
// with a single cached, WHOLE-COMMUNITY artifact: two depths (brief/full),
// each drawn from the idea's entire corpus + per-post positional
// summaries (utils/synUnion.js), generated only on the
// Synthesize/Expand button and reused across every viewer until the corpus
// changes. Private nodes are never indexed or summarized (selectCorpus /
// computePositional are idea-scoped). If the LLM isn't configured the
// generate endpoint fails cleanly with 503 — it never crashes the server or
// blocks route loading.
//
// STREAMING CONTRACT (Server-Sent Events) for the frontend synthesis view —
// identical shape to M3's (now-removed) /chat contract:
//   GET  /api/synthesis/synthesis          → cached { brief?, full?, corpusVersion, stale }
//   POST /api/synthesis/synthesis { depth: 'brief' | 'full' }
//   Response: text/event-stream, events in order:
//     event: meta      data: { citations: Citation[] }   // once, up front
//     event: token     data: { text: string }            // 0..N chunks
//     event: done      data: { citations: Citation[] }   // once, on success
//     event: error     data: { error: string }           // instead of done, on failure
//   Citation = { kind:'node'|'reply', nodeId, layer?, replyId?, ownerHandle, anchorUrl }
//   Citations are assembled from the selection set (never parsed from model
//   output) and sent BEFORE the text so chips can render immediately. When
//   the corpus is empty, `meta.citations` is [] and the single token is the
//   canned "nothing here yet" text (the model is not called).

router.get('/synthesis', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const doc = await synthesis.getCache(req.instanceId);
    res.json(synthesis.toClientCache(doc));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/synthesis', async (req, res) => {
  const membership = await requireMember(req, res);
  if (!membership) return;

  const depth = req.body && req.body.depth;
  if (depth !== 'brief' && depth !== 'full') {
    return res.status(400).json({ error: "depth must be 'brief' or 'full'" });
  }

  const model = getSynthesisModel();
  // Synthesis never embeds a query (no retrieval) — only the chat half needs
  // to be wired up, unlike M3's chat endpoint which also needed embedConfigured.
  if (!model.chatConfigured) {
    return res.status(503).json({ error: 'LLM not configured' });
  }

  // Prepare (select corpus + compute positions + assemble citations) BEFORE
  // opening the stream, so a DB error surfaces as a normal JSON error, not a
  // broken stream. Capture the corpusVersion baseline at the same time, so
  // the artifact we save stamps the version this generation actually ran at.
  let prepared, corpusVersion;
  try {
    const doc = await synthesis.getOrCreateDoc(req.instanceId);
    corpusVersion = doc.corpusVersion;
    prepared = await synthesis.prepareSynthesis({ instanceId: req.instanceId, depth });
  } catch (error) {
    return fail(res, error);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  send('meta', { citations: prepared.citations });

  let text = '';
  try {
    if (prepared.empty) {
      text = prepared.text;
      send('token', { text });
    } else {
      for await (const chunk of model.stream({ system: prepared.system, messages: prepared.messages, signal: ac.signal })) {
        text += chunk;
        send('token', { text: chunk });
      }
    }
  } catch (error) {
    if (ac.signal.aborted) return res.end();
    console.error('[synthesis synthesis]', error && error.message);
    send('error', { error: 'The synthesis could not be generated right now.' });
    return res.end();
  }

  // Cache the result (best-effort — never fails the response).
  try {
    await synthesis.saveDepth({
      instanceId: req.instanceId,
      depth,
      text,
      citations: prepared.citations,
      model: model.info && model.info.chat ? model.info.chat.modelId : '',
      corpusVersion,
    });
  } catch (error) {
    console.error('[synthesis synthesis cache]', error && error.message);
  }

  send('done', { citations: prepared.citations });
  res.end();
});

// ── Statements — the synthesis mechanism ───────────────────────────────
// The Union says where the group stands; a statement is what a collaborator
// puts to the group to stand behind. Votes are rationed by the shared 3-slot
// budget (D14) and at ⅔ (D12) the group has reached Synthesis. All of that
// lives in utils/synStatements.js — these are thin wrappers.

// The leaderboard, plus everything the UI needs to render the budget: my slot
// usage, the bar, and how many votes each statement still needs.
router.get('/statements', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const board = await statementFunnel.leaderboard({
      instanceId: req.instanceId,
      userId: membership.userId,
    });
    res.json(board);
  } catch (error) {
    fail(res, error);
  }
});

// Put a statement to the group. Costs one of my three slots.
router.post('/statements', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const statement = await statementFunnel.submitStatement({
      instanceId: req.instanceId,
      userId: membership.userId,
      authorHandle: membership.handle,
      text: req.body.text,
      sourceUnionId: req.body.sourceUnionId ?? null,
    });
    nodeFunnel.emitToIdea(req.instanceId, 'statement_upserted', {
      statement: statementFunnel.toClient(statement),
    });
    res.status(201).json({ statement: statementFunnel.toClient(statement, { userId: membership.userId }) });
  } catch (error) {
    fail(res, error);
  }
});

// Back a statement, or take that backing away (a toggle). Crossing the bar
// here is what settles the idea, so the broadcast tells every open client.
router.post('/statements/:id/vote', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const { statement, state, enteredSynthesis, leftSynthesis } = await statementFunnel.voteStatement({
      instanceId: req.instanceId,
      statementId: req.params.id,
      userId: membership.userId,
    });
    const wire = statementFunnel.toClient(statement);
    nodeFunnel.emitToIdea(req.instanceId, 'statement_upserted', { statement: wire, state });
    // The measure moved across the bar in one direction or the other — every
    // open client needs to redraw the meter and the map treatment.
    if (enteredSynthesis || leftSynthesis) {
      nodeFunnel.emitToIdea(req.instanceId, 'synthesis_changed', { state });
    }
    res.json({
      statement: statementFunnel.toClient(statement, { userId: membership.userId }),
      state,
      enteredSynthesis,
      leftSynthesis,
    });
  } catch (error) {
    fail(res, error);
  }
});

// Retire my own statement, freeing every slot it held.
router.delete('/statements/:id', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const { statement, state, leftSynthesis } = await statementFunnel.withdrawStatement({
      instanceId: req.instanceId,
      statementId: req.params.id,
      userId: membership.userId,
    });
    nodeFunnel.emitToIdea(req.instanceId, 'statement_upserted', {
      statement: statementFunnel.toClient(statement), state,
    });
    if (leftSynthesis) nodeFunnel.emitToIdea(req.instanceId, 'synthesis_changed', { state });
    res.json({ statement: statementFunnel.toClient(statement, { userId: membership.userId }), state });
  } catch (error) {
    fail(res, error);
  }
});

// ── Frames — the community's shared axis vocabulary ────────────────────

router.get('/frames', async (req, res) => {
  try {
    const membership = await requireMember(req, res, { write: false });
    if (!membership) return;
    const frames = await SynFrame.find({ instanceId: req.instanceId }).sort({ createdAt: 1 });
    res.json({ frames });
  } catch (error) {
    fail(res, error);
  }
});

// Explicitly resolve/coin a frame outside of node creation (e.g. an axis
// picker that lets you set up a spectrum before attaching it to a thought).
router.post('/frames', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const frame = await nodeFunnel.resolveFrame({
      instanceId: req.instanceId,
      parentInstanceId: req.instance.parentInstanceId || null,
      spec: req.body,
      userId: membership.userId,
      username: membership.handle,
    });
    res.status(201).json({ frame });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
