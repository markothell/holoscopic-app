import { ApiError } from '@hs/api';
import type {
  Citation, Collaborator, Idea, Statement, StatementBoard, SynFrame, SynNode,
  SynthesisReply, SynthesisState,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// THE SAMPLE IDEA — invented content, no backend, no network.
//
// Two jobs, and only these two:
//   1. useMyMap seeds from MOCK_NODES and every mutation applies to local
//      state, so the DAG editor works with no live backend.
//   2. `demoMode` (page.tsx, opened from "Look around a sample idea") renders
//      the whole product on this corpus for someone who has never signed in.
//
// Everything below is WRITTEN, not captured: the people are invented, the
// thoughts are invented, and nothing here is saved anywhere. The demo says so
// on its own surfaces (see the sample-idea footers in the overlays) and keeps
// the "← exit demo" way out in the map's corner.
//
// The corpus has to carry the product's actual claim — a group converging on
// shared words — so it ships the whole loop: a map with borrowed thoughts from
// four other people, a reply thread with real spread, a Union read of the
// corpus, and a statement board sitting just above the ⅔ bar. The statement
// store below is deliberately MUTABLE, so a visitor can back a wording, watch
// the meter move, take it back, and watch the group fall out of synthesis.
// ─────────────────────────────────────────────────────────────────────────────

// One boot-time clock, so createdAt ordering is stable across a session and
// "as of 2h ago" reads the same on every render.
const BOOT = Date.now();
const ago = (minutes: number) => new Date(BOOT - minutes * 60_000).toISOString();
const now = () => ago(0);

export const MOCK_USER_ID = 'demo-owner';
export const MOCK_USER_HANDLE = 'you';

// The map's single home root. A real, centered node — every other top-level
// node in MOCK_NODES connects to it as a child, so the map renders as one
// connected tree rooted at home (see layoutMap, which places the lone depth-0
// node centered over its depth-1 children). Modeled as a 'topic' kind so its
// label reuses NodeSheet's existing topic-editing field as-is; `isHome` is the
// only thing that marks it as the root (types.ts). Its label is the IDEA's
// title — the same string the server seeds via utils/synNodes.js#seedHomeHub.
export const MOCK_HOME_NODE_ID = 'n_home';

export const MOCK_COMMUNITY: Idea = {
  id: 'idea-demo',
  slug: 'idea-demo',
  code: 'DEMO',
  title: 'Polarity is generative',
  visibility: 'private',
  synthesisThreshold: 2 / 3,
  statementSlots: 3,
  synthesisStatementId: 'st_hold',
  synthesisReached: true,
  synthesisReachedAt: ago(190),
  createdAt: ago(60 * 24 * 26),
  collaboratorCount: 7,
};

export const MOCK_MAX_MEMBERS = 50;

// ─── The people ──────────────────────────────────────────────────────────────
// Plain account display names. There is no per-idea handle any more (identity
// is your Holoscopic account name — see routes/synthesis.js#displayNameFor), so
// nothing here should read as a pseudonym.

export const MOCK_PEOPLE: Record<string, string> = {
  [MOCK_USER_ID]: MOCK_USER_HANDLE,
  'member-nadia': 'Nadia Okafor',
  'member-ben': 'Ben Sorrell',
  'member-priya': 'Priya Raghunathan',
  'member-june': 'June Halloran',
  'member-wes': 'Wes Ikeda',
  'member-cal': 'Cal Mbeki',
};

const nameFor = (userId: string) => MOCK_PEOPLE[userId] ?? 'someone';

// ─── The axis vocabulary ─────────────────────────────────────────────────────
// poleA is the "most" end (right on x, top on y). Coined by three different
// people, because a shared vocabulary that one person wrote is not shared.

export const MOCK_FRAMES: SynFrame[] = [
  {
    id: 'fr_charge',
    instanceId: MOCK_COMMUNITY.id,
    parentInstanceId: 'synthesis',
    poleA: 'generative',
    poleB: 'corrosive',
    key: null,
    createdBy: MOCK_USER_ID,
    createdByName: MOCK_USER_HANDLE,
  },
  {
    id: 'fr_stance',
    instanceId: MOCK_COMMUNITY.id,
    parentInstanceId: 'synthesis',
    poleA: 'hold it open',
    poleB: 'settle it',
    key: null,
    createdBy: 'member-nadia',
    createdByName: 'Nadia Okafor',
  },
  {
    id: 'fr_scale',
    instanceId: MOCK_COMMUNITY.id,
    parentInstanceId: 'synthesis',
    poleA: 'collective',
    poleB: 'personal',
    key: null,
    createdBy: 'member-ben',
    createdByName: 'Ben Sorrell',
  },
];

function node(partial: Partial<SynNode> & Pick<SynNode, 'id' | 'kind' | 'content'>): SynNode {
  const ownerId = partial.ownerId ?? MOCK_USER_ID;
  return {
    instanceId: MOCK_COMMUNITY.id,
    ownerId,
    ownerHandle: nameFor(ownerId),
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

// ─── My map ──────────────────────────────────────────────────────────────────
// Four hubs (one nested, so the size step is visible), five thoughts of my own,
// three carried in from other people's posts, and one marriage — so the whole
// shape language shows up on first load: hexagon vs. chamfered card, the hub
// size step, brass vs. periwinkle stroke, and the one teal join edge.

export const MOCK_NODES: SynNode[] = [
  node({
    id: MOCK_HOME_NODE_ID,
    kind: 'topic',
    content: { topic: MOCK_COMMUNITY.title, thought: '', context: '' },
    edgeKind: 'root',
    isHome: true,
    createdAt: ago(60 * 24 * 26),
  }),
  node({
    id: 'n_hub_tension',
    kind: 'topic',
    content: { topic: 'Tension', thought: '', context: '' },
    parentIds: [MOCK_HOME_NODE_ID],
    edgeKind: 'child',
    createdAt: ago(60 * 24 * 25),
  }),
  node({
    id: 'n_hub_making',
    kind: 'topic',
    content: { topic: 'Making', thought: '', context: '' },
    parentIds: [MOCK_HOME_NODE_ID],
    edgeKind: 'child',
    createdAt: ago(60 * 24 * 19),
  }),
  node({
    id: 'n_hub_groups',
    kind: 'topic',
    content: { topic: 'Groups', thought: '', context: '' },
    parentIds: [MOCK_HOME_NODE_ID],
    edgeKind: 'child',
    createdAt: ago(60 * 24 * 12),
  }),
  node({
    id: 'n_hub_collapse',
    kind: 'topic',
    content: { topic: 'Collapse', thought: '', context: '' },
    parentIds: ['n_hub_tension'],
    edgeKind: 'child',
    createdAt: ago(60 * 24 * 9),
  }),

  node({
    id: 'n_two_true',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'The tensions worth keeping are the ones where both ends are load-bearing.',
      context:
        'If one pole is simply wrong, there is no polarity — there is an error, and you fix it. What makes a tension generative is that removing either end breaks something you actually need. Speed and care. Openness and focus. Autonomy and alignment. Nobody wins those, and the attempt to win one is what produces the damage people then blame on the tension.',
    },
    parentIds: ['n_hub_tension'],
    edgeKind: 'child',
    topicId: 'n_hub_tension',
    axisFrameIds: ['fr_charge', 'fr_stance'],
    createdAt: ago(60 * 24 * 24),
  }),
  node({
    id: 'n_borrow_rhythm',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'A problem has a solution; a polarity has a rhythm.',
      context:
        'Carried in from Nadia’s post. Filed under Tension because the test she gives — did it come back? — is the one I keep reaching for before anything else.',
    },
    parentIds: ['n_hub_tension'],
    edgeKind: 'child',
    topicId: 'n_hub_tension',
    origin: 'borrowed',
    sourceNodeId: 'n_remote_rhythm',
    sourceEntryId: 'reply_owner_rhythm',
    sourceOwnerHandle: 'Nadia Okafor',
    axisFrameIds: ['fr_stance'],
    createdAt: ago(60 * 24 * 8),
  }),
  node({
    id: 'n_underground',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'A pole you suppress by decree comes back as sabotage.',
      context:
        'Decide once and for all that we ship fast, and care returns as quiet rework nobody logs. Decide once and for all that we do it properly, and speed returns as side projects routing around the process. The suppressed end does not leave. It goes underground, and underground it stops being negotiable.',
    },
    parentIds: ['n_hub_collapse'],
    edgeKind: 'child',
    topicId: 'n_hub_collapse',
    axisFrameIds: ['fr_charge', 'fr_scale'],
    createdAt: ago(60 * 24 * 7),
  }),
  node({
    id: 'n_constraint',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'A constraint is a pole you agreed to keep.',
      context:
        'The sonnet, the budget, the API you cannot break. Constraint gets talked about as a limit on making, but what it does is install a second force pulling against the first — and the work happens in the pull. Take the constraint away and most people do not get freer, they get vague.',
    },
    parentIds: ['n_hub_making'],
    edgeKind: 'child',
    topicId: 'n_hub_making',
    axisFrameIds: ['fr_charge', 'fr_stance'],
    createdAt: ago(60 * 24 * 18),
  }),
  node({
    id: 'n_borrow_oscillation',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'The oscillation is the engine, not the failure.',
      context:
        'Carried in from Ben. He means org cycles — centralize, decentralize, centralize — but it holds for a single afternoon of work too: I write loose, then cut hard, then write loose again, and the swinging is the method rather than a lack of one.',
    },
    parentIds: ['n_hub_making'],
    edgeKind: 'child',
    topicId: 'n_hub_making',
    origin: 'borrowed',
    sourceNodeId: 'n_ben_oscillation',
    sourceEntryId: 'reply_owner_osc',
    sourceOwnerHandle: 'Ben Sorrell',
    axisFrameIds: ['fr_charge'],
    createdAt: ago(60 * 24 * 5),
  }),
  node({
    id: 'n_third_thing',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'Two people who disagree well leave with a third thing neither walked in holding.',
      context:
        'This is the only reliable test I have for whether a disagreement was generative. At the end, is there something on the table that neither of you arrived with? If you both leave carrying exactly the position you brought, you had a negotiation. Nothing was made.',
    },
    parentIds: ['n_hub_groups'],
    edgeKind: 'child',
    topicId: 'n_hub_groups',
    axisFrameIds: ['fr_scale', 'fr_stance'],
    createdAt: ago(60 * 24 * 11),
  }),
  node({
    id: 'n_borrow_premature',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'Agreement reached too early is the loudest pole wearing everyone’s name.',
      context:
        'Carried in from Priya. I want to keep this next to the third-thing test, because they are the same test run from opposite ends: one asks what got made, the other asks what got buried.',
    },
    parentIds: ['n_hub_groups'],
    edgeKind: 'child',
    topicId: 'n_hub_groups',
    origin: 'borrowed',
    sourceNodeId: 'n_priya_premature',
    sourceEntryId: 'reply_owner_prem',
    sourceOwnerHandle: 'Priya Raghunathan',
    axisFrameIds: ['fr_scale'],
    createdAt: ago(60 * 24 * 3),
  }),
  // The marriage: two thoughts from different hubs joined into one. Inherits
  // the FIRST-selected parent's topic (D4), which is why it files under Tension.
  node({
    id: 'n_brief',
    kind: 'thought',
    content: {
      topic: '',
      thought: 'Saying both poles out loud is what turns a fight into a design brief.',
      context:
        'Marrying the load-bearing test to the constraint idea. A tension only becomes generative once both ends are stated as requirements instead of as sides. "We need to ship Thursday AND we need the changelog to be true" is a brief two people can work on. "You always rush" is a fight.',
    },
    parentIds: ['n_two_true', 'n_constraint'],
    edgeKind: 'marriage',
    topicId: 'n_hub_tension',
    axisFrameIds: ['fr_stance', 'fr_scale'],
    createdAt: ago(60 * 22),
  }),
];

