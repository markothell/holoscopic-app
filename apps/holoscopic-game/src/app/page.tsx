'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import SiteFooter from '@/components/SiteFooter';
import EmailCapture from '@/components/EmailCapture';
import GameCardStack from '@/components/GameCards';
import { CIRCLES_URL } from '@/lib/games';
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

/* ── The Practice panels ─────────────────────────────────────────────────
   The figures and the dot palette come from the 06/07 homepages
   (`MappingVisual`, `SequenceVisual`), which drew them on a #1A1F2E panel.
   That panel was right on that site and wrong on this one: three navy blocks
   on a cream page read as three holes punched in it. Same colour family,
   moved to a light warm ground — which means the hues have to change too,
   because #3DD68C and #60A5FA are tuned to glow on near-black and go chalky
   on #F7F4EF. These are the same five hues at the weight the rest of this
   site uses (compare the Map + Sequence card's #0E8F66 / #3D6FA3).

   The middle panel is not the old figure. `SequenceVisual` ran five separate
   threads left to right; this one starts on ONE question, breaks it into
   tangents, runs each through its own course, and brings them back — the
   Synthesis dynamic, which is what the step actually names. */

const PANEL = '#F0EBE1';
const PANEL_EDGE = 'rgba(15, 13, 11, 0.09)';
const RULE_MAJOR = 'rgba(15, 13, 11, 0.13)';
const RULE_MINOR = 'rgba(15, 13, 11, 0.06)';
const LABEL_INK = 'rgba(15, 13, 11, 0.34)';

const GREEN = '#2F8F63';
const BLUE = '#3D6FA3';
const CORAL = '#BE5A55';
const ORANGE = '#BE7C36';
const VIOLET = '#6F5FA0';

const axisLabel = {
  fill: LABEL_INK,
  fontSize: 12,
  fontFamily: 'monospace',
  letterSpacing: 1.5,
} as const;

// See the whole: the 2D map with a grouping in each quadrant, and a haloed
// disc where two of them have a centre of gravity — the thing nobody standing
// inside a grouping can see. Straight from the 06 homepage's `MappingVisual`,
// recoloured for a light ground.
function QuadrantMapArt() {
  const clusters: [string, [number, number, number, number][]][] = [
    [GREEN, [
      [60, 55, 4, 0.62], [95, 72, 3.5, 0.55], [75, 102, 4, 0.7], [112, 85, 3, 0.55],
      [120, 50, 3.5, 0.55], [55, 122, 3, 0.5], [135, 110, 3.5, 0.6],
    ]],
    [BLUE, [
      [240, 46, 4.5, 0.7], [222, 80, 4.5, 0.7], [265, 92, 5, 0.72], [202, 55, 3.5, 0.6],
      [252, 122, 3, 0.52], [185, 100, 4, 0.55], [175, 60, 3.5, 0.5],
    ]],
    [CORAL, [
      [95, 202, 5, 0.68], [76, 262, 4, 0.62], [122, 242, 3.5, 0.58], [112, 212, 3, 0.52],
      [58, 232, 4, 0.58], [136, 270, 3, 0.42],
    ]],
    [ORANGE, [
      [212, 226, 5, 0.72], [237, 202, 4, 0.65], [272, 218, 3.5, 0.68], [196, 252, 4, 0.58],
      [217, 275, 3, 0.52], [262, 242, 4, 0.5], [185, 212, 3, 0.45], [252, 258, 5, 0.68],
    ]],
  ];
  return (
    <svg className={styles.practiceArt} viewBox="0 0 300 300" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="299" height="299" rx="16" fill={PANEL} stroke={PANEL_EDGE} />
      <line x1="150" y1="20" x2="150" y2="280" stroke={RULE_MAJOR} strokeWidth="1" />
      <line x1="20" y1="150" x2="280" y2="150" stroke={RULE_MAJOR} strokeWidth="1" />
      {[85, 215].map(v => (
        <g key={v}>
          <line x1={v} y1="20" x2={v} y2="280" stroke={RULE_MINOR} strokeWidth="0.5" />
          <line x1="20" y1={v} x2="280" y2={v} stroke={RULE_MINOR} strokeWidth="0.5" />
        </g>
      ))}
      <text x="150" y="17" textAnchor="middle" {...axisLabel}>INDIVIDUAL</text>
      <text x="150" y="294" textAnchor="middle" {...axisLabel}>COLLECTIVE</text>
      <text x="16" y="154" textAnchor="middle" {...axisLabel} transform="rotate(-90 16 150)">SHORT</text>
      <text x="286" y="150" textAnchor="middle" {...axisLabel} transform="rotate(90 286 148)">LONG</text>
      {clusters.map(([color, dots]) =>
        dots.map(([x, y, r, o], i) => (
          <circle key={`${color}${i}`} cx={x} cy={y} r={r} fill={color} fillOpacity={o} />
        )),
      )}
      {/* two of the four have gathered into something the group can name */}
      <circle cx="118" cy="128" r="15" fill={GREEN} fillOpacity="0.12" />
      <circle cx="118" cy="128" r="10" fill={GREEN} fillOpacity="0.85" />
      <circle cx="55" cy="195" r="19" fill={CORAL} fillOpacity="0.11" />
      <circle cx="55" cy="195" r="12" fill={CORAL} fillOpacity="0.85" />
      <circle cx="150" cy="150" r="2" fill={LABEL_INK} />
    </svg>
  );
}

