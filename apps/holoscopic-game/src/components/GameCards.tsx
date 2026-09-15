import Link from 'next/link';
import {
  CHORUS_URL, CIRCLES_URL, SPECTRUM_URL, SYNTHESIS_URL, THRESHOLD_URL,
} from '@/lib/games';
import GameCardSignal from './GameCardSignal';
import styles from './GameCards.module.css';

// The game cards, one per instrument. The homepage and the dashboard both show
// them, and they differ only in where a card goes:
//
//   lander  the explainer on this site (/chorus, /synthesis, …), for someone
//           who has never seen the game — what the homepage links to.
//   app     where the game actually runs, for someone who is signed in and
//           came to use it — what the dashboard links to.
//
// Each app's own front door already routes a signed-in visitor to their home
// in it, so `app` is usually the bare origin. Threshold and Circles go one
// step further, to the page listing the circles you are in. Chorus has no
// such page — a memorial is reachable only by its link, and
// chorus.holoscopic.io says exactly that — so it keeps its lander in both.

/* ── Game-card motifs — one quiet gradient mark per game ────────────────── */

// Threshold: the balance beam — a three-section bar on a fulcrum, stories as
// dots in each. The ends wear the app's own pole colours (teal / rust, chosen
// there for equal weight so neither looks like the verdict); the middle
// section is the threshold itself, in the app's neutral grey. The beam tilts
// a few degrees — a scale mid-reading — while the fulcrum stays level.
// Circles: the circle home map, as the app draws it — members on a ring, all
// equal, what they explored together gathered in the middle, one solo spur
// pointing outward. Toono palette from code/docs/plan/circles/DESIGN.md, so the card
// reads as the product rather than as another lab poster.
function CircleRingArt() {
  const cx = 272, cy = 105, r = 56, ring = 68, n = 8;
  const seats = Array.from({ length: n }, (_, i) => {
    const a = (-90 + i * (360 / n)) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const shared = [
    { x: cx - 12, y: cy + 4, r: 15, to: [1, 4, 5, 7] },
    { x: cx + 15, y: cy - 8, r: 10, to: [0, 2, 3] },
  ];
  // Two more circles to the left, empty and clipped by the card's edges: the
  // crowd a circle exchanges with, suggested rather than drawn in full.
  const others = [
    { x: cx - 136, y: cy - 98 },
    { x: cx - 136, y: cy + 98 },
  ];
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 360 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      {others.map((o, i) => (
        <circle key={i} cx={o.x} cy={o.y} r={ring + 27} fill="#B49A6E" fillOpacity="0.14" />
      ))}
      {/* the circle's reach: a wide, faint second ring that overlaps the others */}
      <circle cx={cx} cy={cy} r={ring + 14} fill="none" stroke="#B49A6E" strokeOpacity="0.14" strokeWidth="26" />
      {/* the circle itself */}
      <circle cx={cx} cy={cy} r={ring} fill="none" stroke="#B49A6E" strokeWidth="2" />
      {/* edges from seats to what they explored together */}
      {shared.map((s, si) =>
        s.to.map(i => (
          <line
            key={`${si}-${i}`}
            x1={seats[i].x} y1={seats[i].y} x2={s.x} y2={s.y}
            stroke="#B49A6E" strokeOpacity="0.45" strokeWidth="1"
          />
        )),
      )}
      {/* shared nodes, sized by how much of the circle took part */}
      {shared.map((s, si) => (
        <circle key={si} cx={s.x} cy={s.y} r={s.r} fill="#EDE3D0" stroke="#B49A6E" strokeOpacity="0.7" strokeWidth="1.2" />
      ))}
      {/* the seats */}
      {seats.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="9" fill="#FDFAF4" stroke={i === 0 ? '#3A2E20' : '#B49A6E'} strokeWidth={i === 0 ? 1.6 : 1.2} />
      ))}
    </svg>
  );
}

