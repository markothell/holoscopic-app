'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

function RevealSection({
  className,
  children,
}: {
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
      className={`${className} ${visible ? styles.visible : ''}`}
    >
      {children}
    </section>
  );
}

function RevealDiv({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div
      ref={ref}
      className={`${className} ${visible ? styles.visible : ''}`}
    >
      {children}
    </div>
  );
}

export default function ManifestoPage() {
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

      <div className={styles.container}>
        {/* ---- Nav ---- */}
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.navHome}>
              Holo<span>scopic</span>
            </Link>
            <span className={styles.navLabel}>Manifesto</span>
          </div>
        </nav>

        {/* ---- Hero ---- */}
        <header className={styles.hero}>
          <p className={styles.heroEyebrow}>June 26, 2025</p>
          <h1 className={styles.heroTitle}>
            <span className={styles.line1}>Social Algorithm</span>
            <span className={styles.line2}>
              Manifesto
            </span>
          </h1>
          <p className={styles.heroLede}>
            A social algorithm is a system or process enacted by and between
            humans, that allows us to do new things. It&apos;s like culture
            technology.
          </p>
        </header>

        <div className={styles.divider} />

        {/* ---- Section 1 ---- */}
        <RevealSection className={styles.manifestoSection}>
          <p className={styles.sectionNumber}>01</p>
          <h2 className={styles.sectionTitle}>
            There exists an algorithm
            <br />
            for human <em>alignment.</em>
          </h2>
          <div className={styles.sectionBody}>
            <p>
              It is possible for us to understand how humans work in relation to
              each other.
            </p>
            <p>
              This won&apos;t be something as inflexible as a book of laws and
              it won&apos;t require blind trust in a government or all-knowing
              AGI. We can collectively design systems that allow us to create,
              adapt and improve the learning feedback loop of our culture.
            </p>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Section 2 ---- */}
        <RevealSection className={styles.manifestoSection}>
          <p className={styles.sectionNumber}>02</p>
          <h2 className={styles.sectionTitle}>
            Humans are the
            <br />
            <em>agents</em> of change.
          </h2>
          <div className={styles.sectionBody}>
            <p>
              Humans are the sensory nodes. We can detect the subtle dissonance
              that destabilizes a movement. We can feel when a new idea is
              reaching maturity, when the dynamics of a group are unstable or
              ready for action.
            </p>
            <p>
              These are sensitivities an individual can develop through
              experience. These are sensitivities that, if we desire to act as
              coherent collectives, we must begin developing collectively.
            </p>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Section 3 ---- */}
        <RevealSection className={styles.manifestoSection}>
          <p className={styles.sectionNumber}>03</p>
          <h2 className={styles.sectionTitle}>
            Power = Alignment
            <br />
            = <em>Wholeness</em>
          </h2>
          <div className={styles.sectionBody}>
            <p>
              True power is not a thing one possesses. The universe is not
              &lsquo;powerful&rsquo; for maintaining the laws of physics — it
              just works in certain ways. It is our ability to witness and build
              things that align with that reality that makes us powerful.
            </p>
            <p>
              As we graduate from the concept of power as domination we can
              begin to reveal our true potential. We want to prosper. We want
              dynamic technology and thriving ecology. There is a power we can
              love and pursue with open hearts — one that works to make our
              world whole.
            </p>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Section 4 ---- */}
        <RevealSection className={styles.manifestoSection}>
          <p className={styles.sectionNumber}>04</p>
          <h2 className={styles.sectionTitle}>
            Gaps in perception
            <br />
            are <em>potential energy.</em>
          </h2>
          <div className={styles.sectionBody}>
            <p>
              Humanity is a puzzle of which we all possess a unique piece. For
              some their piece may only serve their closest friends and family.
              For others their piece will unlock understanding for a majority.
              Regardless, finding where our perceptions of the world converge is
              the source of scientific and social innovation alike.
            </p>
            <p>
              In one domain — science — we have tools for inspecting the gaps
              between ideas. While other areas remain stunted, paralyzed by fear
              of the stranger, or simply lacking the tools to hold complex
              realities in view while their emerging purpose takes shape.
            </p>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Section 5 ---- */}
        <RevealSection className={styles.manifestoSection}>
          <p className={styles.sectionNumber}>05</p>
          <h2 className={styles.sectionTitle}>
            Culture can be a tool
            <br />
            we create <em>together.</em>
          </h2>
          <div className={styles.sectionBody}>
            <p>
              The trick you figured out last year was an insight. As insights
              evolve into the tools everybody uses, they become technology.
              Culture is the set of ideas and practices whose origins have sunk
              into myth. Just the way things work.
            </p>
            <p>
              But culture also represents character — how it feels to be and
              work in a city, a job, a family.
            </p>
            <p>
              I want to unify these. To close the gap between the seeking, the
              experimenting, the spread of insights across the population, and
              our ability to create lasting meaning while also allowing that
              meaning to evolve.
            </p>
            <p>
              These can all be part of a conscious collective relationship — a
              game we play together that adds resolution to what we hold
              beautiful, that allows us to share in the pride and joy of being
              human.
            </p>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Closing ---- */}
        <RevealDiv className={styles.closing}>
          <div className={styles.closingLine}>
            Let&apos;s
            <br />
            fucking
            <br />
            go.
          </div>
          <p className={styles.closingSig}>— MO</p>
          <Link href="/" className={styles.backLink}>
            Back home
          </Link>
        </RevealDiv>
      </div>

      {/* ---- Footer ---- */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span className={styles.footerText}>
              Made by Mo &nbsp;&middot;&nbsp; Open source &nbsp;&middot;&nbsp;
              Evolving
            </span>
            <Link
              href="/"
              className={`${styles.footerText} ${styles.footerLink}`}
            >
              Holoscopic &rarr;
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
