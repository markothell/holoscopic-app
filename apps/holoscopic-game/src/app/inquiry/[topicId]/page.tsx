'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService, Topic, InquirySequence } from '@/services/topicService';
import { apiFetch } from '@/lib/api';
import UserMenu from '@/components/UserMenu';

export default function InquiryDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { userId } = useAuth();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [sequence, setSequence] = useState<InquirySequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    TopicService.get(topicId)
      .then(async (t) => {
        setTopic(t);
        if (t.inquirySequenceId) {
          try {
            const seq = await apiFetch(`/sequences/${t.inquirySequenceId}`);
            setSequence(seq);
          } catch { /* sequence fetch is best-effort */ }
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [topicId]);

  const isNominator = topic?.nominatedBy === userId;
  const hasSequence = !!topic?.inquirySequenceId;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', padding: '0 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <Link href="/inquiry" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← Inquiry
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}

        {topic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Status badge */}
            <div>
              <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#34d399' }}>
                confirmed inquiry
                {topic.confirmedAt && <> · {new Date(topic.confirmedAt).toLocaleDateString()}</>}
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0 0', lineHeight: 1.2 }}>
                {topic.title}
              </h1>
            </div>

            {/* Session link / setup CTA */}
            {hasSequence ? (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
                <p style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.4rem 0' }}>
                  Inquiry session
                </p>
                {sequence && <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>{sequence.title}</p>}
                <Link
                  href={`/sequence/${sequence?.urlName || topic.inquirySequenceId}`}
                  style={{ fontSize: '0.75rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Join the sequence →
                </Link>
              </div>
            ) : isNominator ? (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 0.4rem 0' }}>
                  Ready to set up
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                  Link a sequence to open this inquiry for participants.
                </p>
                <Link
                  href={`/inquiry/${topicId}/setup`}
                  style={{ display: 'inline-block', fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}
                >
                  Set up Inquiry →
                </Link>
              </div>
            ) : (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '1rem 1.25rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  The nominator is setting up the session sequence. Check back soon.
                </p>
              </div>
            )}

            {/* Pitch content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
                  Description
                </h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65 }}>
                  {topic.description}
                </p>
              </div>
              <div>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
                  Why It Matters
                </h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65 }}>
                  {topic.whyItMatters}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: '2rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{topic.supporterCount}</div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>supporters</div>
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{topic.holonPool}</div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>holons pooled</div>
              </div>
            </div>

            {/* Prior cycle */}
            {topic.priorCycleNotes && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
                  Prior Cycle Notes
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {topic.priorCycleNotes}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
