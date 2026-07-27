const express = require('express');
const router = express.Router();

const Instance = require('../models/Instance');
const UnisonNode = require('../models/UnisonNode');
const UnisonFrame = require('../models/UnisonFrame');
const UnisonMembership = require('../models/UnisonMembership');
const Entry = require('../models/Entry');
const nodeFunnel = require('../utils/unisonNodes');
const entryUtils = require('../utils/entries');
const communityFunnel = require('../utils/unisonCommunities');

// Unison — M0 REST surface: community/membership plumbing (create/join a
// community, the ≤50-member gate, pseudonymous handles) plus a member's own
// private DAG (create root/child, marry, reparent, edit content, set axes,
// publish/unpublish). Thin wrappers over utils/unisonNodes.js and
// utils/unisonCommunities.js, the single write funnels — this file adds no
// funnel logic beyond request shaping, ownership checks, and error-status
// mapping. Mounted behind resolveInstance + enforceVerifiedUser in
// websocket-server.js#loadAPIRoutes, exactly like every other identity-
// bearing router (see routes/oas.js).
//
// Two different addressing schemes, on purpose:
//   - /communities* routes address a community by its shareable CODE
//     (mirrors OaS room codes — you don't have an x-instance-id for a
//     community until you've created or joined one).
//   - /nodes* and /frames* routes operate against req.instanceId — the
//     community instance resolved by the x-instance-id header, exactly like
//     Topic/Activity elsewhere in the app (root CLAUDE.md's Multi-Tenancy
//     section). Once a client has created/joined a community it sends that
//     community's instance id as x-instance-id for every following request.
//
// M1 (built here): the networking loop — respond/borrow (the two-record
// write, D2), the public reply thread on a post, free reply upvotes (D9), and
// the community feed of published thoughts (D10), plus the sockets/unison.js
// broadcast room. Private-first stays the privacy contract: owner-scoped
// mutation paths remain owner-scoped, and the only cross-member READ paths
// (/feed, /nodes/:id/post) return published nodes exclusively.
//
// DEFERRED TO M2+ (not built here): promote (borrowed → own on first
// owner-authored layer) and anything LLM.

function userIdFrom(req) {
  return req.headers['x-user-id'] || null;
}

async function requireUser(req, res) {
  const userId = userIdFrom(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  return userId;
}

// Loads the caller's membership in the resolved (community) instance. Nodes
// can only be listed/created by a joined member, and the server-trusted
// handle used as ownerHandle on every write comes from here — never from a
// client-supplied display name, so a node's attribution can't be spoofed.
async function requireMember(req, res) {
  const userId = await requireUser(req, res);
  if (!userId) return null;
  const membership = await UnisonMembership.findOne({ instanceId: req.instanceId, userId });
  if (!membership) {
    res.status(403).json({ error: 'Join this community first' });
    return null;
  }
  return membership;
}

// Loads a node this caller owns. 404s (not 403s) when the node exists but
// belongs to someone else, so a probing request can't distinguish "doesn't
// exist" from "not yours" — the private-first contract (plan §8) enforced
// server-side, per node, on every mutation path below.
async function loadOwnedNode(req, res) {
  const userId = await requireUser(req, res);
  if (!userId) return null;
  const node = await UnisonNode.findOne({ id: req.params.id, instanceId: req.instanceId });
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
  'A community code is required',
  'userId is required',
  // M1 networking
  'sourceNodeId is required',
  'A response needs a stance in [0,1]',
  'Cannot vote on your own entry',
]);

const NOT_FOUND_ERRORS = new Set(['Node not found', 'Spectrum not found', 'Community not found', 'Entry not found']);
const CONFLICT_ERRORS = new Set(['Community is full', 'That handle is taken in this community']);
// M1 private-first guards: the target isn't a published post (§8).
const FORBIDDEN_ERRORS = new Set([
  'You can only respond to a published thought',
  'Only a published thought can be responded to',
]);

function fail(res, error) {
  if (NOT_FOUND_ERRORS.has(error.message)) return res.status(404).json({ error: error.message });
  if (FORBIDDEN_ERRORS.has(error.message)) return res.status(403).json({ error: error.message });
  if (CONFLICT_ERRORS.has(error.message)) return res.status(409).json({ error: error.message });
  if (BAD_REQUEST_ERRORS.has(error.message)) return res.status(400).json({ error: error.message });
  console.error('[unison]', error);
  res.status(500).json({ error: 'Something went wrong' });
}

// Resolve 0–2 axis specs ({frameId} to borrow, or {poleA, poleB} to coin) to
// frame ids via the shared community vocabulary (utils/unisonNodes.js's
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

// ── Community + membership ──────────────────────────────────────────────

