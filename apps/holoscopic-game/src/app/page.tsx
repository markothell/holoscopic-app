'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

// Sections below the hero start at opacity 0 and are revealed on scroll. The
// observer that does it lives in an inline script in layout.tsx, NOT here —
// see `revealScript` there. Gating the reveal on React meant the page ended at
// the hero until the whole bundle had loaded and hydrated, which on a slow
// connection (or a dev server sharing a machine with five others) reads as a
// one-screen site. Marking up with `data-reveal` keeps it a parse-time job.
function RevealSection({
  id,
  className,
  children,
}: {
  id?: string;
  className: string;
  children: React.ReactNode;
}) {
  // The script can set `data-revealed` before hydration — a section already in
  // view on load (a restored scroll position, a `#game` deep link) reveals
  // immediately. React would report that attribute as a mismatch, so this
  // element opts out of the check.
  return (
    <section id={id} className={className} data-reveal suppressHydrationWarning>
      {children}
    </section>
  );
}

function ExpandItem({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.expandItem}>
      <button
        className={styles.expandTrigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.expandTitle}>{title}</span>
        <span
          className={`${styles.expandIcon} ${open ? styles.expandIconOpen : ''}`}
        >
          +
        </span>
      </button>
      <div
        className={`${styles.expandContent} ${open ? styles.expandContentOpen : ''}`}
      >
        <div className={styles.expandInner}>{children}</div>
      </div>
    </div>
  );
}

/* ── Game-card motifs — one quiet gradient mark per game ────────────────── */

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

function MappingVisual() {
  return (
    <svg
      width="300"
      height="300"
      viewBox="0 0 300 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.visualSvg}
    >
      <rect width="300" height="300" rx="16" fill="#FCFAF6" stroke="#D9D4CC" />
      <line x1="150" y1="20" x2="150" y2="280" stroke="#0F0D0B" strokeOpacity="0.12" strokeWidth="1" />
      <line x1="20" y1="150" x2="280" y2="150" stroke="#0F0D0B" strokeOpacity="0.12" strokeWidth="1" />
      <line x1="85" y1="20" x2="85" y2="280" stroke="#0F0D0B" strokeOpacity="0.06" strokeWidth="0.5" />
      <line x1="215" y1="20" x2="215" y2="280" stroke="#0F0D0B" strokeOpacity="0.06" strokeWidth="0.5" />
      <line x1="20" y1="85" x2="280" y2="85" stroke="#0F0D0B" strokeOpacity="0.06" strokeWidth="0.5" />
      <line x1="20" y1="215" x2="280" y2="215" stroke="#0F0D0B" strokeOpacity="0.06" strokeWidth="0.5" />
      <text x="150" y="15" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="8" fontFamily="monospace" letterSpacing="1.5">INDIVIDUAL</text>
      <text x="150" y="296" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="8" fontFamily="monospace" letterSpacing="1.5">COLLECTIVE</text>
      <text x="14" y="154" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(-90 14 150)">SHORT</text>
      <text x="290" y="150" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(90 288 148)">LONG</text>
      <circle cx="60" cy="55" r="4" fill="#0E8F66" fillOpacity="0.55" />
      <circle cx="95" cy="72" r="3.5" fill="#0E8F66" fillOpacity="0.5" />
      <circle cx="75" cy="102" r="4" fill="#0E8F66" fillOpacity="0.62" />
      <circle cx="112" cy="85" r="3" fill="#0E8F66" fillOpacity="0.5" />
      <circle cx="120" cy="50" r="3.5" fill="#0E8F66" fillOpacity="0.5" />
      <circle cx="55" cy="122" r="3" fill="#0E8F66" fillOpacity="0.48" />
      <circle cx="135" cy="110" r="3.5" fill="#0E8F66" fillOpacity="0.55" />
      <circle cx="118" cy="128" r="14" fill="#0E8F66" fillOpacity="0.08" />
      <circle cx="118" cy="128" r="10" fill="#0E8F66" fillOpacity="0.9" />
      <circle cx="240" cy="46" r="4.5" fill="#2B49D8" fillOpacity="0.65" />
      <circle cx="222" cy="80" r="4.5" fill="#2B49D8" fillOpacity="0.65" />
      <circle cx="265" cy="92" r="5" fill="#2B49D8" fillOpacity="0.7" />
      <circle cx="202" cy="55" r="3.5" fill="#2B49D8" fillOpacity="0.55" />
      <circle cx="252" cy="122" r="3" fill="#2B49D8" fillOpacity="0.48" />
      <circle cx="185" cy="100" r="4" fill="#2B49D8" fillOpacity="0.5" />
      <circle cx="175" cy="60" r="3.5" fill="#2B49D8" fillOpacity="0.45" />
      <circle cx="95" cy="202" r="5" fill="#C83B50" fillOpacity="0.65" />
      <circle cx="76" cy="262" r="4" fill="#C83B50" fillOpacity="0.6" />
      <circle cx="122" cy="242" r="3.5" fill="#C83B50" fillOpacity="0.55" />
      <circle cx="112" cy="212" r="3" fill="#C83B50" fillOpacity="0.48" />
      <circle cx="58" cy="232" r="4" fill="#C83B50" fillOpacity="0.55" />
      <circle cx="136" cy="270" r="3" fill="#C83B50" fillOpacity="0.38" />
      <circle cx="55" cy="195" r="18" fill="#C83B50" fillOpacity="0.07" />
      <circle cx="55" cy="195" r="12" fill="#C83B50" fillOpacity="0.9" />
      <circle cx="212" cy="226" r="5" fill="#C77D2E" fillOpacity="0.7" />
      <circle cx="237" cy="202" r="4" fill="#C77D2E" fillOpacity="0.62" />
      <circle cx="272" cy="218" r="3.5" fill="#C77D2E" fillOpacity="0.65" />
      <circle cx="196" cy="252" r="4" fill="#C77D2E" fillOpacity="0.55" />
      <circle cx="217" cy="275" r="3" fill="#C77D2E" fillOpacity="0.5" />
      <circle cx="262" cy="242" r="4" fill="#C77D2E" fillOpacity="0.45" />
      <circle cx="185" cy="212" r="3" fill="#C77D2E" fillOpacity="0.4" />
      <circle cx="252" cy="258" r="5" fill="#C77D2E" fillOpacity="0.65" />
      <circle cx="150" cy="150" r="2" fill="#0F0D0B" fillOpacity="0.25" />
    </svg>
  );
}

