'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

interface Instance {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  active: boolean;
  access: { mode: string };
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em' };
const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: 999,
  fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
  textTransform: 'uppercase', background: color === 'green' ? '#d1fae5' : color === 'red' ? '#fee2e2' : '#f3f4f6',
  color: color === 'green' ? '#065f46' : color === 'red' ? '#991b1b' : '#374151',
});

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InstancesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    apiFetch('/instances', { userId: user.id })
      .then(d => setInstances(d.instances))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Holoscopic Platform</span>
          <button onClick={() => { localStorage.removeItem('hs_platform_user'); router.replace('/login'); }}
            style={{ ...mono, background: 'none', border: 'none', color: 'var(--ink-light)', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Instances</h1>
          <Link href="/instances/new" style={{
            padding: '0.5rem 1rem', borderRadius: 6, background: 'var(--ink)', color: '#fff',
            fontSize: '0.8rem', fontWeight: 600,
          }}>
            + New Instance
          </Link>
        </div>

        {loading && <p style={{ color: 'var(--ink-light)', ...mono }}>Loading…</p>}
        {error && <p style={{ color: 'var(--accent)', ...mono }}>{error}</p>}

        {!loading && !error && instances.length === 0 && (
          <p style={{ color: 'var(--ink-light)', ...mono }}>No instances yet.</p>
        )}

        {!loading && instances.length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Name', 'Domains', 'Access', 'Status', 'Dates', ''].map(h => (
                    <th key={h} style={{ ...mono, padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instances.map((inst, i) => (
                  <tr key={inst.id} style={{ borderBottom: i < instances.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{inst.name}</div>
                      <div style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.15rem' }}>{inst.slug}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ ...mono, color: 'var(--ink-mid)' }}>
                        {inst.domains.length > 0 ? inst.domains.join(', ') : <span style={{ color: 'var(--ink-light)' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={badge(inst.access.mode === 'invite' ? 'gray' : 'green')}>{inst.access.mode}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={badge(inst.active ? 'green' : 'red')}>{inst.active ? 'active' : 'inactive'}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ ...mono, color: 'var(--ink-light)' }}>
                        {inst.startDate || inst.endDate ? `${formatDate(inst.startDate)} → ${formatDate(inst.endDate)}` : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Link href={`/instances/${inst.id}`} style={{ ...mono, color: 'var(--accent)', fontWeight: 500 }}>Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
