'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService, Topic } from '@/services/topicService';
import UserMenu from '@/components/UserMenu';

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    function update() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining('Expired'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setRemaining(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return <span>{remaining}</span>;
}

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const { userId, isAuthenticated, refreshBalance } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    TopicService.get(topicId)
      .then(setTopic)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleSupport() {
    if (!userId || !topic) return;
    setActing(true);
    try {
      const updated = await TopicService.support(userId, topic.id);
      setTopic(updated);
      refreshBalance();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  async function handleUnsupport() {
    if (!userId || !topic) return;
    setActing(true);
    try {
      const updated = await TopicService.unsupport(userId, topic.id);
      setTopic(updated);
      refreshBalance();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  const isNominator = topic?.nominatedBy === userId;
  const isSupporter = topic?.supporters.some(s => s.userId === userId) ?? false;
  const quorumPct = topic ? Math.min(100, (topic.supporterCount / topic.quorumThreshold) * 100) : 0;

  const statusColor = topic?.status === 'confirmed' ? '#34d399' : topic?.status === 'expired' ? 'var(--text-muted)' : 'var(--accent)';

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

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {error && <p style={{ color: 'var(--accent)' }}>{error}</p>}

        {topic && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.12em', textTransform: 'uppercase', color: statusColor }}>
                  {topic.status}
                  {topic.status === 'nominated' && <> · <Countdown expiresAt={topic.expiresAt} /> remaining</>}
                  {topic.status === 'confirmed' && topic.confirmedAt && <> · confirmed {new Date(topic.confirmedAt).toLocaleDateString()}</>}
                </span>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>{topic.title}</h1>
              </div>
            </div>

            {/* Quorum bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${quorumPct}%`, background: quorumPct >= 100 ? '#34d399' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
              </div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-dm-mono), monospace' }}>
                {topic.supporterCount} of {topic.quorumThreshold} supporters needed
              </span>
            </div>

            {/* Pitch */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Description</h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65 }}>{topic.description}</p>
              </div>
            </div>

            {/* Actions */}
            {isAuthenticated && topic.status === 'nominated' && !isNominator && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {!isSupporter ? (
                  <button onClick={handleSupport} disabled={acting}
                    style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 1.5rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: acting ? 'wait' : 'pointer' }}>
                    {acting ? 'Processing…' : 'Support this topic'}
                  </button>
                ) : (
                  <button onClick={handleUnsupport} disabled={acting}
                    style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.6rem 1.5rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', cursor: acting ? 'wait' : 'pointer' }}>
                    {acting ? 'Processing…' : 'Withdraw support'}
                  </button>
                )}
              </div>
            )}

            {topic.status === 'confirmed' && isNominator && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '1.25rem 1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0', fontWeight: 600 }}>
                  Your topic reached quorum.
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
                  Complete the setup to schedule your Inquiry session.
                </p>
                <button
                  onClick={() => router.push(`/inquiry/${topic.id}/setup`)}
                  style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Set up Inquiry →
                </button>
              </div>
            )}

            {/* Prior cycle */}
            {topic.priorCycleNotes && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
                <h2 style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>Prior Cycle Notes</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{topic.priorCycleNotes}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
