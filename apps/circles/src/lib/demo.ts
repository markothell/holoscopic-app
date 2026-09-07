import type {
  Circle, GatherAggregate, GatherExtras, GatherResponse, GatherVocabWord, Member, Seed,
  SeedParticipation, SeedPayload,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// THE SAMPLE CIRCLE — invented content, no backend, no network.
//
// `/demo` renders the whole product on this corpus for someone who has never
// signed in. The circle read paths are member-gated server-side on purpose
// (utils/circles.js gates the snapshot's extras and participation behind
// isMember; routes/circles.js#responses calls assertMember) and we are NOT
// loosening them for a public page — so the demo is a fixture, client-side,
// and makes no request of any kind.
//
// Everything below is WRITTEN, not captured: the eight people are invented,
// the answers are invented, and nothing here is saved anywhere. The demo says
// so on its own surfaces and keeps the "← leave the sample" way out.
//
// SOURCE OF THE CONTENT: apps/backend/scripts/seed-gather-demo.js — the same
// Lantern circle, the same prompts, names, answers, word picks and
// coordinates, copied across verbatim. That script writes the real thing to a
// dev database for the camera; this file is the same set with no database
// behind it. Change one, change the other.
//
// SOURCE OF THE SHAPES: every object here is typed against @/lib/types, which
// mirrors the backend serializers. That is the whole defence against this
// demo quietly drifting from the product — if a wire type changes, this file
// stops compiling.
//
// The state is the seed script's state, deliberately:
//
//   1  story              revealed, open wall      the wall of stories
//   2  words              revealed, sealed         the portrait (a coined word, adopted)
//   3  placement, 2 axes  revealed, sealed         the quadrant map, real spread
//   4  story + placement  LIVE, sealed, 7 of 8     — Mara has not answered
//   5  story              approved, waiting        the queue
//
// Ask 4 renders as a sealed ask renders: nothing but the state line. That is
// not a gap in the fixture, it is the mechanic — sealed serves own-only until
// the close, and the demo's reader is nobody, so there is nothing to serve.
//
// No audio, for the same reason the seed script seeds none: a fake blob URL
// renders as a broken player. Every `audio` below is null and stays null.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_BASE = '/demo';
export const DEMO_URL_NAME = 'lantern';

/** Fixed, not `Date.now()` — a server render and a client render have to agree,
 *  and a demo that reads differently on a reload is a demo that looks broken. */
const DAY0 = Date.parse('2026-08-24T09:00:00.000Z');
const at = (days: number, minutes = 0) =>
  new Date(DAY0 + days * 86_400_000 + minutes * 60_000).toISOString();

// ─── The people ──────────────────────────────────────────────────────────────
// Eight, in the seed script's order — which is also the order they sit on the
// ring, so the map is the same picture in both.

const NAMES = ['Mara', 'Ivo', 'Nell', 'Tomas', 'June', 'Priya', 'Owen', 'Sana'] as const;
type Name = (typeof NAMES)[number];

const uid = (name: string) => `demo-${name.toLowerCase()}`;

export const DEMO_MEMBERS: Member[] = NAMES.map(name => ({ userId: uid(name), username: name }));

/** The reader of this page is not one of them, and the demo never pretends
 *  otherwise: no response is `isMine`, nothing is `iSupport`, no seat on the
 *  ring is marked "you". You are looking in from outside. */
export const DEMO_VIEWER_ID = null;

// ─── The payloads ────────────────────────────────────────────────────────────
// A gather payload carries none of Threshold's fields (utils/gather.js#normalizeSeed
// builds it from scratch), but the shared SeedPayload type is the union of
// what every surface reads — so poleA/poleB are empty here rather than
// invented, which is what a gather seed actually looks like on the wire.

const gatherPayload = (p: Partial<SeedPayload> & { prompt: string }): SeedPayload => ({
  topic: p.prompt,
  poleA: '',
  poleB: '',
  secondsPerNote: p.secondsPerNote ?? 60,
  reveal: 'sealed',
  reactions: true,
  editAfterClose: true,
  respondHours: null,
  ...p,
});

// ─── 1 · The wall of stories ─────────────────────────────────────────────────

const MONTH_ANSWERS: [Name, string, string][] = [
  ['Mara', 'Patience', 'My mother moved in on the fourth. I have said "that’s fine" more times this month than in the whole year before it, and about half of those were true.'],
  ['Ivo', 'Saying no', 'Turned down work I would have taken a year ago. Spent the week after wondering whether I had made a mistake, and the week after that not wondering.'],
  ['Nell', 'Showing up unfinished', 'I brought a half-built thing into a room of people who bring finished things. Nobody flinched. I did.'],
  ['Tomas', 'Sleep, mostly', 'The baby is seven weeks old. This month asked me to be a person who functions on four hours. I am not, and it turns out that is survivable anyway.'],
  ['June', 'Letting it be smaller', 'I cut the project down to a third of what I promised. It is better now. I still have not told everyone.'],
  ['Priya', 'Staying', 'Every instinct said leave — the job, the city, the whole arrangement. I stayed. Ask me in November whether that was courage or inertia.'],
  ['Owen', 'Asking', 'I asked three people for help this month, which is three more than usual. Two said yes immediately. I have been thinking about the year I spent not asking.'],
  ['Sana', 'Being wrong out loud', 'I argued hard for something in March and it did not work. This month was telling people that, one at a time.'],
];

// ─── 2 · The portrait ────────────────────────────────────────────────────────
// Nell coins "Permission"; Sana picks it up. A coined word adopted by somebody
// else is the mechanic worth seeing — it is how a circle grows a word it did
// not have. Owen's "Un-performing" is the other coinage, and nobody joined it.

const SEEDED_WORDS = [
  'Honesty', 'Patience', 'Friction', 'Quiet', 'Momentum', 'Perspective',
  'Company', 'Accountability', 'Relief', 'Challenge', 'Belonging', 'Time',
];

const GIVES_ANSWERS: [Name, string[]][] = [
  ['Mara', ['Honesty', 'Quiet']],
  ['Ivo', ['Friction', 'Honesty', 'Perspective']],
  ['Nell', ['Company', 'Permission']],
  ['Tomas', ['Quiet', 'Relief', 'Company']],
  ['June', ['Accountability', 'Honesty']],
  ['Priya', ['Perspective', 'Friction', 'Challenge']],
  ['Owen', ['Company', 'Honesty', 'Un-performing']],
  ['Sana', ['Honesty', 'Belonging', 'Permission']],
];

const COINED_BY: Record<string, Name> = { Permission: 'Nell', 'Un-performing': 'Owen' };

const wordKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '');
const wordId = (label: string) => `demo-w-${wordKey(label)}`;

