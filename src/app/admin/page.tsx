'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import { AdminService, PlatformStats, AdminUser, WaitlistData } from '@/services/adminService';
import styles from './page.module.css';

type Tab = 'analytics' | 'users' | 'waitlist';

export default function SuperAdminPage() {
  const router = useRouter();
  const { userId, userRole, isAuthenticated, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('analytics');

  // Analytics state
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Waitlist state
  const [waitlist, setWaitlist] = useState<WaitlistData | null>(null);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  const loadStats = useCallback(async () => {
    if (!userId) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await AdminService.getPlatformStats(userId);
      setStats(data);
    } catch {
      setStatsError('Failed to load platform stats.');
    } finally {
      setStatsLoading(false);
    }
  }, [userId]);

  const loadUsers = useCallback(async () => {
    if (!userId) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await AdminService.getUsers(userId);
      setUsers(data);
    } catch {
      setUsersError('Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  }, [userId]);

  const loadWaitlist = useCallback(async () => {
    if (!userId) return;
    setWaitlistLoading(true);
    setWaitlistError(null);
    try {
      const data = await AdminService.getWaitlist(userId);
      setWaitlist(data);
    } catch {
      setWaitlistError('Failed to load waitlist.');
    } finally {
      setWaitlistLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') return;
    if (tab === 'analytics') loadStats();
    if (tab === 'users') loadUsers();
    if (tab === 'waitlist') loadWaitlist();
  }, [tab, isAuthenticated, userRole, loadStats, loadUsers, loadWaitlist]);

  const handleRoleToggle = async (user: AdminUser) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? 'promote to admin' : 'demote to user';
    if (!confirm(`${action} ${user.email}?`)) return;
    try {
      await AdminService.updateUserRole(userId!, user.id, newRole);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update role');
    }
  };

  const handleStatusToggle = async (user: AdminUser) => {
    const newStatus = !user.isActive;
    const action = newStatus ? 'activate' : 'deactivate';
    if (!confirm(`${action} ${user.email}?`)) return;
    try {
      await AdminService.updateUserStatus(userId!, user.id, newStatus);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: newStatus } : u));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update status');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredUsers = search
    ? users.filter(u =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (authLoading) {
    return <div className={styles.loading}>Loading…</div>;
  }

  if (!isAuthenticated) {
    router.replace('/login');
    return null;
  }

  if (userRole !== 'admin') {
    return (
      <div className={styles.denied}>
        <div className={styles.deniedCard}>
          <h1 className={styles.deniedTitle}>Access Denied</h1>
          <p className={styles.deniedText}>This area is restricted to platform administrators.</p>
          <Link href="/dashboard" className={styles.deniedLink}>Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link href="/" className={styles.wordmark}>
              Holo<span className={styles.wordmarkAccent}>scopic</span>
            </Link>
            <span className={styles.pageLabel}>/ Admin</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Platform Admin</h1>

        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'analytics' ? styles.tabActive : ''}`}
            onClick={() => setTab('analytics')}
          >
            Analytics
          </button>
          <button
            className={`${styles.tab} ${tab === 'users' ? styles.tabActive : ''}`}
            onClick={() => setTab('users')}
          >
            Users
          </button>
          <button
            className={`${styles.tab} ${tab === 'waitlist' ? styles.tabActive : ''}`}
            onClick={() => setTab('waitlist')}
          >
            Waitlist
          </button>
        </nav>

        {tab === 'analytics' && (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Platform Stats</h2>
              <button className={styles.secondaryBtn} onClick={loadStats}>Refresh</button>
            </div>

            {statsLoading && <p className={styles.loading} style={{ minHeight: 'auto', padding: '2rem 0' }}>Loading…</p>}
            {statsError && <p className={styles.errorText}>{statsError}</p>}

            {stats && !statsLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '1rem' }}>
                {[
                  { label: 'Users', value: stats.users },
                  { label: 'Activities', value: stats.activities },
                  { label: 'Sequences', value: stats.sequences },
                  { label: 'Participants', value: stats.participants },
                  { label: 'Comments', value: stats.comments },
                  { label: 'Votes', value: stats.votes },
                ].map(({ label, value }) => (
                  <div key={label} className={styles.card} style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
                    <div style={{
                      fontFamily: 'var(--font-barlow), sans-serif',
                      fontSize: '2.2rem',
                      fontWeight: 700,
                      color: 'var(--ink)',
                      lineHeight: 1,
                    }}>
                      {value.toLocaleString()}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-dm-mono), monospace',
                      fontSize: '0.58rem',
                      fontWeight: 300,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase' as const,
                      color: 'var(--ink-light)',
                      marginTop: '0.5rem',
                    }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'users' && (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Users</h2>
              <button className={styles.secondaryBtn} onClick={loadUsers}>Refresh</button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '24rem',
                  padding: '0.5rem 0.75rem',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: '0.68rem',
                  letterSpacing: '0.05em',
                  border: '1px solid var(--rule)',
                  borderRadius: '4px',
                  background: '#fff',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>

            {usersLoading && <p className={styles.loading} style={{ minHeight: 'auto', padding: '2rem 0' }}>Loading…</p>}
            {usersError && <p className={styles.errorText}>{usersError}</p>}

            {!usersLoading && !usersError && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead className={styles.tableHead}>
                    <tr>
                      <th className={styles.th}>Name / Email</th>
                      <th className={styles.th}>Role</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Last Login</th>
                      <th className={styles.th}>Joined</th>
                      <th className={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 && (
                      <tr className={styles.tr}>
                        <td className={styles.td} colSpan={6} style={{ textAlign: 'center' }}>
                          <span className={styles.empty} style={{ padding: '1.5rem 0', display: 'block' }}>
                            No users found
                          </span>
                        </td>
                      </tr>
                    )}
                    {filteredUsers.map(user => {
                      const isSelf = user.id === userId;
                      return (
                        <tr key={user.id} className={styles.tr}>
                          <td className={styles.td}>
                            <div className={styles.tdTitle} style={{ fontSize: '0.9rem' }}>
                              {user.name || <span style={{ color: 'var(--ink-light)', fontStyle: 'italic', fontFamily: 'var(--font-cormorant), Georgia, serif' }}>No name</span>}
                            </div>
                            <div className={styles.tdSub}>{user.email}</div>
                          </td>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${user.role === 'admin' ? styles.badgeActive : styles.badgeDraft}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <span className={`${styles.badge} ${user.isActive ? styles.badgeActive : styles.badgeCompleted}`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', color: 'var(--ink-light)' }}>
                              {formatDate(user.lastLoginAt)}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', color: 'var(--ink-light)' }}>
                              {formatDate(user.createdAt)}
                            </span>
                          </td>
                          <td className={styles.td}>
                            <div className={styles.actions}>
                              <button
                                className={`${styles.actionBtn} ${user.role === 'admin' ? styles.actionDelete : styles.actionEdit}`}
                                onClick={() => handleRoleToggle(user)}
                                disabled={isSelf}
                                title={isSelf ? 'Cannot change your own role' : ''}
                                style={{ opacity: isSelf ? 0.3 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                              >
                                {user.role === 'admin' ? 'Demote' : 'Promote'}
                              </button>
                              <span className={styles.actionDot}>·</span>
                              <button
                                className={`${styles.actionBtn} ${user.isActive ? styles.actionDelete : styles.actionComplete}`}
                                onClick={() => handleStatusToggle(user)}
                                disabled={isSelf}
                                title={isSelf ? 'Cannot change your own status' : ''}
                                style={{ opacity: isSelf ? 0.3 : 1, cursor: isSelf ? 'not-allowed' : 'pointer' }}
                              >
                                {user.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {tab === 'waitlist' && (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                Waitlist
                {waitlist && (
                  <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', fontWeight: 300, letterSpacing: '0.1em', color: 'var(--ink-light)', marginLeft: '0.75rem', textTransform: 'none' }}>
                    {waitlist.total} total
                  </span>
                )}
              </h2>
              <button className={styles.secondaryBtn} onClick={loadWaitlist}>Refresh</button>
            </div>

            {waitlistLoading && <p className={styles.loading} style={{ minHeight: 'auto', padding: '2rem 0' }}>Loading…</p>}
            {waitlistError && <p className={styles.errorText}>{waitlistError}</p>}

            {waitlist && !waitlistLoading && (
              <div className={styles.cardList}>
                {Object.entries(waitlist.topics).map(([topic, data]) => {
                  const isExpanded = expandedTopic === topic;
                  return (
                    <div key={topic} className={styles.card}>
                      <div className={styles.cardTop}>
                        <div>
                          <div className={styles.cardTitle}>{topic}</div>
                          <div className={styles.cardMeta}>
                            <span>{data.count} / 25 signups</span>
                          </div>
                        </div>
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => setExpandedTopic(isExpanded ? null : topic)}
                          style={{ flexShrink: 0 }}
                        >
                          {isExpanded ? 'Hide emails' : 'View emails'}
                        </button>
                      </div>

                      {/* Progress bar */}
                      <div style={{
                        height: '3px',
                        background: 'var(--rule)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        marginBottom: isExpanded ? '1rem' : 0,
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min((data.count / 25) * 100, 100)}%`,
                          background: 'var(--accent)',
                          borderRadius: '2px',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>

                      {isExpanded && (
                        <div>
                          {data.emails.length === 0 ? (
                            <p className={styles.empty} style={{ padding: '0.5rem 0', textAlign: 'left' }}>No signups yet</p>
                          ) : (
                            <div className={styles.tableWrap} style={{ marginTop: '0.5rem' }}>
                              <table className={styles.table}>
                                <thead className={styles.tableHead}>
                                  <tr>
                                    <th className={styles.th}>Email</th>
                                    <th className={styles.th}>Joined</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.emails.map((entry, i) => (
                                    <tr key={i} className={styles.tr}>
                                      <td className={styles.td}>
                                        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', letterSpacing: '0.03em' }}>
                                          {entry.email}
                                        </span>
                                      </td>
                                      <td className={styles.td}>
                                        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', color: 'var(--ink-light)' }}>
                                          {formatDate(entry.joinedAt)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
