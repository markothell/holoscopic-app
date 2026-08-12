import Link from 'next/link';
import type { Metadata } from 'next';
import { SPECTRUM_URL } from '@/lib/games';
import styles from './page.module.css';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'On a Spectrum — Holoscopic',
  description:
    'A game for revealing nuance: the group nominates the dimensions that matter, ranks its ideas along them, and watches a collective picture assemble.',
};

// The On a Spectrum lander, on the home domain — the same pattern Synthesis,
// Chorus and Map + Sequence follow: holoscopic.io introduces the game and
// hands off to spectrum.holoscopic.io (SPECTRUM_URL, overridable for local
// dev), where the game actually runs.
//
// This page is in the SITE's warm palette. The homepage card's spectrum
// gradient (crimson → blue → green) belongs to the card art; here the
// mid-spectrum blue stands in for the site crimson, the way Chorus's lander
// borrows its dial amber.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast. (The lede's "axes they hadn't
// chosen" is the lab-notes exception — narrating a finding, per PLATFORM.md
// §8.)

export default function SpectrumPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>
          On a <span className={styles.accent}>Spectrum</span>
        </h1>
        <p className={styles.sub}>a game for revealing nuance</p>

        <p className={styles.lede}>
          The spectrums turned out to be the hard part — I was handing people
          axes they hadn&apos;t chosen. So finding them became the game.
        </p>

        <p className={styles.lede}>
          The group nominates the dimensions that matter, ranks its ideas along
          them, and watches a collective picture assemble. It ends with the
          group redesigning the game&apos;s own rules for the next round.
        </p>

        <div className={styles.paths}>
          <a href={SPECTRUM_URL} className={styles.pathCard}>
            <span className={styles.pathLabel}>01 · Start</span>
            <span className={styles.pathTitle}>Open a game</span>
            <span className={styles.pathDesc}>
              Name the topic and set the clock — rounds run from twenty minutes
              to four days.
            </span>
          </a>
          <a href={SPECTRUM_URL} className={styles.pathCard}>
            <span className={styles.pathLabel}>02 · Join</span>
            <span className={styles.pathTitle}>Join with a code</span>
            <span className={styles.pathDesc}>
              Someone sent you a room code. Two to ten players rank together
              and the picture reveals at once.
            </span>
          </a>
        </div>

        <p className={styles.note}>
          On a Spectrum runs at{' '}
          <a href={SPECTRUM_URL} className={styles.noteLink}>
            spectrum.holoscopic.io
          </a>
          {' '}— a Holoscopic account is all it takes.
        </p>

        <Link href="/" className={styles.back}>← all games</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
