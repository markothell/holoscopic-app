'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminNav from '@/components/AdminNav';
import { AdminApi, type WaitlistData } from '@/lib/adminApi';

// Waitlist signups, grouped by the sequence they signed up for. Moved out of
// the game app's /admin page.
//
// Emails stay collapsed behind a per-sequence toggle rather than rendering by
// default. These are addresses people gave for one thing, and a page that
// prints all of them the moment it opens is a page that gets left on a screen
// in a room with other people in it.

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em',
};
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '1rem 1.25rem',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WaitlistPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [data, setData] = useState<WaitlistData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    AdminApi.waitlist()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (isLoading || !user) return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Waitlist</h1>
            <p style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.2rem' }}>
              {data ? `${data.total} signup${data.total === 1 ? '' : 's'}` : '—'}
            </p>
          </div>
          <button
            onClick={load}
            style={{ ...mono, padding: '0.45rem 0.9rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-mid)' }}
          >
            Refresh
          </button>
        </div>

        {loading && <p style={{ ...mono, color: 'var(--ink-light)' }}>Loading…</p>}
        {error && <p style={{ ...mono, color: 'var(--accent)' }}>{error}</p>}

        {data && !loading && (
          data.sequences.length === 0 ? (
            <p style={{ ...mono, color: 'var(--ink-light)' }}>No waitlist signups yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {data.sequences.map(seq => {
                const open = expanded === seq.sequenceId;
                return (
                  <div key={seq.sequenceId} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{seq.title}</div>
                        <div style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span>{seq.count} signup{seq.count === 1 ? '' : 's'}</span>
                          {seq.urlName && <span>/{seq.urlName}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => setExpanded(open ? null : seq.sequenceId)}
                        aria-expanded={open}
                        style={{ ...mono, flexShrink: 0, padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-mid)' }}
                      >
                        {open ? 'Hide emails' : 'View emails'}
                      </button>
                    </div>

                    {open && (
                      seq.emails.length === 0 ? (
                        <p style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.75rem' }}>No signups yet</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['Email', 'Joined'].map(h => (
                                <th key={h} style={{ ...mono, padding: '0.4rem 0', textAlign: 'left', color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400 }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {seq.emails.map((e, i) => (
                              <tr key={`${e.email}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ ...mono, padding: '0.4rem 0', fontSize: '0.7rem', wordBreak: 'break-all' }}>{e.email}</td>
                                <td style={{ ...mono, padding: '0.4rem 0', color: 'var(--ink-light)', width: 130 }}>{formatDate(e.joinedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
}
