import Link from 'next/link';
import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Map + Sequence — Holoscopic',
  description:
    'The original holoscopic tools: build a shared map, then chain maps into a sequence.',
};

// The historically-first game: the create panel and the sequence builder,
// presented as one entry. The tools themselves live at /create and
// /create/sequences, unchanged.
export default function MapSequencePage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>The first game · where holoscopic began</p>
        <h1 className={styles.title}>
          Map&nbsp;+&nbsp;<span className={styles.accent}>Sequence</span>
        </h1>
        <p className={styles.sub}>group.mapping.one.step.at.a.time</p>

        <p className={styles.lede}>
          Before the games, there were the tools. A <strong>map</strong> asks one
          question and lets a group answer in two dimensions — every perspective
          a point, every point a comment, every comment votable. A{' '}
          <strong>sequence</strong> chains maps into rounds, so one conversation
          can unfold deliberately over days or weeks.
        </p>

        <div className={styles.paths}>
          <Link href="/create" className={styles.pathCard}>
            <span className={styles.pathLabel}>01 · Map</span>
            <span className={styles.pathTitle}>Create a map</span>
            <span className={styles.pathDesc}>
              Set the question and the two axes; share one link; watch the
              group&apos;s picture form.
            </span>
          </Link>
          <Link href="/create/sequences" className={styles.pathCard}>
            <span className={styles.pathLabel}>02 · Sequence</span>
            <span className={styles.pathTitle}>Build a sequence</span>
            <span className={styles.pathDesc}>
              Order maps into rounds, open them on your schedule, and carry the
              group from question to question.
            </span>
          </Link>
        </div>

        <p className={styles.note}>
          Published sequences live at <code>/sequence/&lt;name&gt;</code> — send
          that link and players need nothing else. Signing in is all it takes to
          start building.
        </p>

        <Link href="/" className={styles.back}>← all games</Link>
      </div>
    </main>
  );
}