// Take many paths: the Synthesis dynamic, as a graph rather than as lanes.
// One question, three paths of unequal length, and two places where a path
// does not simply run its own lane:
//
//   · path 1 (green) throws an edge off its second stop that comes down and
//     converges into path 2's last stop;
//   · path 3 (orange) does not leave the question at all — it breaks away
//     from path 2's FIRST stop.
//
// No labels and no guides. Unequal lengths mean the stops never sit in
// columns, so a dashed grid would promise an alignment the paths do not keep,
// and the two nodes that would carry a caption — the question and what the
// group arrives at — already say what they are by weight and position.
function ManyPathsArt() {
  const Q: [number, number] = [40, 140];
  const END: [number, number] = [258, 140];
  const P1: [number, number][] = [[98, 94], [156, 72], [214, 90]];
  const P2: [number, number][] = [[110, 140], [190, 138]];
  const P3: [number, number][] = [[128, 192], [200, 194]];

  // A link between two stops: horizontal control points, so a path leaves and
  // arrives level and the crossings stay legible.
  const link = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const chain = (from: [number, number], stops: [number, number][]) => {
    const all = [from, ...stops, END];
    return all.slice(0, -1).map((a, i) => link(a, all[i + 1]));
  };

  return (
    <svg className={styles.practiceArt} viewBox="0 0 300 260" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="299" height="259" rx="16" fill={PANEL} stroke={PANEL_EDGE} />

      {chain(Q, P1).map(d => <path key={d} d={d} stroke={GREEN} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />)}
      {chain(Q, P2).map(d => <path key={d} d={d} stroke={BLUE} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />)}
      {/* path 3 leaves from path 2's first stop, not from the question */}
      {chain(P2[0], P3).map(d => <path key={d} d={d} stroke={ORANGE} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />)}
      {/* path 1's tangent, breaking off and converging into path 2 */}
      <path d={link(P1[1], P2[1])} stroke={GREEN} strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />

      {P1.map(([x, y]) => <circle key={`a${x}`} cx={x} cy={y} r="4.5" fill={GREEN} fillOpacity="0.85" />)}
      {P2.map(([x, y]) => <circle key={`b${x}`} cx={x} cy={y} r="4.5" fill={BLUE} fillOpacity="0.85" />)}
      {P3.map(([x, y]) => <circle key={`c${x}`} cx={x} cy={y} r="4.5" fill={ORANGE} fillOpacity="0.85" />)}

      <circle cx={Q[0]} cy={Q[1]} r="13" fill={LABEL_INK} fillOpacity="0.14" />
      <circle cx={Q[0]} cy={Q[1]} r="7" fill="#0F0D0B" fillOpacity="0.6" />
      <circle cx={END[0]} cy={END[1]} r="21" fill={BLUE} fillOpacity="0.07" />
      <circle cx={END[0]} cy={END[1]} r="15" fill={BLUE} fillOpacity="0.12" />
      <circle cx={END[0]} cy={END[1]} r="10" fill={BLUE} fillOpacity="0.85" />
    </svg>
  );
}

