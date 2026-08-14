// Wire types mirroring apps/backend/models/SynNode.js / SynFrame.js and
// the utils/synNodes.js toClient() serializer. See apps/synthesis/PLAN.md §4.

export type NodeKind = 'topic' | 'thought';
export type EdgeKind = 'root' | 'child' | 'marriage';
export type Origin = 'own' | 'borrowed';
export type Visibility = 'private' | 'published';

// The platform's one recording wire shape — mirrors ThresholdShare.audio and
// Memory.body.audio, validated server-side by utils/audioPayload.js.
export interface NodeAudio {
  url: string;
  pathname?: string;
  contentType: string;
  /** Timed by the client while recording — iOS MP4 carries no duration
   *  metadata, so the file's own reading is Infinity. */
  durationMs: number;
  peaks: number[];
  sizeBytes: number;
}

export interface NodeContent {
  topic: string;    // meaningful when kind === 'topic'
  thought: string;  // meaningful when kind === 'thought' — the one-sentence claim
  context: string;  // meaningful when kind === 'thought' — prose, click-to-reveal
  /** D20 — a voice on the thought, recorded as/with its context. Null or
   *  absent means typed-only. Never on a topic hub. */
  audio?: NodeAudio | null;
}

export interface SynNode {
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
  // drop this client-only flag once SynNode carries it for real.
  isHome?: boolean;
  // SERVER-ENRICHED, feed reads only: GET /synthesis/feed denormalizes the
  // author's nearest topic-hub label onto each published thought (D10 — the
  // "by topic" lens needs a label, not just topicId) via
  // utils/synNodes.js#feed(). Absent on every other read path.
  topicLabel?: string;
}

// poleA = the "most" end (filled dot; right on x, top on y) — identical
// orientation rule to OasFrame.
export interface SynFrame {
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

// Mirrors utils/synIdeas.js toClientIdea(). An idea is a thought space — a
// title, the map that grows under it, and the statement a group may reach
// Synthesis on. `collaboratorCount` is only present on the GET /ideas/:code
// lookup, the browse directory, and /me/ideas — never on create/join.
export interface Idea {
  id: string;            // child Instance id
  slug: string;          // idea-<code>
  title: string;         // labels the home hub at the centre of every map
  code: string;          // shareable join code (slug minus the idea- prefix, uppercased)
  visibility: 'public' | 'private';
  synthesisThreshold: number; // share of collaborators needed to reach Synthesis (D12)
  statementSlots: number;     // combined author+vote budget per collaborator (D14)
  synthesisStatementId: string | null;
  synthesisReached: boolean;
  synthesisReachedAt: string | null;
  createdAt: string;
  collaboratorCount?: number;
}

// One row of the app's home surface: an idea plus how I stand in it.
export interface MyIdea extends Idea {
  membership: Membership;
  collaboratorCount: number;
  draftedByMe: boolean;   // I hold the 'admin' role — I started this idea
  lastActivityAt: string;
}

// A roster row on the social page — who is working on this idea.
export interface Collaborator extends Membership {
  publishedCount: number; // published thoughts (drafts stay private)
  replyCount: number;
}

// Where the group stands right now (utils/synStatements.js#synthesisState).
// Recomputed from current votes on every read — Synthesis is a living measure,
// so this can move in both directions and is never a latched flag.
export interface SynthesisState {
  collaboratorCount: number;
  threshold: number;          // the share needed, e.g. 2/3
  votesToReach: number;       // collaborators needed behind one wording
  leadingStatementId: string | null;
  backing: number;            // how many are behind the leading wording
  share: number;              // backing / collaboratorCount — what the meter fills to
  inSynthesis: boolean;       // share is at or above the bar
  stillToWeighIn: number;     // collaborators who have spent no slot at all
}

// A statement someone has put to the group, as the voting surface sees it.
export interface Statement {
  id: string;
  instanceId: string;
  authorId: string;
  authorHandle: string;
  text: string;
  sourceUnionId: string | null; // the Union read it was drafted from, if any
  status: 'live' | 'withdrawn';
  voteCount: number;
  votedByMe: boolean;
  mine: boolean;
  createdAt: string;
  // Present on the leaderboard read only:
  votesNeeded?: number;   // how many more to carry the group
  share?: number;         // this wording's share of the group
  isLeading?: boolean;
  isSynthesis?: boolean;  // leading AND above the bar
}

// GET /statements — the board plus the measure plus my budget, in one read.
export interface StatementBoard extends SynthesisState {
  statements: Statement[];
  slotsUsed: number;
  slotsTotal: number;
}

// Mirrors toClientMembership() — the pseudonymous handle for THIS idea.
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
export interface SynthesisReply {
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

// S1 union (UNION.md §6). Mirrors routes/synthesis.js's SSE
// contract and models/SynUnion.js's citationSchema. Assembled
// server-side from the selection set (never parsed from model output), so
// `nodeId`/`replyId` are trustworthy deep-link targets — UnionOverlay
// routes a click through those, not anchorUrl. `layer` is only ever present
// on a fresh `kind:'node'` citation off the live stream (assembleCitations
// sets it, but SynUnion's schema doesn't persist it) — a cached
// artifact from GET /synthesis won't carry it back.
export interface Citation {
  kind: 'node' | 'reply';
  nodeId: string;
  layer?: string;
  replyId?: string;
  ownerHandle: string;
  anchorUrl: string;
}

// One depth's cached artifact off models/SynUnion.js — brief (2-4
// sentences) or full (structured read). `atCorpusVersion` is the corpusVersion
// this text was generated AT; SynthesisCache.stale compares it to the live one.
export interface SynthesisArtifact {
  text: string;
  citations: Citation[];
  generatedAt: string | null;
  model: string;
  atCorpusVersion: number;
}

// GET /synthesis/synthesis's response shape — the cached brief/full (if either
// has ever been generated), the community's live corpusVersion, and whether
// the cached BRIEF is stale relative to it (routes/synthesis.js#toClientCache).
export interface SynthesisCache {
  brief?: SynthesisArtifact;
  full?: SynthesisArtifact;
  corpusVersion: number;
  stale: boolean;
}

export type SynthesisDepth = 'brief' | 'full';
