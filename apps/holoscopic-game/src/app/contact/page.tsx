import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/SiteFooter';
import ContactForm from './ContactForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Contact — Holoscopic',
  description: 'Reach the person who makes Holoscopic.',
};

// The form is a client component; this shell stays a Server Component so the
// page carries real metadata. Someone lands here from a link a friend sent
// them, and the tab title is the first thing that says where they are.

export default function ContactPage() {
  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.inner}>
        <p className={styles.eyebrow}>Get in touch</p>
        <h1 className={styles.title}>Contact</h1>

        <ContactForm />

        <Link href="/" className={styles.eyebrow} style={{ display: 'block', marginTop: '3rem' }}>
          &larr; all activities
        </Link>
      </div>

      <SiteFooter />
    </div>
  );
}
