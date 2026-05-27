'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService, Topic } from '@/services/topicService';
import { apiFetch } from '@/lib/api';
import UserMenu from '@/components/UserMenu';

interface SequenceSummary {
  id: string;
  title: string;
  urlName: string;
  description: string;
  status: string;
}

export default function InquirySetupPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { userId, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [sequences, setSequences] = useState<SequenceSummary[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      TopicService.get(topicId),
      apiFetch(`/sequences/admin?createdBy=${userId}`, { userId }),
    ])
      .then(([t, seqs]) => {
        setTopic(t);
        setSequences(Array.isArray(seqs) ? seqs : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [topicId, userId]);

  async function handleSave() {
    if (!userId || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await TopicService.linkInquiry(userId, topicId, selected);
      router.push(`/inquiry/${topicId}`);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
    </div>;
  }

  if (!isAuthenticated) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Sign in to continue.</p>
    </div>;
  }

  if (topic && topic.nominatedBy !== userId) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Only the nominator can set up the inquiry.</p>
    </div>;
  }

  if (topic && topic.inquirySequenceId) {
    router.replace(`/inquiry/${topicId}`);
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href={`/inquiry/${topicId}`} style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Back
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.4rem 0' }}>
            Set up Inquiry
          </h1>
          {topic && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Linking a sequence for: <strong style={{ color: 'var(--text-secondary)' }}>{topic.title}</strong>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.6 }}>
              Select one of your sequences to host this inquiry. Participants will join through the sequence page.
              If you haven't created a sequence yet, do that first in the{' '}
              <Link href="/create/sequences" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create panel</Link>.
            </p>

            {sequences.length === 0 ? (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                  You don't have any sequences yet.
                </p>
                <Link
                  href="/create/sequences"
                  style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none', display: 'inline-block' }}
                >
                  Create a sequence →
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sequences.map(seq => (
                  <button
                    key={seq.id}
                    onClick={() => setSelected(seq.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: selected === seq.id ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
                      border: `1px solid ${selected === seq.id ? 'var(--accent)' : 'var(--border-default)'}`,
                      borderRadius: 10,
                      padding: '1rem 1.25rem',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                          {seq.title}
                        </div>
                        {seq.description && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {seq.description.length > 100 ? seq.description.slice(0, 100) + '…' : seq.description}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {seq.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: 0 }}>{error}</p>}

          {sequences.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Link
                href={`/inquiry/${topicId}`}
                style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-block' }}
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={!selected || saving}
                style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: 'none', background: !selected ? 'var(--border-default)' : 'var(--accent)', color: 'var(--text-primary)', cursor: !selected || saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Linking…' : 'Link sequence'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