// ─── Everyone else's thoughts ────────────────────────────────────────────────
// The rest of the idea's corpus: what the other six have published here. These
// are the nodes the feed lists, the posts a borrowed node points back at, and
// the raw material each collaborator's own map is rebuilt from.

const REMOTE_CORPUS: SynNode[] = [
  node({
    id: 'n_remote_rhythm',
    kind: 'thought',
    ownerId: 'member-nadia',
    content: {
      topic: '',
      thought: 'A problem has a solution; a polarity has a rhythm.',
      context:
        'The tell is whether it comes back. A problem, once solved, stays solved — you do not re-solve the broken door handle every quarter. A polarity comes back, and it comes back on a period: every reorg, every planning cycle, every second album. Since I started asking "did this come back?" I have stopped treating half my recurring problems as failures of execution.',
    },
    axisFrameIds: ['fr_charge', 'fr_stance'],
    topicLabel: 'Noticing',
    createdAt: ago(60 * 24 * 9),
  }),
  node({
    id: 'n_nadia_period',
    kind: 'thought',
    ownerId: 'member-nadia',
    content: {
      topic: '',
      thought: 'Ask how long the swing takes. If nobody knows, nobody is holding it.',
      context:
        'Every polarity I have watched play out has a period — six weeks, a quarter, two years. The groups that suffer least are the ones where somebody can tell you the number. Not because knowing it fixes anything, but because it turns "here we go again" into "right on time", and you can plan for right on time.',
    },
    axisFrameIds: ['fr_stance'],
    topicLabel: 'Noticing',
    createdAt: ago(60 * 24 * 4),
  }),
  node({
    id: 'n_nadia_carry',
    kind: 'thought',
    ownerId: 'member-nadia',
    content: {
      topic: '',
      thought: 'The question is never which pole. It is who is currently carrying the underweighted one.',
      context:
        'In practice one end always has fewer people arguing for it, usually the less glamorous end. Naming who is carrying it makes it a role instead of a personality trait — and roles rotate, whereas "the person who slows us down" does not.',
    },
    axisFrameIds: ['fr_scale', 'fr_stance'],
    topicLabel: 'Practice',
    createdAt: ago(60 * 26),
  }),
  node({
    id: 'n_ben_oscillation',
    kind: 'thought',
    ownerId: 'member-ben',
    content: {
      topic: '',
      thought: 'The oscillation is the engine, not the failure.',
      context:
        'Centralize, decentralize, centralize. Everyone treats the swing as evidence that the last reorg was wrong. It is evidence that the organization is a system with two real forces in it, and the swing is how it keeps finding a middle it cannot hold still in.',
    },
    axisFrameIds: ['fr_charge', 'fr_scale'],
    topicLabel: 'Systems',
    createdAt: ago(60 * 24 * 6),
  }),
  node({
    id: 'n_ben_apology',
    kind: 'thought',
    ownerId: 'member-ben',
    content: {
      topic: '',
      thought: 'Every reorg is an apology to the pole the last reorg ignored.',
      context:
        'Centralize and you get consistency and a queue. Decentralize and you get speed and drift. The next reorg is not a correction of a mistake, it is the system paying back what the last one borrowed. Announcing it as a mistake is what makes people cynical about the one after that.',
    },
    axisFrameIds: ['fr_charge'],
    topicLabel: 'Systems',
    createdAt: ago(60 * 24 * 2),
  }),
  node({
    id: 'n_priya_premature',
    kind: 'thought',
    ownerId: 'member-priya',
    content: {
      topic: '',
      thought: 'Agreement reached too early is the loudest pole wearing everyone’s name.',
      context:
        'The room goes quiet, somebody summarizes, everyone nods. Six weeks later half the group is quietly building something else. They did not change their minds — the other pole never got said, so it never got carried, and it went off to find its own budget.',
    },
    axisFrameIds: ['fr_scale', 'fr_stance'],
    topicLabel: 'Groups',
    createdAt: ago(60 * 24 * 4 + 120),
  }),
  node({
    id: 'n_priya_slow',
    kind: 'thought',
    ownerId: 'member-priya',
    content: {
      topic: '',
      thought: 'Protect the slowest objection in the room. It is usually the other pole trying to speak.',
      context:
        'The objection that arrives late and badly phrased is the one worth ten more minutes. It is late and badly phrased precisely because nobody has been rehearsing that side — which is exactly what makes it the side the group has not paid for yet.',
    },
    axisFrameIds: ['fr_scale'],
    topicLabel: 'Groups',
    createdAt: ago(60 * 20),
  }),
  node({
    id: 'n_june_curious',
    kind: 'thought',
    ownerId: 'member-june',
    content: {
      topic: '',
      thought: 'You can tell a generative argument by whether anyone is still curious at minute forty.',
      context:
        'Corrosive arguments get narrower — the same three sentences, louder. Generative ones get wider: somebody brings in an example nobody asked for and it lands. Curiosity at minute forty is the vital sign, and it is the one I check before deciding whether to stay in the room.',
    },
    axisFrameIds: ['fr_charge'],
    topicLabel: 'Signs',
    createdAt: ago(60 * 24 * 3 + 60),
  }),
  node({
    id: 'n_june_notall',
    kind: 'thought',
    ownerId: 'member-june',
    content: {
      topic: '',
      thought: 'Not everything that recurs is a polarity. Some things recur because nobody fixed them.',
      context:
        'I keep hearing "that is just a tension we hold" about things that turn out to be an unowned bug and a missing decision. Calling a mess a polarity is a very comfortable way to stop working on it, and this idea should be honest that the frame has that failure mode.',
    },
    axisFrameIds: ['fr_charge', 'fr_stance'],
    topicLabel: 'Signs',
    createdAt: ago(60 * 14),
  }),
  node({
    id: 'n_wes_values',
    kind: 'thought',
    ownerId: 'member-wes',
    content: {
      topic: '',
      thought: 'Most values statements are one pole with the other pole deleted.',
      context:
        '"We move fast." Fast against what counterforce? A value with no counterweight is not a value, it is a preference nobody has had to pay for yet. The honest version names both and says which one this quarter is leaning on.',
    },
    axisFrameIds: ['fr_scale'],
    topicLabel: 'Language',
    createdAt: ago(60 * 24 * 5 + 200),
  }),
  node({
    id: 'n_wes_hold',
    kind: 'thought',
    ownerId: 'member-wes',
    content: {
      topic: '',
      thought: 'Somebody has to be paid to hold both ends, or it is not being held.',
      context:
        'Holding a tension is work. It means being the person who says "and" in a room that wants "or", repeatedly, while being read as indecisive. If that job belongs to nobody, the tension resolves itself by default toward whoever is loudest, and everyone calls the result a decision.',
    },
    axisFrameIds: ['fr_scale', 'fr_stance'],
    topicLabel: 'Practice',
    createdAt: ago(60 * 9),
  }),
  node({
    id: 'n_cal_apprentice',
    kind: 'thought',
    ownerId: 'member-cal',
    content: {
      topic: '',
      thought: 'You learn a craft by being told two contradictory things until you can feel which one this moment wants.',
      context:
        'Loose wrist, firm grip. Follow the score, play it like you mean it. Beginners hear a contradiction and pick a side, and their work is stiff in one direction or the other. From outside, expertise looks like taste. From inside it is knowing which pole this particular bar is asking for.',
    },
    axisFrameIds: ['fr_charge', 'fr_stance'],
    topicLabel: 'Practice',
    createdAt: ago(60 * 5),
  }),
];

