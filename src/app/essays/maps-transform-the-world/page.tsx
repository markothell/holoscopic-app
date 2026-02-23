'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from '../essay.module.css';

export default function MapsTransformTheWorldPage() {
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
          <p className={styles.heroEyebrow}>Part 1 of 3 — Open Source Social Algorithms</p>
          <h1 className={styles.heroTitle}>
            <span className={styles.line1}>Maps Transform</span>
            <span className={styles.line2}>the World</span>
          </h1>
          <p className={styles.heroLede}>
            There exists an algorithm for prosperity. They must be communally generated,
            human-readable living feedback loops. Open source social algorithms.
          </p>
        </header>

        <div className={styles.divider} />

        {/* Content */}
        <div className={styles.essayContent}>

          <p className={styles.body}>
            Humans solve problems. To solve problems for ever wider and more diverse collectives
            we need more than empathy. We need to develop the skill of seeing and thinking as{' '}
            <strong>collectives</strong>. In this first essay I&apos;ll discuss the impact of maps
            on transforming the mind of humanity and suggest some simple tools we can use to chart
            the human social sphere.
          </p>

          <h3 className={styles.subTitle}>Maps transfer knowledge from one to another</h3>
          <p className={styles.body}>
            Maps began as communication between individuals: &ldquo;Over the hill, through the
            pine trees, cross the stream by the big rock then go to the base of the nearby
            tree&hellip;&rdquo;
          </p>

          <h3 className={styles.subTitle}>Maps let us compare and expand knowledge across time</h3>
          <p className={styles.body}>
            Explorers venture out to discover the world and bring back maps of their route. Those
            maps are copied and taken on new journeys, each adventure expanding or refining the
            collective project of knowing and navigating the world.
          </p>

          <h3 className={styles.subTitle}>Maps allow us to see the whole</h3>
          <p className={styles.body}>
            Though first recognized through study of the night sky, at some point the idea spread
            that all the far lands of the world connected in a great loop. Maps make this real. You
            can hold the globe and identify all its parts. This was a radical shift in perception
            for humankind. The flat map with fuzzy unknown around the perimeter became a globe.
            Known.
          </p>
          <p className={styles.body}>
            The project of map making entered a new phase. No longer expanding in size but filling
            in layer upon layer of useful information.
          </p>

          <h3 className={styles.subTitle}>Maps unify layers of intersecting knowledge</h3>
          <p className={styles.body}>
            The atlas was born. And Google Earth and Maps. Earth sciences, industrial planners,
            bureaucrats — everyone with information to share mapped their data onto the surface of
            the globe. New functions became possible. We can zoom in and out from a view of the
            milky way to the furniture you keep in your backyard. In place of landmarks we have
            coordinate systems that allow us to coordinate on a global scale, build navigation
            systems that automatically plan your journey on foot, road, boat and air.
          </p>
          <p className={styles.body}>
            In a sense the world is unknowable and ever changing. In other ways we can see it
            completely, and these ways are functionally very empowering for us.
          </p>
          <p className={styles.body}>
            So this is the potential: disconnected siloes of mismatched perspectives to unified
            project of collective learning and enabling technology.
          </p>

          <h2 className={styles.sectionTitle}>Mapping Culture</h2>

          <p className={styles.body}>
            What would it mean to make maps of culture? And how do we do it?
          </p>

          <h2 className={styles.sectionTitle}>Why Map Culture?</h2>

          <h3 className={styles.subTitle}>To See as Collectives</h3>
          <p className={styles.body}>
            Despite the grand promise of maps&apos; ability to reveal the whole, these culture
            mapping activities are not global in scale. This is not so much an attempt to
            &ldquo;see everything about everyone&rdquo; as a set of tools that allow people to
            see more completely the communities and movements that they are a part of; the premise
            being that we need to hone our collective ability to see before we can coordinate
            harmoniously at greater scales.
          </p>

          <h3 className={styles.subTitle}>To See Spectrums</h3>
          <p className={styles.body}>
            Culture exists on a spectrum. There are the definite artifacts of culture — the
            objects, the recipes, the ritual practices — but within society these manifest to
            varying degrees, with some placing great meaning and others merely gesturing towards
            past meaning. Other parts of culture are implicit, our way of describing how things
            get done. Within and between both there are countless nuanced variations.
          </p>
          <p className={styles.body}>
            Maps help us place our varied relationships on spectrums so that we can develop more
            nuanced language for coordinating across beliefs.
          </p>

          <h3 className={styles.subTitle}>To Navigate Change</h3>
          <p className={styles.body}>
            We witness the every-day feelings, desires and decisions of those in our life but when
            it comes to societal change we often only note official events: a new law is passed, a
            new technology hits the market, celebrity drama, war, IPO, launch, collapse. If we
            want to scale a culture of collaborative innovation we need more nuanced feedback loops
            for the ways that we are all gradually changing.
          </p>

          <h2 className={styles.sectionTitle}>What Do We Map?</h2>

          <h3 className={styles.subTitle}>We map our relationship to ideas</h3>
          <p className={styles.body}>
            This platform is not directed at answering any particular questions. Instead it is a
            tool that allows groups to answer their own questions as collectives. Purpose,
            prosperity, truth, leadership, wealth — our ability to create thriving systems depends
            on our ability to see, together, a clear vision of what we hold important.
          </p>

          <h3 className={styles.subTitle}>We map &ldquo;wholes&rdquo;</h3>
          <p className={styles.body}>
            What does completeness look like in individuals, in relationships, family, community?
            How do they combine to build whole society? Much of how we view the world is through
            the language of separation — country, religion, race. We have a rich taxonomy of
            difference. This platform is intended to visualize and develop a language around the
            experience of social completeness.
          </p>
          <p className={styles.body}>
            Whole group. Whole ideas. Whole cycles.
          </p>

          <h2 className={styles.sectionTitle}>How Do We Map?</h2>

          <p className={styles.body}>
            Statistics is the language of collective perception. Turn it from the asymmetrical
            measure-and-report of academic research to interactive conversation where each exchange
            is a collaborative creation, where collective dialogs can be seen and understood in a
            snapshot.
          </p>

          <h3 className={styles.subTitle}>Social Maps</h3>
          <p className={styles.body}>
            The basic interactive element is a group sharing activity that allows a group to
            quickly visualize their relationship with a thing or idea. These are created by and for
            community members as a form of group conversation. The steps:
          </p>
          <ul className={styles.essayList}>
            <li>
              <strong>Pick a topic:</strong> Purpose, prosperity, religion — whatever is important.
            </li>
            <li>
              <strong>Identify a cultural intersection:</strong> the &lsquo;landscape&rsquo; where
              participants map their experiences. Examples from popular culture:
              <ul>
                <li>Attachment Theory: relationships map connection styles on spectrums of anxiety vs. avoidance</li>
                <li>SWOT Analysis: project teams map priorities on spectrums of internal/external vs. helpful/harmful</li>
                <li>Thinking Ladder: political conversants map discourse on scales of liberal/conservative vs. scientific/tribal</li>
              </ul>
            </li>
            <li>
              <strong>Select Elements:</strong> Things, beliefs, behavior patterns, intentions,
              plans. In response to a core question, each participant places a piece of their
              personal context on the collective graph and leaves a comment describing its
              significance.
            </li>
            <li>
              <strong>Vote and discuss:</strong> Participants vote on collected elements and
              comments that best illustrate this cultural landscape for them.
            </li>
            <li>
              <strong>Repeat:</strong> Participants can repeat social maps in new crowds or propose
              new intersections for observing the collective.
            </li>
          </ul>

          <h3 className={styles.subTitle}>Learning Sequences</h3>
          <p className={styles.body}>
            Where social maps could be seen as a simple feedback system similar to social media or
            community surveys, their true value is revealed by connecting them in series as part of
            a collective learning. In part two I&apos;ll discuss how these bits of conversation can
            be connected to visualize collective learning and discuss a particular type of cultural
            learning that would greatly benefit us in this moment in time.
          </p>

        </div>

        {/* Series Nav */}
        <div className={styles.seriesNav}>
          <p className={styles.seriesLabel}>This series</p>
          <div className={styles.seriesLinks}>
            <span className={`${styles.seriesLink} ${styles.seriesLinkCurrent}`}>
              Part 1 — Maps Transform the World
            </span>
            <Link href="/essays/studying-collective-identity" className={styles.seriesLink}>
              Part 2 — Studying Collective Identity →
            </Link>
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
