'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AlgorithmService, Algorithm, AlgorithmProposal } from '@/services/algorithmService';
import { apiFetch } from '@/lib/api';
import UserMenu from '@/components/UserMenu';

export default function AlgorithmDetailPage() {
  const { algorithmId } = useParams<{ algorithmId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, isAuthenticated, refreshBalance } = useAuth();

  const [algorithm, setAlgorithm] = useState<Algorithm | null>(null);
  const [sequenceUrlName, setSequenceUrlName] = useState<string | null>(null);
  const [authorSequences, setAuthorSequences] = useState<{ id: string; title: string }[]>([]);
  const [selectedSeqId, setSelectedSeqId] = useState('');
  const [linkingSave, setLinkingSave] = useState(false);

  const [proposals, setProposals] = useState<AlgorithmProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [intentInput, setIntentInput] = useState('');
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sequenceCloned = searchParams.get('sequenceCloned') === '1';

  useEffect(() => {
    AlgorithmService.get(algorithmId)
      .then(async alg => {
        setAlgorithm(alg);
        if (alg.sequenceId) {
          try {
            const seq = await apiFetch(`/sequences/${alg.sequenceId}`);
            setSequenceUrlName(seq.urlName || null);
          } catch { /* best-effort */ }
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [algorithmId]);

  const isAuthor = algorithm?.authorId === userId;

  useEffect(() => {
    if (!isAuthor || !userId) return;
    apiFetch(`/sequences/admin?createdBy=${userId}`, { userId })
      .then((data: any[]) => {
        setAuthorSequences(data.map((s: any) => ({ id: s.id, title: s.title })));
        if (algorithm?.sequenceId) setSelectedSeqId(algorithm.sequenceId);
      })
      .catch(() => {});
  }, [isAuthor, userId, algorithm?.sequenceId]);

  useEffect(() => {
    if (!algorithm) return;
    setProposalsLoading(true);
    AlgorithmService.getProposals(algorithmId)
      .then(setProposals)
      .catch(() => {})
      .finally(() => setProposalsLoading(false));
  }, [algorithm, isAuthor, algorithmId]);

  async function handleLinkSequence() {
    if (!userId) return;
    setLinkingSave(true);
    try {
      const updated = await AlgorithmService.linkSequence(userId, algorithmId, selectedSeqId || null);
      setAlgorithm(prev => prev ? { ...prev, sequenceId: updated.sequenceId } : prev);
      if (selectedSeqId) {
        const seq = await apiFetch(`/sequences/${selectedSeqId}`);
        setSequenceUrlName(seq.urlName || null);
      } else {
        setSequenceUrlName(null);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLinkingSave(false);
    }
  }

  async function handlePropose() {
    if (!userId || !intentInput.trim()) return;
    setProposing(true);
    try {
      const result = await AlgorithmService.propose(userId, algorithmId, intentInput.trim());
      refreshBalance();
      if (result.sessionStarted && result.sequenceUrlName) {
        router.push(`/sequence/${result.sequenceUrlName}`);
        return;
      }
      setProposals(prev => [result.proposal, ...prev]);
      setIntentInput('');
      setShowProposeForm(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProposing(false);
    }
  }

  async function handleJoin(proposalId: string) {
    if (!userId) return;
    setJoiningId(proposalId);
    try {
      const result = await AlgorithmService.joinProposal(userId, algorithmId, proposalId);
      refreshBalance();
      if (result.sessionStarted && result.sequenceUrlName) {
        router.push(`/sequence/${result.sequenceUrlName}`);
        return;
      }
      setProposals(prev => prev.map(p => p.id === proposalId ? result.proposal : p));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setJoiningId(null);
    }
  }

  async function handleWithdraw(proposalId: string) {
    if (!userId) return;
    setWithdrawingId(proposalId);
    try {
      const updated = await AlgorithmService.withdrawProposal(userId, algorithmId, proposalId);
      setProposals(prev => prev.map(p => p.id === proposalId ? updated : p));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setWithdrawingId(null);
    }
  }

  const myProposalIds = new Set(
    proposals.filter(p => p.signups.some(s => s.userId === userId)).map(p => p.id)
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href="/algorithms" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Algorithms
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}

        {sequenceCloned && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            A session sequence was automatically created from the parent algorithm's template. Review it below before making it live.
          </div>
        )}

        {algorithm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    algorithm{algorithm.forkDepth > 0 ? ` · fork depth ${algorithm.forkDepth}` : ''}
                  </span>
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem 0', lineHeight: 1.2 }}>
                  {algorithm.title}
                </h1>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  by {algorithm.authorName} · {new Date(algorithm.publishedAt).toLocaleDateString()}
                </span>
              </div>
              {isAuthenticated && !isAuthor && (
                <Link href={`/create/algorithm?forkFrom=${algorithm.id}`}
                  style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none' }}>
                  Fork →
                </Link>
              )}
            </div>

            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
              <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Thesis</p>
              <p style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.65, fontStyle: 'italic' }}>
                "{algorithm.thesis}"
              </p>
            </div>

            {algorithm.description && (
              <div>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Description</h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65 }}>{algorithm.description}</p>
              </div>
            )}

            {/* Author: template management */}
            {isAuthor && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
                <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
                  Session template
                </p>
                {sequenceUrlName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>Template sequence linked. Group sessions will be cloned from this.</p>
                    <Link href={`/sequence/${sequenceUrlName}`}
                      style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.45rem 1rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none' }}>
                      View template →
                    </Link>
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem 0' }}>
                  {sequenceUrlName ? 'Change template:' : 'Link a sequence template so group sessions can be cloned from it:'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select value={selectedSeqId} onChange={e => setSelectedSeqId(e.target.value)}
                    style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, fontSize: '0.82rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none' }}>
                    <option value="">No template</option>
                    {authorSequences.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <button onClick={handleLinkSequence} disabled={linkingSave}
                    style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.5rem 1rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: linkingSave ? 'wait' : 'pointer', opacity: linkingSave ? 0.7 : 1 }}>
                    {linkingSave ? '…' : 'Save'}
                  </button>
                </div>
                {authorSequences.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
                    No sequences yet. <Link href="/create/sequences" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create one →</Link>
                  </p>
                )}
              </div>
            )}

            {/* Proposals / group sessions */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                    Group sessions
                  </p>
                  {isAuthenticated && !showProposeForm && algorithm.sequenceId && (
                    <button onClick={() => setShowProposeForm(true)}
                      style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 0.9rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Propose →
                    </button>
                  )}
                </div>

                {!algorithm.sequenceId && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                    {isAuthor ? 'Link a sequence template above to enable group sessions.' : 'No session template set up yet. Check back later.'}
                  </p>
                )}

                {algorithm.sequenceId && (
                  <>
                    {showProposeForm && (
                      <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Describe what you want to use this algorithm for:</p>
                        <textarea
                          value={intentInput}
                          onChange={e => setIntentInput(e.target.value)}
                          rows={3}
                          maxLength={500}
                          placeholder="What's the context or goal for this session?"
                          style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, fontSize: '0.85rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                          <button onClick={() => { setShowProposeForm(false); setIntentInput(''); }}
                            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button onClick={handlePropose} disabled={proposing || !intentInput.trim()}
                            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 0.9rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: proposing ? 'wait' : 'pointer', opacity: proposing ? 0.7 : 1 }}>
                            {proposing ? '…' : 'Submit proposal'}
                          </button>
                        </div>
                      </div>
                    )}

                    {proposalsLoading && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Loading proposals…</p>}

                    {!proposalsLoading && proposals.length === 0 && !showProposeForm && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No open group sessions yet. Propose one to get started.</p>
                        {!isAuthenticated && (
                          <Link href="/login" style={{ flexShrink: 0, fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none' }}>Sign in →</Link>
                        )}
                      </div>
                    )}

                    {proposals.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {proposals.map(p => {
                          const isIn = myProposalIds.has(p.id);
                          const isProposer = p.proposedBy === userId;
                          const pct = Math.min(100, Math.round((p.signups.length / p.quorumThreshold) * 100));
                          const hoursLeft = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 3600000));
                          return (
                            <div key={p.id} style={{ background: 'var(--bg-elevated)', border: `1px solid ${isIn ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '0.85rem 1rem' }}>
                              <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: '0 0 0.5rem 0', lineHeight: 1.5 }}>
                                {p.intent}
                              </p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{ flex: 1, height: 4, background: 'var(--border-default)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', flexShrink: 0 }}>
                                  {p.signups.length}/{p.quorumThreshold} · {hoursLeft}h left
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
                                  proposed by {p.proposedByName}{isProposer ? ' (you)' : ''}
                                </span>
                                {isAuthenticated && !isProposer && (
                                  isIn ? (
                                    <button onClick={() => handleWithdraw(p.id)} disabled={withdrawingId === p.id}
                                      style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 0.7rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                      {withdrawingId === p.id ? '…' : 'Withdraw'}
                                    </button>
                                  ) : (
                                    <button onClick={() => handleJoin(p.id)} disabled={joiningId === p.id}
                                      style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 0.7rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer', opacity: joiningId === p.id ? 0.7 : 1 }}>
                                      {joiningId === p.id ? '…' : 'Join'}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
            </div>

            {/* Fork lineage */}
            {algorithm.forkParentId && (
              <p style={{ fontSize: '0.72rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', margin: 0 }}>
                Forked from{' '}
                <Link href={`/algorithms/${algorithm.forkParentId}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  parent algorithm
                </Link>
                {' '}· depth {algorithm.forkDepth}
              </p>
            )}

            {/* Forks of this algorithm */}
            <div>
              <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
                Forks {algorithm.forks && algorithm.forks.length > 0 ? `(${algorithm.forks.length})` : ''}
              </h2>
              {(!algorithm.forks || algorithm.forks.length === 0) ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No forks yet. Be the first to adapt this algorithm.</p>
                  {isAuthenticated && !isAuthor && (
                    <Link href={`/create/algorithm?forkFrom=${algorithm.id}`}
                      style={{ flexShrink: 0, marginLeft: '1rem', fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none' }}>
                      Fork →
                    </Link>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {algorithm.forks.map(fork => (
                    <Link key={fork.id} href={`/algorithms/${fork.id}`}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, textDecoration: 'none' }}>
                      <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>{fork.title}</span>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>{fork.authorName}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
