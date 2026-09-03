import Link from 'next/link';
import type { Metadata } from 'next';
import { CIRCLES_URL } from '@/lib/games';
import styles from './page.module.css';
import SiteFooter from '@/components/SiteFooter';
import HarborMapArt from '@/components/HarborMapArt';
import EmailCapture from '@/components/EmailCapture';

export const metadata: Metadata = {
  title: 'Circles — Holoscopic',
  description:
    'A circle is a group of people who gather, each on their own time, to explore what they think and keep what they make. Circles gather too.',
};

// The Circles lander, on the home domain — the same pattern Synthesis, Chorus,
// interView and Map + Sequence follow: holoscopic.io introduces the thing and
// hands off to where it runs, here circles.holoscopic.io (CIRCLES_URL).
//
// This is where the circle content lives now. The homepage used to carry a
// "social model" section and the first-gathering invitation; both moved here
// so the homepage is the lab's inventory and this page is the circle's own
// door. The card on the homepage points here, like the other instruments'.
//
// The page keeps the site's warm palette and structure, with the product's
// own marks standing in for the site crimson: the serif wordmark, the ring,
// rope and ochre from apps/circles/DESIGN.md.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.

// ── The four beats, drawn in the circle map's own grammar ────────────────
//
// These used to be generic icons (a microphone, a stack of cards). They are
// now the SAME PICTURE the product draws — apps/circles/src/components/
// CircleMap.tsx — at four moments, so a visitor recognises the circle home the
// first time they see it.
//
// What the map does, and what these copy exactly:
//   · No ring is stroked. Seats sit on an implicit ring and imply it.
//   · The faint circle in the middle is the toono: the crown the group's work
//     converges on. It is `--rule`, always there, always quiet.
//   · A seat is a `--card` disc with a `--rule-strong` edge; YOURS wears
//     `--ink` at 1.8.
//   · A solo or nominated exploration is a short `--ochre` spur pointing
//     outward with no circle at its end. An `--ochre` dot on the open end
//     means the circle backed it and it is queued.
//   · What the group made together is a `--shared` disc with a `--rope` edge,
//     sized by how much of the circle took part, with `--rule-strong` edges
//     back to the members who did.
//   · `--sky` marks what is LIVE and nothing else (DESIGN.md's one rule).
//     The live node is `--card` inside a sky edge, with a pulse ring around
//     it — animated in the app, held still and faint here.
//
// The one deliberate departure: radii are scaled up relative to the ring. The
// app draws at 440px where these draw at 76, and a faithful ratio would put
// the centre nodes under two pixels.
const CARD = '#FDFAF4';
const INK = '#3A2E20';
const OCHRE = '#C08A3E';
const ROPE = '#B49A6E';
const SHARED = '#EDE3D0';
const SKY = '#3D7FB5';
const RULE = 'rgba(58, 46, 32, 0.14)';
const RULE_STRONG = 'rgba(58, 46, 32, 0.30)';

// Eight seats on a ring of 26 about (44,44). Written out rather than computed:
// server and browser libm disagree in the last bits of sin/cos, and the
// difference serialises into a hydration mismatch (the same reason
// GatheringArt quantises).
const SEATS: [number, number][] = [
  [44, 18], [62.38, 25.62], [70, 44], [62.38, 62.38],
  [44, 70], [25.62, 62.38], [18, 44], [25.62, 25.62],
];
const SEAT_R = 5.5;
const TOONO_R = 13;

function BeatArt({ children }: { children: React.ReactNode }) {
  return (
    <svg className={styles.beatArt} width="76" height="76" viewBox="0 0 88 88" fill="none" aria-hidden>
      {/* the toono, under everything */}
      <circle cx="44" cy="44" r={TOONO_R} fill="none" stroke={RULE} strokeWidth="1" />
      {children}
    </svg>
  );
}

/** The ring of seats. `mine` is the index wearing the ink edge, if any. */
function Seats({ mine }: { mine?: number }) {
  return (
    <>
      {SEATS.map(([x, y], i) => (
        <circle
          key={i}
          cx={x} cy={y} r={SEAT_R}
          fill={CARD}
          stroke={i === mine ? INK : RULE_STRONG}
          strokeWidth={i === mine ? 1.8 : 1.2}
        />
      ))}
    </>
  );
}

/** An edge from a seat to something in the middle — under the discs. */
function Edge({ from, to }: { from: number; to: [number, number] }) {
  return (
    <line
      x1={SEATS[from][0]} y1={SEATS[from][1]} x2={to[0]} y2={to[1]}
      stroke={RULE_STRONG} strokeWidth="1"
    />
  );
}

// Propose: one seat puts a question to the circle. It hangs off them as an
// ochre spur, and the dot on the open end is the circle having backed it —
// exactly how a nominated seed reads on the map before it runs.
const ArtPropose = (
  <BeatArt>
    <line x1="77.5" y1="44" x2="84" y2="44" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="84" cy="44" r="2.5" fill={OCHRE} />
    <Seats mine={2} />
  </BeatArt>
);

// Answer: the round is live. Sky, and only here. Your own edge is the one
// edge a live node can carry — the map never shows who else has spoken yet.
const ArtAnswer = (
  <BeatArt>
    <Edge from={2} to={[44, 44]} />
    <circle cx="44" cy="44" r="9" fill="none" stroke={SKY} strokeWidth="1.2" opacity="0.35" />
    <circle cx="44" cy="44" r="6" fill={CARD} stroke={SKY} strokeWidth="1.8" />
    <Seats mine={2} />
  </BeatArt>
);