// A published thought belonging to someone else — the Post overlay demo reads
// against this (read-only, per D2/D6) with a reply map underneath.
export const MOCK_POST: SynNode = REMOTE_CORPUS[0];

export const MOCK_REPLIES: SynthesisReply[] = [
  {
    id: 'reply_ben_period', activityId: MOCK_POST.id, userId: 'member-ben', username: 'Ben Sorrell',
    position: { x: 0.82, y: 0.3 },
    text: 'The period is the useful half. If you know it comes back every planning cycle you can put the conversation on the calendar instead of being ambushed by it.',
    voterIds: ['member-priya', 'member-wes', MOCK_USER_ID], voteCount: 3, createdAt: ago(60 * 24 * 8), updatedAt: ago(60 * 24 * 8),
  },
  {
    id: 'reply_june_careful', activityId: MOCK_POST.id, userId: 'member-june', username: 'June Halloran',
    position: { x: 0.34, y: 0.72 },
    text: 'Careful. Some things come back because nobody ever actually fixed them. Recurrence is a prompt to look, not a proof.',
    voterIds: ['member-nadia', 'member-wes'], voteCount: 2, createdAt: ago(60 * 24 * 7 + 300), updatedAt: ago(60 * 24 * 7 + 300),
  },
  {
    id: 'reply_priya_amnesia', activityId: MOCK_POST.id, userId: 'member-priya', username: 'Priya Raghunathan',
    position: { x: 0.68, y: 0.6 },
    text: 'In my last team the period was about two years, which is longer than anyone’s memory of the previous swing. Institutional amnesia is what makes a polarity feel like a crisis.',
    voterIds: [MOCK_USER_ID], voteCount: 1, createdAt: ago(60 * 24 * 6), updatedAt: ago(60 * 24 * 6),
  },
  {
    id: 'reply_wes_grudge', activityId: MOCK_POST.id, userId: 'member-wes', username: 'Wes Ikeda',
    position: { x: 0.24, y: 0.34 },
    text: 'It comes back as a rhythm only where somebody is holding both ends. Left alone it comes back as a grudge.',
    voterIds: ['member-june'], voteCount: 1, createdAt: ago(60 * 24 * 5 + 45), updatedAt: ago(60 * 24 * 5 + 45),
  },
];

