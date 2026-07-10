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

export interface GameConfig {
  roundSeconds: RoundSeconds;
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

export interface WinningAxis {
  entryId: string;
  label: string;
}

export interface MapItem {
  entryId: string;
  index: number;
  label: string;
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
  subtopicId: string | null;
  dimensions: 1 | 2 | null;
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
  authorId: string;
  x: number;
  y: number;
}

export interface MapDetail {
  nomination: Nomination;
  items: MapEntry[];
  axisIdeas: MapEntry[];
  myRankings?: Partial<Record<Axis, string[]>>;
  results?: MapResultDot[];
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
