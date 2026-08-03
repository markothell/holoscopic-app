'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';

// The one header for the whole admin. Extracted when the app went from two
// pages to five — the header had already been copy-pasted twice by then, and a
// nav that is duplicated per page is a nav where one page quietly loses an
// entry and nobody notices for a month.

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/instances', label: 'Instances' },
  { href: '/traffic', label: 'Traffic' },
  { href: '/users', label: 'Users' },
  { href: '/waitlist', label: 'Waitlist' },
];

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em',
};

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Holoscopic Platform</span>
          <nav style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap' }}>
            {LINKS.map(l => {
              // Exact match for the overview, prefix for the rest — otherwise
              // "/" is current on every page in the app.
              const current = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
              return current ? (
                <span key={l.href} style={{ ...mono, color: 'var(--ink)', fontWeight: 600 }}>{l.label}</span>
              ) : (
                <Link key={l.href} href={l.href} style={{ ...mono, color: 'var(--ink-light)' }}>{l.label}</Link>
              );
            })}
          </nav>
        </div>
        <button
          onClick={() => { localStorage.removeItem('hs_platform_user'); router.replace('/login'); }}
          style={{ ...mono, background: 'none', border: 'none', color: 'var(--ink-light)', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
