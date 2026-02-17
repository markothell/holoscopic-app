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
  title: string;
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

      {/* Fixed UserMenu */}
      <div className={styles.userMenuWrapper}>
        <UserMenu />
      </div>

      <main className={styles.container}>
        {/* ---- Hero ---- */}
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>
            Open experiments in collective intelligence
          </p>
          <h1 className={styles.heroTitle}>
            <span className={styles.word1}>Holo</span>
            <span className={styles.word2}>scopic</span>
          </h1>
          <p className={styles.heroSub}>
            Games for understanding how we work.
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

        {/* ---- The Problem ---- */}
        <RevealSection id="problem" className={styles.section}>
          <p className={styles.sectionLabel}>The Problem/Opportunity</p>
          <h2 className={styles.sectionHeadline}>
            Polarization, Distraction, 
            <br />Domination, <em>Transformation</em>
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem title="Society is coming unhinged.">
              Our internal conflicts are the world&apos;s problems. Polarized
              cultural dynamics are the result of shared blindness. If one
              person can see themselves and transform, so can the collective.
              <br />Our solutions will heal the world.
            </ExpandItem>

            <ExpandItem title="We are connected but can't see each other.">
              The world has been connected in real time and yet the tools we use
              to do that connecting build walls around what we do not know or like.
            </ExpandItem>

            <ExpandItem title="Our world is controlled by a powerful few.">
              Another way to say this is society is guided by algorithms. Some exist
              in the head of powerful figures; some are the systems that guide our society.
              Humans can design algorithms. Like the programming of computers, we
              just need a language that everyone can use to connect our different experiences.
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- What We're Building ---- */}
        <RevealSection id="game" className={styles.section}>
          <p className={styles.sectionLabel}>What We&apos;re Building</p>
          <h2 className={styles.sectionHeadline}>
            Algorithms For
            <br />
            Human <em>Prosperity</em>
          </h2>

          <div className={styles.expandGroup}>
            <ExpandItem title="Map Culture">
              If we want to graduate from systems that reinforce separation,
              we must learn to see, think and act as collectives.
              Maps help us transfer knowledge from one to another, compare and expand 
              knowledge across time, unify layers of intersecting knowledge, and 
              see the whole.
            </ExpandItem>

            <ExpandItem title="Study Collective Transformation">
              Collectives &apos;see&apos; through ideas.<br/> Mapping sequences create
              feedback loops that allows us to witness how we change in relation to the world. 
              By visualizing this processes we create paths for others to follow, i.e. 
              lower the ladder. By doing it as collectives we build models of the world that serve the whole.
            </ExpandItem>

            <ExpandItem title="Programming Humanity">
              The insights that transform individuals and communities can be turned
              into repeatable processes. Those processes can be shared, forked —
              like open source code, but for how humans find alignment with the world.
              Human readable algorithms backed by 
            </ExpandItem>
          </div>
        </RevealSection>

        <div className={styles.divider} />

        {/* ---- Invitation ---- */}
        <RevealSection id="join" className={styles.invitation}>
          <h2 className={styles.invitationHeadline}>
            If you find that
            <br />
            <em>exciting —</em>
            <br />
            welcome.
          </h2>
          <div className={styles.invitationLinks}>
            <a href="#" className={styles.invLink}>
              Follow the experiments on TikTok
            </a>
            <Link href="/activities" className={styles.invLink}>
              Participate in an activity
            </Link>
            <a
              href="https://wiki.holoscopic.io/index.php?title=Special:Contact"
              className={styles.invLink}
            >
              Reach out directly
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