// Create a community (a child Instance of the `unison` parent) and join it
// as its first (admin) member under the given handle.
router.post('/communities', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { instance, membership } = await communityFunnel.createCommunity({
      userId, handle: req.body.handle, name: req.body.name,
    });
    res.status(201).json({
      community: communityFunnel.toClientCommunity(instance),
      membership: communityFunnel.toClientMembership(membership),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Join an existing community by its shareable code. The ≤50-member gate and
// per-community handle uniqueness are enforced in utils/unisonCommunities.js.
router.post('/communities/:code/join', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const { instance, membership } = await communityFunnel.joinCommunity({
      code: req.params.code, userId, handle: req.body.handle,
    });
    res.status(201).json({
      community: communityFunnel.toClientCommunity(instance),
      membership: communityFunnel.toClientMembership(membership),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Look up a community by code (join-page preview) plus my membership if I've
// already joined it. No member roster is returned — the ≤50 boundary is a
// size check, not a directory.
router.get('/communities/:code', async (req, res) => {
  try {
    const instance = await Instance.findOne({ slug: `uni-${String(req.params.code).toLowerCase()}` });
    if (!instance) return res.status(404).json({ error: 'Community not found' });
    const userId = userIdFrom(req);
    const [membership, memberCount] = await Promise.all([
      userId ? UnisonMembership.findOne({ instanceId: instance.id, userId }) : null,
      UnisonMembership.countDocuments({ instanceId: instance.id }),
    ]);
    res.json({
      community: { ...communityFunnel.toClientCommunity(instance), memberCount },
      membership: membership ? communityFunnel.toClientMembership(membership) : null,
    });
  } catch (error) {
    fail(res, error);
  }
});

// The communities I've joined — dashboard list, mirroring OaS's /me/games.
router.get('/me/communities', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const memberships = await UnisonMembership.find({ userId }).sort({ joinedAt: -1 });
    const instances = await Instance.find({ id: { $in: memberships.map(m => m.instanceId) } });
    const byId = new Map(instances.map(i => [i.id, i]));
    const list = memberships
      .filter(m => byId.has(m.instanceId))
      .map(m => ({
        ...communityFunnel.toClientCommunity(byId.get(m.instanceId)),
        membership: communityFunnel.toClientMembership(m),
      }));
    res.json({ communities: list });
  } catch (error) {
    fail(res, error);
  }
});

// ── My private map ─────────────────────────────────────────────────────
// UnisonNode.find({ instanceId, ownerId }) — the flat indexed personal-map
// scan (plan §2). Private-first: this is MY map only; there is no "view
// another member's map" route in M0 (that's the M1 feed/post view).

router.get('/nodes', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const nodes = await UnisonNode
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

// Marry two of my own nodes into a synthesis node (plan D4/MAP-2: tap one
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
// Cycle guard + same-owner invariant enforced in utils/unisonNodes.js.
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

router.post('/nodes/:id/publish', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    const updated = await nodeFunnel.publish({ nodeId: node.id });
    res.json({ node: nodeFunnel.toClient(updated) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/nodes/:id/unpublish', async (req, res) => {
  try {
    const node = await loadOwnedNode(req, res);
    if (!node) return;
    const updated = await nodeFunnel.unpublish({ nodeId: node.id });
    res.json({ node: nodeFunnel.toClient(updated) });
  } catch (error) {
    fail(res, error);
  }
});

// ── M1: publish → borrow → the networking loop ─────────────────────────
// Attribution is always by handle; replies are public (toClient, never
// toRedacted — D3/D6). Broadcasts (node_published on publish above,
// reply_upserted here) are emitted from the funnel, not these routes.

// The community feed: published thoughts across the community, recency-first,
// carrying topic + author fields for the frontend's switchable lenses (D10).
// Never leaks private nodes — the funnel query is visibility:'published' only.
router.get('/feed', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const feed = await nodeFunnel.feed({ instanceId: req.instanceId });
    res.json({ feed });
  } catch (error) {
    fail(res, error);
  }
});

// A published post + its public reply thread (the comment section / reply map,
// D6). Read-only, member-visible; a private draft is not a post to anyone but
// its owner, so this 404s unless published. Replies are attributed by handle.
router.get('/nodes/:id/post', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const node = await UnisonNode.findOne({ id: req.params.id, instanceId: req.instanceId });
    if (!node || node.visibility !== 'published') {
      return res.status(404).json({ error: 'Node not found' });
    }
    const replies = await entryUtils.listByActivity(node.id);
    res.json({
      post: nodeFunnel.toClient(node),
      replies: replies.map(entryUtils.toClient),
    });
  } catch (error) {
    fail(res, error);
  }
});

// Respond to a published thought — the two-record write (D2): a public reply
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

// ── Frames — the community's shared axis vocabulary ────────────────────

router.get('/frames', async (req, res) => {
  try {
    const membership = await requireMember(req, res);
    if (!membership) return;
    const frames = await UnisonFrame.find({ instanceId: req.instanceId }).sort({ createdAt: 1 });
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
