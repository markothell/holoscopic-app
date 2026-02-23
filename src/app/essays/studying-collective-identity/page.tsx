'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from '../essay.module.css';

export default function StudyingCollectiveIdentityPage() {
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

        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.navHome}>
              Holo<span>scopic</span>
            </Link>
            <span className={styles.navLabel}>Essay</span>
          </div>
        </nav>

        {/* Hero */}
        <header className={styles.hero}>
          <p className={styles.heroEyebrow}>Part 2 of 3 — Open Source Social Algorithms</p>
          <h1 className={styles.heroTitle}>
            <span className={styles.line1}>Studying</span>
            <span className={styles.line2}>Collective Identity</span>
          </h1>
          <p className={styles.heroLede}>
            In part one I described &lsquo;social maps&rsquo; as a single exchange for a
            collective — a byte of information that informs a transformative dialog. Here I
            discuss the nature of these dialogs and how they contribute to our progress as
            a species.
          </p>
        </header>

        <div className={styles.divider} />

        {/* Content */}
        <div className={styles.essayContent}>

          <h2 className={styles.sectionTitle}>The Journey to Wholeness</h2>

          <p className={styles.body}>
            Popular concepts of wholeness for human society are often labeled as utopian. To
            help understand how we can extend our concepts of wholeness and build bridges across
            the chasm, I&apos;ll borrow some functional definitions of wholeness from other realms
            of the human world and then try to reconnect them with our work here at Holoscopic.
          </p>

          <h3 className={styles.subTitle}>Wholeness = seeing all the parts in place</h3>
          <p className={styles.body}>
            Internal Family Systems is a therapeutic system that sees human identity as composed
            of parts that compete or collaborate. It provides a framework for identifying, creating
            space for, and healing those parts. Success is described as the discovery of the core
            &lsquo;self&rsquo; and its coming into leadership of the whole.
          </p>
          <p className={styles.body}>
            Before a person can instruct, shape, or fix themself, they must see their self.
          </p>

          <h3 className={styles.subTitle}>Wholeness = collective progress</h3>
          <p className={styles.body}>
            As all the parts of a person have a kind of evolutionary urge, so do the individuals
            and collectives within a society. As we can see by the ideological conflict that
            afflicts our relatively prosperous society, it is not enough to have nominal,
            &lsquo;objective&rsquo; progress — the evolutionary urges of all parties must be seen
            and integrated to achieve a sense of wholeness.
          </p>
          <p className={styles.body}>
            This is near unthinkable at the scale of society but there are scales and domains for
            which this can and does occur. This project is aimed at (1) making this particular
            brand of wholeness visible and (2) reproducible.
          </p>

          <h3 className={styles.subTitle}>Collectives &lsquo;see&rsquo; through ideas</h3>
          <p className={styles.body}>
            Individuals see individuals. We can each witness the events that make up another
            individual&apos;s life and come to &lsquo;know&rsquo; them to a degree, through direct
            experience.
          </p>
          <p className={styles.body}>
            Collectives see archetypes. The number of people for whom we can store and process
            direct experience is limited. To understand the collective we tell stories. To create
            meaning we position ourselves and others in relationship to those stories.
          </p>
          <p className={styles.body}>
            These could be ancient stories like those in religious texts, prompting us to maintain
            some crucial but fleeting knowledge. These could be modern anecdotes that redefine our
            relationship with change — the founding of scientific laws is always paired with
            stories: &ldquo;We thought X but we couldn&apos;t explain Y, then we tried Z and
            discovered&hellip;&rdquo;
          </p>
          <p className={styles.body}>
            These stories and associated values are given names and become leverage points for our
            collective discussions.
          </p>

          <h3 className={styles.subTitle}>Whole Seeing &Rightarrow; Collective Power</h3>
          <p className={styles.body}>
            Like those that speak a common language, a group whose members all believe the same
            core stories is able to coordinate far more easily than those that don&apos;t — because
            they don&apos;t have the time delay or errors involved in translating.
          </p>
          <p className={styles.body}>
            On the other hand a homogeneous group is more fragile when entering unfamiliar
            territory because they must develop new knowledge from scratch. This is very difficult
            when it conflicts with core beliefs.
          </p>
          <p className={styles.body}>
            Archetypal stories do not convey the full complexity of a human life and yet they
            allow us to know something about all who share them. In the same way we can design
            ideas that allow us to see and translate diverse ways of understanding the world.
          </p>
          <p className={styles.body}>
            Holoscopic imagines this as a process not of compressing diverse systems into one
            dominant narrative, but using tools to create shared maps of meaning.
          </p>
          <p className={styles.body}>
            In the same way that the individual becomes more effective when they see and align
            the various parts of their self, so too does any group become powerful when it is able
            to witness and channel its many expressions. As individuals and groups harness this
            skill the greater human collective increases its ability to harmoniously co-operate.
          </p>

          <h2 className={styles.sectionTitle}>Activity: Collective Introspection</h2>

          <p className={styles.body}>
            A minimum viable intervention: observation. Make change visible.
          </p>
          <p className={styles.body}>
            This is a description of how social maps can be used by a cohort to observe and
            extract knowledge from a shared process of navigating a common topic or intention.
          </p>

          <h3 className={styles.subTitle}>Pick a topic</h3>
          <p className={styles.body}>
            An individual in the group observes some pattern in self or group. In order to
            &lsquo;sense&rsquo; the group&apos;s relationship on the topic they create a map and
            invite everyone to join in a mapping exercise.
          </p>

          <h3 className={styles.subTitle}>Create a feedback loop</h3>
          <p className={styles.body}>
            Introspection involves more than categorization. There must be input, output, and
            cycles that allow for refinement. For instance, two questions:
          </p>
          <ul className={styles.essayList}>
            <li><strong>Q1: &ldquo;Who are we?&rdquo;</strong> Observe the distribution of ideas relating to a topic.</li>
            <li><strong>Q2: &ldquo;What do &lsquo;we&rsquo; do?&rdquo;</strong> Map the ways the various identities enact their ideas.</li>
          </ul>
          <p className={styles.body}>
            Every time the loop repeats there is an opportunity to observe the evolution of both
            aspects.
          </p>

          <h3 className={styles.subTitle}>Observe Change and Reframe</h3>
          <p className={styles.body}>Change happens in certain ways.</p>
          <p className={styles.body}>For individuals:</p>
          <ul className={styles.essayList}>
            <li>Intended or unintended outcomes</li>
            <li>Harmonious or turbulent relating</li>
            <li>Moving toward simplification or complexity</li>
          </ul>
          <p className={styles.body}>
            For the group: either converging on or diverging from ideals and strategies.
          </p>
          <p className={styles.body}>
            When things go wrong we are forced to reassess, redefine our way of thinking or
            looking at a situation.
          </p>
          <p className={styles.body}>
            As a group finds itself coming into resonance around new ideas, the sequence of social
            maps provides a documented journey — stories that span from the individual to the
            collective, and a well-defined conceptual process that others can follow in order to
            validate or differentiate from.
          </p>
          <p className={styles.body}>
            Conceptual frames that allow us to see wholes at greater scales with less effort are
            like a social technology and like all powerful technologies, they spread.
          </p>

        </div>

        {/* Series Nav */}
        <div className={styles.seriesNav}>
          <p className={styles.seriesLabel}>This series</p>
          <div className={styles.seriesLinks}>
            <Link href="/essays/maps-transform-the-world" className={styles.seriesLink}>
              ← Part 1 — Maps Transform the World
            </Link>
            <span className={`${styles.seriesLink} ${styles.seriesLinkCurrent}`}>
              Part 2 — Studying Collective Identity
            </span>
            <Link href="/essays/open-source-social-algorithms" className={styles.seriesLink}>
              Part 3 — Open Source Social Algorithms →
            </Link>
          </div>
        </div>

        <Link href="/" className={styles.backLink}>
          Back home
        </Link>

      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerInner}>
            <span className={styles.footerText}>
              Made by Mo &nbsp;&middot;&nbsp; Open source &nbsp;&middot;&nbsp; Evolving
            </span>
            <Link href="/" className={`${styles.footerText} ${styles.footerLink}`}>
              Holoscopic &rarr;
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
