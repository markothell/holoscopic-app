import Link from 'next/link';
import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Map + Sequence — Holoscopic',
  description:
    'Our first attempt at algorithmic social design: build a shared map, then chain maps into a sequence.',
};

// A group map: quadrant, scattered perspectives, and the comments beside
// them — the essence of the activity view, redrawn in the site's light
// palette.
function MapIllustration() {
  const dots: [number, number, number, string][] = [
    [104, 42, 5, '#0E8F66'], [138, 66, 4, '#3D6FA3'], [76, 84, 5, '#C83B50'],
    [122, 104, 6, '#9A7B2F'], [58, 122, 4, '#3D6FA3'], [96, 138, 4, '#C83B50'],
    [148, 128, 5, '#0E8F66'], [70, 52, 4, '#9A7B2F'],
  ];
  const comments: [number, string][] = [[36, '#0E8F66'], [78, '#3D6FA3'], [120, '#C83B50']];
  return (
    <svg className={styles.pathArt} viewBox="0 0 340 170" aria-hidden>
      {/* the map */}
      <rect x="12" y="14" width="184" height="142" rx="10" fill="var(--bg-primary)" stroke="var(--border-default)" />
      <line x1="104" y1="24" x2="104" y2="146" stroke="var(--border-strong)" strokeWidth="1" />
      <line x1="22" y1="85" x2="186" y2="85" stroke="var(--border-strong)" strokeWidth="1" />
      {dots.map(([x, y, r, c], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c} opacity="0.75" />
      ))}
      <circle cx={122} cy={104} r={11} fill="none" stroke="#9A7B2F" strokeOpacity="0.4" />
      {/* the comments beside it */}
      {comments.map(([y, c], i) => (
        <g key={i}>
          <rect x="212" y={y} width="116" height="32" rx="6" fill="var(--bg-secondary)" stroke="var(--border-default)" />
          <rect x="212" y={y} width="3.5" height="32" rx="1.75" fill={c} opacity="0.8" />
          <rect x="224" y={y + 9} width="72" height="4" rx="2" fill="var(--border-strong)" />
          <rect x="224" y={y + 19} width="52" height="4" rx="2" fill="var(--border-default)" />
        </g>
      ))}
    </svg>
  );
}

// Maps chained into rounds — the sequence graph view, simplified.
function SequenceIllustration() {
  const nodes: [number, number, number][] = [
    [52, 46, 24], [52, 124, 24], [162, 52, 28], [162, 130, 22], [276, 62, 24], [276, 128, 24],
  ];
  return (
    <svg className={styles.pathArt} viewBox="0 0 340 170" aria-hidden>
      <path d="M76,46 C118,46 120,52 134,52" stroke="var(--border-strong)" strokeWidth="1.2" fill="none" />
      <path d="M76,124 C118,124 122,58 134,54" stroke="var(--border-strong)" strokeWidth="1.2" fill="none" />
      <path d="M190,52 C232,52 240,60 252,62" stroke="var(--border-strong)" strokeWidth="1.2" fill="none" />
      <path d="M184,130 C226,130 240,128 252,128" stroke="var(--border-strong)" strokeWidth="1.2" fill="none" />
      {nodes.map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="var(--bg-secondary)" stroke="#3D6FA3" strokeOpacity="0.55" strokeWidth="1.4" />
          <rect x={x - 12} y={y - 5} width={24} height={3} rx={1.5} fill="var(--border-strong)" />
          <rect x={x - 8} y={y + 3} width={16} height={3} rx={1.5} fill="var(--border-default)" />
          <circle cx={x} cy={y + r} r={2.5} fill="#C83B50" opacity="0.7" />
        </g>
      ))}
      <text x="52" y="14" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.5">R1</text>
      <text x="162" y="14" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.5">R2</text>
      <text x="276" y="14" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-dm-mono), monospace" letterSpacing="1.5">R3</text>
    </svg>
  );
}

// The original tools — the create panel and the sequence builder,
// presented as one entry. The tools themselves live at /create and
// /create/sequences, unchanged.
export default function MapSequencePage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>
          Map&nbsp;+&nbsp;<span className={styles.accent}>Sequence</span>
        </h1>
        <p className={styles.sub}>Our first attempt</p>

        <p className={styles.lede}>
          This was our first attempt at algorithmic social design. A{' '}
          <strong>map</strong> asks one question and lets a group answer in two
          dimensions — every perspective a point, every point a comment, every
          comment votable. A <strong>sequence</strong> chains maps into rounds,
          so one conversation can unfold deliberately over days or weeks.
        </p>

        <div className={styles.paths}>
          <Link href="/create" className={styles.pathCard}>
            <MapIllustration />
            <span className={styles.pathLabel}>01 · Map</span>
            <span className={styles.pathTitle}>Create a map</span>
            <span className={styles.pathDesc}>
              Set the question and the two axes; share one link; watch the
              group&apos;s picture form.
            </span>
          </Link>
          <Link href="/create/sequences" className={styles.pathCard}>
            <SequenceIllustration />
            <span className={styles.pathLabel}>02 · Sequence</span>
            <span className={styles.pathTitle}>Build a sequence</span>
            <span className={styles.pathDesc}>
              Order maps into rounds, open them on your schedule, and carry the
              group from question to question.
            </span>
          </Link>
        </div>

        <p className={styles.note}>
          See it in use:{' '}
          <Link href="/sequence/relationship-blueprint" className={styles.noteLink}>
            the Relationship Blueprint
          </Link>{' '}
          — a real sequence with example data, open to explore. Published
          sequences live at <code>/sequence/&lt;name&gt;</code>; send that link
          and players need nothing else. Signing in is all it takes to start
          building.
        </p>

        <Link href="/" className={styles.back}>← all games</Link>
      </div>
    </main>
  );
}