// ─── The feed ────────────────────────────────────────────────────────────────
// Recency-ordered across the whole idea — mine and everyone else's, newest
// first. `topicLabel` mirrors GET /synthesis/feed's server-side enrichment
// (utils/synNodes.js#feed) so the mock and real paths render identically.

const hubLabel = (topicId: string | null): string => {
  if (!topicId) return '';
  return MOCK_NODES.find(n => n.id === topicId)?.content.topic ?? '';
};

export const MOCK_FEED: SynNode[] = [
  // My own thoughts. A borrowed copy never appears here — its text is someone
  // else's and already in the feed at its source (utils/synIndex.js).
  ...MOCK_NODES
    .filter(n => n.kind === 'thought' && n.origin === 'own')
    .map(n => ({ ...n, topicLabel: hubLabel(n.topicId) })),
  ...REMOTE_CORPUS,
].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

// PostOverlay is opened for an explicit node id (a map thought, a feed item, or
// a borrowed node's source) — it may not live in the viewer's own map, so
// resolution falls back to the "remote" corpus. Deduped by id since MOCK_FEED
// already carries most of it.
const MOCK_REMOTE_NODES: SynNode[] = (() => {
  const byId = new Map<string, SynNode>();
  for (const n of [...REMOTE_CORPUS, ...MOCK_FEED]) if (!byId.has(n.id)) byId.set(n.id, n);
  return [...byId.values()];
})();

