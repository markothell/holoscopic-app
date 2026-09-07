import type {
  Circle, Member, Seed, SeedParticipation, SeedPayload, SeedResult, Share, ShareResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// THE SAMPLE CIRCLE — invented content, no backend, no network.
//
// `/demo` renders one finished Threshold cycle for somebody who has never
// signed in: the topic, the eight people, the stories they told, how the group
// sorted them, and the line that fell out of the sorting.
//
// It is a FIXTURE rather than a public read path, and deliberately so. Every
// circle read here is member-gated server-side (`utils/threshold.js#assertMember`
// on both result routes and on `listShares`, plus the D9/D17 redaction ladder),
// and none of those gates is being loosened for a marketing page. So this file
// holds the content, the demo pages render the app's own components over it,
// and nothing on `/demo` makes a request of any kind.
//
// SOURCE OF THE SHAPES: every object here is typed against `@/lib/types`, which
// mirrors the backend serializers (`utils/circles.js#toClient`,
// `utils/threshold.js#toClientShare`, `computeResult`). That typing is the whole
// defence against the demo quietly drifting from the product — if a wire type
// moves, this file stops compiling instead of rendering a lie.
//
// SOURCE OF THE CONTENT: written for this file. The eight people are invented,
// the stories are invented, and the sorting is invented. Tone follows
// `apps/backend/scripts/seed-gather-demo.js`.
//
// NO AUDIO, on purpose — the same rule that script keeps. Threshold's stories
// can be recorded, but a fake blob URL renders as a broken player, so every
// share here is typed and `audio` is null. `StoryPlayer` is only mounted when
// `share.audio` is truthy, so no player and no empty waveform reaches the page.
//
// THE STATE: one topic, run to the end, on a circle its facilitator has since
// closed. Six of the eight sorted, which is above the three-ranker floor, so
// the reveal draws its three bands and the reader's cutoff does something
// visible at all three settings.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_BASE = '/demo';

/** The reader of a sample is nobody in it: no seat is marked "you", no story
 *  reads as theirs. Every `isMine` below is false for the same reason. */
export const DEMO_VIEWER_ID = null;

// ─── The people ──────────────────────────────────────────────────────────────

const NAMES = ['Nadia', 'Wes', 'Ruth', 'Idris', 'Hana', 'Colm', 'Bea', 'Sam'] as const;

const uid = (name: string) => `demo-${name.toLowerCase()}`;

export const DEMO_MEMBERS: Member[] = NAMES.map(name => ({ userId: uid(name), username: name }));

// ─── The topic ───────────────────────────────────────────────────────────────

// One of the app's three standing polarities, from the front door's TOPICS.
// A seed names its own ends; it never chooses their colours (D26).
const PAYLOAD: SeedPayload = {
  topic: 'Belonging',
  poleA: 'by origin',
  poleB: 'from destination',
  secondsPerNote: 90,
};

export const DEMO_SEED_ID = 'demo-belonging';

const OPENED_AT = '2026-08-24T17:00:00.000Z';
const REVEALED_AT = '2026-08-31T09:12:00.000Z';

const DEMO_SEED: Seed = {
  id: DEMO_SEED_ID,
  authorId: uid('Ruth'),
  order: 0,
  payload: PAYLOAD,
  phase: 'revealed',
  supporterCount: 5,
  iSupport: false,
  promotedAt: null,
  openedAt: OPENED_AT,
  phaseDeadline: null,
  revealedAt: REVEALED_AT,
  result: null, // filled in below, once the rows exist
};

// ─── The stories ─────────────────────────────────────────────────────────────
//
// `pole` is the end the teller entered by — picking a pole is how you enter the
// telling round (D22), and it is a claim about your own story, never a verdict
// on it. The group's reading is the sorting, further down, and the two come
// apart on purpose: Sam told a story about choosing and five of six read it as
// a story about where he is from. That gap is the mechanic the reveal exists to
// show, so the fixture contains one.

const STORIES: { by: string; pole: 'A' | 'B'; title: string; text: string }[] = [
  {
    by: 'Nadia',
    pole: 'A',
    title: 'The wrong side of the river',
    text: 'I grew up four streets from where I live now. Last year the council redrew the catchment and my kids were suddenly from the other side — same house, same bus, same bakery. It took a line on a map to show me how much of what I call belonging is a postcode nobody has moved yet.',
  },
  {
    by: 'Colm',
    pole: 'A',
    title: 'My father’s tools',
    text: 'When Dad died I kept the tools and I use maybe three of them. The rest sit in the shed because a plane with his thumb worn into the handle is the last address I have for him. I don’t belong to the trade. I belong to the man who did.',
  },
  {
    by: 'Sam',
    pole: 'B',
    title: 'Twelve years, then the accent',
    text: 'Twelve years here. Mortgage, kids in the school at the end of the road, on the rota for the recycling. Someone at a wedding asked where I was really from and I gave the honest answer — here, I chose here — and watched him wait for the other one. The choosing is the part nobody counts.',
  },
  {
    by: 'Wes',
    pole: 'A',
    title: 'Every Thursday, the same pitch',
    text: 'Thirty years in the same five-a-side. Half the lads I couldn’t tell you what they do for a living. We aren’t from anywhere together — we just kept turning up on the same square of grass until turning up was the thing we were from.',
  },
  {
    by: 'Hana',
    pole: 'B',
    title: 'I learned it off a video',
    text: 'My grandmother’s soup, and I learned it from a stranger on the internet, because nobody in my family ever wrote anything down. It tastes right. My mother cried at the table. I still don’t know whether I inherited that or built it.',
  },
  {
    by: 'Bea',
    pole: 'A',
    title: 'The choir that wouldn’t let me leave',
    text: 'I joined to fill a Tuesday and called it temporary for six years. When I finally tried to go they kept my part in the folder anyway. By the end I couldn’t have told you whether I was still choosing them or was simply from there now.',
  },
  {
    by: 'Idris',
    pole: 'B',
    title: 'The name on the mailbox',
    text: 'I left the old tenant’s name up for a year because his post kept arriving. The week I finally scratched it off and wrote mine, the woman downstairs knocked with a cutting from her monstera. Nobody on that landing ever asked where I was from. They waited to see whether I’d stay.',
  },
  {
    by: 'Ruth',
    pole: 'B',
    title: 'Room 4, ten past nine',
    text: 'I took citizenship at forty-one, in a municipal room with a plastic flag on the desk. Not one of us had been born into it. We stood up, said the words, and went for terrible coffee afterwards — eleven strangers — and I have never felt more like I was joining something on purpose.',
  },
];

export const DEMO_SHARES: Share[] = STORIES.map((s, i) => ({
  id: `demo-share-${i + 1}`,
  seedId: DEMO_SEED_ID,
  pole: s.pole,
  title: s.title,
  text: s.text,
  // No audio, deliberately — see the header. A typed story is first-class here
  // and every surface says so in the same breath as the recorder.
  audio: null,
  transcript: { status: 'skipped', text: '' },
  isMine: false,
  createdAt: OPENED_AT,
  // Attributed, because the cycle has revealed (D9). Before that the server
  // strips both of these and the client never receives them at all.
  userId: uid(s.by),
  username: s.by,
}));

const shareIdOf = (name: string) =>
  DEMO_SHARES[STORIES.findIndex(s => s.by === name)].id;

// ─── The sorting ─────────────────────────────────────────────────────────────
//
// Six of the eight submitted a ranking, so every split below adds to six. The
// rows are DERIVED from the splits rather than typed out: `agreement` and
// `coherence` are the two numbers `computeResult` stores, and writing them by
// hand is how a fixture ends up describing a sorting that could not have
// happened.

const RANKERS = 6;

/** `a` read it as *by origin*, `b` as *from destination*. */
function row(shareId: string, a: number, b: number): ShareResult {
  const total = a + b;
  const agreement = a / total;
  return { shareId, agreement, coherence: Math.abs(2 * agreement - 1), splits: { a, b } };
}

// Where the six landed. At the default cutoff — three in four — this reads:
//
//   by origin           Nadia 6–0, Sam 5–1, Colm 5–1
//   the threshold       Wes 4–2, Hana 3–3, Bea 2–4
//   from destination    Idris 1–5, Ruth 0–6
//
// and the reader's control moves it: at "all of them" only Nadia and Ruth stay
// at the ends and the middle swells to six; at "more than half" the middle
// collapses to Hana alone. That is the argument the screen makes — a threshold
// is a function of how much agreement you decide to require (D24).
const ROWS: ShareResult[] = [
  row(shareIdOf('Nadia'), 6, 0),
  row(shareIdOf('Sam'), 5, 1),
  row(shareIdOf('Colm'), 5, 1),
  row(shareIdOf('Wes'), 4, 2),
  row(shareIdOf('Hana'), 3, 3),
  row(shareIdOf('Bea'), 2, 4),
  row(shareIdOf('Idris'), 1, 5),
  row(shareIdOf('Ruth'), 0, 6),
];

export const DEMO_RESULT: SeedResult = {
  computedAt: REVEALED_AT,
  rankers: RANKERS,
  shares: ROWS,
  unanimous: ROWS.filter(r => r.agreement === 0 || r.agreement === 1).length,
  meanCoherence: ROWS.reduce((sum, r) => sum + r.coherence, 0) / ROWS.length,
};

DEMO_SEED.result = DEMO_RESULT;

// ─── The circle ──────────────────────────────────────────────────────────────

/** One row per seed, for the circle-home map. Attributed because the topic is
 *  done — before that `tellerIds` is null and the map can only draw a count
 *  (D9/D17), which is why the map can never leak an identity: it never receives
 *  one it may not show. */
const DEMO_PARTICIPATION: SeedParticipation[] = [
  {
    seedId: DEMO_SEED_ID,
    tellerIds: DEMO_MEMBERS.map(m => m.userId),
    tellerCount: DEMO_MEMBERS.length,
    iTold: false,
  },
];

export const DEMO_CIRCLE: Circle = {
  id: 'demo-circle',
  activity: 'threshold',
  title: 'The Wednesday circle',
  urlName: 'demo',
  mode: 'circle',
  status: 'complete',
  phase: 'closed',
  phaseDeadline: null,
  liveSeedId: null,
  seedCount: 1,
  memberCount: DEMO_MEMBERS.length,
  members: DEMO_MEMBERS,
  currentSeed: null,
  seeds: [DEMO_SEED],
  queue: [],
  mySeedIds: [],
  isCreator: false,
  // A member's view, because that is the view worth showing — and precisely the
  // reason this is a fixture rather than a loosened read path.
  isMember: true,
  myEmailOptOut: false,
  startedAt: OPENED_AT,
  completedAt: REVEALED_AT,
  participation: DEMO_PARTICIPATION,
  // `shares`, `myRanking` and `waitingShareIds` are absent, exactly as the
  // snapshot serves them for a circle with nothing live.
};

export function demoSeed(seedId: string): Seed | null {
  return DEMO_CIRCLE.seeds.find(s => s.id === seedId) ?? null;
}
