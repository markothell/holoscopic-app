'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AlgorithmService, Algorithm, AlgorithmProposal } from '@/services/algorithmService';
import UserMenu from '@/components/UserMenu';

type EnrichedProposal = AlgorithmProposal & { algorithmTitle: string };

export default function PatternsPage() {
  const router = useRouter();
  const { isAuthenticated, userId, refreshBalance } = useAuth();
  const [patterns, setPatterns] = useState<Algorithm[]>([]);
  const [proposals, setProposals] = useState<EnrichedProposal[]>([]);
  const [mySessions, setMySessions] = useState<Awaited<ReturnType<typeof AlgorithmService.getMySessions>>>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const fetches: Promise<any>[] = [
      AlgorithmService.list().catch(() => [] as Algorithm[]),
      AlgorithmService.listProposals().catch(() => [] as EnrichedProposal[]),
    ];
    if (userId) fetches.push(AlgorithmService.getMySessions(userId).catch(() => []));
    Promise.all(fetches).then(([algs, props, sessions = []]) => {
      setPatterns(algs);
      setProposals(props);
      setMySessions(sessions);
    }).finally(() => setLoading(false));
  }, [userId]);

  async function handleJoin(proposal: EnrichedProposal) {
    if (!userId) { router.push('/login'); return; }
    setJoiningId(proposal.id);
    try {
      const result = await AlgorithmService.joinProposal(userId, proposal.algorithmId, proposal.id);
      refreshBalance();
      if (result.sessionStarted && result.sequenceUrlName) {
        router.push(`/sequence/${result.sequenceUrlName}`);
        return;
      }
      setProposals(prev => prev.map(p => p.id === proposal.id
        ? { ...result.proposal, algorithmTitle: proposal.algorithmTitle }
        : p
      ));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <nav style={{ display: 'flex', gap: '1rem' }}>
              {[{ label: 'Topics', href: '/topics' }, { label: 'Patterns', href: '/patterns' }].map(item => (
                <Link key={item.href} href={item.href}
                  style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: item.href === '/patterns' ? 'var(--accent)' : 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>

        {/* Open sessions */}
        {(loading || proposals.length > 0) && (
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>Open sessions</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Group sessions seeking participants to reach quorum</p>
              </div>
            </div>
            {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {proposals.map(p => {
                const isIn = p.signups.some(s => s.userId === userId);
                const isProposer = p.proposedBy === userId;
                const pct = Math.min(100, Math.round((p.signups.length / p.quorumThreshold) * 100));
                const hoursLeft = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 3600000));
                return (
                  <div key={p.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${isIn ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.6rem' }}>
                      <div style={{ flex: 1 }}>
                        <Link href={`/patterns/${p.algorithmId}`}
                          style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none' }}>
                          {p.algorithmTitle}
                        </Link>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: '0.3rem 0 0 0', lineHeight: 1.5 }}>
                          {p.intent}
                        </p>
                      </div>
                      {!isProposer && (
                        isIn ? (
                          <span style={{ flexShrink: 0, fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.35rem 0.75rem', borderRadius: 999, border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                            Joined
                          </span>
                        ) : (
                          <button onClick={() => handleJoin(p)} disabled={joiningId === p.id}
                            style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 0.85rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: joiningId === p.id ? 'wait' : 'pointer', opacity: joiningId === p.id ? 0.7 : 1 }}>
                            {joiningId === p.id ? '…' : 'Join'}
                          </button>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ flex: 1, height: 3, background: 'var(--border-default)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {p.signups.length}/{p.quorumThreshold} · {hoursLeft}h left
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Your active sessions */}
        {mySessions.length > 0 && (
          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>Your sessions</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>Sessions you're enrolled in</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {mySessions.map(s => (
                <div key={s.proposalId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <Link href={`/patterns/${s.algorithmId}`}
                      style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none' }}>
                      {s.algorithmTitle}
                    </Link>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: '0.25rem 0 0 0', lineHeight: 1.4 }}>{s.intent}</p>
                    {s.sequenceTitle && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>{s.sequenceTitle}</p>
                    )}
                  </div>
                  {s.sequenceUrlName ? (
                    <Link href={`/sequence/${s.sequenceUrlName}`}
                      style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 0.85rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                      Enter →
                    </Link>
                  ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Session unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patterns list */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.3rem 0' }}>Patterns</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Reusable conversation sequences published by practitioners</p>
          </div>
          {isAuthenticated && (
            <Link href="/create/pattern"
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
              Publish
            </Link>
          )}
        </div>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}

        {!loading && patterns.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No patterns published yet.</p>
            {isAuthenticated && (
              <Link href="/create/pattern" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>Be the first to publish →</Link>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {patterns.map(p => (
            <Link key={p.id} href={`/patterns/${p.id}`} style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.25rem 1.5rem', transition: 'border-color 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{p.title}</h2>
                    {p.forkDepth > 0 && (
                      <span style={{ fontSize: '0.55rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>
                        fork
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {p.thesis}
                  </p>
                  <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
                    {p.authorName} · {new Date(p.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