function SequenceVisual() {
  return (
    <svg
      width="300"
      height="260"
      viewBox="0 0 300 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.visualSvg}
    >
      <rect width="300" height="260" rx="16" fill="#FCFAF6" stroke="#D9D4CC" />
      <defs>
        <radialGradient id="gravityGlow" cx="78%" cy="38%" r="28%">
          <stop offset="0%"   stopColor="#2B49D8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#2B49D8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="260" rx="16" fill="url(#gravityGlow)" />
      <line x1="65"  y1="42" x2="65"  y2="238" stroke="#0F0D0B" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="150" y1="42" x2="150" y2="238" stroke="#0F0D0B" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="235" y1="42" x2="235" y2="238" stroke="#0F0D0B" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="3 4" />
      <text x="65"  y="32" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="7" fontFamily="monospace" letterSpacing="1.5">THEN</text>
      <text x="150" y="32" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="7" fontFamily="monospace" letterSpacing="1.5">NOW</text>
      <text x="235" y="32" textAnchor="middle" fill="#0F0D0B" fillOpacity="0.45" fontSize="7" fontFamily="monospace" letterSpacing="1.5">FORMING</text>
      <path d="M65,82 C107,82 107,68 150,68"    stroke="#0E8F66" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M150,68 C193,68 200,88 235,90"    stroke="#0E8F66" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M65,112 C107,112 107,95 150,95"   stroke="#2B49D8" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M150,95 C193,95 200,88 235,90"    stroke="#2B49D8" strokeOpacity="0.8"  strokeWidth="2.5" fill="none" />
      <path d="M150,138 C193,138 200,100 235,90"  stroke="#0F0D0B" strokeOpacity="0.4"  strokeWidth="1.5" fill="none" />
      <path d="M65,162 C107,162 107,168 150,168"  stroke="#C83B50" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
      <path d="M150,168 C193,168 200,155 235,150" stroke="#C83B50" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
      <path d="M65,192 C107,192 107,198 150,198"  stroke="#C77D2E" strokeOpacity="0.3"  strokeWidth="1.5" fill="none" />
      <path d="M150,198 C193,198 200,185 235,180" stroke="#C77D2E" strokeOpacity="0.3"  strokeWidth="1.5" fill="none" />
      <circle cx="65" cy="82"  r="5" fill="#0E8F66" fillOpacity="0.85" />
      <circle cx="65" cy="112" r="5" fill="#2B49D8" fillOpacity="0.85" />
      <circle cx="65" cy="162" r="5" fill="#C83B50" fillOpacity="0.85" />
      <circle cx="65" cy="192" r="5" fill="#C77D2E" fillOpacity="0.85" />
      <circle cx="150" cy="68"  r="4.5" fill="#0E8F66" fillOpacity="0.75" />
      <circle cx="150" cy="95"  r="4.5" fill="#2B49D8" fillOpacity="0.75" />
      <circle cx="150" cy="138" r="5"   fill="#0F0D0B" fillOpacity="0.85" />
      <circle cx="150" cy="168" r="4.5" fill="#C83B50" fillOpacity="0.75" />
      <circle cx="150" cy="198" r="4.5" fill="#C77D2E" fillOpacity="0.75" />
      <circle cx="235" cy="90" r="22" fill="#2B49D8" fillOpacity="0.04" />
      <circle cx="235" cy="90" r="16" fill="#2B49D8" fillOpacity="0.06" />
      <circle cx="235" cy="90" r="13" fill="#2B49D8" fillOpacity="0.15" />
      <circle cx="235" cy="90" r="9"  fill="#2B49D8" fillOpacity="0.9"  />
      <circle cx="228" cy="82"  r="3.5" fill="#0E8F66" fillOpacity="0.7"  />
      <circle cx="235" cy="103" r="3.5" fill="#0F0D0B" fillOpacity="0.65" />
      <circle cx="235" cy="150" r="4.5" fill="#C83B50" fillOpacity="0.6"  />
      <circle cx="235" cy="180" r="4.5" fill="#C77D2E" fillOpacity="0.55" />
    </svg>
  );
}

export default function HomePage() {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = 'var(--bg-primary)';
    return () => {
      document.body.style.background = original;
    };
  }, []);

  // On a fresh load the inline script in layout.tsx has already armed these —
  // it runs at parse time, before React exists. This covers the other way in:
  // a client-side navigation, where no HTML is parsed and that script never
  // re-runs. Re-arming is idempotent (it skips anything already armed).
  useEffect(() => {
    window.__hsReveal?.();
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.userMenuWrapper}>
        <UserMenu />
      </div>

      <main className={styles.container}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>
            Experiments in collective intelligence
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.word1}>Holo</span>
            <span className={styles.word2}>scopic</span>
          </h1>
          <p className={styles.heroSub}>
            Games for seeing and learning as a collective.
          </p>
          <div className={styles.heroCtaRow}>
            <a
              href="#game"
              className={`${styles.heroCta} ${styles.heroCtaPrimary}`}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('game');
              }}
            >
              Join a game
            </a>
            <a
              href="#idea"
              className={styles.heroCta}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('idea');
              }}
            >
              What is this?
            </a>
          </div>
        </section>

        <div className={styles.divider} />

        {/* ── The Idea ─────────────────────────────────────────────────────── */}
        <RevealSection id="idea" className={styles.section}>
          <p className={styles.sectionLabel}>The Idea</p>
          <h2 className={styles.sectionHeadline}>
            Culture is technology.
            <br />
            We just haven&apos;t learned
            <br />
            to build it <em>intentionally.</em>
          </h2>
          <p className={styles.sectionBody}>
            Every society runs on shared processes — ways of talking, deciding,
            resolving conflict, generating meaning. Some are centuries old. Some
            were designed last year by a team optimizing for engagement. Most
            were never designed at all.
            <br />
            <br />
            Holoscopic asks: what happens if we start designing them
            consciously, together?
          </p>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── Kinda Like ───────────────────────────────────────────────────── */}
        <RevealSection id="kindaLike" className={styles.section}>
          <p className={styles.sectionLabel}>It&apos;s a bit like&hellip;</p>
          <ul className={styles.kindaLikeList}>
            <li className={styles.kindaLikeItem}>
              <span className={styles.kindaLikeTitle}>
                Sharing circle meets Reddit thread —
              </span>
              <span className={styles.kindaLikeSub}>
                but instead of upvotes, you place your response on a map of shared meaning.
              </span>
            </li>
            <li className={styles.kindaLikeItem}>
              <span className={styles.kindaLikeTitle}>
                A culture design workshop —
              </span>
              <span className={styles.kindaLikeSub}>
                where the conversation itself is the material being shaped.
              </span>
            </li>
            <li className={styles.kindaLikeItem}>
              <span className={styles.kindaLikeTitle}>
                A social media lab —
              </span>
              <span className={styles.kindaLikeSub}>
                where players can change the rules and watch what happens.
              </span>
            </li>
          </ul>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Practice ─────────────────────────────────────────────────── */}
        <RevealSection id="practice" className={styles.section}>
          <p className={styles.sectionLabel}>The Practice</p>
          <h2 className={styles.sectionHeadline}>
            <em>Conversations </em> that&hellip;
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem title="Show us wholes">
              <div className={styles.visualPanel}>
                <MappingVisual />
              </div>
              Most of what shapes us is invisible — the assumptions inside our
              agreements, the values embedded in our systems. Mapping collective
              perception makes the implicit explicit, so we can finally see the
              full terrain we&apos;re navigating together.
              <p style={{ marginTop: '1em' }}>
                More:{' '}
                <Link href="/essays/maps-transform-the-world" style={{ textDecoration: 'none' }}>
                  How Maps Transform The World
                </Link>
              </p>
            </ExpandItem>

            <ExpandItem title="Make change visible">
              <div className={styles.visualPanel}>
                <SequenceVisual />
              </div>
              Change doesn&apos;t announce itself. But when you can watch a
              group&apos;s ideas shift in real time — converging, diverging, finding
              unexpected common ground — you start to see how transformation
              actually moves through a culture.
            </ExpandItem>

            <ExpandItem title="Leave a trail">
              Every insight that transforms a group is a path someone else could
              walk. We document what works, make it repeatable, and share it
              openly — so good social technology compounds the way scientific
              discovery does. The next group starts where you left off.
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── Join a Game — newest first, the origin last. Each card wears
               its game's own palette and a quiet gradient motif. ─────────── */}
        <RevealSection id="game" className={styles.invitation}>
          <p className={styles.sectionLabel}>Join a Game</p>
          <div className={styles.gameCardStack}>
            {/* The one card with a single-colour wordmark. The others split on
                something the split means — syn-/-thesis, the two OaS axes.
                "Cho|rus" has no such seam, so a two-tone treatment here would
                be decoration pretending to be structure. */}
            <Link href="/chorus" className={`${styles.gameCard} ${styles.gameCardCh}`}>
              <ChorusArt />
              <span className={styles.gameCardTitle}>Chorus</span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubCh}`}>
                connecting stories and voices
              </span>
              <span className={styles.gameCardMeta}>
                anyone with the link &middot; always open
              </span>
            </Link>
            <Link href="/synthesis" className={`${styles.gameCard} ${styles.gameCardSyn}`}>
              <ConvergeArt />
              <span className={styles.gameCardTitle}>
                <span className={styles.synPrefix}>Syn</span><span className={styles.synAccent}>thesis</span>
              </span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubSyn}`}>
                a game for generating collective thought
              </span>
              <span className={styles.gameCardMeta}>
                2&ndash;50 collaborators &middot; open-ended
              </span>
            </Link>
            <a href="https://spectrum.holoscopic.io" className={`${styles.gameCard} ${styles.gameCardOas}`}>
              <SpectrumBarsArt />
              <span className={styles.gameCardTitle}>
                On&nbsp;a&nbsp;<span className={styles.oasAx}>Spec</span><span className={styles.oasAy}>trum</span>
              </span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubOas}`}>
                a game for revealing nuance
              </span>
              <span className={styles.gameCardMeta}>
                2&ndash;10 players &middot; 20 min&ndash;4 days
              </span>
            </a>
            <Link href="/interview" className={`${styles.gameCard} ${styles.gameCardIv}`}>
              <SequenceChainArt />
              <span className={styles.gameCardTitle}>
                inter<span className={styles.gameCardAccent}>View</span>
              </span>
              <span className={styles.gameCardSub}>
                a game for designing conversations that learn
              </span>
            </Link>
            <Link href="/map-sequence" className={`${styles.gameCard} ${styles.gameCardMs}`}>
              <QuadrantArt />
              <span className={styles.gameCardTitle}>
                Map&nbsp;+&nbsp;<span className={styles.msAccent}>Sequence</span>
              </span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubMs}`}>
                the original holoscopic mapping tools
              </span>
            </Link>
          </div>
        </RevealSection>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span className={styles.footerText}>
              Made by{' '}
              <Link href="/essays/a-personal-story" className={styles.footerLink}>
                Mo
              </Link>
              &nbsp;&middot;&nbsp;{' '}
              <a
                href="https://github.com/markothell/holoscopic-app"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.footerLink}
              >
                Open source
              </a>
              &nbsp;&middot;&nbsp;{' '}
              <a
                href="https://markothell.substack.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.footerLink}
              >
                Seeing Wholes
              </a>
            </span>
            <Link
              href="/manifesto"
              className={`${styles.footerText} ${styles.footerLink}`}
            >
              Read the manifesto &rarr;
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}