// Reveal: everyone has spoken, so the node is finished — shared and rope —
// sized by how much of the circle took part, sitting toward the members who
// did, with an edge back to each of them.
const ArtReveal = (
  <BeatArt>
    {[1, 2, 3, 5].map(i => <Edge key={i} from={i} to={[47, 45]} />)}
    <circle cx="47" cy="45" r="8" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
    <Seats mine={2} />
  </BeatArt>
);

// Keep: the map after a few cycles. Several finished nodes at their own
// sizes, and one spur still hanging off a seat — something one member has
// explored alone, waiting for the circle to join them.
const ArtKeep = (
  <BeatArt>
    {[1, 2, 7].map(i => <Edge key={`a${i}`} from={i} to={[50, 39]} />)}
    {[4, 5].map(i => <Edge key={`b${i}`} from={i} to={[38, 51]} />)}
    <Edge from={6} to={[36, 38]} />
    <circle cx="50" cy="39" r="7.5" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
    <circle cx="38" cy="51" r="5.5" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
    <circle cx="36" cy="38" r="4" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
    <line x1="44" y1="10.5" x2="44" y2="4" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round" />
    <Seats mine={2} />
  </BeatArt>
);

const ArtShare = (
  <BeatArt>
    <line x1="49" y1="42" x2="77" y2="30" stroke={ROPE} strokeWidth="1.2" />
    <circle cx="44" cy="44" r="7" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
    <Seats />
    <circle cx="81" cy="28.7" r="4.5" fill={SHARED} stroke={ROPE} strokeWidth="1.2" />
  </BeatArt>
);

const BEATS: { art: React.ReactNode; title: string; desc: string }[] = [
  {
    art: ArtPropose,
    title: 'Propose',
    desc: 'Anyone puts a question to the circle. It starts when a third of the circle backs it, so nobody commits the room’s attention alone.',
  },
  {
    art: ArtAnswer,
    title: 'Answer',
    desc: 'Everyone answers once, on their own time, in voice or in writing: a story, a place on an axis, both at once, or a word from a shared set.',
  },
  {
    art: ArtReveal,
    title: 'Reveal',
    desc: 'Answers show as they arrive, or stay sealed until the last person has spoken. Then the circle sees where it landed, on its own ring.',
  },
  {
    art: ArtKeep,
    title: 'Keep',
    desc: 'What a circle makes, it keeps: a wall of stories, a map of where everyone stands, a portrait in the group’s own words.',
  },
  {
    art: ArtShare,
    title: 'Share',
    desc: 'Offer your most interesting prompts to the community of circles, so a question that worked in your room can be run in someone else’s.',
  },
];

export default function CirclesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Circles</h1>
        <p className={styles.sub}>form a sharing circle, exchange conversations with the crowd</p>

        <p className={styles.lede}>
          Holoscopic builds tools for small groups to think together. Circles is
          where those tools are played: the room that runs them, and the room
          that keeps what they make.
        </p>

        <p className={styles.lede}>
          The circle is a social model with ancient roots: four to twelve
          people, all equal, all facing a common center, gathered to learn as
          one &mdash; record stories, map where everyone stands, find the
          group&apos;s thresholds, arrive at shared words. What a circle makes,
          it keeps.
        </p>

        <div className={styles.figure}>
          <HarborMapArt className={styles.figureArt} />
        </div>

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

        <div className={styles.invitation} id="invitation">
          <span id="platform" />
          <p className={styles.invitationTitle}>Be in the first circles</p>
          <p className={styles.invitationBody}>
            We&apos;re convening the first gathering now, sized to fit the
            crowd: circles of four to twelve form as seats fill. Each circle
            runs one cycle together over a few weeks, on its own time &mdash;
            stories, sorting, maps, shared words. Then the circles gather,
            World Caf&eacute; style, and we all find out what the collective
            can see.
          </p>
          <p className={styles.invitationBody}>
            Leave your address. When the seats around you fill, your circle
            forms and the first round begins &mdash; email carries you through
            the rest.
          </p>
          <EmailCapture
            cta="Save me a seat"
            sentNote="Seat saved. We'll write when your circle forms."
            source="first-gathering"
            tone="toono"
          />
        </div>

        <div className={styles.paths}>
          <a href={`${CIRCLES_URL}/login`} className={styles.pathCard}>
            <span className={styles.pathLabel}>01 &middot; Members</span>
            <span className={styles.pathTitle}>Sign in</span>
            <span className={styles.pathDesc}>
              Already have an invitation? Your circles are waiting at
              circles.holoscopic.io.
            </span>
          </a>
          <Link href="/contact" className={styles.pathCard}>
            <span className={styles.pathLabel}>02 &middot; Convene</span>
            <span className={styles.pathTitle}>Bring your circle</span>
            <span className={styles.pathDesc}>
              Already meet as a group? Write, and we&apos;ll set your circle up
              with the instruments it wants to play.
            </span>
          </Link>
        </div>

        <p className={styles.note}>
          Circles runs at{' '}
          <a href={CIRCLES_URL} className={styles.noteLink}>circles.holoscopic.io</a>
          {' '}&mdash; one Holoscopic account opens every instrument.
        </p>

        <Link href="/" className={styles.back}>&larr; all instruments</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
