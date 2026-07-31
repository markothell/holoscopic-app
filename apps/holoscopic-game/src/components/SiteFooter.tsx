import Link from 'next/link';
import styles from './SiteFooter.module.css';

// The site's one footer, so Contact reaches every page that has one.
//
// This is the homepage footer lifted out of page.tsx unchanged apart from the
// new Contact link. Before it, the only address anywhere on holoscopic.io was
// unlinked plain text at the end of an essay — and misspelled — which meant a
// visitor arriving from a Chorus memorial had no way to reach a person at all.
//
// Deliberately not a nav. It carries who made this, where the code is, where
// the writing is, and how to get in touch. Anything structural belongs in a
// header, which this site does not yet have.

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.text}>
          Made by{' '}
          <Link href="/essays/a-personal-story" className={styles.link}>
            Mo
          </Link>
          &nbsp;&middot;&nbsp;{' '}
          <Link href="/contact" className={styles.link}>
            Contact
          </Link>
          &nbsp;&middot;&nbsp;{' '}
          <a
            href="https://github.com/markothell/holoscopic-app"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Open source
          </a>
          &nbsp;&middot;&nbsp;{' '}
          <a
            href="https://markothell.substack.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Seeing Wholes
          </a>
        </span>
        <Link href="/manifesto" className={`${styles.text} ${styles.link}`}>
          Read the manifesto &rarr;
        </Link>
      </div>
    </footer>
  );
}