export function resolveMockRemoteNode(id: string): SynNode | undefined {
  return MOCK_REMOTE_NODES.find(n => n.id === id);
}

// ─── The roster ──────────────────────────────────────────────────────────────
// SynMembership means "has contributed" — so the counts below are the corpus,
// counted, not decoration. Cal joined last and has not spent a statement slot
// yet, which is who `stillToWeighIn` on the meter is talking about.

function countThoughts(userId: string): number {
  if (userId === MOCK_USER_ID) return MOCK_NODES.filter(n => n.kind === 'thought' && n.origin === 'own').length;
  return REMOTE_CORPUS.filter(n => n.ownerId === userId).length;
}

function countReplies(userId: string): number {
  return MOCK_REPLIES.filter(r => r.userId === userId).length;
}

const ROSTER: { userId: string; role: string; joinedAt: string }[] = [
  { userId: MOCK_USER_ID, role: 'admin', joinedAt: ago(60 * 24 * 26) },
  { userId: 'member-nadia', role: 'member', joinedAt: ago(60 * 24 * 22) },
  { userId: 'member-ben', role: 'member', joinedAt: ago(60 * 24 * 20) },
  { userId: 'member-priya', role: 'member', joinedAt: ago(60 * 24 * 15) },
  { userId: 'member-june', role: 'member', joinedAt: ago(60 * 24 * 11) },
  { userId: 'member-wes', role: 'member', joinedAt: ago(60 * 24 * 9) },
  { userId: 'member-cal', role: 'member', joinedAt: ago(60 * 24 * 2) },
];

