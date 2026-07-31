import Link from 'next/link';
import type { Metadata } from 'next';
import { memorialUrl } from '@/lib/games';
import styles from './page.module.css';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: 'Chorus — Holoscopic',
  description:
    'Stories and voices about one person, gathered from everyone who has one. Each page has its own link, and anyone holding it can add to it.',
};

// The Chorus lander, on the home domain — the same pattern Synthesis,
// interView and Map + Sequence follow: holoscopic.io introduces the game and
// hands off to where it runs.
//
// DELIBERATELY A TEASER. The other landers walk through their game's flow;
// this one says what Chorus is and opens the door. The flow is three taps and
// a sentence, and reading about it takes longer than doing it — anyone who
// wants to know what it's like should be inside a real page instead.
//
// Also deliberately not a page about death. A memorial is the sharpest case
// and the one that shaped the design, but the mechanic is stories and voices
// about one person gathering in one place, and there are living people it
// belongs to. Nothing here narrows it to the funeral.
//
// COPY RULE (project-wide): every line says what a thing IS. No "not a…",
// no "instead of…", no defining by contrast.
//
// This page is in the SITE's warm palette with Chorus's dial-amber standing in
// for the site crimson. The app's own eau de nil starts when you cross over.

export default function ChorusPage() {
  const demo = memorialUrl('chorus');

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Newest activity</p>
        <h1 className={styles.title}>Chorus</h1>
        <p className={styles.sub}>connecting stories and voices</p>

        <p className={styles.lede}>
          One page for one person, with its own link. Send it to the people who
          have a story about them, and each of them leaves what they have —
          typed, or said out loud in their own voice. What gathers is someone
          described by everyone at once.
        </p>

        <p className={styles.lede}>
          Every story arrives through the same sentence, so they line up with
          each other: the words people reach for become the ways through
          everyone else&apos;s.
        </p>

        <div className={styles.paths}>
          <a href={demo} className={styles.pathCard}>
            <span className={styles.pathLabel}>Have a look</span>
            <span className={styles.pathTitle}>Open a page</span>
            <span className={styles.pathDesc}>
              Ellen Vance is an invented person with invented stories, so you can
              walk around the whole thing.
            </span>
          </a>
        </div>

        <Link href="/" className={styles.back}>← all activities</Link>
      </div>

      <SiteFooter />
    </main>
  );
}
