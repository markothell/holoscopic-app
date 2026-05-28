'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useInstance } from '@/contexts/InstanceContext';
import { AlgorithmService, Algorithm } from '@/services/algorithmService';
import { apiFetch } from '@/lib/api';
import UserMenu from '@/components/UserMenu';

function AlgorithmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forkFromId = searchParams.get('forkFrom') || undefined;

  const { userId, isAuthenticated, isLoading, holonBalance, refreshBalance } = useAuth();
  const { config: instanceConfig } = useInstance();
  const [parent, setParent] = useState<Algorithm | null>(null);
  const [parentSequenceTitle, setParentSequenceTitle] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [description, setDescription] = useState('');
  const [sequenceId, setSequenceId] = useState('');
  const [sequences, setSequences] = useState<{ id: string; title: string; status: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (forkFromId) {
      AlgorithmService.get(forkFromId).then(async alg => {
        setParent(alg);
        if (alg.sequenceId) {
          try {
            const seq = await apiFetch(`/sequences/${alg.sequenceId}`);
            setParentSequenceTitle(seq.title || null);
          } catch { /* best-effort */ }
        }
      }).catch(() => {});
    }
  }, [forkFromId]);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/sequences/admin?createdBy=${userId}`, { userId })
      .then((data: any[]) => setSequences(data.map((s: any) => ({ id: s.id, title: s.title, status: s.status }))))
      .catch(() => {});
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = { title, thesis, description: description || undefined, sequenceId: sequenceId || undefined };
      if (forkFromId) {
        const { algorithm: alg, newSequenceUrlName } = await AlgorithmService.fork(userId, forkFromId, payload);
        refreshBalance();
        const suffix = newSequenceUrlName ? '?sequenceCloned=1' : '';
        router.push(`/algorithms/${alg.id}${suffix}`);
      } else {
        const alg = await AlgorithmService.publish(userId, payload);
        refreshBalance();
        router.push(`/algorithms/${alg.id}`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <p style={{ color: 'var(--text-muted)', padding: '2rem' }}>Loading…</p>;

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>You need to be signed in to publish an algorithm.</p>
        <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '0.65rem 0.85rem', borderRadius: 8, fontSize: '0.9rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', resize: 'vertical' };
  const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem' };
  const labelTextStyle: React.CSSProperties = { fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {parent && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span>Forking from <strong style={{ color: 'var(--text-primary)' }}>{parent.title}</strong> by {parent.authorName}. Royalties will flow to the original author.</span>
          {parentSequenceTitle && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              The session sequence <strong style={{ color: 'var(--text-secondary)' }}>{parentSequenceTitle}</strong> will be copied as a draft template for your fork. You can edit it before going live.
            </span>
          )}
        </div>
      )}

      <label style={labelStyle}>
        <span style={labelTextStyle}>Title</span>
        <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Name your algorithm"
          style={{ ...fieldStyle, resize: undefined }} />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Thesis</span>
        <textarea required rows={3} value={thesis} onChange={e => setThesis(e.target.value)}
          placeholder="The central claim or insight this conversation pattern is built around"
          style={fieldStyle} />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Description (optional)</span>
        <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="How does it work? When should it be used? What conditions does it require?"
          style={fieldStyle} />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Session sequence (optional)</span>
        {sequences.length > 0 ? (
          <select value={sequenceId} onChange={e => setSequenceId(e.target.value)}
            style={{ ...fieldStyle, resize: undefined, cursor: 'pointer' }}>
            <option value="">No sequence linked</option>
            {sequences.map(s => (
              <option key={s.id} value={s.id}>{s.title} ({s.status})</option>
            ))}
          </select>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            No sequences yet.{' '}
            <a href="/create/sequences" target="_blank" style={{ color: 'var(--accent)' }}>Create one first →</a>
          </p>
        )}
      </label>

      {error && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
          Balance: {holonBalance ?? '—'} H · Costs {instanceConfig?.holons?.algorithmPublishCost ?? '…'} H to publish
        </span>
        <button type="submit" disabled={submitting}
          style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 1.5rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Publishing…' : forkFromId ? 'Publish Fork' : 'Publish Algorithm'}
        </button>
      </div>
    </form>
  );
}

export default function CreateAlgorithmPage() {
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

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem 0' }}>Publish Algorithm</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Share a reusable conversation pattern with a thesis others can build on.
          </p>
        </div>
        <Suspense fallback={null}>
          <AlgorithmForm />
        </Suspense>
      </main>
    </div>
  );
}
