import type { Idea, SynFrame, SynNode, SynthesisReply } from './types';

// Seed/mock data so the app renders and is fully interactive with no live
// backend (routes/synthesis.js is being built in parallel). useMyMap seeds from
// this, then every mutation applies to local state; if the backend answers,
// great, if not, the map keeps working offline-first for M0 review.

const now = () => new Date().toISOString();

export const MOCK_USER_ID = 'demo-owner';
export const MOCK_USER_HANDLE = 'you';

// Task item 3: the map's single home root. A real, centered node — every
// other top-level node in MOCK_NODES connects to it as a child, so the map
// renders as one connected tree rooted at home (see layoutMap, which places
// the lone depth-0 node centered over its depth-1 children). Modeled as a
// 'topic' kind so its label reuses NodeSheet's existing topic-editing field
// as-is; `isHome` is the only thing that marks it as the root (types.ts). Its
// label is the IDEA'''s title — the same string the server seeds via
// utils/synNodes.js#seedHomeHub.
export const MOCK_HOME_NODE_ID = 'n_home';

export const MOCK_COMMUNITY: Idea = {
  id: 'idea-demo',
  slug: 'idea-demo',
  code: 'DEMO',
  title: 'What makes a ritual',
  visibility: 'private',
  synthesisThreshold: 2 / 3,
  statementSlots: 3,
  synthesisStatementId: null,
  synthesisReached: false,
  synthesisReachedAt: null,
  createdAt: now(),
  collaboratorCount: 6,
};

export const MOCK_MAX_MEMBERS = 50;

export const MOCK_FRAMES: SynFrame[] = [
  {
    id: 'fr_depth',
    instanceId: MOCK_COMMUNITY.id,
    parentInstanceId: 'synthesis',
    poleA: 'considered',
    poleB: 'instinctive',
    key: null,
    createdBy: MOCK_USER_ID,
    createdByName: MOCK_USER_HANDLE,
  },
  {
    id: 'fr_scope',
    instanceId: MOCK_COMMUNITY.id,
    parentInstanceId: 'synthesis',
    poleA: 'collective',
    poleB: 'personal',
    key: null,
    createdBy: 'member-briar',
    createdByName: 'briar',
  },
];

function node(partial: Partial<SynNode> & Pick<SynNode, 'id' | 'kind' | 'content'>): SynNode {
  return {
    instanceId: MOCK_COMMUNITY.id,
    ownerId: MOCK_USER_ID,
    ownerHandle: MOCK_USER_HANDLE,
    axisFrameIds: [],
    topicId: null,
    parentIds: [],
    edgeKind: 'root',
    origin: 'own',
    sourceNodeId: null,
    sourceEntryId: null,
    sourceOwnerHandle: null,
    promotedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...partial,
  };
}

// A small starter map: one hub with two of your own thoughts (one published)
// and one borrowed thought (color = origin, per PLAN §2/§7), so both node
// kinds and both origin colors are visible on first load.
export const MOCK_NODES: SynNode[] = [
  node({
    id: MOCK_HOME_NODE_ID,
    kind: 'topic',
    content: { topic: MOCK_COMMUNITY.title, thought: '', context: '' },
    edgeKind: 'root',
    isHome: true,
  }),
  node({
    id: 'n_hub_craft',
    kind: 'topic',
    content: { topic: 'Craft', thought: '', context: '' },
    parentIds: [MOCK_HOME_NODE_ID],
    edgeKind: 'child',
  }),
  node({
    id: 'n_slow',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'Good work resists the schedule that produced it.',
      context: 'Every deadline compresses a decision that deserved more room. The tell is regret that shows up after ship, not before — that\'s the decision that got compressed.',
    },
    parentIds: ['n_hub_craft'],
    edgeKind: 'child',
    topicId: 'n_hub_craft',
    axisFrameIds: ['fr_depth'],
  }),
  node({
    id: 'n_tools',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'The tool shapes the thought before the thought shapes the tool.',
      context: 'Pick up a hammer and the world fills with nails. Worth naming which of your tools are doing that to you right now.',
    },
    parentIds: ['n_hub_craft'],
    edgeKind: 'child',
    topicId: 'n_hub_craft',
    axisFrameIds: ['fr_depth', 'fr_scope'],
  }),
  node({
    id: 'n_borrowed_ritual',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'A ritual is just a decision you no longer have to make.',
      context: 'Borrowed from briar\'s post on habit — filed under the same hub because that\'s where their thought lived too.',
    },
    ownerHandle: MOCK_USER_HANDLE,
    parentIds: [MOCK_HOME_NODE_ID],
    edgeKind: 'child',
    origin: 'borrowed',
    sourceNodeId: 'n_remote_ritual',
    sourceEntryId: 'entry_remote_1',
    sourceOwnerHandle: 'briar',
    axisFrameIds: ['fr_scope'],
  }),
];

