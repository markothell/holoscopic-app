'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import SiteFooter from '@/components/SiteFooter';
import EmailCapture from '@/components/EmailCapture';
import GatheringArt from '@/components/GatheringArt';
import { THRESHOLD_URL } from '@/lib/games';
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

/* ── Game-card motifs — one quiet gradient mark per game ────────────────── */

// Threshold: the balance beam — a three-section bar on a fulcrum, stories as
// dots in each. The ends wear the app's own pole colours (teal / rust, chosen
// there for equal weight so neither looks like the verdict); the middle
// section is the threshold itself, in the app's neutral grey. The beam tilts
// a few degrees — a scale mid-reading — while the fulcrum stays level.
function ThresholdBeamArt() {
  const dotY = 79;
  return (
    <svg
      className={styles.gameCardArt}
      viewBox="0 0 360 210"
      aria-hidden
      preserveAspectRatio="xMaxYMid meet"
    >
      {/* The figure keeps to the upper right so the card's type — which runs
          long on this card — never crosses the beam. */}
      <g transform="rotate(-4 222 96)" opacity="0.75">
        {/* pole A — teal */}
        <rect x="105" y="64" width="74" height="30" rx="8" fill="#DCE8E7" stroke="#2F7D7B" strokeOpacity="0.45" strokeWidth="1.5" />
        {[120, 140, 160].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#2F7D7B" opacity="0.7" />
        ))}
        {/* the threshold — neutral, the split stories */}
        <rect x="184" y="64" width="76" height="30" rx="8" fill="#E6E4E0" stroke="#7C7A76" strokeOpacity="0.4" strokeWidth="1.5" />
        {[198, 222, 246].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#7C7A76" opacity="0.65" />
        ))}
        {/* pole B — rust */}
        <rect x="265" y="64" width="74" height="30" rx="8" fill="#F0DFD7" stroke="#B15C3C" strokeOpacity="0.45" strokeWidth="1.5" />
        {[280, 300, 320].map(x => (
          <circle key={x} cx={x} cy={dotY} r="4" fill="#B15C3C" opacity="0.7" />
        ))}
      </g>
      {/* the fulcrum stays level while the beam tilts */}
      <path d="M222,98 L202,140 L242,140 Z" fill="none" stroke="#7C7A76" strokeOpacity="0.5" strokeWidth="1.5" />
    </svg>
  );
}

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