/** Every word anybody can pick: the creator's twelve, plus the two coined
 *  during the round. Mirrors utils/gather.js#vocabularyFor at a REVEALED seed —
 *  counts are public and every coinage is visible. */
const DEMO_VOCABULARY: GatherVocabWord[] = (() => {
  const counts = new Map<string, number>();
  for (const [, words] of GIVES_ANSWERS) {
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const seeded: GatherVocabWord[] = SEEDED_WORDS.map(label => ({
    id: wordId(label), label, origin: 'seeded', mine: false, count: counts.get(label) ?? 0,
  }));
  const contributed: GatherVocabWord[] = Object.keys(COINED_BY).map(label => ({
    id: wordId(label), label, origin: 'contributed', mine: false, count: counts.get(label) ?? 0,
  }));
  return [...seeded, ...contributed];
})();

/** The portrait: only words somebody picked, count-sorted then alphabetical —
 *  the order computeAggregate() sorts them into. */
const PORTRAIT: NonNullable<GatherAggregate['words']> = DEMO_VOCABULARY
  .filter(w => (w.count ?? 0) > 0)
  .map(w => ({ id: w.id, label: w.label, count: w.count ?? 0 }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

// ─── 3 · The quadrant map ────────────────────────────────────────────────────

const WORK_ANSWERS: [Name, number, number, string][] = [
  ['Mara', 0.72, 0.35, 'Heads down. Talking to fewer people than I should.'],
  ['Ivo', 0.20, 0.70, 'All conversations, no output yet. It is the good part.'],
  ['Nell', 0.55, 0.15, 'Building alone and starting to feel it.'],
  ['Tomas', 0.85, 0.55, 'Shipping. Barely awake.'],
  ['June', 0.35, 0.80, ''],
  ['Priya', 0.90, 0.25, 'Executing something I no longer believe in.'],
  ['Owen', 0.15, 0.45, ''],
  ['Sana', 0.60, 0.90, 'Surrounded, which is new for me.'],
];

// ─── 4 · Live, sealed, seven of eight ────────────────────────────────────────
// Mara is absent on purpose: she is the eighth voice, and the cycle closes
// when she answers rather than when anybody presses a button.

const CHANGED_ANSWERS: [Name, number, string, string][] = [
  ['Ivo', 0.15, 'Ten years', 'I was raised to think ambition was a character flaw. It took about a decade and one very patient friend to unpick that, and I could not tell you the day it turned.'],
  ['Nell', 0.88, 'One sentence', 'Someone said "you keep describing what you do not want." I have not been the same since. It took four seconds.'],
  ['Tomas', 0.30, 'The long way', 'I thought people who left the industry had given up. Then I watched three good ones leave, one a year, and by the third I had run out of ways to be right.'],
  ['June', 0.92, 'The scan', 'The doctor turned the screen around. Everything I thought I wanted rearranged itself between one breath and the next.'],
  ['Priya', 0.45, 'Both at once', 'Slowly, and then a conversation on a train that made it official. I think the train only gave it somewhere to land.'],
  ['Owen', 0.20, 'By repetition', 'Nobody argued me out of it. I just kept ending up in rooms where the opposite was obviously true, until obviously won.'],
  ['Sana', 0.75, 'A photograph', 'I found a picture of myself from the year I insisted I was fine. That did more than two years of being told.'],
];

// ─── The seeds ───────────────────────────────────────────────────────────────

export const DEMO_SEED_IDS = {
  month: 'demo-s-month',
  gives: 'demo-s-gives',
  work: 'demo-s-work',
  changed: 'demo-s-changed',
  next: 'demo-s-next',
} as const;

const seed = (s: {
  id: string; author: Name; order: number; payload: SeedPayload;
  phase: Seed['phase']; supporterCount: number; openedDay: number | null; revealedDay: number | null;
}): Seed => ({
  id: s.id,
  authorId: uid(s.author),
  order: s.order,
  // null = the circle's own module. The circle IS a gather circle, so every
  // ask here stores null and resolves through seedActivityOf() — the same
  // path the eyes-on pass caught surfaces skipping (PRIMITIVES.md §9).
  activity: null,
  payload: s.payload,
  phase: s.phase,
  supporterCount: s.supporterCount,
  iSupport: false,
  promotedAt: null,
  openedAt: s.openedDay == null ? null : at(s.openedDay),
  phaseDeadline: null, // shareHours/respondHours null — this circle runs on no clock
  revealedAt: s.revealedDay == null ? null : at(s.revealedDay),
  result: null,
});

const MONTH_SEED = seed({
  id: DEMO_SEED_IDS.month, author: 'Mara', order: 0, phase: 'revealed',
  supporterCount: 3, openedDay: 0, revealedDay: 2,
  payload: gatherPayload({
    prompt: 'What did this month ask of you?',
    shape: 'story', reveal: 'open', secondsPerNote: 90, telling: 'voice',
  }),
});

const GIVES_SEED = seed({
  id: DEMO_SEED_IDS.gives, author: 'Nell', order: 1, phase: 'revealed',
  supporterCount: 4, openedDay: 2, revealedDay: 5,
  payload: gatherPayload({
    prompt: 'What does this circle give you that you do not get elsewhere?',
    shape: 'words', reveal: 'sealed', words: SEEDED_WORDS, pickMax: 3, coinMax: 2,
  }),
});

const WORK_SEED = seed({
  id: DEMO_SEED_IDS.work, author: 'Ivo', order: 2, phase: 'revealed',
  supporterCount: 3, openedDay: 5, revealedDay: 8,
  payload: gatherPayload({
    prompt: 'Where are you with your work right now?',
    shape: 'placement', reveal: 'sealed', placing: 'free',
    axes: [
      { poleA: 'Exploring', poleB: 'Executing' },
      { poleA: 'Alone', poleB: 'Surrounded' },
    ],
  }),
});

const CHANGED_SEED = seed({
  id: DEMO_SEED_IDS.changed, author: 'June', order: 3, phase: 'respond',
  supporterCount: 5, openedDay: 8, revealedDay: null,
  payload: gatherPayload({
    prompt: 'Tell us about a time you changed your mind about something that mattered.',
    shape: 'story-placement', reveal: 'sealed', secondsPerNote: 90, telling: 'voice',
    axes: [{ poleA: 'Slowly', poleB: 'All at once' }],
  }),
});

// Approved and waiting for a slot: this circle runs one cycle at a time
// (maxLive 1), so the fifth ask sits behind the live one. Owen's own support
// came with posting it; June and Priya added theirs, which is the third of
// eight the machine asks for (approvalsToStart = ceil(8/3) = 3).
const NEXT_SEED = seed({
  id: DEMO_SEED_IDS.next, author: 'Owen', order: 4, phase: 'pending',
  supporterCount: 3, openedDay: null, revealedDay: null,
  payload: gatherPayload({
    prompt: 'What would you want this circle to try that we have not?',
    shape: 'story', reveal: 'open', secondsPerNote: 60, telling: 'voice',
  }),
});

const SEEDS: Seed[] = [MONTH_SEED, GIVES_SEED, WORK_SEED, CHANGED_SEED, NEXT_SEED];

// ─── The responses ───────────────────────────────────────────────────────────

const response = (r: {
  seedId: string; who: Name; index: number;
  title?: string; text?: string;
  position?: { x: number; y: number } | null;
  words?: string[];
}): GatherResponse => ({
  id: `${r.seedId}-${r.who.toLowerCase()}`,
  seedId: r.seedId,
  title: r.title ?? '',
  text: r.text ?? '',
  // Deliberately null everywhere: the seed script records no audio because a
  // fake blob URL renders as a broken player, and the same is true here.
  audio: null,
  transcript: null,
  words: (r.words ?? []).map(label => ({ id: wordId(label), label })),
  reactionCount: 0,
  iReacted: false,
  isMine: false,
  createdAt: at(1, r.index * 37),
  position: r.position ?? null,
  userId: uid(r.who),
  username: r.who,
});

const MONTH_RESPONSES = MONTH_ANSWERS.map(([who, title, text], i) =>
  response({ seedId: DEMO_SEED_IDS.month, who, index: i, title, text }));

const GIVES_RESPONSES = GIVES_ANSWERS.map(([who, words], i) =>
  response({ seedId: DEMO_SEED_IDS.gives, who, index: i, words }));

const WORK_RESPONSES = WORK_ANSWERS.map(([who, x, y, text], i) =>
  response({ seedId: DEMO_SEED_IDS.work, who, index: i, text, position: { x, y } }));

const CHANGED_RESPONSES = CHANGED_ANSWERS.map(([who, x, title, text], i) =>
  response({ seedId: DEMO_SEED_IDS.changed, who, index: i, title, text, position: { x, y: 0.5 } }));

// ─── The aggregates ──────────────────────────────────────────────────────────
// Computed here the way utils/gather.js#computeAggregate computes them on
// read, rather than typed in as numbers that would go stale the first time
// somebody edits an answer above.

const stats = (values: number[]) => {
  if (!values.length) return { mean: null, spread: null, count: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, spread, count: values.length };
};

const AGGREGATES: Record<string, GatherAggregate> = {
  [DEMO_SEED_IDS.month]: { responses: MONTH_RESPONSES.length, computedAt: at(2) },
  [DEMO_SEED_IDS.gives]: { responses: GIVES_RESPONSES.length, computedAt: at(5), words: PORTRAIT },
  [DEMO_SEED_IDS.work]: {
    responses: WORK_RESPONSES.length,
    computedAt: at(8),
    x: stats(WORK_RESPONSES.map(r => r.position!.x)),
    y: stats(WORK_RESPONSES.map(r => r.position!.y)),
  },
};

// ─── The extras, per seed ────────────────────────────────────────────────────
// What GET /circles/:id/seeds/:seedId/responses would answer for this reader
// (utils/gather.js#snapshotExtras): everything on a revealed ask, and nothing
// at all on the sealed one still running — own-only, and the reader owns none.

export const DEMO_EXTRAS: Record<string, GatherExtras> = {
  [DEMO_SEED_IDS.month]: {
    responses: MONTH_RESPONSES, myResponse: null,
    aggregate: AGGREGATES[DEMO_SEED_IDS.month], vocabulary: null,
  },
  [DEMO_SEED_IDS.gives]: {
    responses: GIVES_RESPONSES, myResponse: null,
    aggregate: AGGREGATES[DEMO_SEED_IDS.gives], vocabulary: DEMO_VOCABULARY,
  },
  [DEMO_SEED_IDS.work]: {
    responses: WORK_RESPONSES, myResponse: null,
    aggregate: AGGREGATES[DEMO_SEED_IDS.work], vocabulary: null,
  },
  [DEMO_SEED_IDS.changed]: {
    responses: [], myResponse: null, aggregate: null, vocabulary: null,
  },
};

/** How many people have actually answered the live ask. The wire never says
 *  this while an ask is sealed — the demo's own note does, because explaining
 *  what is being withheld is the point of showing a sealed ask at all. */
export const DEMO_LIVE_ANSWERED = CHANGED_RESPONSES.length;

// ─── The participation rows ──────────────────────────────────────────────────
// The map's rows, at the redaction the server applies (utils/gather.js#participation):
// open wall or finished → named tellers; sealed and running → nothing but my
// own flag, because even a count would say who has moved. A seed that has not
// started has no row at all.

const DEMO_PARTICIPATION: SeedParticipation[] = [
  {
    seedId: DEMO_SEED_IDS.month,
    tellerIds: MONTH_RESPONSES.map(r => r.userId),
    tellerCount: MONTH_RESPONSES.length,
    iTold: false,
  },
  {
    seedId: DEMO_SEED_IDS.gives,
    tellerIds: GIVES_RESPONSES.map(r => r.userId),
    tellerCount: GIVES_RESPONSES.length,
    iTold: false,
  },
  {
    seedId: DEMO_SEED_IDS.work,
    tellerIds: WORK_RESPONSES.map(r => r.userId),
    tellerCount: WORK_RESPONSES.length,
    iTold: false,
  },
  { seedId: DEMO_SEED_IDS.changed, tellerIds: null, tellerCount: null, iTold: false },
];

// ─── The circle ──────────────────────────────────────────────────────────────

export const DEMO_CIRCLE: Circle = {
  id: 'demo-lantern',
  activity: 'gather',
  title: 'Lantern circle',
  urlName: DEMO_URL_NAME,
  mode: 'circle',
  status: 'running',
  phase: 'cycle',
  phaseDeadline: null,
  liveSeedId: DEMO_SEED_IDS.changed,
  liveSeedIds: [DEMO_SEED_IDS.changed],
  maxLive: 1,
  seedCount: SEEDS.length,
  memberCount: DEMO_MEMBERS.length,
  members: DEMO_MEMBERS,
  currentSeed: CHANGED_SEED,
  seeds: SEEDS,
  nominations: [],
  // ceil(8 / 3) — a third of the circle, which is what the machine derives
  // when a circle sets no flat number (utils/circles.js#approvalsToStart).
  approvalsToStart: 3,
  queue: [NEXT_SEED],
  mySeedIds: [],
  isCreator: false,
  // A member's view, because that is the view worth showing — and the reason
  // this is a fixture rather than a loosened read path.
  isMember: true,
  myEmailOptOut: false,
  startedAt: at(0),
  completedAt: null,
  participation: DEMO_PARTICIPATION,
  seedExtras: { [DEMO_SEED_IDS.changed]: DEMO_EXTRAS[DEMO_SEED_IDS.changed] },
  // The flat merge the snapshot does for the FIRST live seed.
  responses: DEMO_EXTRAS[DEMO_SEED_IDS.changed].responses,
  myResponse: null,
  aggregate: null,
  vocabulary: null,
};

/** The one-line note each ask carries on the demo, saying what the reader is
 *  looking at. Written, not derived — the point of each surface is a thing a
 *  caption can say and a chart cannot. */
export const DEMO_NOTES: Record<string, string> = {
  [DEMO_SEED_IDS.month]: 'An open wall: everyone’s answer was visible as it arrived. Tap a seat on the ring to read that person up close.',
  [DEMO_SEED_IDS.gives]: 'Sealed until everyone had answered, then attributed. Nell coined “Permission” — it was not on the list — and Sana picked it up. Tap a word to light the people who chose it.',
  [DEMO_SEED_IDS.work]: 'Two axes, eight marks. Tap the chart in the middle of the ring to open it; near marks merge into one bigger node, so cluster size is where the circle sits.',
  [DEMO_SEED_IDS.next]: 'Put to the circle by Owen and backed by June and Priya — approved, and waiting for the live ask to close. One activity runs at a time here.',
  [DEMO_SEED_IDS.changed]: `Still running, and sealed. Seven of the eight have answered; nobody sees anybody else’s until the eighth does, and it is her answer that closes the round — not a button.`,
};

/** What each ask made, in the record's own words. */
export const DEMO_SHAPE_LABELS: Record<string, string> = {
  story: 'a wall of stories',
  placement: 'where everyone stands',
  'story-placement': 'stories on a line',
  words: 'a word portrait',
};

export function demoSeed(seedId: string): Seed | null {
  return SEEDS.find(s => s.id === seedId) ?? null;
}