export const MOCK_COLLABORATORS: Collaborator[] = ROSTER.map(r => ({
  id: `mem_${r.userId}`,
  instanceId: MOCK_COMMUNITY.id,
  userId: r.userId,
  handle: nameFor(r.userId),
  role: r.role,
  joinedAt: r.joinedAt,
  thoughtCount: countThoughts(r.userId),
  replyCount: countReplies(r.userId),
}));

// Someone else's published thinking, AS THEIR MAP (D18). Rebuilt from what
// they have published: a home hub carrying the idea's title, one hub per topic
// label they filed under, and their thoughts hanging off it — the same shape
// the server returns from /ideas/:code/collaborators/:userId/map.
export function mockCollaboratorMap(userId: string): SynNode[] {
  if (userId === MOCK_USER_ID) return MOCK_NODES;
  const theirs = REMOTE_CORPUS.filter(n => n.ownerId === userId);
  if (theirs.length === 0) return [];

  const homeId = `home_${userId}`;
  const out: SynNode[] = [
    node({
      id: homeId,
      kind: 'topic',
      ownerId: userId,
      content: { topic: MOCK_COMMUNITY.title, thought: '', context: '' },
      edgeKind: 'root',
      isHome: true,
    }),
  ];
  const hubs = new Set<string>();

  for (const thought of theirs) {
    const label = thought.topicLabel || '';
    const hubId = label ? `hub_${userId}_${label.toLowerCase().replace(/\W+/g, '')}` : homeId;
    if (label && !hubs.has(hubId)) {
      hubs.add(hubId);
      out.push(node({
        id: hubId,
        kind: 'topic',
        ownerId: userId,
        content: { topic: label, thought: '', context: '' },
        parentIds: [homeId],
        edgeKind: 'child',
      }));
    }
    out.push({ ...thought, parentIds: [hubId], edgeKind: 'child', topicId: label ? hubId : null });
  }

  return out;
}

// ─── The Union ───────────────────────────────────────────────────────────────
// What the LLM would return for this corpus, written by hand. Citations are
// assembled from the selection set server-side (never parsed from model
// output), so every nodeId/replyId here is a real deep-link target in the
// demo corpus and every chip opens the thought or reply it names.

export const MOCK_UNION_GENERATED_AT = ago(115);

export const MOCK_UNION_BRIEF =
  'The group has landed on a test rather than a definition: a tension is a polarity when both ends are load-bearing and it keeps coming back on a period, and an ordinary problem when one end is simply wrong. From there the work splits. Nadia Okafor and Wes Ikeda hold that carrying a polarity is a job somebody has to be given; June Halloran presses that recurrence proves nothing on its own. Nobody here has argued for resolving a polarity outright.';

