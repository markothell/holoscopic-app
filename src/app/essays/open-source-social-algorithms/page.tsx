'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from '../essay.module.css';

export default function OpenSourceSocialAlgorithmsPage() {
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
          <p className={styles.heroEyebrow}>Part 3 of 3 — Open Source Social Algorithms</p>
          <h1 className={styles.heroTitle}>
            <span className={styles.line1}>Open Source</span>
            <span className={styles.line2}>Social Algorithms</span>
          </h1>
          <p className={styles.heroLede}>
            Can we make the evolutionary insights of individuals and groups into self-replicating
            knowledge systems? Can wholeness be as contagious as fear and division?
          </p>
        </header>

        <div className={styles.divider} />

        {/* Content */}
        <div className={styles.essayContent}>

          <p className={styles.body}>
            Because I think of this as the development of a programming language for humans in
            community, I attempt to describe a context where groups of people could not only
            influence the fabric of human life at scale but in which this would be celebrated
            instead of cause for rebellion.
          </p>

          <h2 className={styles.sectionTitle}>Algorithms</h2>

          <h3 className={styles.subTitle}>Algorithms guide us through known solutions</h3>
          <p className={styles.body}>
            In the context of mathematics or computer code an algorithm is a process or set of
            rules to be followed, that can produce a desired change in state.
          </p>
          <p className={styles.body}>
            For a tangible example: the Rubik&apos;s cube. This is a puzzle that most would
            consider challenging or complex but that is in fact &ldquo;solved.&rdquo; There is a
            sequence of steps someone can use to complete the cube from any state. No knowledge of
            the patterns in the cube are required, no creative experimentation and discovery — just
            reading the cube and following instructions. This is the essence of most algorithms.
          </p>

          <h3 className={styles.subTitle}>&lsquo;Social Algorithms&rsquo; help humans decide what to do</h3>
          <p className={styles.body}>
            To the concept of algorithm we then add a modifier: a &lsquo;Social&rsquo; Algorithm
            is a process or set of rules that allow humans to solve complex creative problems in
            collaboration.
          </p>
          <p className={styles.body}>
            Unlike numbers or geometric concepts, humans are constantly changing. The challenges
            that we face in society are of a type that resist fixed sequences and predetermined
            outcomes. They require both the sensitivities and the creative inspiration of the
            human spirit to witness new solutions and bring them into being.
          </p>
          <p className={styles.body}>
            Social algorithms, then, are fluid feedback loops that place these human faculties at
            the center of a communal solution generation process.
          </p>

          <h3 className={styles.subTitle}>Democracy</h3>
          <p className={styles.body}>
            Democracy gives a set of practices for arriving at a prosperous society but it
            doesn&apos;t define what that state looks like. It merely creates a context where
            humans can have a better chance at assessing and improving their conditions. Steps:
            talk about it, vote on a course of action, execute, reassess who gets to talk about
            it, repeat.
          </p>

          <h3 className={styles.subTitle}>Science</h3>
          <p className={styles.body}>
            Science is a social context for observing the world and arriving at common
            understanding. It doesn&apos;t tell us which experiments to perform or when we have it
            figured out or what the truth is. Humans remain the creative agent. In order for
            individual experiences to translate to others we perform a common set of steps:
            describe your observations, form a hypothesis, outline your methods, share your
            results.
          </p>
          <p className={styles.body}>
            We are attempting to develop tools for changing how we think as humans. This brings up
            wounds of authoritarian structures. How might we build systems where humans can
            voluntarily learn to see and think like others without risking negative influence or
            homogeneity? One aspect is to make the processes truly open source.
          </p>

          <h2 className={styles.sectionTitle}>Open Source</h2>

          <p className={styles.body}>
            Nobody wants to be programmed. That is, no one wants to lose agency, to be changed
            against their will. On the other hand, if we can gain knowledge that makes our life
            better, we like that. Workshops, degrees, physical and spiritual disciplines are often
            turned into &lsquo;programs&rsquo; for transferring knowledge from one to many.
          </p>
          <p className={styles.body}>
            As soon as we begin to discuss the design of collective programs there are territory
            battles about what is good, who knows how to create it and its impact on the broader
            environment. Here I would like to reimagine this process — taking leadership from a
            game of authority and winner-take-all to one of collective investigation and iterative
            discovery.
          </p>
          <p className={styles.body}>
            Collectives gather, map their perceptions, intentions, and actions, and share the
            processes that generate insight. I imagine this like the speck of dust dropped into
            super-cooled water that produces a chain reaction of crystallization. Not via economic
            or peer pressure but because like all good technology it answers a question or solves
            a problem that was seeking completion.
          </p>

          <h3 className={styles.subTitle}>Open Source is Explicit</h3>
          <p className={styles.body}>
            In the context of software, &ldquo;open source&rdquo; describes a codebase that is
            visible to all. Not only does this allow it to be audited by anyone — it also allows
            anyone to copy and modify its contents, put them to their own use. While democracy was
            certainly a step toward open source when compared to monarchy, much of the operating
            system remains in the sphere of culture: an implicit understanding of &lsquo;how
            things get done&rsquo;. Here is where the specifics of open source software lend a
            powerful example.
          </p>
          <p className={styles.body}>
            Creating open source cultural practices, then, is not just about revealing secrets —
            it is about making the necessary steps (or thoughts and beliefs) explicit.
          </p>
          <p className={styles.body}>
            Holoscopic is explicit in that each social map frames a very specific conversation
            space, and sequences of maps allow groups to navigate a specific chain of thought.
            Both of these are visible and repeatable.
          </p>

          <h3 className={styles.subTitle}>Open Source is Evolutionary</h3>
          <p className={styles.body}>
            The open source software movement has generated tools used by billions and collective
            knowledge and technologies worth trillions. All of this is made possible not just
            through hard work and goodwill but with a piece of technology for making the
            development process visible to and modifiable by the crowd.
          </p>
          <p className={styles.body}>
            Git and GitHub are pieces of crucial infrastructure that enable asynchronous global
            collaboration, revealing not just the final product but every incremental change to
            the system. The experiments and missteps, the negotiations between collaborators —
            every step of the process remains accessible to all. When a party wants to take a
            piece of code in a new direction, copying the codebase to a new project is called
            &ldquo;forking.&rdquo; What results is a complete tree of decisions, divergences and
            convergences that reveal not just what worked but the process through which it came
            about.
          </p>
          <p className={styles.body}>
            Holoscopic is evolutionary in that sequences can be copied and altered. Users can
            begin with established tools and make nudging improvements or adapt them to their
            community. The evolution of how the collective accesses key ideas becomes visible
            through the chain of adaptations as they work their way through the community.
          </p>

          <h2 className={styles.sectionTitle}>Activity: Running Human Code</h2>

          <p className={styles.body}>
            Certain patterns are both so deeply aligned and profoundly powerful that upon their
            initiation they spread and evolve infinitely. Life is the best example — a pattern of
            wholes (bacteria, cell, organism) forming larger emergent wholes (individual, society,
            planet). The goal here is to witness and develop knowledge about this process as
            applied to ideas.
          </p>

          <h3 className={styles.subTitle}>Identify a topic</h3>
          <p className={styles.body}>
            Pick a topic for the group to explore. Design a social mapping sequence.
          </p>

          <h3 className={styles.subTitle}>Initiate feedback loop</h3>
          <p className={styles.body}>
            Set up a sequence of social maps in the Holoscopic app and invite community to join.
            These act as the seed for a collective conversation.
          </p>

          <h3 className={styles.subTitle}>Let the collective steer</h3>
          <p className={styles.body}>
            Allow the crowd to take over. Participants can propose their own social maps, vote on
            which to complete.
          </p>

          <h3 className={styles.subTitle}>Visualize the results</h3>
          <p className={styles.body}>
            Graph the evolution of maps.
          </p>

          <h3 className={styles.subTitle}>Close and Document</h3>
          <p className={styles.body}>
            After participation drops or a set period of time, close the sequence and document on
            the wiki.
          </p>

        </div>

        {/* Series Nav */}
        <div className={styles.seriesNav}>
          <p className={styles.seriesLabel}>This series</p>
          <div className={styles.seriesLinks}>
            <Link href="/essays/maps-transform-the-world" className={styles.seriesLink}>
              ← Part 1 — Maps Transform the World
            </Link>
            <Link href="/essays/studying-collective-identity" className={styles.seriesLink}>
              ← Part 2 — Studying Collective Identity
            </Link>
            <span className={`${styles.seriesLink} ${styles.seriesLinkCurrent}`}>
              Part 3 — Open Source Social Algorithms
            </span>
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
