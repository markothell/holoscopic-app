// Wire types. These mirror the backend's serializers exactly — change one and
// change the other in the same commit:
//
//   Circle / Seed  → apps/backend/utils/circles.js#toClient, #toClientSeed
//   Share          → apps/backend/utils/threshold.js#toClientShare
//   SeedResult     → the shape computeResult() stores on seed.result (PLAN §5.3)
//   CircleResult   → apps/backend/utils/threshold.js#circleResult

export type Pole = 'A' | 'B';

/**
 * OPAQUE to the circle layer — each activity module owns and validates its own
 * shape (apps/backend/utils/circleActivities.js). The fields below are the
 * union of what the surfaces in this app read: `topic` is the label every
 * generic surface uses and every module fills in, the poles and clock are
 * Threshold's, and the idea fields are a shared synthesis document's.
 */
export interface SeedPayload {
  topic: string;
  poleA: string;
  poleB: string;
  secondsPerNote: number;
  /** activity 'synthesis': the idea this seed shares with the circle. */
  ideaId?: string;
  ideaCode?: string;
  /** The idea's title, snapshotted when it was shared. */
  title?: string;
  /** activity 'gather' (utils/gather.js#normalizeSeed; `topic` mirrors it): */
  prompt?: string;
  context?: string;
  shape?: GatherShape;
  /** 1–2 pole pairs, placement shapes only. */
  axes?: GatherAxis[];
  /** 'open' = a live wall; 'sealed' = own-only until the close. */
  reveal?: 'open' | 'sealed';
  reactions?: boolean;
  editAfterClose?: boolean;
  respondHours?: number | null;
  /** S1 — which act the respond surface leads with (story shapes). */
  telling?: 'voice' | 'text';
  /** S3 — place anywhere, or four named quadrants (two-axis shapes). */
  placing?: 'free' | 'quadrants';
  /** Words shape: the creator's seed list and the two caps. */
  words?: string[];
  pickMax?: number;
  coinMax?: number;
}

// ---------------------------------------------------------------------------
// Gather — the builder's single-round activity (PRIMITIVES.md §9)
// ---------------------------------------------------------------------------

export type GatherShape = 'story' | 'placement' | 'story-placement' | 'words';

export interface GatherAxis {
  poleA: string;
  poleB: string;
}

/** Mirrors utils/gather.js#toClientResponse. ALWAYS attributed — there is no
 *  anonymity inside a circle, so unlike Share there is no redacted variant. */
export interface GatherResponse {
  id: string;
  seedId: string;
  title: string;
  text: string;
  audio: ShareAudio | null;
  /** Null while skipped — the serializer only sends a transcript that exists
   *  or is on its way. */
  transcript: { status: 'pending' | 'ready' | 'failed'; text: string } | null;
  /** The words-shape picks, labeled. Empty on every other shape. */
  words: { id: string; label: string }[];
  reactionCount: number;
  iReacted: boolean;
  isMine: boolean;
  createdAt: string;
  /** Both in [0,1]; y is 0.5 on a one-axis ask. Null on story/words shapes. */
  position: { x: number; y: number } | null;
  userId: string;
  username: string;
}

/** One pickable word, from utils/gather.js#vocabularyFor. Sealed before the
 *  close, `count` is null and other members' coinages are absent — even a
 *  count would say who has moved. */
export interface GatherVocabWord {
  id: string;
  label: string;
  origin: 'seeded' | 'contributed';
  mine: boolean;
  count: number | null;
}

/** Computed on read, never trusted from a stored snapshot (§9 gotcha 1). */
export interface GatherAggregate {
  responses: number;
  computedAt: string;
  x?: { mean: number | null; spread: number | null; count: number };
  y?: { mean: number | null; spread: number | null; count: number };
  /** The portrait — only words somebody picked, count-sorted. */
  words?: { id: string; label: string; count: number }[];
}

