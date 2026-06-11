'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import { AdminService, PlatformStats, AdminUser, WaitlistData } from '@/services/adminService';
import styles from './page.module.css';

type Tab = 'analytics' | 'users' | 'waitlist' | 'config';

interface HolonConfig { startingStake: number; nominationCost: number; supportCost: number; algorithmPublishCost: number; sessionHostReward: number; sessionParticipantReward: number; topicQuorumReward: number; algorithmRoyaltyPercent: number; forkRoyaltyDecayPercent: number; forkDepthCap: number; }
interface QuorumConfig { topicSupportThreshold: number; topicWindowHours: number; inquiryMinParticipants: number; frameVoteThreshold: number; }

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

  // Config state
  const [holonConfig, setHolonConfig] = useState<HolonConfig | null>(null);
  const [quorumConfig, setQuorumConfig] = useState<QuorumConfig | null>(null);
  const [topicsActivityId, setTopicsActivityId] = useState('');
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Award Holons state
  const [awardEmail, setAwardEmail] = useState('');
  const [awardAmount, setAwardAmount] = useState(100);
  const [awardResult, setAwardResult] = useState<string | null>(null);
  const [awarding, setAwarding] = useState(false);

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

  const loadConfig = useCallback(async () => {
    if (!userId) return;
    const data = await AdminService.getConfig(userId);
    setHolonConfig(data.holons);
    setQuorumConfig(data.quorum);
    setTopicsActivityId(data.topicsActivityId || '');
  }, [userId]);

  const awardHolons = async () => {
    if (!userId || !awardEmail || !awardAmount) return;
    setAwarding(true);
    setAwardResult(null);
    try {
      const data = await AdminService.awardHolons(userId, { targetUserId: awardEmail, amount: awardAmount });
      setAwardResult(`✓ ${(data as any).name || (data as any).userId} now has ${(data as any).balance} H`);
      setAwardEmail('');
    } catch (err: any) {
      setAwardResult(`Error: ${err.message}`);
    } finally {
      setAwarding(false);
    }
  };

  const saveConfig = async () => {
    if (!userId || !holonConfig || !quorumConfig) return;
    setConfigSaving(true);
    try {
      await AdminService.updateConfig(userId, { holons: holonConfig, quorum: quorumConfig, topicsActivityId });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } finally {
      setConfigSaving(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || userRole !== 'admin') return;
    if (tab === 'analytics') loadStats();
    if (tab === 'users') loadUsers();
    if (tab === 'waitlist') loadWaitlist();
    if (tab === 'config') loadConfig();
  }, [tab, isAuthenticated, userRole, loadStats, loadUsers, loadWaitlist, loadConfig]);

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
          <button
            className={`${styles.tab} ${tab === 'config' ? styles.tabActive : ''}`}
            onClick={() => setTab('config')}
          >
            Config
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
                {waitlist.sequences.length === 0 ? (
                  <p className={styles.empty}>No waitlist signups yet.</p>
                ) : (
                  waitlist.sequences.map((seq) => {
                    const isExpanded = expandedTopic === seq.sequenceId;
                    return (
                      <div key={seq.sequenceId} className={styles.card}>
                        <div className={styles.cardTop}>
                          <div>
                            <div className={styles.cardTitle}>{seq.title}</div>
                            <div className={styles.cardMeta}>
                              <span>{seq.count} signup{seq.count !== 1 ? 's' : ''}</span>
                              {seq.urlName && <span>/{seq.urlName}</span>}
                            </div>
                          </div>
                          <button
                            className={styles.secondaryBtn}
                            onClick={() => setExpandedTopic(isExpanded ? null : seq.sequenceId)}
                            style={{ flexShrink: 0 }}
                          >
                            {isExpanded ? 'Hide emails' : 'View emails'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div>
                            {seq.emails.length === 0 ? (
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
                                    {seq.emails.map((entry, i) => (
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
                  })
                )}
              </div>
            )}
          </section>
        )}
        {tab === 'config' && (
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Holon & Quorum Config</h2>
            </div>
            {(!holonConfig || !quorumConfig) && <p className={styles.loading} style={{ minHeight: 'auto', padding: '2rem 0' }}>Loading…</p>}
            {holonConfig && quorumConfig && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: '0.75rem' }}>Award Holons</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '2 1 12rem' }}>
                      <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--ink-light)', textTransform: 'uppercase' }}>User email</span>
                      <input type="email" value={awardEmail} onChange={e => setAwardEmail(e.target.value)}
                        placeholder="user@example.com"
                        style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.85rem', background: '#fff', color: 'var(--ink)', outline: 'none', width: '100%' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '0 1 6rem' }}>
                      <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--ink-light)', textTransform: 'uppercase' }}>Amount</span>
                      <input type="number" value={awardAmount} onChange={e => setAwardAmount(Number(e.target.value))}
                        style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.85rem', background: '#fff', color: 'var(--ink)', outline: 'none', width: '100%' }}
                      />
                    </label>
                    <button onClick={awardHolons} disabled={awarding || !awardEmail}
                      className={styles.secondaryBtn}
                      style={{ flexShrink: 0 }}
                    >
                      {awarding ? 'Awarding…' : 'Award'}
                    </button>
                  </div>
                  {awardResult && (
                    <p style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', color: awardResult.startsWith('✓') ? '#059669' : '#C83B50', marginTop: '0.5rem' }}>
                      {awardResult}
                    </p>
                  )}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: '0.75rem' }}>Tier Links</h3>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxWidth: '24rem' }}>
                    <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--ink-light)', textTransform: 'uppercase' }}>Topics — Activity ID</span>
                    <input
                      type="text"
                      value={topicsActivityId}
                      onChange={e => setTopicsActivityId(e.target.value)}
                      placeholder="Paste activity ID from create panel"
                      style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.85rem', background: '#fff', color: 'var(--ink)', outline: 'none', width: '100%' }}
                    />
                  </label>
                </div>

                <div>
                  <h3 style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: '0.75rem' }}>Holon Amounts</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.75rem' }}>
                    {(Object.keys(holonConfig) as (keyof HolonConfig)[]).map((key) => (
                      <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--ink-light)', textTransform: 'uppercase' }}>
                          {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </span>
                        <input type="number" value={holonConfig[key]}
                          onChange={(e) => setHolonConfig((h) => h && { ...h, [key]: Number(e.target.value) })}
                          style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.85rem', background: '#fff', color: 'var(--ink)', outline: 'none', width: '100%' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-light)', marginBottom: '0.75rem' }}>Quorum Settings</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))', gap: '0.75rem' }}>
                    {(Object.keys(quorumConfig) as (keyof QuorumConfig)[]).map((key) => (
                      <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <span style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--ink-light)', textTransform: 'uppercase' }}>
                          {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </span>
                        <input type="number" value={quorumConfig[key]}
                          onChange={(e) => setQuorumConfig((q) => q && { ...q, [key]: Number(e.target.value) })}
                          style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--rule)', borderRadius: 4, fontSize: '0.85rem', background: '#fff', color: 'var(--ink)', outline: 'none', width: '100%' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <button onClick={saveConfig} disabled={configSaving} className={styles.secondaryBtn}>
                    {configSaved ? 'Saved ✓' : configSaving ? 'Saving…' : 'Save Config'}
                  </button>
                </div>
              </div>
            )}

          </section>
        )}
      </main>
    </div>
  );
}
