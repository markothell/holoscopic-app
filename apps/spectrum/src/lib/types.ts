// On a Spectrum — wire types matching apps/backend/utils/oasGames.js
// serializers (toClient / toClientNomination) and routes/oas.js payloads.

export type Phase =
  | 'lobby' | 'round1' | 'round2' | 'round3' | 'round4' | 'revise' | 'complete';

export const TIMED_PHASES: Phase[] = ['round1', 'round2', 'round3', 'round4', 'revise'];

export type MappingRound = 2 | 3 | 4;

export interface Participant {
  id: string;
  name: string;
  joinedAt?: string;
  isHost: boolean;
}

export interface RoundSeconds {
  round1: number;
  round2: number;
  round3: number;
  round4: number;
  revise: number;
}

export type RoundMode = 'timed' | 'manual';

export interface GameConfig {
  roundSeconds: RoundSeconds;
  roundMode: RoundMode;
  startingTokens: number;
  quorum: number;
  votesPerUser: number;
  maxPlayers: number;
}

export interface MapRef {
  nominationId: string;
  subtopicId: string;
  round: number;
  themeIndex: number;
}

export interface Proposal {
  id: string;
  proposedBy: string;
  proposedByName: string;
  topic: string;
  themes: string[];
  childGameId: string | null;
  createdAt: string;
}

export interface Game {
  id: string;
  instanceId: string;
  code: string;
  phase: Phase;
  phaseDeadline: string | null;
  serverNow: string;
  hostId: string;
  topic: string;
  themes: string[];
  participants: Participant[];
  config: GameConfig;
  maps: MapRef[];
  proposals: Proposal[];
  parentGameId: string | null;
  createdAt: string;
}

export type NominationKind = 'subtopic' | 'map';
export type NominationStatus = 'nominated' | 'confirmed' | 'expired';
export type MapStage = 'gather' | 'rank' | 'done' | 'closed';
export type Axis = 'x' | 'y';

// A frame = one spectrum with durable identity in this game: two poles the
// group ranks between. "Most" is always poleA (plots right on x, top on y).
export interface FrameRef {
  frameId: string;
  poleA: string;
  poleB: string;
}

// One frame on a map nomination's slate — the pre-quorum lens contest.
export interface SlateFrame extends FrameRef {
  proposedBy: string;
  proposedByName: string;
  voterIds: string[];
}

// What a nominate/propose call sends: borrow an existing lens by id, or
// coin a new one by its poles.
export type FrameSpec = { frameId: string } | { poleA: string; poleB: string };

export type WinningAxis = FrameRef;

export interface MapItem {
  entryId: string;
  index: number;
  // Short handle used to rank/reveal; `comment` is the substance being ranked.
  label: string;
  comment: string;
  authorId: string;
}

export interface RankingDone {
  userId: string;
  axis: Axis;
}

export interface MapState {
  stage: MapStage;
  stageDeadline: string | null;
  winningAxes: WinningAxis[];
  items: MapItem[];
  rankingDone: RankingDone[];
}

export interface Nomination {
  id: string;
  kind: NominationKind;
  round: number;
  themeIndex: number | null;
  title: string;
  // kind 'subtopic': parent in the round-1 tree (null = child of game topic).
  parentSubtopicId: string | null;
  subtopicId: string | null;
  // kind 'map', rounds 3–4: the carried previous-round item and the map it came
  // from. Null for round-2 maps (which seed from the subtopic tree).
  sourceEntryId: string | null;
  sourceMapId: string | null;
  dimensions: 1 | 2 | null;
  // kind 'map': the frame contest (nominator's seeds + rivals). Frozen at
  // confirmation, when its tally becomes mapState.winningAxes.
  frameSlate: SlateFrame[] | null;
  mapState: MapState | null;
  nominatedBy: string;
  nominatedByName: string;
  stakes: { userId: string; returned: boolean }[];
  quorumThreshold: number;
  status: NominationStatus;
  createdAt: string;
}