/** utils/gather.js#snapshotExtras — flat-merged onto the snapshot for the
 *  first live seed, keyed under Circle.seedExtras for the rest, and served at
 *  any phase by GET /circles/:id/seeds/:seedId/responses. */
export interface GatherExtras {
  responses: GatherResponse[];
  myResponse: GatherResponse | null;
  /** Null while a sealed ask is still open. */
  aggregate: GatherAggregate | null;
  /** Words shape only; null otherwise. */
  vocabulary: GatherVocabWord[] | null;
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
  /** Posted order. The tiebreak under support, not the order it will run in —
   *  read `Circle.queue` for that. */
  order: number;
  /** Which activity module runs this seed. null = the circle's own. A circle
   *  holds mixed activities, so this is what tells a Threshold topic from a
   *  shared synthesis document. */
  activity: string | null;
  payload: SeedPayload;
  /** `nominated` is BEFORE the queue: shared with the circle, readable and
   *  contributable, but not something the group has taken on yet. Somebody
   *  other than the author supporting it accepts it into the queue as
   *  `pending`. `skipped` is terminal like `revealed`: the facilitator moved
   *  the group on and the topic kept every story it had (D30). */
  phase: 'nominated' | 'pending' | 'share' | 'rank' | 'exploring' | 'respond' | 'revealed' | 'skipped';
  /** One support per member, toggled freely — the count is what orders the
   *  queue (D27). The roster never crosses the wire; who backed a topic is
   *  nobody's business, and only the count decides anything. */
  supporterCount: number;
  iSupport: boolean;
  /** Set when a facilitator moved this topic to the front, over the support
   *  order (D30). */
  promotedAt: string | null;
  openedAt: string | null;
  phaseDeadline: string | null;
  revealedAt: string | null;
  result: SeedResult | null;
}

export interface Member {
  userId: string;
  username: string;
  /** Not served yet — the slot the circle-home map fills the day members have
   *  pictures. Absent means initials. */
  pictureUrl?: string;
}

/**
 * One row per seed on GET /circles/:urlName, members only — who told a story
 * on what, for the circle-home map. Mirrors
 * apps/backend/utils/threshold.js#circleParticipation, which applies
 * listShares' redaction ladder (D9/D17):
 * revealed/skipped → attributed; rank → count only; share/pending → own flag only.
 */
export interface SeedParticipation {
  seedId: string;
  /** Attributed only once the topic is done; null before that. */
  tellerIds: string[] | null;
  /** Public from the rank phase on; null while sharing or queued. */
  tellerCount: number | null;
  iTold: boolean;
}

export interface Circle {
  id: string;
  /** The circle's OWN module — the one a seed with activity null runs. A
   *  circle holds mixed activities, so this is a default, not a description. */
  activity: string;
  title: string;
  urlName: string;
  mode: 'single' | 'circle';
  status: 'draft' | 'open' | 'running' | 'complete';
  /** `idle` is an OPEN circle with nothing queued — a pause, and the state a
   *  circle returns to after every cycle. `closed` is the only ending, and only
   *  a facilitator writes it (D29). */
  phase: 'draft' | 'cycle' | 'idle' | 'closed';
  /** The live seed's deadline. Null means that phase has no clock, which is a
   *  supported configuration (D16), not a missing value. */
  phaseDeadline: string | null;
  /** The FIRST live cycle; null while idle. Kept for single-live readers —
   *  pinned equal to liveSeedIds[0] (circlesMulti.test.js). */
  liveSeedId: string | null;
  /** Every live cycle. A circle runs up to maxLive at once (B1); the default
   *  is 1 — every Threshold circle and everything written before the field —
   *  and 3 is what a builder circle opts into at creation. Render this as a
   *  list of one-or-more, never a fixed multi-slot layout. */
  liveSeedIds: string[];
  maxLive: number;
  seedCount: number;
  memberCount: number;
  members: Member[];
  currentSeed: Seed | null;
  seeds: Seed[];
  /** The pending topics, IN THE ORDER THEY WILL RUN — support first, promotions
   *  ahead of that, posting order as the tiebreak. Render this rather than
   *  re-deriving the sort, which drifts from the machine the moment either
   *  changes. */
  queue: Seed[];
  /** Every topic I posted. A member may post more than one: the queue is
   *  filtered by support, not by a one-each rule. */
  mySeedIds: string[];
  isCreator: boolean;
  isMember: boolean;
  /** MY mail preference for this circle, never anybody else's (D31). Mail only:
   *  the in-app notification lands either way. */
  myEmailOptOut: boolean;
  startedAt: string | null;
  completedAt: string | null;