// Run it again: one constellation, three groups. The shape is literally the
// same element drawn three times — a copy, which is the claim — and the
// rotation is the remix. Equal weight throughout: fading the third would say
// a form thins as it spreads, which is the opposite of the point.
function RunAgainArt() {
  // Five points on a ring of 26, written out rather than computed: server and
  // browser libm disagree in the last bits of sin/cos, and that difference
  // serializes into a hydration mismatch.
  const shape: [number, number][] = [
    [0, -26], [24.73, -8.03], [15.29, 21.03], [-15.29, 21.03], [-24.73, -8.03],
  ];
  const path = shape.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') + ' Z';
  const groups = [
    { x: 65, color: GREEN, rot: 0, label: 'INVENTED' },
    { x: 150, color: BLUE, rot: 22, label: 'ADOPTED' },
    { x: 235, color: ORANGE, rot: -16, label: 'REMIXED' },
  ];
  return (
    <svg className={styles.practiceArt} viewBox="0 0 300 260" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="299" height="259" rx="16" fill={PANEL} stroke={PANEL_EDGE} />
      {groups.map(g => (
        <text key={g.label} x={g.x} y="34" textAnchor="middle" {...axisLabel} fontSize={11}>
          {g.label}
        </text>
      ))}
      {[[100, 115], [185, 200]].map(([x1, x2]) => (
        <g key={x1}>
          <line x1={x1} y1="140" x2={x2} y2="140" stroke={RULE_MAJOR} strokeWidth="1" strokeDasharray="3 4" />
          <path d={`M${x2 - 5},135 L${x2},140 L${x2 - 5},145`} fill="none" stroke={RULE_MAJOR} strokeWidth="1" />
        </g>
      ))}
      {groups.map(g => (
        <g key={g.x} transform={`translate(${g.x},140) rotate(${g.rot})`}>
          <path d={path} fill={g.color} fillOpacity="0.07" stroke={g.color} strokeOpacity="0.4" strokeWidth="1.2" />
          {shape.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 0 ? 5 : 4} fill={g.color} fillOpacity={i === 0 ? 0.85 : 0.65} />
          ))}
        </g>
      ))}
    </svg>
  );
}

