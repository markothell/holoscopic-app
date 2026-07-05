export type Phase = 'lobby' | 'nominate' | 'rank' | 'reveal';
export type Axis = 'x' | 'y';

export interface Participant {
  id: string;
  name: string;
  joinedAt?: string;
  isHost: boolean;
}

export interface RosterMember {
  id: string;
  name: string;
  subjectIndex: number;
}

export interface WinningAxis {
  entryId: string;
  label: string;
}

export interface RankingDone {
  playerId: string;
  axis: Axis;
}

export interface GameConfig {
  nominateSeconds: number;
  votesPerUser: number;
  maxNominationsPerPlayer: number;
  maxPlayers: number;
}

export interface Game {
  id: string;
  code: string;
  phase: Phase;
  phaseDeadline: string | null;
  serverNow: string;
  hostId: string;
  participants: Participant[];
  roster: RosterMember[];
  winningAxes: WinningAxis[];
  rankingDone: RankingDone[];
  config: GameConfig;
  createdAt: string;
}

export interface Nomination {
  id: string;
  userId: string;
  username: string;
  text: string;
  voterIds: string[];
  voteCount: number;
  createdAt: string;
}

export interface Story {
  axis: Axis;
  raterId: string;
  raterName: string;
  text: string;
  createdAt: string;
}

export interface ResultDot {
  playerId: string;
  name: string;
  x: number;
  y: number;
  stories: Story[];
}

export interface Snapshot {
  game: Game;
  nominations: Nomination[];
  results?: ResultDot[];
}

export interface PlayerIdentity {
  playerId: string;
  name: string;
  token: string | null;
}

export interface PhaseChangedPayload {
  phase: Phase;
  phaseDeadline: string | null;
  serverNow: string;
  winningAxes: WinningAxis[];
  roster: RosterMember[];
  results?: ResultDot[];
  reason?: string;
}
