import Link from 'next/link';
import type { Metadata } from 'next';
import GatheringArt from '@/components/GatheringArt';
import EmailCapture from '@/components/EmailCapture';
import SiteFooter from '@/components/SiteFooter';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Circles — Holoscopic',
  description:
    'A circle is a group of people who gather, each on their own time, to run activities together and keep what they make. Circles gather too — into collectives that learn as one.',
};

// The Circles lander, on the home domain — the long read behind the
// homepage's Model section. It carries the recursive claim and the drawing
// that makes it, and the one thing to do about it today: a seat in the first
// gathering (same `first-gathering` capture the homepage's Invitation runs).
//
// It deliberately offers no way to start a circle. The first circles form
// from the gathering's seat list (PLATFORM.md P15, rung 2); a creation
// surface arrives with the platform, and promising one here would be writing
// a cheque the product cannot cash.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.

export default function CirclesPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Circles</h1>
        <p className={styles.sub}>
          building block for <span className={styles.whole}>whole</span> society
        </p>

        <p className={styles.lede}>
          The circle is a social model with ancient roots; all members equal,
          all facing a common center. To form a circle is to gather four to
          twelve people to share experiences, explore ideas, and develop
          process together.
        </p>

        {/* The journey figure the homepage's Model section carries — the
            same drawing on both surfaces, so the story a visitor followed
            here is the story they land on. */}
        <div className={styles.figure}>
          <GatheringArt className={styles.art} />
        </div>

        <p className={styles.lede}>
          Circles are also a building block. Circles gather into collectives
          that think as one, and the pattern continues — each new layer with
          its own activities and its own feedback loops.
        </p>

        <div className={styles.joinBlock}>
          <h2 className={styles.joinHeading}>Save a seat</h2>
          <p className={styles.joinBody}>
            The first gathering is convening now, sized to fit the crowd:
            circles form as seats fill, each runs a cycle, then the circles
            gather. Leave your address and we&apos;ll write when your circle
            forms.
          </p>
          <EmailCapture
            cta="Save me a seat"
            sentNote="Seat saved. We'll write when your circle forms."
            source="first-gathering"
          />
        </div>

        <Link href="/" className={styles.back}>← Holoscopic</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
