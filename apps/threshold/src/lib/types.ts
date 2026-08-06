// Wire types. These mirror the backend's serializers exactly — change one and
// change the other in the same commit:
//
//   Circle / Seed  → apps/backend/utils/circles.js#toClient, #toClientSeed
//   Share          → apps/backend/utils/threshold.js#toClientShare
//   SeedResult     → the shape computeResult() stores on seed.result (PLAN §5.3)
//   CircleResult   → apps/backend/utils/threshold.js#circleResult

export type Pole = 'A' | 'B';

/** A seed's payload, after utils/threshold.js#normalizeSeed. */
export interface SeedPayload {
  topic: string;
  poleA: string;
  poleB: string;
  secondsPerNote: number;
}

/**
 * The per-share output of a revealed cycle.
 *
 * `agreement` is a POSITION on one axis: 1.0 is unanimously pole A, 0.0
 * unanimously pole B, 0.5 a dead split. `coherence` is |2·agreement − 1|, the
 * same fact as a magnitude.
 *
 * No band classification is stored, deliberately (D15) — grouping these into
 * "agreed" and "contested" is a render-time choice, so changing where the line
 * sits costs a re-render and never a migration.
 */
export interface ShareResult {
  shareId: string;
  agreement: number;
  coherence: number;
  splits: { a: number; b: number };
}

export interface SeedResult {
  computedAt: string;
  /** How many COMPLETE rankings fed this. 0 → nothing was ranked; 1 → every
   *  share reads as unanimous by construction, so the reveal must suppress the
   *  coherence framing rather than claim agreement (§6.1). */
  rankers: number;
  shares: ShareResult[];
  unanimous: number;
  meanCoherence: number | null;
}

export interface Seed {
  id: string;
  authorId: string;
  order: number;
  payload: SeedPayload;
  phase: 'pending' | 'share' | 'rank' | 'revealed';
  openedAt: string | null;
  phaseDeadline: string | null;
  revealedAt: string | null;
  result: SeedResult | null;
}

export interface Member {
  userId: string;
  username: string;
}

export interface Circle {
  id: string;
  activity: 'threshold';
  title: string;
  urlName: string;
  mode: 'single' | 'circle';
  status: 'draft' | 'open' | 'running' | 'complete';
  phase: 'draft' | 'seeding' | 'cycle' | 'complete';
  /** The deadline of whatever phase is live — the circle's while seeding, the
   *  active seed's during a cycle. Null means that phase has no clock, which is
   *  a supported configuration (D16), not a missing value. */
  phaseDeadline: string | null;
  cycleIndex: number;
  seedCount: number;
  memberCount: number;
  members: Member[];
  currentSeed: Seed | null;
  seeds: Seed[];
  mySeed: Seed | null;
  isCreator: boolean;
  isMember: boolean;
  startedAt: string | null;
  completedAt: string | null;

  /** Present only on GET /circles/:urlName, and only while a seed is live. */
  shares?: Share[];
  myRanking?: MyRanking | null;
}

export interface ShareAudio {
  url: string;
  contentType: string;
  /** Timed by the client while recording. NEVER read off the file: iOS writes
   *  MP4 with no duration metadata, which surfaces as Infinity in every player
   *  and an un-scrubbable track. */
  durationMs: number;
  peaks: number[];
  sizeBytes: number;
  pathname?: string;
}

export interface Share {
  id: string;
  seedId: string;
  pole: Pole;
  title: string;
  text: string;
  audio: ShareAudio | null;
  transcript: { status: 'skipped' | 'pending' | 'done' | 'failed'; text: string };
  isMine: boolean;
  createdAt: string;
  /** Absent while ranking, for everyone but you. The server strips these — the
   *  client never receives an identity it is meant to be hiding (D9, D17), so
   *  there is nothing here to accidentally render. */
  userId?: string;
  username?: string;
}

export interface Placement {
  shareId: string;
  pole: Pole;
}

export interface MyRanking {
  placements: Placement[];
  /** Null while a draft. Nothing counts toward advancement, and nothing reaches
   *  the aggregate, until this is set. */
  submittedAt: string | null;
}

export interface CircleResultTopic {
  seedId: string;
  topic: string;
  poleA: string;
  poleB: string;
  rankers: number;
  unanimous: number;
  shareCount: number;
  meanCoherence: number | null;
}

export interface CircleResult {
  topics: CircleResultTopic[];
  /** The topic this group split hardest on — the headline of the final screen. */
  mostContested: string | null;
}
