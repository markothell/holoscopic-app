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
  activityId: string;
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

export interface AxisPair {
  x: { min: string; max: string };
  y: { min: string; max: string };
}

export type NominationKind = 'subtopic' | 'map';
export type NominationStatus = 'nominated' | 'confirmed' | 'expired';

export interface Nomination {
  id: string;
  kind: NominationKind;
  round: number;
  themeIndex: number | null;
  title: string;
  subtopicId: string | null;
  axes: AxisPair | null;
  nominatedBy: string;
  nominatedByName: string;
  stakes: { userId: string; returned: boolean }[];
  quorumThreshold: number;
  status: NominationStatus;
  activityId: string | null;
  createdAt: string;
}

export interface MapCompletion {
  hasPosition: boolean;
  hasComment: boolean;
  votesCast: number;
  votesRequired: number;
  complete: boolean;
}

export interface MyMapState {
  activityId: string;
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
// Generic activity surface (live maps) — matches utils/entries.js toClient
// and the /api/activities routes.

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

export interface MapActivity {
  id: string;
  title: string;
  mapQuestion: string;
  commentQuestion: string;
  objectNameQuestion: string;
  xAxis: { label: string; min: string; max: string };
  yAxis: { label: string; min: string; max: string };
  votesPerUser: number | null;
  status: 'active' | 'completed';
  entries?: MapEntry[];
}