export interface MapCompletion {
  hasItem: boolean;
  rankedAxes: number;
  axesRequired: number;
  complete: boolean;
}

export interface MyMapState {
  nominationId: string;
  stakeReturned: boolean;
  completion: MapCompletion;
}

export interface Snapshot {
  game: Game;
  nominations: Nomination[];
  balance?: number;
  myMaps?: MyMapState[];
  serverNow: string;
}

export interface PhaseChangedPayload {
  phase: Phase;
  phaseDeadline: string | null;
  serverNow: string;
}

// ---------------------------------------------------------------------------
// Live map surface — content entries (utils/entries.js toClient shape) and
// the per-map detail payload.

export interface MapEntry {
  id: string;
  userId: string;
  username: string;
  slotNumber: number;
  questionId: string | null;
  objectName: string;
  position: { x: number; y: number } | null;
  text: string;
  voterIds: string[];
  voteCount: number;
  isSeed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MapResultDot {
  entryId: string;
  label: string;
  comment: string;
  authorId: string;
  x: number;
  y: number;
  // Rater disagreement (population std dev, 0 = consensus; 1D = the single
  // axis, 2D = both axes combined so a split on either one still shows).
  // Drives the 1D reveal's bar heights and the 2D reveal's dot halo.
  // count = how many ranked it.
  spread: number;
  count: number;
}

export interface MapDetail {
  nomination: Nomination;
  items: MapEntry[];
  myRankings?: Partial<Record<Axis, string[]>>;
  results?: MapResultDot[];
  serverNow: string;
}

// ---------------------------------------------------------------------------
// Aggregates — /oas/me/games (self-only history) and /oas/pulse (the public
// instance view). Pulse payloads carry no user identity by design.

export interface GameSummary {
  players: number;
  subtopicsConfirmed: number;
  mapsProposed: number;
  mapsRevealed: number;
  items: number;
  spectrums: number;
  // Mean rater disagreement across revealed maps (0 = consensus, 0.5 =
  // maximal split); null when nothing was ranked.
  spread: number | null;
}

export interface GameCard {
  id: string;
  code: string;
  topic: string;
  themes: string[];
  phase: Phase;
  phaseDeadline: string | null;
  players: number;
  rootGameId: string | null;
  parentGameId: string | null;
  createdAt: string;
  updatedAt: string;
  summary: GameSummary | null;
}

export interface MyGameStats {
  hosted: boolean;
  items: number;
  axesRanked: number;
  mapsCompleted: number;
  framesProposed: number;
}

export interface MySpectrum {
  key: string;
  poleA: string;
  poleB: string;
  games: number;
  firstUsedAt: string;
}

export interface MeGames {
  active: (GameCard & { hostedByMe: boolean })[];
  history: (GameCard & { my: MyGameStats })[];
  spectrums: MySpectrum[];
  serverNow: string;
}

export interface PulseConversation {
  rootGameId: string;
  rootTopic: string;
  latestTopic: string;
  latestThemes: string[];
  latestCode: string;
  latestPhase: Phase;
  games: number;
  generations: number;
  live: number;
  mapsRevealed: number;
  lastActiveAt: string;
  startedAt: string;
}

export interface PulseSpectrum {
  key: string;
  poleA: string;
  poleB: string;
  games: number;
  recent: boolean;
  lastUsedAt: string;
  subtopics: string[];
}

export interface Pulse {
  stats: {
    games: number;
    conversations: number;
    live: number;
    mapsRevealed: number;
    spectrums: number;
  };
  conversations: PulseConversation[];
  spectrums: PulseSpectrum[];
  serverNow: string;
}

export interface MapStagePayload {
  mapId: string;
  stage: MapStage;
  stageDeadline: string | null;
  serverNow: string;
  winningAxes: WinningAxis[];
  items: MapItem[];
  reason?: string;
}
