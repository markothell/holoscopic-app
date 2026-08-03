'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AdminNav from '@/components/AdminNav';
import { AdminApi, type AdminUser } from '@/lib/adminApi';

// User administration, moved out of the game app's /admin page.
//
// The three guards that were there are still here, because each one is
// protecting against a different way of locking yourself out or handing
// somebody else the keys:
//   • you cannot change your OWN role or status — the fastest way to lose
//     admin on a platform with no other admin is to demote yourself;
//   • both destructive toggles confirm first;
//   • a reset password is shown once, in a prompt, and stored nowhere.

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.05em',
};
const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, overflow: 'hidden',
};
const badge = (tone: 'on' | 'off' | 'neutral'): React.CSSProperties => ({
  display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: 999,
  fontSize: '0.6rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
  textTransform: 'uppercase',
  background: tone === 'on' ? '#d1fae5' : tone === 'off' ? '#fee2e2' : '#f3f4f6',
  color: tone === 'on' ? '#065f46' : tone === 'off' ? '#991b1b' : '#374151',
});
const actionBtn = (disabled = false): React.CSSProperties => ({
  ...mono, background: 'none', border: 'none', padding: 0,
  color: disabled ? 'var(--ink-light)' : 'var(--accent)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
});

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function UsersPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    AdminApi.users()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function toggleRole(target: AdminUser) {
    const role = target.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`${role === 'admin' ? 'Promote to admin' : 'Demote to user'}: ${target.email}?`)) return;
    try {
      await AdminApi.setRole(target.id, role);
      setUsers(prev => prev.map(u => (u.id === target.id ? { ...u, role } : u)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update role');
    }
  }

  async function toggleActive(target: AdminUser) {
    const isActive = !target.isActive;
    if (!confirm(`${isActive ? 'Activate' : 'Deactivate'} ${target.email}?`)) return;
    try {
      await AdminApi.setActive(target.id, isActive);
      setUsers(prev => prev.map(u => (u.id === target.id ? { ...u, isActive } : u)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update status');
    }
  }

  async function resetPassword(target: AdminUser) {
    if (!confirm(`Reset password for ${target.email}? A temporary password will be shown once.`)) return;
    try {
      const { tempPassword } = await AdminApi.resetPassword(target.id);
      prompt(`Temporary password for ${target.email} (copy it now):`, tempPassword);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to reset password');
    }
  }

  if (isLoading || !user) return null;

  const shown = search
    ? users.filter(u =>
        u.name?.toLowerCase().includes(search.toLowerCase())
        || u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div style={{ minHeight: '100vh' }}>
      <AdminNav />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Users</h1>
            <p style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.2rem' }}>
              {users.length} account{users.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={load}
            style={{ ...mono, padding: '0.45rem 0.9rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink-mid)' }}
          >
            Refresh
          </button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            width: '100%', maxWidth: 360, padding: '0.5rem 0.75rem', marginBottom: '1rem',
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
          }}
        />

        {loading && <p style={{ ...mono, color: 'var(--ink-light)' }}>Loading…</p>}
        {error && <p style={{ ...mono, color: 'var(--accent)' }}>{error}</p>}

        {!loading && !error && (
          <div style={{ ...card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  {['Name / Email', 'Role', 'Status', 'Last login', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ ...mono, padding: '0.6rem 1rem', textAlign: 'left', color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 400 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...mono, padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--ink-light)' }}>
                      No users found
                    </td>
                  </tr>
                )}
                {shown.map((u, i) => {
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id} style={{ borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {u.name || <span style={{ color: 'var(--ink-light)', fontStyle: 'italic' }}>No name</span>}
                        </div>
                        <div style={{ ...mono, color: 'var(--ink-light)', marginTop: '0.15rem' }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={badge(u.role === 'admin' ? 'on' : 'neutral')}>{u.role}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={badge(u.isActive ? 'on' : 'off')}>{u.isActive ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ ...mono, padding: '0.75rem 1rem', color: 'var(--ink-light)' }}>{formatDate(u.lastLoginAt)}</td>
                      <td style={{ ...mono, padding: '0.75rem 1rem', color: 'var(--ink-light)' }}>{formatDate(u.createdAt)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => toggleRole(u)}
                            disabled={isSelf}
                            title={isSelf ? 'You cannot change your own role' : ''}
                            style={actionBtn(isSelf)}
                          >
                            {u.role === 'admin' ? 'Demote' : 'Promote'}
                          </button>
                          <span style={{ color: 'var(--ink-light)' }}>·</span>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={isSelf}
                            title={isSelf ? 'You cannot change your own status' : ''}
                            style={actionBtn(isSelf)}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <span style={{ color: 'var(--ink-light)' }}>·</span>
                          <button onClick={() => resetPassword(u)} style={actionBtn()}>Reset PW</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
