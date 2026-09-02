import Link from 'next/link';
import type { Metadata } from 'next';
import { CIRCLES_URL } from '@/lib/games';
import styles from './page.module.css';
import SiteFooter from '@/components/SiteFooter';
import GatheringArt from '@/components/GatheringArt';
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

const ROPE = '#B49A6E';
const OCHRE = '#C08A3E';
const INK = '#3A2E20';
const SHARED = '#EDE3D0';
const CARD = '#FDFAF4';

function BeatArt({ children }: { children: React.ReactNode }) {
  return (
    <svg className={styles.beatArt} width="76" height="56" viewBox="0 0 76 56" fill="none" aria-hidden>
      {children}
    </svg>
  );
}

// Propose: one seat puts a question to the ring; a third of the seats back it.
const ArtPropose = (
  <BeatArt>
    <circle cx="38" cy="28" r="20" stroke={ROPE} strokeWidth="1.5" />
    <circle cx="38" cy="8" r="5" fill={CARD} stroke={INK} strokeWidth="1.5" />
    <circle cx="55.3" cy="18" r="4" fill={OCHRE} />
    <circle cx="55.3" cy="38" r="4" fill={OCHRE} />
    <circle cx="38" cy="48" r="4" fill={OCHRE} />
    <circle cx="20.7" cy="38" r="4" fill={CARD} stroke={ROPE} strokeWidth="1.2" />
    <circle cx="20.7" cy="18" r="4" fill={CARD} stroke={ROPE} strokeWidth="1.2" />
  </BeatArt>
);

// Answer: a voice mark and a written line, both first-class.
const ArtAnswer = (
  <BeatArt>
    <rect x="12" y="10" width="12" height="22" rx="6" fill={SHARED} stroke={ROPE} strokeWidth="1.3" />
    <path d="M8,26 C8,36 28,36 28,26" stroke={ROPE} strokeWidth="1.3" fill="none" />
    <path d="M18,36 L18,44 M13,44 L23,44" stroke={ROPE} strokeWidth="1.3" />
    <path d="M40,18 L68,18 M40,26 L64,26 M40,34 L58,34" stroke={OCHRE} strokeWidth="1.5" strokeLinecap="round" />
  </BeatArt>
);

// Reveal: the ring, seats lit, what the circle made in the middle.
const ArtReveal = (
  <BeatArt>
    <circle cx="38" cy="28" r="22" stroke={ROPE} strokeWidth="1.5" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const r = (a * Math.PI) / 180;
      return <circle key={a} cx={38 + 22 * Math.cos(r)} cy={28 + 22 * Math.sin(r)} r="3.2" fill={CARD} stroke={ROPE} strokeWidth="1.2" />;
    })}
    <circle cx="35" cy="30" r="7" fill={SHARED} stroke={ROPE} strokeWidth="1" />
    <circle cx="44" cy="24" r="4.5" fill={SHARED} stroke={ROPE} strokeWidth="1" />
  </BeatArt>
);

// Keep: the record, three artifacts stacked.
const ArtKeep = (
  <BeatArt>
    <rect x="14" y="20" width="44" height="26" rx="3" fill={CARD} stroke={ROPE} strokeWidth="1.3" />
    <rect x="18" y="14" width="44" height="26" rx="3" fill={CARD} stroke={ROPE} strokeWidth="1.3" />
    <rect x="22" y="8" width="44" height="26" rx="3" fill={CARD} stroke={INK} strokeWidth="1.3" />
    <path d="M30,18 L58,18 M30,25 L50,25" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" />
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
];

export default function CirclesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Newest experiment</p>
        <h1 className={styles.title}>Circles</h1>
        <p className={styles.sub}>form a sharing circle, exchange conversations with the crowd</p>

        <p className={styles.lede}>
          By this point the instruments could record stories, sort them, map
          where everyone stands and arrive at shared words. Circles is where
          they converge: the room they are played in, and the room that keeps
          what they make.
        </p>

        <p className={styles.lede}>
          The circle is a social model with ancient roots: four to twelve
          people, all equal, all facing a common center, gathered to learn as
          one &mdash; record stories, map where everyone stands, find the
          group&apos;s thresholds, arrive at shared words. What a circle makes,
          it keeps.
        </p>

        <div className={styles.figure}>
          <GatheringArt className={styles.figureArt} />
        </div>

        <p className={styles.lede}>
          Circles gather too. Members mix across tables the way a World
          Caf&eacute; runs, trade what their home circles learned, and carry
          the exchange back. Circles that gather become a collective &mdash;
          itself a circle, and the platform is the outermost one.
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
          />
        </div>

        <div className={styles.paths}>
          <a href={`${CIRCLES_URL}/signup`} className={styles.pathCard}>
            <span className={styles.pathLabel}>01 &middot; Join</span>
            <span className={styles.pathTitle}>Make an account</span>
            <span className={styles.pathDesc}>
              Circles form by invitation for now. An invitation link is the way
              in, and an account is what it opens.
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
          {' '}&mdash; a Holoscopic account is all it takes, and the same account
          opens every instrument.
        </p>

        <Link href="/" className={styles.back}>&larr; all instruments</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