// The method, in three moves. Named for what the group does, not for what
// the software does — the products are the section after this one.
const PRACTICE: { art: React.ReactNode; title: string; desc: string }[] = [
  {
    art: <QuadrantMapArt />,
    title: 'See the whole',
    desc: "A group's own picture of itself, drawn from what everyone actually said.",
  },
  {
    art: <ManyPathsArt />,
    title: 'Take many paths',
    desc: 'A question breaks into tangents. Each one runs its own course, and the group brings them back to something it can hold together.',
  },
  {
    art: <RunAgainArt />,
    title: 'Run it again',
    desc: 'Remix and spread across groups: a form one group invents can be run by a group that never met them.',
  },
];

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
            Tools for seeing and learning as a collective.
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

        {/* ── The Practice — the middle the page lost when the circle content
               moved to its own lander. Three beats naming the method rather
               than the products: a group sees itself, a form travels, and
               what one group learns is where the next one starts. The old
               pre-circle homepage carried this register (`kindaLike`, "Leave
               a trail"); these are its successor. Label only, no headline —
               the beats are display type themselves. ─────────────────────── */}
        <RevealSection id="practice" className={styles.section}>
          <p className={styles.sectionLabel}>The Practice</p>
          {/* The three moves used to stand alone, which asked a first-time
              reader to infer what kind of thing they were. The headline names
              it, and each title completes the sentence. */}
          <h2 className={styles.sectionHeadline}>
            <em>Conversations</em>
            <br />
            that let groups&hellip;
          </h2>
          <ul className={styles.practiceList}>
            {PRACTICE.map(b => (
              <li key={b.title} className={styles.practiceItem}>
                {b.art}
                <span className={styles.practiceText}>
                  <span className={styles.practiceTitle}>{b.title}</span>
                  <span className={styles.practiceDesc}>{b.desc}</span>
                </span>
              </li>
            ))}
          </ul>
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
            Living experiments in human understanding and collaboration. Each
            one encapsulates a different dynamic &mdash; how a group finds its
            edges, how it holds many voices, how it thinks together &mdash; and
            each taught us something the next was built on. Circles is our first
            attempt at knitting them together. All of them are open: play them,
            break them, tell us what you find. The first circles form now:{' '}
            <a
              href="#invitation"
              className={styles.inlineLink}
              onClick={(e) => {
                e.preventDefault();
                scrollTo('invitation');
              }}
            >
              take a seat
            </a>
            .
          </p>
          <GameCardStack to="lander" />
        </RevealSection>

        <div className={styles.divider} />

        {/* ── The Invitation — the one ask on the page, and where "take a
               seat" lands. Two audiences, one movement: a group that already
               gathers, and a person who has never held space. Both are told
               the same third thing, which is the point of the section — what
               a circle makes joins a body of work larger than the circle.
               An address, not an account: the invitation reaches them when
               their circle forms. (`platform` span keeps old #platform
               links.) ────────────────────────────────────────────────────── */}
        <RevealSection id="invitation" className={styles.section}>
          <span id="platform" />
          <p className={styles.sectionLabel}>The Invitation</p>
          <h2 className={styles.sectionHeadline}>
            Be in the first <em>circles.</em>
          </h2>
          {/* Three tiers, because the copy is three moves and four evenly
              spaced paragraphs read as one block: who this is for, the fork
              between two ways of arriving, and the thing both are told. The
              fork is a pair of ruled columns so it scans as a fork. */}
          <p className={`${styles.sectionBody} ${styles.inviteLede}`}>
            Groups that gather to share, plan, heal, or grow &mdash; and want
            what they find to be part of something larger.
          </p>
          <div className={styles.inviteFork}>
            <p className={styles.forkItem}>
              <span className={styles.roleLead}>If you facilitate</span>
              these are adaptable tools that can accompany the gatherings you
              already hold.
            </p>
            <p className={styles.forkItem}>
              <span className={styles.roleLead}>If you&apos;re new to holding space</span>
              they give you accessible structure to convene a gathering of
              thoughts.
            </p>
          </div>
          <p className={styles.inviteJoin}>
            Either way, what your circle makes joins a growing body of work on
            how groups understand each other.
          </p>

          <div className={styles.joinBlock}>
            <h3 className={styles.joinHeading}>Save a seat</h3>
            <p className={styles.joinBody}>
              Leave your address. Circles form at twelve people; when
              yours is ready, an invitation reaches you with everything you
              need to begin.
            </p>
            <p className={styles.joinBody}>
              <a href={`${CIRCLES_URL}/demo`} className={styles.inlineLink}>
                See a demo circle
              </a>
              {' '}&mdash; one finished conversation, no account needed.
            </p>
            <EmailCapture
              cta="Save me a seat"
              sentNote="Seat saved. We'll write when your circle forms."
              source="first-gathering"
            />
            <p className={`${styles.joinBody} ${styles.joinAside}`}>
              Already meet as a group?{' '}
              <Link href="/contact" className={styles.inlineLink}>
                Write to us
              </Link>
              {' '}and bring your circle in whole. For more details, visit{' '}
              <Link href="/circles" className={styles.inlineLink}>Circles</Link>
              .
            </p>
          </div>
        </RevealSection>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <SiteFooter />
    </div>
  );
}
