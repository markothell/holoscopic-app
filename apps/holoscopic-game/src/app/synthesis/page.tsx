import Link from 'next/link';
import type { Metadata } from 'next';
import { SYNTHESIS_URL } from '@/lib/games';
import styles from './page.module.css';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Synthesis — Holoscopic',
  description:
    'A group thinks together on one idea and works toward a single statement all of them stand behind.',
};

// The Synthesis lander, on the home domain — the same pattern interView and
// Map + Sequence follow: holoscopic.io explains the game, then hands off to
// wherever the game is actually played. Here that is the synthesis.holoscopic.io
// subdomain (SYNTHESIS_URL, overridable for local dev).
//
// This page is deliberately in the SITE's warm palette, not the app's dusk
// theme. It belongs to holoscopic.io; the dark theme starts when you cross
// over to the app.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.

// Beat marks, redrawn from the app's own shape language in the site's light
// palette: hexagon = topic hub, chamfered card = thought, dashed = private,
// concentric rings = the group's synthesis.

const hex = (x: number, y: number, w: number, h: number) =>
  `M ${x + w * 0.25},${y} L ${x + w * 0.75},${y} L ${x + w},${y + h / 2} `
  + `L ${x + w * 0.75},${y + h} L ${x + w * 0.25},${y + h} L ${x},${y + h / 2} Z`;

const card = (x: number, y: number, w: number, h: number, c = 5) =>
  `M ${x + c},${y} L ${x + w - c},${y} L ${x + w},${y + c} L ${x + w},${y + h - c} `
  + `L ${x + w - c},${y + h} L ${x + c},${y + h} L ${x},${y + h - c} L ${x},${y + c} Z`;

const BRASS = '#c78a2a';
const TEAL = '#1f9e84';
const PERI = '#5c60c4';

function BeatArt({ children }: { children: React.ReactNode }) {
  return (
    <svg className={styles.beatArt} width="76" height="56" viewBox="0 0 76 56" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

const ArtPrivate = (
  <BeatArt>
    <path d={hex(24, 6, 28, 15)} fill="none" stroke={BRASS} strokeWidth="1.3" strokeDasharray="4 3" />
    <path d={card(4, 34, 26, 15)} fill="none" stroke={BRASS} strokeWidth="1.3" />
    <path d={card(46, 34, 26, 15)} fill="none" stroke={BRASS} strokeWidth="1.3" />
    <path d="M33,21 L22,34 M43,21 L54,34" stroke="var(--border-strong)" strokeWidth="1" />
  </BeatArt>
);

const ArtRespond = (
  <BeatArt>
    <path d={card(2, 21, 27, 15)} fill="none" stroke={BRASS} strokeWidth="1.3" />
    <path d={card(46, 21, 27, 15)} fill="none" stroke={PERI} strokeWidth="1.3" />
    <path d="M29,28 L46,28" stroke={PERI} strokeWidth="1.3" strokeDasharray="3 3" />
  </BeatArt>
);

const ArtUnion = (
  <BeatArt>
    {[8, 20, 32].map((y, i) => (
      <path key={i} d={`M4,${y + 6} C24,${y + 6} 28,28 46,28`} fill="none" stroke={BRASS} strokeWidth="1.2" opacity={0.75} />
    ))}
    <text x="52" y="35" fontSize="20" fill={PERI} fontFamily="var(--font-dm-mono), monospace">∪</text>
  </BeatArt>
);

const ArtSynthesis = (
  <BeatArt>
    <path d={hex(28, 20, 22, 14)} fill="none" stroke={TEAL} strokeWidth="1.5" />
    <path d={hex(24, 16, 30, 22)} fill="none" stroke={TEAL} strokeWidth="1.1" opacity={0.75} />
    <path d={hex(20, 12, 38, 30)} fill="none" stroke={TEAL} strokeWidth="1.1" opacity={0.34} />
  </BeatArt>
);

const BEATS: { art: React.ReactNode; title: string; desc: string }[] = [
  {
    art: ArtPrivate,
    title: 'Think privately first',
    desc: 'Grow your own map of the idea — hubs, thoughts, the context behind each one. It stays yours until you publish it.',
  },
  {
    art: ArtRespond,
    title: 'Respond, and carry it home',
    desc: "Answering someone's published thought places your stance on their post and drops a linked copy onto your own map. Add your own thinking to it and it becomes yours.",
  },
  {
    art: ArtUnion,
    title: 'Take the union',
    desc: 'One read of everything the group has published, cited back to who said what. Edit it into words you would stand behind, and put those to the group.',
  },
  {
    art: ArtSynthesis,
    title: 'Find synthesis',
    desc: 'Everyone holds three slots, shared between writing statements and backing them. When two thirds of the group stands behind one, the idea is in synthesis.',
  },
];

export default function SynthesisPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Newest game</p>
        <h1 className={styles.title}>
          <span className={styles.synPrefix}>Syn</span>
          <span className={styles.synAccent}>thesis</span>
        </h1>
        <p className={styles.sub}>a game for generating collective thought</p>

        <p className={styles.lede}>
          On a Spectrum ran on a clock. Synthesis is the opposite tempo — a
          game where time to think is a move.
        </p>

        <p className={styles.lede}>
          An <strong>idea</strong>{' '}is a thought space you draft and invite people
          into — a question worth a group&apos;s attention. Its title sits at the
          centre of everyone&apos;s map, and the idea becomes whatever its
          collaborators put underneath it. Up to fifty people, each under a handle
          that means something inside that one idea.
        </p>

        <ul className={styles.beats}>
          {BEATS.map(b => (
            <li key={b.title} className={styles.beat}>
              {b.art}
              <span>
                <span className={styles.beatTitle}>{b.title}</span>
                <span className={styles.beatDesc}>{b.desc}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.measure}>
          <p className={styles.measureTitle}>Synthesis is a living measure</p>
          <p className={styles.measureBody}>
            It stays live. Backing moves, better words arrive, new people join —
            and the measure follows. Anyone who reads where the group landed and
            sees it differently can put up their own words and move it. Getting
            there is the group&apos;s achievement, and so is finding better.
          </p>
        </div>

        <div className={styles.paths}>
          <a href={SYNTHESIS_URL} className={styles.pathCard}>
            <span className={styles.pathLabel}>01 · Draft</span>
            <span className={styles.pathTitle}>Start an idea</span>
            <span className={styles.pathDesc}>
              Name the question, choose whether anyone can find it, and invite the
              people you want thinking on it.
            </span>
          </a>
          <a href={SYNTHESIS_URL} className={styles.pathCard}>
            <span className={styles.pathLabel}>02 · Join</span>
            <span className={styles.pathTitle}>Join with a code</span>
            <span className={styles.pathDesc}>
              Someone sent you five characters. Pick a handle and the idea&apos;s
              map opens with its title at the centre.
            </span>
          </a>
        </div>

        <p className={styles.note}>
          Synthesis runs at{' '}
          <a href={SYNTHESIS_URL} className={styles.noteLink}>synthesis.holoscopic.io</a>
          {' '}— a Holoscopic account is all it takes, and there is no economy to
          learn: publishing, replying, and voting are free.
        </p>

        <Link href="/" className={styles.back}>← all games</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