function ThresholdBeamArt() {
  const dotY = 79;
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 360 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      {/* The figure keeps to the upper right so the card's type — which runs
          long on this card — never crosses the beam. */}
      <g transform="rotate(-4 222 96)" opacity="0.75">
        {/* pole A — teal */}
        <rect x="105" y="64" width="74" height="30" rx="8" fill="#DCE8E7" stroke="#2F7D7B" strokeOpacity="0.45" strokeWidth="1.5" />
        {[120, 140, 160].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#2F7D7B" opacity="0.7" />
        ))}
        {/* the threshold — neutral, the split stories */}
        <rect x="184" y="64" width="76" height="30" rx="8" fill="#E6E4E0" stroke="#7C7A76" strokeOpacity="0.4" strokeWidth="1.5" />
        {[198, 222, 246].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#7C7A76" opacity="0.65" />
        ))}
        {/* pole B — rust */}
        <rect x="265" y="64" width="74" height="30" rx="8" fill="#F0DFD7" stroke="#B15C3C" strokeOpacity="0.45" strokeWidth="1.5" />
        {[280, 300, 320].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#B15C3C" opacity="0.7" />
        ))}
      </g>
      {/* the fulcrum stays level while the beam tilts */}
      <path d="M222,98 L202,140 L242,140 Z" fill="none" stroke="#7C7A76" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}

// On a Spectrum: rounded bars rising and falling like a distribution,
// crimson → cobalt → emerald across its three theme accents.
function SpectrumBarsArt() {
  const heights = [36, 64, 104, 148, 190, 148, 92, 72, 40];
  const w = 26, gap = 14, baseline = 200;
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 360 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="oasBars" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E0344E" />
          <stop offset="55%" stopColor="#2B49D8" />
          <stop offset="100%" stopColor="#0E8F66" />
        </linearGradient>
      </defs>
      {heights.map((h, i) => (
        <rect
          key={i}
          x={i * (w + gap)}
          y={baseline - h}
          width={w}
          height={h}
          rx={w / 2}
          fill="url(#oasBars)"
          opacity={0.24 + (h / 190) * 0.3}
        />
      ))}
    </svg>
  );
}

// Map + Sequence: the 2×2 map with a scatter of perspectives — the basic
// mapping unit, in the card's emerald/steel palette.
function QuadrantArt() {
  const dots: [number, number, number][] = [
    [52, 44, 5], [96, 78, 4], [70, 122, 6], [128, 52, 4],
    [156, 96, 5], [118, 148, 4], [178, 138, 7], [44, 168, 4],
    [148, 178, 4], [190, 62, 4],
  ];
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 230 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="msDots" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0E8F66" />
          <stop offset="100%" stopColor="#3D6FA3" />
        </linearGradient>
      </defs>
      <line x1="115" y1="8" x2="115" y2="202" stroke="#0E8F66" strokeOpacity="0.28" strokeWidth="1.5" />
      <line x1="12" y1="105" x2="218" y2="105" stroke="#0E8F66" strokeOpacity="0.28" strokeWidth="1.5" />
      {dots.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="url(#msDots)" opacity={0.26 + (r - 4) * 0.09} />
      ))}
    </svg>
  );
}

// interView: conversations chained into a web — echoes the graph on the
// interView lander, in the card's crimson palette.
function SequenceChainArt() {
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 320 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="ivChain" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C83B50" />
          <stop offset="100%" stopColor="#7A2231" />
        </linearGradient>
      </defs>
      <path d="M60,62 C110,62 110,105 160,105" stroke="url(#ivChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M60,160 C110,160 110,105 160,105" stroke="url(#ivChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M160,105 C215,105 215,70 268,70" stroke="url(#ivChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M160,105 C215,105 215,148 268,148" stroke="url(#ivChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      {[[60, 62, 26], [60, 160, 26], [160, 105, 32], [268, 70, 24], [268, 148, 24]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="#FCFAF6" fillOpacity="0.6" stroke="url(#ivChain)" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx={x} cy={y} r={3} fill="url(#ivChain)" opacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

// Chorus: separate voices running in parallel, gathering around one node, then
// re-forming as parallel lines and rising — many people, one person, the memory
// carried on. The waist is narrower than the base and the lines that leave it
// are closer together than the ones that arrived, which is the whole shape of
// the app in one figure.
//
// Eau de nil ground and a dial-amber line, the memorial's own palette: the
// strokes darken toward the bottom and light up as they rise.
function ChorusArt() {
  // Five voices. Bottom parallels at 34pt spacing, the waist at 5.5, the rising
  // parallels at 17 — the gather has to be visibly tighter than both or the
  // figure reads as a plain hourglass rather than as a convergence.
  //
  // The whole figure sits in the RIGHT half of the viewBox. The card anchors
  // this art to its right edge behind the type, so a centred composition puts
  // the node straight through the subtitle line.
  const voices = [
    'M180,208 L180,152 C180,124 237,132 237,104 C237,78 214,74 214,44 L214,4',
    'M214,208 L214,152 C214,126 243,130 243,104 C243,80 231,74 231,44 L231,4',
    'M248,208 L248,152 C248,128 248,128 248,104 C248,82 248,74 248,44 L248,4',
    'M282,208 L282,152 C282,130 253,130 253,104 C253,80 265,74 265,44 L265,4',
    'M316,208 L316,152 C316,132 259,132 259,104 C259,78 282,74 282,44 L282,4',
  ];
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 320 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="chorusVoices" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8A6F4E" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#C97B1E" />
          <stop offset="100%" stopColor="#E8A44B" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#chorusVoices)" strokeWidth="1.6" strokeLinecap="round">
        {voices.map(d => <path key={d} d={d} />)}
      </g>
      {/* The person the voices gather around. */}
      <circle cx="248" cy="104" r="8.5" fill="none" stroke="#C97B1E" strokeWidth="1.6" />
      <circle cx="248" cy="104" r="3.2" fill="#C97B1E" />
    </svg>
  );
}