// The full read does NOT restate the brief: both cards are on screen at once
// when a member expands, and a repeated paragraph reads as a bug.
export const MOCK_UNION_FULL =
  'Consensus: both ends of a real polarity are load-bearing, and the return is the tell — it comes back on a period, and the return is a property of the system rather than a failure of the last fix.'
  + '\n\nTension: what holding one actually costs. Wes Ikeda’s claim that somebody has to be paid to hold both ends has the most backing in the idea; June Halloran’s counter is that the label is used to excuse work nobody wants to own. Neither position has moved the other yet, and the group has not tried to settle it.'
  + '\n\nVoices: Nadia Okafor set the frame the rest of the idea is working inside. Priya Raghunathan supplies the failure case — early agreement that buries the quieter pole. Ben Sorrell keeps pulling the argument up to the level of systems. Cal Mbeki’s thought about learning a craft from two contradictory instructions is the newest thread and has drawn no replies yet.';

export const MOCK_UNION_BRIEF_CITATIONS: Citation[] = [
  { kind: 'node', nodeId: 'n_remote_rhythm', ownerHandle: 'Nadia Okafor', anchorUrl: '#n_remote_rhythm' },
  { kind: 'node', nodeId: 'n_wes_hold', ownerHandle: 'Wes Ikeda', anchorUrl: '#n_wes_hold' },
  { kind: 'reply', nodeId: 'n_remote_rhythm', replyId: 'reply_june_careful', ownerHandle: 'June Halloran', anchorUrl: '#reply_june_careful' },
  { kind: 'node', nodeId: 'n_two_true', ownerHandle: MOCK_USER_HANDLE, anchorUrl: '#n_two_true' },
];

export const MOCK_UNION_FULL_CITATIONS: Citation[] = [
  ...MOCK_UNION_BRIEF_CITATIONS,
  { kind: 'node', nodeId: 'n_priya_premature', ownerHandle: 'Priya Raghunathan', anchorUrl: '#n_priya_premature' },
  { kind: 'node', nodeId: 'n_ben_apology', ownerHandle: 'Ben Sorrell', anchorUrl: '#n_ben_apology' },
  { kind: 'node', nodeId: 'n_cal_apprentice', ownerHandle: 'Cal Mbeki', anchorUrl: '#n_cal_apprentice' },
];

// ─── The statement board ─────────────────────────────────────────────────────
// The one part of the demo that is MUTABLE, because the product's whole claim
// is that a group converges on shared words and a static screenshot cannot show
// that. The arithmetic below mirrors utils/synStatements.js exactly — the same
// ceil() bar, the same slot budget (authoring or backing costs one, backing
// your own is free because authoring already paid), the same living measure
// recomputed from current votes on every read. State lives at module scope so
// it survives an overlay closing and reopening.

export const MOCK_STATEMENT_SLOTS = 3;
const MOCK_UNION_ID = 'un_demo_brief';

interface MockStatement {
  id: string;
  authorId: string;
  text: string;
  sourceUnionId: string | null;
  status: 'live' | 'withdrawn';
  voterIds: string[];
  createdAt: string;
}

const STATEMENT_SEED: MockStatement[] = [
  {
    id: 'st_hold',
    authorId: 'member-nadia',
    text: 'A tension is worth holding when both ends are load-bearing: take either away and something the group needs falls over. Those we name, schedule and staff. Everything else is a problem, and problems get fixed.',
    sourceUnionId: MOCK_UNION_ID,
    status: 'live',
    voterIds: ['member-nadia', MOCK_USER_ID, 'member-priya', 'member-june', 'member-wes'],
    createdAt: ago(60 * 24 * 3),
  },
  {
    id: 'st_test',
    authorId: 'member-june',
    text: 'Before we agree to hold a tension, somebody has to say what would make it a plain unowned problem instead. If nobody can answer that, we are not holding a polarity, we are avoiding a decision.',
    sourceUnionId: null,
    status: 'live',
    voterIds: ['member-june', 'member-wes', 'member-nadia'],
    createdAt: ago(60 * 30),
  },
  {
    id: 'st_swing',
    authorId: 'member-ben',
    text: 'Stop calling the swing a mistake. Centralize, decentralize, centralize — the oscillation is how a system pays back what the last decision borrowed, and announcing it as failure is what makes people cynical about the next one.',
    sourceUnionId: MOCK_UNION_ID,
    status: 'live',
    voterIds: ['member-ben', 'member-priya'],
    createdAt: ago(60 * 24 * 2 + 90),
  },
];

