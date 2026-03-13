'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from '../essay.module.css';

export default function APersonalStoryPage() {
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
          <p className={styles.heroEyebrow}>A personal story</p>
          <h1 className={styles.heroTitle}>
            <span className={styles.line1}>Seeing</span>
            <span className={styles.line2}>Wholes</span>
          </h1>

        </header>

        <div className={styles.divider} />

        {/* Content */}
        <div className={styles.essayContent}>

          <p className={styles.body}>
            Greetings, MO here.
          </p>

          <p className={styles.body}>
            The inception of this project goes back to a time in my life when I had given up. I felt
            defeated, was in chronic pain and thinking about ending my life. I won&apos;t go into
            that story here but I want to share some of the first insights that helped me begin again
            because they were the basis for this work.
          </p>

          <p className={styles.body}>
            I decided to give up on improving myself for a year and noticed something surprising. I
            watched the pendulum swing of my desire move from practical to idealistic, each turn with
            a kind of distaste for the last. My mind was literally at war. There were two distinct
            characters trying to steer my life. One was a dreamer, an inspired idealist, the other
            was pragmatic, reliable, safe.
          </p>

          <p className={styles.body}>
            They were wrestling for control. But for what? Nominally, &lsquo;they&rsquo; wanted
            &lsquo;me&rsquo; to be happy and prosperous. Not only did they have different methods and
            weren&apos;t talking to each other, they didn&apos;t even know the other existed in a
            sense. Just observing this was the seed of the journey I have been on since.
          </p>

          <p className={styles.body}>
            I observed entrenched arguments between people with fresh eyes, situations where both had
            good intentions but where different frames of reference had them at a deadlock.
          </p>

          <p className={styles.body}>
            I marveled at this same pattern at work within our culture&mdash;peoples separated by
            race, class, region, language were carrying out similar arguments, fighting for control of
            our ideals, laws, power, money, etc., none able to see that their relationship with the
            opposition was what truly defined their experience.
          </p>

          <p className={styles.body}>
            As the years passed I also saw solutions&hellip;
          </p>

          <p className={styles.body}>
            Within myself I saw how giving time to both aspects of my fractured psyche yielded
            gradual refinement, a rhythmic convergence on my true purpose.
          </p>

          <p className={styles.body}>
            Others, who I presume have completed this journey, left social technologies that allow
            others to follow their path, within their mind (Internal Family Systems) and in their
            relationships (Hendrix + Hunt&apos;s Imago Dialogue). There are many examples but these
            touched me personally. Simple executable steps that transform people&apos;s relationship
            to the world. For me this was a revelation: individuals can understand the world and pass
            that understanding on in a cascade of functionality that gradually moves the culture.
          </p>

          <p className={styles.body}>
            Today, I flip through social media and see people offering their experience to others,
            working to translate it into the kind of knowledge that others can follow. They are
            influencers, run courses, spark communities. And while I see the teacher/student dynamic
            as a remnant of old domination systems I feel the soil of the human mind is primed for a
            new blossoming.
          </p>

          <p className={styles.body}>
            I marvel at the{' '}
            <a
              href="https://en.wikipedia.org/wiki/Open_source"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerLink}
            >
              open source
            </a>
            {' '}technologies that allow this worldwide connection. So much of what makes the
            internet work is a result of things built by communities scattered across the globe and
            given to the collective.
          </p>

          <p className={styles.body}>
            Holoscopic is my attempt to create a learning place and knowledge base for cross-cultural
            understanding. A place to seek out difference for the purpose of charting pathways to
            unification not in the form of thought coordination but by generating social technologies
            that allow us to operate in resonance with each other.
          </p>

          <p className={styles.body}>
            The focal point of that idealistic effort, the place where this project is focused, is
            not in getting the best knowledge holders to contribute their authority or &ldquo;get the
            results&rdquo; in any way. And this connects with my reason for sharing my story.
            Holoscopic means &ldquo;seeing wholes&rdquo;. Just by seeing ourselves, by seeing each
            other, we are launched on the journey of creation that gives birth to our highest
            potentials. I&apos;m eager to learn this skill and build tools that facilitate it, in
            community with the many beautiful people sharing this moment.
          </p>

          <p className={styles.body}>
            If you have anything you&apos;d like to say, please email me: mo[at]holoscopi.io
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