// A published thought belonging to someone else — the Post overlay demo
// reads against this (read-only, per D2/D6) with a reply map underneath.
export const MOCK_POST: SynNode = node({
  id: 'n_remote_ritual',
  kind: 'thought',
  content: {
    topic: '',
    thought: 'A ritual is just a decision you no longer have to make.',
    context: 'The morning routine isn\'t about discipline — it\'s about not re-litigating the same choice at 6am every day. Worth asking which of your daily frictions are actually undecided decisions.',
  },
  ownerId: 'member-briar',
  ownerHandle: 'briar',
  parentIds: [],
  edgeKind: 'root',
  axisFrameIds: ['fr_depth', 'fr_scope'],
});

export const MOCK_REPLIES: SynthesisReply[] = [
  {
    id: 'reply_1', activityId: 'n_remote_ritual', userId: 'member-oat', username: 'oat',
    position: { x: 0.78, y: 0.72 }, text: 'This is why I keep the same three breakfasts on rotation.',
    voterIds: ['member-june', MOCK_USER_ID], voteCount: 2, createdAt: now(), updatedAt: now(),
  },
  {
    id: 'reply_2', activityId: 'n_remote_ritual', userId: 'member-june', username: 'june',
    position: { x: 0.3, y: 0.65 }, text: 'Only true until the ritual outlives the reason for it.',
    voterIds: [], voteCount: 0, createdAt: now(), updatedAt: now(),
  },
  {
    id: 'reply_3', activityId: 'n_remote_ritual', userId: 'member-wren', username: 'wren',
    position: { x: 0.6, y: 0.22 }, text: 'True for mornings, false for conversations — every "ritual" reply is a decision not to listen.',
    voterIds: [MOCK_USER_ID], voteCount: 1, createdAt: now(), updatedAt: now(),
  },
];

// Recency-ordered feed of published thoughts across the community — the
// Feed overlay stub sorts this by recency / topic / author (D10). topicLabel
// mirrors GET /synthesis/feed's server-side enrichment (utils/synNodes.js
// #feed) so the mock and real paths render identically.
export const MOCK_FEED: SynNode[] = [
  { ...MOCK_POST, topicLabel: '' },
  node({
    id: 'n_feed_2', kind: 'thought', ownerId: 'member-oat', ownerHandle: 'oat',
    content: { topic: '', thought: 'Consensus is what\'s left after everyone stops arguing, not what\'s true.', context: '' },
    topicId: null, axisFrameIds: ['fr_scope'], topicLabel: '',
  }),
  node({
    id: 'n_feed_3', kind: 'thought', ownerId: 'member-wren', ownerHandle: 'wren',
    content: { topic: '', thought: 'The best critique arrives as a question, not a verdict.', context: '' },
    topicId: null, axisFrameIds: ['fr_depth'], topicLabel: '',
  }),
  node({
    id: 'n_slow', kind: 'thought', ownerId: MOCK_USER_ID, ownerHandle: MOCK_USER_HANDLE,
    content: MOCK_NODES.find(n => n.id === 'n_slow')!.content, topicId: 'n_hub_craft', axisFrameIds: ['fr_depth'], topicLabel: 'Craft',
  }),
];

// Task item 1/2: PostOverlay is opened for an explicit node id (a map
// thought, a feed item, or a borrowed node's source) — it may not live in
// the viewer's own map, so resolution falls back to the mock "remote"
// corpus below (a published post by someone else + the feed). Deduped by
// id since MOCK_FEED already includes MOCK_POST.
const MOCK_REMOTE_NODES: SynNode[] = (() => {
  const byId = new Map<string, SynNode>();
  for (const n of [MOCK_POST, ...MOCK_FEED]) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()];
})();

export function resolveMockRemoteNode(id: string): SynNode | undefined {
  return MOCK_REMOTE_NODES.find(n => n.id === id);
}
