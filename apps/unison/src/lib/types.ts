// Wire types mirroring apps/backend/models/UnisonNode.js / UnisonFrame.js and
// the utils/unisonNodes.js toClient() serializer. See apps/unison/PLAN.md §4.

export type NodeKind = 'topic' | 'thought';
export type EdgeKind = 'root' | 'child' | 'marriage';
export type Origin = 'own' | 'borrowed';
export type Visibility = 'private' | 'published';

export interface NodeContent {
  topic: string;    // meaningful when kind === 'topic'
  thought: string;  // meaningful when kind === 'thought' — the one-sentence claim
  context: string;  // meaningful when kind === 'thought' — prose, click-to-reveal
}

export interface UnisonNode {
  id: string;
  instanceId: string;
  ownerId: string;
  ownerHandle: string;
  kind: NodeKind;
  content: NodeContent;
  axisFrameIds: string[];
  topicId: string | null;
  parentIds: string[];
  edgeKind: EdgeKind;
  origin: Origin;
  sourceNodeId: string | null;
  sourceEntryId: string | null;
  sourceOwnerHandle: string | null;
  visibility: Visibility;
  publishedAt: string | null;
  promotedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // FRONTEND-ONLY (M0 mock, task item 3): marks the map's single home root —
  // a real, centered node other top-level nodes connect to, seeded from the
  // member's handle and editable in place via the existing topic-label
  // edit flow (NodeSheet). Has no backend counterpart yet.
  // TODO(M1+): persist a real home-node concept server-side (id, label) and
  // drop this client-only flag once UnisonNode carries it for real.
  isHome?: boolean;
  // SERVER-ENRICHED, feed reads only: GET /unison/feed denormalizes the
  // author's nearest topic-hub label onto each published thought (D10 — the
  // "by topic" lens needs a label, not just topicId) via
  // utils/unisonNodes.js#feed(). Absent on every other read path.
  topicLabel?: string;
}

// poleA = the "most" end (filled dot; right on x, top on y) — identical
// orientation rule to OasFrame.
export interface UnisonFrame {
  id: string;
  instanceId: string;
  parentInstanceId: string | null;
  poleA: string;
  poleB: string;
  key: string | null;
  createdBy: string;
  createdByName: string;
}

// A frame spec as sent to resolveFrame: borrow an existing frame by id, or
// coin a new pole pair (deduped server-side).
export type FrameSpec = { frameId: string } | { poleA: string; poleB: string };

// Mirrors utils/unisonCommunities.js toClientCommunity(). memberCount is
// only present on the GET /communities/:code lookup, not on create/join.
export interface Community {
  id: string;          // child Instance id
  slug: string;         // uni-<code>
  name: string;
  code: string;         // shareable join code (slug minus the uni- prefix, uppercased)
  createdAt: string;
  memberCount?: number;
}

// Mirrors toClientMembership() — the pseudonymous handle for THIS community.
export interface Membership {
  id: string;
  instanceId: string;
  userId: string;
  handle: string;
  role: string;
  joinedAt: string;
}

// A reply Entry, duck-typing the published thought as its activity
// (activityId = postNodeId). M1+ — modeled here so the resolve components
// and Post overlay have a real shape to render against.
export interface UnisonReply {
  id: string;
  activityId: string; // post node id
  userId: string;
  username: string;
  position: { x: number; y: number } | null;
  text: string;
  voterIds: string[];
  voteCount: number;
  createdAt: string;
  updatedAt: string;
}