// Synthesis: many scattered nodes drawn along converging curves into one
// filled node — the group arriving at a single expression, in brass → teal.
function ConvergeArt() {
  const target: [number, number] = [272, 105];
  const nodes: [number, number, number][] = [
    [30, 34, 4], [22, 78, 4], [44, 122, 5], [28, 168, 4],
    [78, 52, 4], [70, 100, 5], [86, 140, 4],
    [140, 72, 5], [150, 132, 5], [186, 98, 6],
  ];
  const paths = [
    'M30,34 C120,34 162,105 246,105',
    'M22,78 C112,78 166,105 246,105',
    'M44,122 C130,122 172,105 246,105',
    'M28,168 C120,168 162,105 246,105',
    'M78,52 C150,52 182,105 246,105',
    'M70,100 C152,100 190,105 246,105',
    'M86,140 C156,140 186,105 246,105',
  ];
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 320 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="synConverge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#E3A548" />
          <stop offset="100%" stopColor="#55C2A8" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="url(#synConverge)" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
      ))}
      {nodes.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="url(#synConverge)" opacity={0.28 + (x / 246) * 0.42} />
      ))}
      <circle cx={target[0]} cy={target[1]} r={26} fill="url(#synConverge)" opacity="0.78" />
    </svg>
  );
}

export type CardKey =
  | 'circles' | 'threshold' | 'chorus' | 'synthesis' | 'spectrum' | 'interview' | 'map-sequence';

type Card = {
  key: CardKey;
  /** Plain-text name, for labels the styled title cannot supply. */
  name: string;
  lander: string;
  app: string;
  className: string;
  art: React.ReactNode;
  title: React.ReactNode;
  titleClassName?: string;
  sub: React.ReactNode;
  subClassName?: string;
  meta?: React.ReactNode;
};

