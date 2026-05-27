'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService } from '@/services/topicService';
import UserMenu from '@/components/UserMenu';

function NominationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const priorTopicId = searchParams.get('priorTopicId') || undefined;

  const { userId, isAuthenticated, isLoading, holonBalance, refreshBalance } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [whyItMatters, setWhyItMatters] = useState('');
  const [priorCycleNotes, setPriorCycleNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const topic = await TopicService.nominate(userId, {
        title,
        description,
        whyItMatters,
        priorTopicId,
        priorCycleNotes: priorCycleNotes || undefined,
      });
      refreshBalance();
      router.push(`/topics/${topic.id}`);
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
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>You need to be signed in to nominate a topic.</p>
        <Link href="/login" style={{ color: 'var(--accent)' }}>Sign in</Link>
      </div>
    );
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.65rem 0.85rem',
    borderRadius: 8,
    fontSize: '0.9rem',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
    resize: 'vertical' as const,
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  };

  const labelTextStyle: React.CSSProperties = {
    fontSize: '0.6rem',
    fontFamily: 'var(--font-dm-mono), monospace',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {priorTopicId && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Re-nominating from a prior cycle. Add iteration notes below to show how your thinking has evolved.
        </div>
      )}

      <label style={labelStyle}>
        <span style={labelTextStyle}>Title</span>
        <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
          placeholder="A clear, specific question or tension"
          style={{ ...fieldStyle, resize: undefined }} />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Description</span>
        <textarea required rows={4} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Describe the topic in depth. What's the context? What makes it worth exploring?"
          style={fieldStyle} />
      </label>

      <label style={labelStyle}>
        <span style={labelTextStyle}>Why It Matters</span>
        <textarea required rows={3} value={whyItMatters} onChange={e => setWhyItMatters(e.target.value)}
          placeholder="Make your case. Why should others give their time and Holons to this?"
          style={fieldStyle} />
      </label>

      {priorTopicId && (
        <label style={labelStyle}>
          <span style={labelTextStyle}>Iteration Notes (optional)</span>
          <textarea rows={3} value={priorCycleNotes} onChange={e => setPriorCycleNotes(e.target.value)}
            placeholder="What changed since the last cycle? What did you learn from the feedback?"
            style={fieldStyle} />
        </label>
      )}

      {error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
          Balance: {holonBalance ?? '—'} H · Nomination costs Holons
        </span>
        <button type="submit" disabled={submitting}
          style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 1.5rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
          {submitting ? 'Submitting…' : 'Nominate Topic'}
        </button>
      </div>
    </form>
  );
}

export default function CreateTopicPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href="/topics" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Topics
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem 0' }}>Nominate a Topic</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Make your case. If enough people support it, an Inquiry session will be scheduled.
          </p>
        </div>
        <Suspense fallback={null}>
          <NominationForm />
        </Suspense>
      </main>
    </div>
  );
}
