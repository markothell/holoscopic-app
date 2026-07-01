'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { AlgorithmService, Algorithm, AlgorithmProposal } from '@/services/algorithmService';
import UserMenu from '@/components/UserMenu';

export default function PatternDetailPage() {
  const { patternId } = useParams<{ patternId: string }>();
  const router = useRouter();
  const { userId, isAuthenticated, refreshBalance } = useAuth();
  const { ended } = useInstance();

  const [pattern, setPattern] = useState<Algorithm | null>(null);
  const [proposals, setProposals] = useState<AlgorithmProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intentInput, setIntentInput] = useState('');
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      AlgorithmService.get(patternId),
      AlgorithmService.getProposals(patternId),
    ]).then(([alg, props]) => {
      setPattern(alg);
      setProposals(props);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [patternId]);

  async function handlePropose() {
    if (!userId) { router.push('/login'); return; }
    setProposing(true);
    try {
      const result = await AlgorithmService.propose(userId, patternId, intentInput);
      refreshBalance();
      if (result.sessionStarted && result.sequenceUrlName) {
        router.push(`/sequence/${result.sequenceUrlName}`);
        return;
      }
      setProposals(prev => [result.proposal, ...prev]);
      setShowProposeForm(false);
      setIntentInput('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProposing(false);
    }
  }

  async function handleJoin(proposal: AlgorithmProposal) {
    if (!userId) { router.push('/login'); return; }
    setJoiningId(proposal.id);
    try {
      const result = await AlgorithmService.joinProposal(userId, patternId, proposal.id);
      refreshBalance();
      if (result.sessionStarted && result.sequenceUrlName) {
        router.push(`/sequence/${result.sequenceUrlName}`);
        return;
      }
      setProposals(prev => prev.map(p => p.id === proposal.id ? result.proposal : p));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setJoiningId(null);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
    </div>
  );

  if (error || !pattern) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>{error || 'Pattern not found'}</p>
    </div>
  );

  const myProposal = proposals.find(p => p.proposedBy === userId && p.status === 'open');
  const isAuthor = pattern.authorId === userId;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href="/patterns" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--accent)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Patterns
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>

        {/* Pattern header */}
        <div style={{ marginBottom: '2.5rem' }}>
          {pattern.forkDepth > 0 && (
            <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.2rem 0.5rem', borderRadius: 4, marginBottom: '0.75rem', display: 'inline-block' }}>
              fork · depth {pattern.forkDepth}
            </span>
          )}
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem 0', lineHeight: 1.2 }}>{pattern.title}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
            by {pattern.authorName} · published {new Date(pattern.publishedAt).toLocaleDateString()}
          </p>
          {pattern.thesis && (
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 1rem 0', fontStyle: 'italic' }}>{pattern.thesis}</p>
          )}
          {pattern.description && (
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{pattern.description}</p>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
          {isAuthenticated && !myProposal && !ended && (
            <button onClick={() => setShowProposeForm(v => !v)}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Propose a session
            </button>
          )}
          {isAuthenticated && (
            <Link href={`/create/pattern?forkFrom=${pattern.id}`}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: '1px solid var(--border-default)', color: 'var(--text-muted)', textDecoration: 'none' }}>
              Fork this pattern
            </Link>
          )}
        </div>

        {/* Propose form */}
        {showProposeForm && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>What do you want to explore?</h3>
            <textarea value={intentInput} onChange={e => setIntentInput(e.target.value)} placeholder="Describe the specific topic or question you want this pattern to address…"
              style={{ width: '100%', minHeight: 80, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '0.75rem', fontSize: '0.88rem', color: 'var(--text-primary)', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowProposeForm(false)} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handlePropose} disabled={proposing || !intentInput.trim()} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', padding: '0.4rem 0.9rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: proposing ? 'wait' : 'pointer', opacity: !intentInput.trim() ? 0.5 : 1 }}>
                {proposing ? '…' : 'Propose'}
              </button>
            </div>
          </div>
        )}

        {/* Open proposals */}
        {proposals.filter(p => p.status === 'open').length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Open sessions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {proposals.filter(p => p.status === 'open').map(p => {
                const isIn = p.signups.some(s => s.userId === userId);
                const isProposer = p.proposedBy === userId;
                const pct = Math.min(100, Math.round((p.signups.length / p.quorumThreshold) * 100));
                const hoursLeft = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 3600000));
                return (
                  <div key={p.id} style={{ background: 'var(--bg-secondary)', border: `1px solid ${isIn ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.6rem' }}>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5, flex: 1 }}>{p.intent}</p>
                      {!isProposer && (
                        isIn ? (
                          <span style={{ flexShrink: 0, fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', padding: '0.35rem 0.75rem', borderRadius: 999, border: '1px solid var(--accent)', color: 'var(--accent)' }}>Joined</span>
                        ) : (
                          <button onClick={() => handleJoin(p)} disabled={joiningId === p.id || ended}
                            style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', padding: '0.4rem 0.85rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: (joiningId === p.id || ended) ? (ended ? 'not-allowed' : 'wait') : 'pointer', opacity: (joiningId === p.id || ended) ? 0.6 : 1 }}>
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

        {/* Forks */}
        {pattern.forks && pattern.forks.length > 0 && (
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Forks</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pattern.forks.map(f => (
                <Link key={f.id} href={`/patterns/${f.id}`}
                  style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '0.75rem 1rem' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.title}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>by {f.authorName}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