  /** Present only on GET /circles/:urlName, and only for members. */
  participation?: SeedParticipation[];
  /** Present only on GET /circles/:urlName, and only while a seed is live. */
  shares?: Share[];
  /** Extras for EVERY live seed, keyed by seed id, each from its own module
   *  (gather's is GatherExtras; threshold's carries shares/myRanking). The
   *  first live seed's extras are ALSO flat-merged onto this object — that is
   *  what `shares`/`responses` at the top level are. */
  seedExtras?: Record<string, GatherExtras | Record<string, unknown>>;
  /** Gather flat-merge, first live seed only (see seedExtras). */
  responses?: GatherResponse[];
  myResponse?: GatherResponse | null;
  aggregate?: GatherAggregate | null;
  vocabulary?: GatherVocabWord[] | null;
  myRanking?: MyRanking | null;
  /** The stories still waiting on me — DERIVED server-side from `shares` minus
   *  `myRanking.placements`, never stored (D32). It is why a member who joined
   *  in week six needs no special handling: they have no ranking, so everything
   *  reads as waiting. */
  waitingShareIds?: string[];
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
  /** Mirrors ThresholdShare.transcript's enum exactly. It said `done` here
   *  until M3b, a value the backend cannot write — so every "is the transcript
   *  ready" check silently answered no. `ready` is the one the model has. */
  transcript: { status: 'skipped' | 'pending' | 'ready' | 'failed'; text: string };
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
  /** Every story's position on the one axis, so the final screen sizes its
   *  three-part bar at whatever cutoff the reader is holding. Positions rather
   *  than three counts, because no band classification is stored OR served
   *  (D15) — the cutoff stays a view parameter at both scales. */
  agreements: (number | null)[];
  /** The group moved on before finishing this one, so a low ranker count here
   *  means something different (D30). */
  skipped: boolean;
  revealedAt: string | null;
}

/**
 * The circle-final record. Readable at ANY time (D29) — a running circle three
 * topics in has a three-topic record, so this is never a terminal state the
 * page waits to unlock.
 */
export interface CircleResult {
  /** D33 — a one-off has one node, and a graph of one node is not a graph, so
   *  `single` routes this page to that cycle's reveal instead. */
  mode: 'single' | 'circle';
  phase: 'draft' | 'cycle' | 'idle' | 'closed';
  /** Oldest first: a record of a conversation reads in the order it happened. */
  topics: CircleResultTopic[];
  /** There is deliberately no most-contested id and no ranking of any kind
   *  (D25). This screen is a record of a conversation, so it names no winner
   *  and draws no conclusion. An earlier cut computed one; adding it back is
   *  adding a verdict to a sharing circle. */
}

/**
 * One thing the circle told you. Every phase transition of every activity built
 * on the Circle layer is written under ONE notification type (`circle_phase`) —
 * the phase name lives in the message, because a type derived from the phase
 * would fail the model's closed enum for any activity nobody had added to it,
 * silently, since utils/notify.js swallows the error.
 */
export interface ThresholdNotification {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
  /** Null if the circle has since been removed. */
  circle: { id: string; title: string; urlName: string } | null;
}

/**
 * One of my synthesis documents, for the picker that shares one with a circle.
 * Mirrors a row from GET /api/synthesis/me/ideas.
 */
export interface MyIdea {
  id: string;
  code: string;
  title: string;
  collaboratorCount: number;
}
