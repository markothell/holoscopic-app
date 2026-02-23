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

      {/* Grid */}
      <line x1="150" y1="20" x2="150" y2="280" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="20" y1="150" x2="280" y2="150" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="85" y1="20" x2="85" y2="280" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="215" y1="20" x2="215" y2="280" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="20" y1="85" x2="280" y2="85" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />
      <line x1="20" y1="215" x2="280" y2="215" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="0.5" />

      {/* Axis labels */}
      <text x="150" y="15" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5">INDIVIDUAL</text>
      <text x="150" y="296" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5">COLLECTIVE</text>
      <text x="14" y="154" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(-90 14 150)">SHORT</text>
      <text x="290" y="150" textAnchor="middle" fill="#ffffff" fillOpacity="0.25" fontSize="8" fontFamily="monospace" letterSpacing="1.5" transform="rotate(90 288 148)">LONG</text>

      {/* GREEN dots — top-left */}
      <circle cx="60" cy="55" r="4" fill="#3DD68C" fillOpacity="0.55" />
      <circle cx="95" cy="72" r="3.5" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="75" cy="102" r="4" fill="#3DD68C" fillOpacity="0.62" />
      <circle cx="112" cy="85" r="3" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="120" cy="50" r="3.5" fill="#3DD68C" fillOpacity="0.5" />
      <circle cx="55" cy="122" r="3" fill="#3DD68C" fillOpacity="0.48" />
      <circle cx="135" cy="110" r="3.5" fill="#3DD68C" fillOpacity="0.55" />
      <circle cx="118" cy="128" r="14" fill="#3DD68C" fillOpacity="0.08" />
      <circle cx="118" cy="128" r="10" fill="#3DD68C" fillOpacity="0.9" />

      {/* BLUE dots — top-right */}
      <circle cx="240" cy="46" r="4.5" fill="#60A5FA" fillOpacity="0.65" />
      <circle cx="222" cy="80" r="4.5" fill="#60A5FA" fillOpacity="0.65" />
      <circle cx="265" cy="92" r="5" fill="#60A5FA" fillOpacity="0.7" />
      <circle cx="202" cy="55" r="3.5" fill="#60A5FA" fillOpacity="0.55" />
      <circle cx="252" cy="122" r="3" fill="#60A5FA" fillOpacity="0.48" />
      <circle cx="185" cy="100" r="4" fill="#60A5FA" fillOpacity="0.5" />
      <circle cx="175" cy="60" r="3.5" fill="#60A5FA" fillOpacity="0.45" />

      {/* RED dots — bottom-left */}
      <circle cx="95" cy="202" r="5" fill="#F87171" fillOpacity="0.65" />
      <circle cx="76" cy="262" r="4" fill="#F87171" fillOpacity="0.6" />
      <circle cx="122" cy="242" r="3.5" fill="#F87171" fillOpacity="0.55" />
      <circle cx="112" cy="212" r="3" fill="#F87171" fillOpacity="0.48" />
      <circle cx="58" cy="232" r="4" fill="#F87171" fillOpacity="0.55" />
      <circle cx="136" cy="270" r="3" fill="#F87171" fillOpacity="0.38" />
      <circle cx="55" cy="195" r="18" fill="#F87171" fillOpacity="0.07" />
      <circle cx="55" cy="195" r="12" fill="#F87171" fillOpacity="0.9" />

      {/* ORANGE dots — bottom-right */}
      <circle cx="212" cy="226" r="5" fill="#FB923C" fillOpacity="0.7" />
      <circle cx="237" cy="202" r="4" fill="#FB923C" fillOpacity="0.62" />
      <circle cx="272" cy="218" r="3.5" fill="#FB923C" fillOpacity="0.65" />
      <circle cx="196" cy="252" r="4" fill="#FB923C" fillOpacity="0.55" />
      <circle cx="217" cy="275" r="3" fill="#FB923C" fillOpacity="0.5" />
      <circle cx="262" cy="242" r="4" fill="#FB923C" fillOpacity="0.45" />
      <circle cx="185" cy="212" r="3" fill="#FB923C" fillOpacity="0.4" />
      <circle cx="252" cy="258" r="5" fill="#FB923C" fillOpacity="0.65" />

      {/* Center crosshair */}
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

      {/* Stage dashed lines */}
      <line x1="65" y1="42" x2="65" y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="150" y1="42" x2="150" y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />
      <line x1="235" y1="42" x2="235" y2="238" stroke="white" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="3 4" />

      {/* Stage labels */}
      <text x="65" y="32" textAnchor="middle" fill="white" fillOpacity="0.25" fontSize="7" fontFamily="monospace" letterSpacing="1.5">ACT. I</text>
      <text x="150" y="32" textAnchor="middle" fill="white" fillOpacity="0.25" fontSize="7" fontFamily="monospace" letterSpacing="1.5">ACT. II</text>
      <text x="235" y="32" textAnchor="middle" fill="white" fillOpacity="0.25" fontSize="7" fontFamily="monospace" letterSpacing="1.5">ACT. III</text>

      {/* Connecting paths — Green */}
      <path d="M65,82 C107,82 107,62 150,62" stroke="#3DD68C" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
      <path d="M150,62 C193,62 193,78 235,78" stroke="#3DD68C" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />

      {/* Connecting paths — Blue (dramatic shift in Act III) */}
      <path d="M65,112 C107,112 107,97 150,97" stroke="#60A5FA" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
      <path d="M150,97 C193,97 193,55 235,55" stroke="#60A5FA" strokeOpacity="0.65" strokeWidth="2" fill="none" />

      {/* Connecting paths — Purple (joins Act II) */}
      <path d="M150,133 C193,133 193,127 235,127" stroke="#A78BFA" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />

      {/* Connecting paths — Red */}
      <path d="M65,155 C107,155 107,174 150,174" stroke="#F87171" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
      <path d="M150,174 C193,174 193,158 235,158" stroke="#F87171" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />

      {/* Connecting paths — Orange */}
      <path d="M65,185 C107,185 107,200 150,200" stroke="#FB923C" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />
      <path d="M150,200 C193,200 193,195 235,195" stroke="#FB923C" strokeOpacity="0.4" strokeWidth="1.5" fill="none" />

      {/* Stage 1 nodes */}
      <circle cx="65" cy="82" r="5" fill="#3DD68C" fillOpacity="0.85" />
      <circle cx="65" cy="112" r="5" fill="#60A5FA" fillOpacity="0.85" />
      <circle cx="65" cy="155" r="5" fill="#F87171" fillOpacity="0.85" />
      <circle cx="65" cy="185" r="5" fill="#FB923C" fillOpacity="0.85" />

      {/* Stage 2 nodes */}
      <circle cx="150" cy="62" r="4.5" fill="#3DD68C" fillOpacity="0.75" />
      <circle cx="150" cy="97" r="4.5" fill="#60A5FA" fillOpacity="0.75" />
      <circle cx="150" cy="133" r="5" fill="#A78BFA" fillOpacity="0.85" />
      <circle cx="150" cy="174" r="4.5" fill="#F87171" fillOpacity="0.75" />
      <circle cx="150" cy="200" r="4.5" fill="#FB923C" fillOpacity="0.75" />

      {/* Stage 3 nodes */}
      <circle cx="235" cy="78" r="4.5" fill="#3DD68C" fillOpacity="0.75" />
      {/* Blue: highlighted perspective shift */}
      <circle cx="235" cy="55" r="14" fill="#60A5FA" fillOpacity="0.08" />
      <circle cx="235" cy="55" r="10" fill="#60A5FA" fillOpacity="0.9" />
      <circle cx="235" cy="127" r="4.5" fill="#A78BFA" fillOpacity="0.75" />
      <circle cx="235" cy="158" r="4.5" fill="#F87171" fillOpacity="0.75" />
      <circle cx="235" cy="195" r="4.5" fill="#FB923C" fillOpacity="0.75" />
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

        {/* ---- Hero ---- */}
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>
            Experiments in collective intelligence
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.word1}>Holo</span>
            <span className={styles.word2}>scopic</span>
          </h1>
          <p className={styles.heroSub}>
            Games for understanding how we work, together.
          </p>
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
        </section>

        <div className={styles.divider} />

        {/* ---- The Idea ---- */}
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

        {/* ---- Our Leverage ---- */}
        <RevealSection id="leverage" className={styles.section}>
          <p className={styles.sectionLabel}>Our Leverage</p>
          <h2 className={styles.sectionHeadline}>
            Light Enters
            <br />
            Through the Cracks
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem
              title={
                <>
                  True change comes through{' '}
                  <s className={styles.strike}>Domination</s>{' '}
                  Mutual Insight
                </>
              }
            >
              For ages the tension of difference was solved by domination. War,
              politics, gender — each side fighting for a partial truth, not
              seeing a path for co-creation.
            </ExpandItem>

            <ExpandItem title="Polarization = Potential Energy">
              Science provided a framework for mutual examination of the physical
              world. We still get caught in the battles but it fueled an era of
              innovation. Our social world is primed for discovery.
            </ExpandItem>

            <ExpandItem title="Ideas Transform Reality">
              Science gave us a simple discipline: write down your thinking
              before you run your experiment. Share your results. Let others try
              it. That process unlocked centuries of compounding discovery — not
              by identifying the <strong>TRUTH</strong> but by creating useful
              explanations.
              <br /><br />
              George Box: &ldquo;All models are wrong, but some are useful&rdquo;
              <br /><br />
              The social and spiritual realms remain largely untapped, and the
              source of our deepest rifts. But as with science there are
              processes that allow us to craft useful ideas not in spite of
              divergent perspectives but using them as fuel.
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- The Practice ---- */}
        <RevealSection id="practice" className={styles.section}>
          <p className={styles.sectionLabel}>The Practice</p>
          <h2 className={styles.sectionHeadline}>
            Conversations that&hellip;
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
              <div>
                <Link href="/essays/maps-transform-the-world" className={styles.readLink}>
                  Maps Transform the World
                </Link>
              </div>
            </ExpandItem>

            <ExpandItem title="Visualize Emergence">
              <div className={styles.visualPanel}>
                <SequenceVisual />
              </div>
              Change doesn&apos;t announce itself. But when you can watch a
              group&apos;s ideas shift in real time — converging, diverging, finding
              unexpected common ground — you start to see how transformation
              actually moves through a culture.
              <div>
                <Link href="/essays/studying-collective-identity" className={styles.readLink}>
                  Studying Collective Identity
                </Link>
              </div>
            </ExpandItem>

            <ExpandItem title="Leave a trail for others to follow">
              Every insight that transforms a group is a path someone else
              could walk. We document what works, make it repeatable, and share
              it openly — so good social technology compounds the way scientific
              discovery does.
              <div>
                <Link href="/essays/open-source-social-algorithms" className={styles.readLink}>
                  Open Source Social Algorithms
                </Link>
              </div>
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- An Invitation ---- */}
        <RevealSection id="join" className={styles.invitation}>
          <p className={styles.sectionLabel}>An Invitation</p>
          <h2 className={styles.sectionHeadline}>
            <em>Play</em> the Game
          </h2>

          <p className={styles.invSubLabel}>Open activities</p>

          <div className={styles.activityList}>
            <Link href="/activities" className={styles.activityCard}>
              <span className={styles.activityTitle}>
                Artificial Intelligence // Earth Intelligence
              </span>
              <span className={styles.activityMeta}>Progress &rarr;</span>
            </Link>
          </div>

          <div className={styles.invitationLinks}>
            <a
              href="https://wiki.holoscopic.io/index.php?title=Special:Contact"
              className={styles.invLink}
            >
              Create a map
            </a>
          </div>
        </RevealSection>

      </main>

      {/* ---- Footer ---- */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span className={styles.footerText}>
              Made by Mo &nbsp;&middot;&nbsp; Open source &nbsp;&middot;&nbsp;
              Evolving
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
