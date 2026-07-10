'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import styles from './page.module.css';

function RevealSection({
  id,
  className,
  children,
}: {
  id?: string;
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id={id}
      className={`${className} ${visible ? styles.visible : ''}`}
    >
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

// interView: the 2×2 map with a scatter of perspectives.
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
        <linearGradient id="ivDots" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C83B50" />
          <stop offset="100%" stopColor="#7A2231" />
        </linearGradient>
      </defs>
      <line x1="115" y1="8" x2="115" y2="202" stroke="#C83B50" strokeOpacity="0.28" strokeWidth="1.5" />
      <line x1="12" y1="105" x2="218" y2="105" stroke="#C83B50" strokeOpacity="0.28" strokeWidth="1.5" />
      {dots.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="url(#ivDots)" opacity={0.26 + (r - 4) * 0.09} />
      ))}
    </svg>
  );
}

// Map + Sequence: maps chained into rounds.
function SequenceChainArt() {
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 320 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      <defs>
        <linearGradient id="msChain" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0E8F66" />
          <stop offset="100%" stopColor="#3D6FA3" />
        </linearGradient>
      </defs>
      <path d="M60,62 C110,62 110,105 160,105" stroke="url(#msChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M60,160 C110,160 110,105 160,105" stroke="url(#msChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M160,105 C215,105 215,70 268,70" stroke="url(#msChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M160,105 C215,105 215,148 268,148" stroke="url(#msChain)" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      {[[60, 62, 26], [60, 160, 26], [160, 105, 32], [268, 70, 24], [268, 148, 24]].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill="#FCFAF6" fillOpacity="0.6" stroke="url(#msChain)" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx={x} cy={y} r={3} fill="url(#msChain)" opacity="0.5" />
        </g>
      ))}
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
      <rect width="300" height="300" rx="16" fill="#1A1F2E" />
      <line x1="150" y1="20" x2="150" y2="280" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="20" y1="150" x2="280" y2="150" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="85" y1="20" x2="85" y2="280" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="215" y1="20" x2="215" y2="280" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="20" y1="85" x2="280" y2="85" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="20" y1="215" x2="280" y2="215" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <text x="150" y="15" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5">INDIVIDUAL</text>
      <text x="150" y="296" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5">COLLECTIVE</text>
      <text x="14" y="154" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(-90 14 150)">SHORT</text>
      <text x="290" y="150" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(90 288 148)">LONG</text>
      <circle cx="60" cy="55" r="4" fill="#3DD68C" fillOpacity="0.55" />
      <circle cx="95" cy="72" r="3.5" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="75" cy="102" r="4" fill="#3DD68C" fillOpacity="0.62" />
      <circle cx="112" cy="85" r="3" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="120" cy="50" r="3.5" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="55" cy="122" r="3" fill="#3DD68C" fillOpacity="0.48" />
      <circle cx="135" cy="110" r="3.5" fill="#3DD68C" fillOpacity="0.55" />
      <circle cx="118" cy="128" r="14" fill="#3DD68C" fillOpacity="0.08" />
      <circle cx="118" cy="128" r="10" fill="#3DD68C" fillOpacity="0.9" />
      <circle cx="240" cy="46" r="4.5" fill="#60A5FA" fillOpacity="0.65" />
      <circle cx="222" cy="80" r="4.5" fill="#60A5FA" fillOpacity="0.65" />
      <circle cx="265" cy="92" r="5" fill="#60A5FA" fillOpacity="0.7" />
      <circle cx="202" cy="55" r="3.5" fill="#60A5FA" fillOpacity="0.55" />
      <circle cx="252" cy="122" r="3" fill="#60A5FA" fillOpacity="0.48" />
      <circle cx="185" cy="100" r="4" fill="#60A5FA" fillOpacity="0.5" />
      <circle cx="175" cy="60" r="3.5" fill="#60A5FA" fillOpacity="0.45" />
      <circle cx="95" cy="202" r="5" fill="#F87171" fillOpacity="0.65" />
      <circle cx="76" cy="262" r="4" fill="#F87171" fillOpacity="0.6" />
      <circle cx="122" cy="242" r="3.5" fill="#F87171" fillOpacity="0.55" />
      <circle cx="112" cy="212" r="3" fill="#F87171" fillOpacity="0.48" />
      <circle cx="58" cy="232" r="4" fill="#F87171" fillOpacity="0.55" />
      <circle cx="136" cy="270" r="3" fill="#F87171" fillOpacity="0.38" />
      <circle cx="55" cy="195" r="18" fill="#F87171" fillOpacity="0.07" />
      <circle cx="55" cy="195" r="12" fill="#F87171" fillOpacity="0.9" />
      <circle cx="212" cy="226" r="5" fill="#FB923C" fillOpacity="0.7" />
      <circle cx="237" cy="202" r="4" fill="#FB923C" fillOpacity="0.62" />
      <circle cx="272" cy="218" r="3.5" fill="#FB923C" fillOpacity="0.65" />
      <circle cx="196" cy="252" r="4" fill="#FB923C" fillOpacity="0.55" />
      <circle cx="217" cy="275" r="3" fill="#FB923C" fillOpacity="0.5" />
      <circle cx="262" cy="242" r="4" fill="#FB923C" fillOpacity="0.45" />
      <circle cx="185" cy="212" r="3" fill="#FB923C" fillOpacity="0.4" />
      <circle cx="252" cy="258" r="5" fill="#FB923C" fillOpacity="0.65" />
      <circle cx="150" cy="150" r="2" fill="#ffffff" fillOpacity="0.2" />
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
      <rect width="300" height="260" rx="16" fill="#1A1F2E" />
      <defs>
        <radialGradient id="gravityGlow" cx="78%" cy="38%" r="28%">
          <stop offset="0%"   stopColor="#60A5FA" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="260" rx="16" fill="url(#gravityGlow)" />
      <line x1="65"  y1="42" x2="65"  y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="150" y1="42" x2="150" y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="235" y1="42" x2="235" y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />
      <text x="65"  y="32" textAnchor="middle" fill="white" fillOpacity="0.2" fontSize="7" fontFamily="monospace" letterSpacing="1.5">THEN</text>
      <text x="150" y="32" textAnchor="middle" fill="white" fillOpacity="0.2" fontSize="7" fontFamily="monospace" letterSpacing="1.5">NOW</text>
      <text x="235" y="32" textAnchor="middle" fill="white" fillOpacity="0.2" fontSize="7" fontFamily="monospace" letterSpacing="1.5">FORMING</text>
      <path d="M65,82 C107,82 107,68 150,68"    stroke="#3DD68C" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M150,68 C193,68 200,88 235,90"    stroke="#3DD68C" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M65,112 C107,112 107,95 150,95"   stroke="#60A5FA" strokeOpacity="0.45" strokeWidth="1.5" fill="none" />
      <path d="M150,95 C193,95 200,88 235,90"    stroke="#60A5FA" strokeOpacity="0.8"  strokeWidth="2.5" fill="none" />
      <path d="M150,138 C193,138 200,100 235,90"  stroke="#A78BFA" strokeOpacity="0.4"  strokeWidth="1.5" fill="none" />
      <path d="M65,162 C107,162 107,168 150,168"  stroke="#F87171" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
      <path d="M150,168 C193,168 200,155 235,150" stroke="#F87171" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
      <path d="M65,192 C107,192 107,198 150,198"  stroke="#FB923C" strokeOpacity="0.3"  strokeWidth="1.5" fill="none" />
      <path d="M150,198 C193,198 200,185 235,180" stroke="#FB923C" strokeOpacity="0.3"  strokeWidth="1.5" fill="none" />
      <circle cx="65" cy="82"  r="5" fill="#3DD68C" fillOpacity="0.85" />
      <circle cx="65" cy="112" r="5" fill="#60A5FA" fillOpacity="0.85" />
      <circle cx="65" cy="162" r="5" fill="#F87171" fillOpacity="0.85" />
      <circle cx="65" cy="192" r="5" fill="#FB923C" fillOpacity="0.85" />
      <circle cx="150" cy="68"  r="4.5" fill="#3DD68C" fillOpacity="0.75" />
      <circle cx="150" cy="95"  r="4.5" fill="#60A5FA" fillOpacity="0.75" />
      <circle cx="150" cy="138" r="5"   fill="#A78BFA" fillOpacity="0.85" />
      <circle cx="150" cy="168" r="4.5" fill="#F87171" fillOpacity="0.75" />
      <circle cx="150" cy="198" r="4.5" fill="#FB923C" fillOpacity="0.75" />
      <circle cx="235" cy="90" r="22" fill="#60A5FA" fillOpacity="0.04" />
      <circle cx="235" cy="90" r="16" fill="#60A5FA" fillOpacity="0.06" />
      <circle cx="235" cy="90" r="13" fill="#60A5FA" fillOpacity="0.15" />
      <circle cx="235" cy="90" r="9"  fill="#60A5FA" fillOpacity="0.9"  />
      <circle cx="228" cy="82"  r="3.5" fill="#3DD68C" fillOpacity="0.7"  />
      <circle cx="235" cy="103" r="3.5" fill="#A78BFA" fillOpacity="0.65" />
      <circle cx="235" cy="150" r="4.5" fill="#F87171" fillOpacity="0.6"  />
      <circle cx="235" cy="180" r="4.5" fill="#FB923C" fillOpacity="0.55" />
    </svg>
  );
}