// The three overlapping things Holoscopic is at once. Each lobe wears one of
// the site's accents; the centre stays ink, because the overlap is the subject
// and a fourth colour there would read as a fourth thing.
function VennVisual() {
  const R = 110;
  const lobes: { cx: number; cy: number; color: string; label: string[]; lx: number; ly: number }[] = [
    { cx: 210, cy: 114, color: '#C83B50', label: ['WORKSHOP'], lx: 210, ly: 62 },
    { cx: 153, cy: 213, color: '#2B49D8', label: ['SOCIAL', 'MEDIA'], lx: 100, ly: 256 },
    { cx: 267, cy: 213, color: '#0E8F66', label: ['OPEN', 'SOURCE'], lx: 320, ly: 256 },
  ];
  return (
    <svg
      viewBox="0 0 420 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={styles.vennSvg}
      role="img"
      aria-label="Three overlapping circles — workshop, social media, open source — with Holoscopic at the overlap"
    >
      {lobes.map(l => (
        <circle
          key={l.label.join('')}
          cx={l.cx}
          cy={l.cy}
          r={R}
          fill={l.color}
          fillOpacity="0.07"
          stroke={l.color}
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
      ))}
      {lobes.map(l =>
        l.label.map((line, i) => (
          <text
            key={l.label.join('') + i}
            x={l.lx}
            y={l.ly + i * 17}
            textAnchor="middle"
            fill={l.color}
            fontSize="12"
            fontFamily="monospace"
            letterSpacing="1.4"
          >
            {line}
          </text>
        )),
      )}
      <text
        x="210"
        y="187"
        textAnchor="middle"
        fill="#0F0D0B"
        fillOpacity="0.72"
        fontSize="12"
        fontFamily="monospace"
        letterSpacing="1"
      >
        HOLOSCOPIC
      </text>
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
              href="#invitation"
              className={`${styles.heroCta} ${styles.heroCtaPrimary}`}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('invitation');
              }}
            >
              Take a seat
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

        {/* ── The Shape — three familiar things, and Holoscopic at the
               overlap. The Venn is the argument; the three rows underneath
               say what each lobe means here. ─────────────────────────────── */}
        <RevealSection id="shape" className={styles.section}>
          <p className={styles.sectionLabel}>The Shape</p>
          <h2 className={styles.sectionHeadline}>
            Three things
            <br />
            at <em>once.</em>
          </h2>
          <p className={styles.sectionBody}>
            Holoscopic sits where three familiar things overlap.
          </p>
          <div className={styles.vennPanel}>
            <VennVisual />
          </div>
          <dl className={styles.defList}>
            <div className={styles.defRow}>
              <dt className={styles.defTerm}>Personal development workshop</dt>
              <dd className={styles.defDesc}>
                A transformative social process, the way Nonviolent
                Communication and Imago dialogue are: structured practice that
                changes how a group talks to itself.
              </dd>
            </div>
            <div className={styles.defRow}>
              <dt className={styles.defTerm}>Social media</dt>
              <dd className={styles.defDesc}>
                The human bazaar, with mechanisms for elevating the ideas that
                work.
              </dd>
            </div>
            <div className={styles.defRow}>
              <dt className={styles.defTerm}>Open source software</dt>
              <dd className={styles.defDesc}>
                A platform where people share, experiment, and iterate on tools
                for social coherence.
              </dd>
            </div>
          </dl>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Model — the pitch. Circles promoted out of the card stack:
               the circle is the social model the experiments feed, so it gets
               the section, the drawing, and the "we are whole" claim. The
               long read stays on /circles. ─────────────────────────────── */}
        <RevealSection id="model" className={styles.section}>
          <p className={styles.sectionLabel}>The Model</p>
          <h2 className={styles.sectionHeadline}>
            We are <em>whole.</em>
          </h2>
          <p className={styles.sectionBody}>
            The circle is a social model with ancient roots: four to twelve
            people, all equal, all facing a common center, gathered to learn
            as one — record stories, map where everyone stands, find the
            group&apos;s thresholds, arrive at shared words. What a circle
            makes, it keeps.
          </p>
          <div className={styles.modelFigure}>
            <GatheringArt className={styles.modelArt} />
          </div>
          <p className={styles.sectionBody}>
            Circles gather too. Members mix across tables the way a World
            Caf&eacute; runs, trade what their home circles learned, and carry
            the exchange back. Circles that gather become a collective —
            itself a circle, and the platform is the outermost one.{' '}
            <Link href="/circles" className={styles.inlineLink}>
              The circle, at length &rarr;
            </Link>
          </p>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Instruments — newest first, the origin demoted to a
               lineage line under the stack. Lean cards:
               title, subtitle, and the elements each one contributed — the
               recurring chips are the mix-and-match argument. The lab notes
               themselves live on each game's lander. (id stays `game` for
               old #game deep links.) ─────────────────────────────────────── */}
        <RevealSection id="game" className={styles.invitation}>
          <p className={styles.sectionLabel}>The Instruments</p>
          <p className={`${styles.sectionBody} ${styles.labIntro}`}>
            Each of these began as a question about how groups learn together,
            and each one taught us something the next was built on. Together
            they are the instruments a circle plays. All of them are open —
            play them, break them, tell us what you find. The first circles
            pick them up together:{' '}
            <a
              href="#invitation"
              className={styles.inlineLink}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('invitation');
              }}
            >
              save a seat below
            </a>
            .
          </p>
          <div className={styles.gameCardStack}>
            {/* Threshold's wordmark has no morpheme seam to split on, so it
                stays one colour like Chorus's. The two poles live in the art,
                where they belong — and the sub-line wears the app's neutral
                threshold grey, the colour of the split itself. */}
            <a href={THRESHOLD_URL} className={`${styles.gameCard} ${styles.gameCardTh}`}>
              <ThresholdBeamArt />
              <span className={styles.gameCardTitle}>Threshold</span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubTh}`}>
                a game for finding the group&apos;s dividing line
              </span>
              <span className={styles.gameCardMeta}>
                voice stories &middot; polarity sorting &middot; rounds by mail &middot; circle membership
              </span>
            </a>
            {/* The one card with a single-colour wordmark by precedent. The
                others split on something the split means — syn-/-thesis, the
                two OaS axes. "Cho|rus" has no such seam, so a two-tone
                treatment here would be decoration pretending to be
                structure. */}
            <Link href="/chorus" className={`${styles.gameCard} ${styles.gameCardCh}`}>
              <ChorusArt />
              <span className={styles.gameCardTitle}>Chorus</span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubCh}`}>
                connecting stories and voices
              </span>
              <span className={styles.gameCardMeta}>
                voice stories &middot; shared vocabulary &middot; one open link
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
                private&rarr;shared maps &middot; borrowed thoughts &middot; LLM synthesis &middot; token voting
              </span>
            </Link>
            {/* Routes to the on-site lander (which hands off to the spectrum
                subdomain), the same pattern as Chorus and Synthesis. */}
            <Link href="/spectrum" className={`${styles.gameCard} ${styles.gameCardOas}`}>
              <SpectrumBarsArt />
              <span className={styles.gameCardTitle}>
                On&nbsp;a&nbsp;<span className={styles.oasAx}>Spec</span><span className={styles.oasAy}>trum</span>
              </span>
              <span className={`${styles.gameCardSub} ${styles.gameCardSubOas}`}>
                a game for revealing nuance
              </span>
              <span className={styles.gameCardMeta}>
                spectrum ranking &middot; timed rounds &middot; stakes &middot; rule revision
              </span>
            </Link>
            <Link href="/interview" className={`${styles.gameCard} ${styles.gameCardIv}`}>
              <SequenceChainArt />
              <span className={styles.gameCardTitle}>
                inter<span className={styles.gameCardAccent}>View</span>
              </span>
              <span className={styles.gameCardSub}>
                a game for designing conversations that learn
              </span>
              <span className={styles.gameCardMeta}>
                2D map &middot; sequences &middot; tokens &middot; quorum
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
              <span className={styles.gameCardMeta}>
                2D map &middot; comments &middot; votes &middot; sequenced rounds
              </span>
            </Link>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Invitation — the one ask on the page. The gathering is
               sized to the crowd: circles form as seats fill, each runs a
               cycle, then the circles meet — the event is the recursion
               demonstrated. (`platform` span keeps old #platform links.) ── */}
        <RevealSection id="invitation" className={styles.section}>
          <span id="platform" />
          <p className={styles.sectionLabel}>The Invitation</p>
          <h2 className={styles.sectionHeadline}>
            Be in the first <em>circles.</em>
          </h2>
          <p className={styles.sectionBody}>
            We&apos;re convening the first gathering now, sized to fit the
            crowd: circles of four to twelve form as seats fill. Each circle
            runs one cycle together over a few weeks, on its own time —
            stories, sorting, maps, shared words. Then the circles gather,
            World Caf&eacute; style, and we all find out what the collective
            can see.
          </p>

          <div className={styles.joinBlock}>
            <h3 className={styles.joinHeading}>Save a seat</h3>
            <p className={styles.joinBody}>
              Leave your address. When the seats around you fill, your circle
              forms and the first round begins — email carries you through the
              rest.
            </p>
            <EmailCapture
              cta="Save me a seat"
              sentNote="Seat saved. We'll write when your circle forms."
              source="first-gathering"
            />
          </div>
        </RevealSection>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <SiteFooter />
    </div>
  );
}
