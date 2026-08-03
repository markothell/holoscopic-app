'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import AdminNav from '@/components/AdminNav';
import { AdminApi, type PlatformStats } from '@/lib/adminApi';

// The admin's front door. It used to redirect straight to /instances, which
// was right when instances were the only thing here.
//
// These six counters are PARTICIPATION, all-time: how much has been made and
// done on the platform. Traffic is the other question — how many people
// arrived — and lives on its own page. Keeping them apart matters because they
// move independently and the failure mode of mixing them is reading a busy
// week of visitors as a busy week of play.

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em',
};
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '1.25rem',
};

const TILES: Array<{ key: keyof PlatformStats; label: string }> = [
  { key: 'users', label: 'Users' },
  { key: 'activities', label: 'Activities' },
  { key: 'sequences', label: 'Sequences' },
  { key: 'participants', label: 'Participants' },
  { key: 'comments', label: 'Comments' },
  { key: 'votes', label: 'Votes' },
];

const SHORTCUTS = [
  { href: '/instances', label: 'Instances', note: 'create and configure editions' },
  { href: '/traffic', label: 'Traffic', note: 'who arrived, and from where' },
  { href: '/users', label: 'Users', note: 'roles, access, password resets' },
  { href: '/waitlist', label: 'Waitlist', note: 'signups per sequence' },
];

export default function OverviewPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    AdminApi.stats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Overview</h1>
        <p style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.2rem', marginBottom: '1.5rem' }}>
          Everything made on the platform, all time
        </p>

        {loading && <p style={{ ...mono, color: 'var(--ink-light)' }}>Loading…</p>}
        {error && <p style={{ ...mono, color: 'var(--accent)' }}>{error}</p>}

        {stats && (
          // 120px, not 140: at the 960px content width six tiles plus five
          // gaps need 800px and fit on one row, where 140 left a single
          // orphan wrapping underneath five.
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
            {TILES.map(({ key, label }) => (
              <div key={key} style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.1 }}>
                  {stats[key].toLocaleString()}
                </div>
                <div style={{ ...mono, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.4rem' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          {SHORTCUTS.map(s => (
            <Link key={s.href} href={s.href} style={{ ...card, display: 'block' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.label}</div>
              <div style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.3rem' }}>{s.note}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