export default function HomePage() {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => {
      document.body.style.background = original;
    };
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
            Games for understanding how we work, <em>together.</em>
          </p>
          <div className={styles.heroCtaRow}>
            <a
              href="#idea"
              className={styles.heroCta}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('idea');
              }}
            >
              What is this
            </a>
            <a
              href="#game"
              className={styles.heroCta}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('game');
              }}
            >
              Join a Game
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
            This project asks: what happens if we start designing them
            consciously, together?
          </p>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── Kinda Like ───────────────────────────────────────────────────── */}
        <RevealSection id="kindaLike" className={styles.section}>
          <p className={styles.sectionLabel}>Kinda Like&hellip;</p>
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
                where users can change the rules and watch what happens.
              </span>
            </li>
          </ul>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Practice ─────────────────────────────────────────────────── */}
        <RevealSection id="practice" className={styles.section}>
          <p className={styles.sectionLabel}>The Practice</p>
          <h2 className={styles.sectionHeadline}>
            <em>Conversations</em> that&hellip;
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem title="Allow us to See Wholes">
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

            <ExpandItem title="Visualize Emergence">
              <div className={styles.visualPanel}>
                <SequenceVisual />
              </div>
              Change doesn&apos;t announce itself. But when you can watch a
              group&apos;s ideas shift in real time — converging, diverging, finding
              unexpected common ground — you start to see how transformation
              actually moves through a culture.
            </ExpandItem>

            <ExpandItem title="Leave a Trail">
              Every insight that transforms a group is a path someone else could
              walk. We document what works, make it repeatable, and share it
              openly — so good social technology compounds the way scientific
              discovery does.
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── Join a Game — newest first, the origin last. Each card wears
               its game's own palette and a quiet gradient motif. ─────────── */}
        <RevealSection id="game" className={styles.invitation}>
          <p className={styles.sectionLabel}>Join a Game</p>
          <div className={styles.gameCardStack}>
            <a href="https://spectrum.holoscopic.io" className={`${styles.gameCard} ${styles.gameCardOas}`}>
              <SpectrumBarsArt />
              <span className={styles.gameCardTitle}>
                On&nbsp;a&nbsp;<span className={styles.oasAx}>Spec</span><span className={styles.oasAy}>trum</span>
              </span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubOas}`}>
                a game for organizing collective minds
              </span>
            </a>
            <Link href="/interview" className={`${styles.gameCard} ${styles.gameCardIv}`}>
              <QuadrantArt />
              <span className={styles.gameCardTitle}>
                inter<span className={styles.gameCardAccent}>View</span>
              </span>
              <span className={styles.gameCardSub}>
                collaborative.conversation.design.game
              </span>
            </Link>
            <Link href="/map-sequence" className={`${styles.gameCard} ${styles.gameCardMs}`}>
              <SequenceChainArt />
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
              &nbsp;&middot;&nbsp; Evolving
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