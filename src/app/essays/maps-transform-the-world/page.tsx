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
            <span className={styles.line1}>How Maps</span>
            <span className={styles.line2}>Transform the World</span>
          </h1>
        </header>

        <img
          src="/worldBanner.png"
          alt="Earth from space"
          style={{ width: '100%', display: 'block', borderRadius: '8px', marginBottom: '2rem' }}
        />

        <div className={styles.divider} />

        {/* Content */}
        <div className={styles.essayContent}>

          <h2 className={styles.sectionTitle}>Making the World</h2>

          <p className={styles.body}>
            Early maps were directions. One person reading the needs of another and sketching a
            path: over the hill, through the pine trees, cross the stream by the big rock.
          </p>
          <p className={styles.body}>
            The known world had a center — the village, the valley, the familiar — and an edge
            past which things became dangerous or simply unknown. A map was a tool for extending
            safe passage a little further into that unknown. It was personal, local, and built
            from the perspective of whoever was drawing it.
          </p>
          <p className={styles.body}>
            This changed as trade routes expanded across continents. Maps became assets. Explorers
            and merchants carried them, revised them and brought them back. The next generation
            copied those revisions and pushed further. Over time, competing versions of the same
            territory could be compared — the errors identified, the reliable details confirmed.
            Map-making became a collective knowledge project, cumulative across generations in a
            way no individual journey could be.
          </p>
          <p className={styles.body}>
            Then something more monumental happened. Through the study of the night sky and the
            slow accumulation of explorers&apos; accounts, a new idea took hold: all the far lands
            of the world connected. The edge wasn&apos;t an edge. The flat map with its fuzzy
            unknown perimeter was actually a section of a sphere. At some point this stopped being
            a theory and became a perception — the world &lsquo;became&rsquo; whole.
          </p>
          <p className={styles.body}>
            This was a phase transition in the mind of man. The project of map-making changed in
            kind. It was no longer about extending the boundary of the known — it was about filling
            in a complete object. And because the object was now whole and shared, it became a
            framework that all peoples could contribute to. Earth scientists, industrial planners,
            navigators, governments — anyone with data to contribute could map it onto the same
            surface. Coordinate systems replaced local landmarks. Layers of unrelated knowledge
            became interoperable because they shared a common substrate. What had begun as personal
            directions between individuals became the infrastructure for global coordination.
          </p>

          <div className={styles.divider} />

          <h2 className={styles.sectionTitle}>Mapping Culture</h2>

          <p className={styles.body}>
            If we look at the evolution of the globe we can see it didn&apos;t begin with an
            abstract global intention — just a simple but compelling desire. Trade, for example.
            The realization that other, different people had something interesting and valuable that
            &lsquo;our&rsquo; people didn&apos;t have.
          </p>
          <p className={styles.body}>
            The human world is a collection of disparate cultures. There are people that live with
            the rhythms of the plants and the earth. There are people who live in glass towers
            insulated from these cycles. Some people view humanity as a competition to crown the
            greatest, others to raise our collective baseline. We are divided. Or so it seems. We
            all want something. We all start from somewhere and must take a journey to find it. In
            this way we are primed for the project of mapping our culture.
          </p>
          <p className={styles.body}>
            People are already busy creating maps for others to follow. Millions have documented
            their journeys — in courses, workshops, therapeutic modalities, and social feeds —
            representing genuinely different starting points, different terrains, different
            destinations. The self-help movement, the explosion of online courses, the endless
            stream of people narrating their experience on social media: all of it is cartography.
            Personal maps of the human journey, more widely distributed and immediately accessible
            than at any point in history.
          </p>
          <p className={styles.body}>
            The problem is that none of it accumulates. A course reaches ten thousand people and
            the collective insight from those ten thousand journeys mostly disappears. A thread
            about someone&apos;s experience with grief or transformation gets millions of
            engagements and then scrolls away. The knowledge doesn&apos;t compound the way
            scientific knowledge compounds — each iteration building on the last, errors corrected,
            patterns confirmed across independent observations. We are still in the stage of
            individual explorers returning with their accounts. The infrastructure that would turn
            those accounts into a shared, cumulative understanding of the terrain doesn&apos;t yet
            exist.
          </p>

          <div className={styles.divider} />

          <h2 className={styles.sectionTitle}>Seeing the Whole</h2>

          <p className={styles.body}>
            At the heart of this project is the belief that humanity is whole. Watch the news and
            this may be difficult to believe, but then war or no, humanity has focused much of its
            knowledge on creating taxonomies of difference. Country, religion, race, class — the
            language of separation is precise and well-developed. We now have the challenge of
            developing a new skillset: seeing wholes.
          </p>
          <p className={styles.body}>
            There are methodologies that have worked this out at the individual scale. Internal
            Family Systems is one. It doesn&apos;t begin by filtering out the unwanted parts of
            the psyche — it begins by learning to hold all the parts in view at once, observing
            the roles they play and the relationships between them. The result is not the
            elimination of conflict but a shift in perception: from fragmentation to a self that
            can see itself whole.
          </p>
          <p className={styles.body}>
            Life gives us our &lsquo;compelling desires&rsquo;. We all navigate desire and loss,
            connection and isolation, the gap between who we are and who we want to be. The
            starting points differ. The terrain differs. But the fact of the journey is shared.
            All we need is a framework that allows us to stitch together our varied experiences of
            that desire into a cohesive whole.
          </p>
          <p className={styles.body}>
            Holoscopic is built to do this. It asks people to place their experience and
            perspective within a shared framework — not to flatten those perspectives into
            consensus, but to make them spatially legible in relation to each other. Each
            contribution is a data point in a collective map. Over time, across activities,
            communities and topics, a knowledge graph accumulates.
          </p>
          <p className={styles.body}>
            The goal is the same perceptual shift the globe produced: from a collection of
            defended territories to a single human project that everyone is contributing to and
            navigating within. Not a utopia of agreement, but a change in relationship — from
            competition over scarce authority to the collective harvesting of the ways we are
            growing, together. Our bet is that, much the way the globe has enabled an acceleration
            of mapping technologies, so can we inspire a wave of whole human cultural technologies.
          </p>
          <p className={styles.body}>
            More details about our approach in the essays that follow.
          </p>

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
