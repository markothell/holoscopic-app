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

        {/* ── The Opportunity ──────────────────────────────────────────────── */}
        <RevealSection id="opportunity" className={styles.section}>
          <h2 className={styles.sectionHeadline}>
            Our <em>Frame</em>
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem title={<>The Noise Is <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>Data</em></>}>
              We are surrounded by conflict, friction, polarization. Most treat
              this as the problem to solve. But every place where people disagree
              is potential energy — stored insight waiting to be released.
              We&apos;ve never had so much of it visible at once.
            </ExpandItem>

            <ExpandItem title={<><em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>Lenses,</em> Not Laws</>}>
              You don&apos;t resolve that tension by imposing a solution. You resolve
              it by learning to see it more clearly, together. Holoscopic
              doesn&apos;t tell groups what to think — it shows them what they already
              think in a form they couldn&apos;t see before. The insight does the work.
            </ExpandItem>

            <ExpandItem title={<>Patterns Become <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>Tools</em></>}>
              When a group can see its own shape clearly enough, new possibilities
              emerge from that seeing. Not theories handed down — thinking tools
              that grow from the collective looking itself. The map becomes the
              path.
            </ExpandItem>
          </div>
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

        {/* ── An Invitation ────────────────────────────────────────────────── */}
        <RevealSection id="join" className={styles.invitation}>
          <p className={styles.sectionLabel}>An Invitation</p>
          <h2 className={styles.sectionHeadline}>
            <em>Play</em> the Game
          </h2>
          <div className={styles.activityBigList}>
            {[
              { title: 'Relationship', sub: ['Conflict +', 'Resolution'] },
              { title: 'Intuition',    sub: ['Impulse +', 'Action'] },
              { title: 'Work',         sub: ['Duty ->', 'Purpose'] },
              { title: 'Sexuality',    sub: ['Arousal +', 'Intentionality'] },
            ].map(({ title, sub }, i) => (
              <Link key={i} href="/waitlist" className={styles.activityBigCard}>
                <span className={styles.activityBigTitle}>{title}</span>
                {sub && (
                  <span className={styles.activityBigSub}>
                    <span>{sub[0]}</span>
                    <span>{sub[1]}</span>
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className={styles.invitationLinks}>
            <Link href="/waitlist" className={styles.invLink}>
              Create a map
            </Link>
          </div>
        </RevealSection>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
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