let demoStatements: MockStatement[] = STATEMENT_SEED.map(s => ({ ...s, voterIds: [...s.voterIds] }));

const listeners = new Set<() => void>();
function announce() { listeners.forEach(fn => fn()); }

/** The demo's statement store is shared across overlays and the map's home hub,
 *  so anything drawing the measure can follow it. Returns an unsubscribe. */
export function subscribeMockStatements(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const live = () => demoStatements.filter(s => s.status === 'live');

function slotsUsedBy(userId: string): number {
  return live().filter(s => s.authorId === userId || s.voterIds.includes(userId)).length;
}

function assertHasSlot(userId: string) {
  if (slotsUsedBy(userId) >= MOCK_STATEMENT_SLOTS) {
    throw new ApiError(409, `You are holding all ${MOCK_STATEMENT_SLOTS} of your statement slots`);
  }
}

// Most-backed first, ties to the earlier submission — synStatements.js#rank.
function rank(statements: MockStatement[]): MockStatement[] {
  return [...statements].sort((a, b) => {
    if (b.voterIds.length !== a.voterIds.length) return b.voterIds.length - a.voterIds.length;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function mockSynthesisState(): SynthesisState {
  const statements = live();
  const collaboratorCount = MOCK_COMMUNITY.collaboratorCount ?? 0;
  const threshold = MOCK_COMMUNITY.synthesisThreshold;
  const votesToReach = Math.max(1, Math.ceil(collaboratorCount * threshold));
  const leading = rank(statements)[0] ?? null;
  const backing = leading?.voterIds.length ?? 0;

  const engaged = new Set<string>();
  for (const s of statements) {
    engaged.add(s.authorId);
    for (const v of s.voterIds) engaged.add(v);
  }

  return {
    collaboratorCount,
    threshold,
    votesToReach,
    leadingStatementId: leading?.id ?? null,
    backing,
    share: collaboratorCount > 0 ? backing / collaboratorCount : 0,
    inSynthesis: backing >= votesToReach && backing > 0,
    stillToWeighIn: Math.max(0, collaboratorCount - engaged.size),
  };
}

export function mockStatementBoard(userId: string): StatementBoard {
  const state = mockSynthesisState();
  const statements: Statement[] = rank(live()).map(s => ({
    id: s.id,
    instanceId: MOCK_COMMUNITY.id,
    authorId: s.authorId,
    authorHandle: nameFor(s.authorId),
    text: s.text,
    sourceUnionId: s.sourceUnionId,
    status: s.status,
    voteCount: s.voterIds.length,
    votedByMe: s.voterIds.includes(userId),
    mine: s.authorId === userId,
    createdAt: s.createdAt,
    votesNeeded: Math.max(0, state.votesToReach - s.voterIds.length),
    share: state.collaboratorCount > 0 ? s.voterIds.length / state.collaboratorCount : 0,
    isLeading: s.id === state.leadingStatementId,
    isSynthesis: state.inSynthesis && s.id === state.leadingStatementId,
  }));

  return { ...state, statements, slotsUsed: slotsUsedBy(userId), slotsTotal: MOCK_STATEMENT_SLOTS };
}

export function mockVoteStatement(statementId: string, userId: string): void {
  const statement = demoStatements.find(s => s.id === statementId);
  if (!statement || statement.status !== 'live') throw new ApiError(409, 'That statement was withdrawn');
  if (statement.voterIds.includes(userId)) {
    statement.voterIds = statement.voterIds.filter(v => v !== userId);
  } else {
    // Authoring already paid for the author's own statement, so backing it is free.
    if (statement.authorId !== userId) assertHasSlot(userId);
    statement.voterIds = [...statement.voterIds, userId];
  }
  announce();
}

export function mockWithdrawStatement(statementId: string, userId: string): void {
  const statement = demoStatements.find(s => s.id === statementId);
  if (!statement) throw new ApiError(404, 'Statement not found');
  if (statement.authorId !== userId) throw new ApiError(403, 'Only the author can withdraw a statement');
  statement.status = 'withdrawn';
  statement.voterIds = [];
  announce();
}

export function mockSubmitStatement(text: string, userId: string, fromUnion: boolean): void {
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new ApiError(400, 'A statement needs some text');
  assertHasSlot(userId);
  demoStatements = [
    ...demoStatements,
    {
      id: `st_local_${Math.random().toString(36).slice(2, 8)}`,
      authorId: userId,
      text: clean,
      sourceUnionId: fromUnion ? MOCK_UNION_ID : null,
      status: 'live',
      voterIds: [userId],
      createdAt: new Date().toISOString(),
    },
  ];
  announce();
}