const CARDS: Card[] = [
  // Circles first: the newest experiment, and the one the others are
  // converging into. It wears the product's warm ground and ring, with the
  // same wordmark and mono sub-line type as every other card. The sub-line
  // breaks at its comma: two clauses, one per line.
  {
    key: 'circles',
    name: 'Circles',
    lander: '/circles',
    app: `${CIRCLES_URL}/circles`,
    className: styles.gameCardCi,
    art: <CircleRingArt />,
    title: 'Circles',
    titleClassName: styles.gameCardTitleCi,
    sub: <><span>form a sharing circle,</span><span>exchange conversations with the crowd</span></>,
    subClassName: styles.gameCardSubCi,
  },
  // Threshold's wordmark has no morpheme seam to split on, so it stays one
  // colour like Chorus's. The two poles live in the art, where they belong —
  // and the sub-line wears the app's neutral threshold grey, the colour of the
  // split itself. It has no lander on this site, so both go to the app.
  {
    key: 'threshold',
    name: 'Threshold',
    lander: THRESHOLD_URL,
    app: `${THRESHOLD_URL}/me`,
    className: styles.gameCardTh,
    art: <ThresholdBeamArt />,
    title: 'Threshold',
    sub: <>a tool for finding the group&apos;s dividing line</>,
    subClassName: styles.gameCardSubTh,
    meta: <>voice stories &middot; polarity sorting &middot; rounds by mail</>,
  },
  // The one card with a single-colour wordmark by precedent. The others split
  // on something the split means — syn-/-thesis, the two OaS axes. "Cho|rus"
  // has no such seam, so a two-tone treatment here would be decoration
  // pretending to be structure.
  {
    key: 'chorus',
    name: 'Chorus',
    lander: '/chorus',
    app: '/chorus',
    className: styles.gameCardCh,
    art: <ChorusArt />,
    title: 'Chorus',
    sub: 'connecting stories and voices',
    subClassName: styles.gameCardSubCh,
    meta: <>voice stories &middot; shared vocabulary &middot; one open link</>,
  },
  {
    key: 'synthesis',
    name: 'Synthesis',
    lander: '/synthesis',
    app: SYNTHESIS_URL,
    className: styles.gameCardSyn,
    art: <ConvergeArt />,
    title: <><span className={styles.synPrefix}>Syn</span><span className={styles.synAccent}>thesis</span></>,
    sub: 'a tool for generating collective thought',
    subClassName: styles.gameCardSubSyn,
    meta: <>private&rarr;shared maps &middot; borrowed thoughts &middot; LLM synthesis &middot; token voting</>,
  },
  {
    key: 'spectrum',
    name: 'On a Spectrum',
    lander: '/spectrum',
    app: SPECTRUM_URL,
    className: styles.gameCardOas,
    art: <SpectrumBarsArt />,
    title: <>On&nbsp;a&nbsp;<span className={styles.oasAx}>Spec</span><span className={styles.oasAy}>trum</span></>,
    sub: 'move group thought from polarization to nuance',
    subClassName: styles.gameCardSubOas,
    meta: <>thought mapping &middot; spectrum ranking &middot; timed rounds</>,
  },
  // /interview redirects to the default game's session by its real slug.
  {
    key: 'interview',
    name: 'interView',
    lander: '/interview',
    app: '/interview',
    className: styles.gameCardIv,
    art: <SequenceChainArt />,
    title: <>inter<span className={styles.gameCardAccent}>View</span></>,
    sub: 'a tool for designing conversations that learn',
    meta: <>2D map &middot; sequences &middot; tokens &middot; quorum</>,
  },
  {
    key: 'map-sequence',
    name: 'Map + Sequence',
    lander: '/map-sequence',
    app: '/create',
    className: styles.gameCardMs,
    art: <QuadrantArt />,
    title: <>Map&nbsp;+&nbsp;<span className={styles.msAccent}>Sequence</span></>,
    sub: 'the original holoscopic mapping tools',
    subClassName: styles.gameCardSubMs,
    meta: <>2D map &middot; comments &middot; votes &middot; sequenced rounds</>,
  },
];

export type CardSignal = { count: number; items: { title: string; href: string }[] };

// Cards named in `order` come first, in that order; any it leaves out follow
// in the default order, so a partial list can never drop a card.
function orderedCards(order?: CardKey[]): Card[] {
  if (!order?.length) return CARDS;
  const byKey = new Map(CARDS.map(c => [c.key, c]));
  const picked = order.flatMap(k => byKey.get(k) ?? []);
  const seen = new Set(picked.map(c => c.key));
  return [...picked, ...CARDS.filter(c => !seen.has(c.key))];
}

// `signals` and `order` are the dashboard's alone. The homepage passes neither
// and gets the exact markup it always had: a card with nothing waiting renders
// as the bare link, with no wrapper around it.
export default function GameCardStack({
  to,
  signals,
  order,
}: {
  to: 'lander' | 'app';
  signals?: Partial<Record<CardKey, CardSignal>>;
  order?: CardKey[];
}) {
  return (
    <div className={styles.gameCardStack}>
      {orderedCards(order).map(card => {
        const href = card[to];
        const className = `${styles.gameCard} ${card.className}`;
        const body = (
          <>
            {card.art}
            <span className={`${styles.gameCardTitle} ${card.titleClassName ?? ''}`}>{card.title}</span>
            <span className={`${styles.gameCardSub} ${card.subClassName ?? ''}`}>{card.sub}</span>
            {card.meta && <span className={styles.gameCardMeta}>{card.meta}</span>}
          </>
        );
        const link = href.startsWith('http') ? (
          <a key={card.key} href={href} className={className}>{body}</a>
        ) : (
          <Link key={card.key} href={href} className={className}>{body}</Link>
        );
        const signal = signals?.[card.key];
        if (!signal || signal.count <= 0) return link;
        // The toggle is a sibling of the link, never inside it: a button
        // nested in an <a> is invalid markup, and a click on it would also
        // follow the card.
        return (
          <div key={card.key} className={styles.gameCardSlot}>
            {link}
            <GameCardSignal name={card.name} signal={signal} />
          </div>
        );
      })}
    </div>
  );
}
