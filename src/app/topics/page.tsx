'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService, Topic } from '@/services/topicService';
import UserMenu from '@/components/UserMenu';

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    function update() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) { setRemaining('expired'); return; }
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

function TopicCard({ topic, userId, onAction }: { topic: Topic; userId: string | null; onAction: () => void }) {
  const [acting, setActing] = useState(false);

  const isNominator = topic.nominatedBy === userId;
  const isSupporter = topic.supporters.some(s => s.userId === userId);
  const quorumPct = Math.min(100, (topic.supporterCount / topic.quorumThreshold) * 100);
  const canSupport = !!userId && !isNominator && !isSupporter && topic.status === 'nominated';
  const canUnsupport = !!userId && isSupporter && topic.status === 'nominated';

  async function handle(action: 'support' | 'unsupport') {
    if (!userId) return;
    setActing(true);
    try {
      if (action === 'support') await TopicService.support(userId, topic.id);
      else await TopicService.unsupport(userId, topic.id);
      onAction();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/topics/${topic.id}`} style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', lineHeight: 1.3, display: 'block' }}>
            {topic.title}
          </Link>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.3rem 0 0 0', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {topic.description}
          </p>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
            <Countdown expiresAt={topic.expiresAt} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${quorumPct}%`, background: quorumPct >= 100 ? '#34d399' : 'var(--accent)', borderRadius: 2, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
          {topic.supporterCount} of {topic.quorumThreshold} supporters · {topic.holonPool} H pooled
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canSupport && (
            <button onClick={() => handle('support')} disabled={acting}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: acting ? 'wait' : 'pointer', opacity: acting ? 0.7 : 1 }}>
              {acting ? '…' : 'Support'}
            </button>
          )}
          {canUnsupport && (
            <button onClick={() => handle('unsupport')} disabled={acting}
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', cursor: acting ? 'wait' : 'pointer' }}>
              {acting ? '…' : 'Withdraw'}
            </button>
          )}
          {isNominator && (
            <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', padding: '0.4rem 0' }}>your nomination</span>
          )}
        </div>
        <Link href={`/topics/${topic.id}`} style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', textDecoration: 'none' }}>
          details →
        </Link>
      </div>
    </div>
  );
}

export default function TopicsPage() {
  const { userId, isAuthenticated, refreshBalance } = useAuth();
  const [nominated, setNominated] = useState<Topic[]>([]);
  const [confirmed, setConfirmed] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [nom, conf] = await Promise.all([
        TopicService.list('nominated'),
        TopicService.list('confirmed'),
      ]);
      setNominated(nom);
      setConfirmed(conf);
    } catch {
      setNominated([]);
      setConfirmed([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleAction() {
    refreshBalance();
    load();
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.6rem',
    fontFamily: 'var(--font-dm-mono), monospace',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: '0.75rem',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '100%', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <Link href="/" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              Holo<span style={{ color: 'var(--accent)' }}>scopic</span>
            </Link>
            <nav style={{ display: 'flex', gap: '1rem' }}>
              {['Topics', 'Inquiry', 'Algorithms'].map(item => (
                <Link key={item} href={`/${item.toLowerCase()}`}
                  style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: item === 'Topics' ? 'var(--accent)' : 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
                  {item}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.3rem 0' }}>Topics</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Nominate and support topics for Inquiry</p>
          </div>
          {isAuthenticated && (
            <Link href="/create/topic"
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.5rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
              Nominate
            </Link>
          )}
        </div>

        {loading && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {confirmed.length > 0 && (
              <div>
                <p style={sectionLabel}>Confirmed — ready for Inquiry</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {confirmed.map(topic => (
                    <div key={topic.id} style={{ background: 'var(--bg-secondary)', border: '1px solid #34d39933', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{topic.title}</div>
                        <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', color: '#34d399' }}>
                          {topic.supporterCount} supporter{topic.supporterCount !== 1 ? 's' : ''} · {topic.holonPool} H pooled
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        {topic.inquirySequenceId ? (
                          <Link href={`/inquiry/${topic.id}`}
                            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none' }}>
                            View Inquiry
                          </Link>
                        ) : topic.nominatedBy === userId ? (
                          <Link href={`/inquiry/${topic.id}/setup`}
                            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999, border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                            Set up Inquiry →
                          </Link>
                        ) : (
                          <Link href={`/topics/${topic.id}`}
                            style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.4rem 1rem', borderRadius: 999, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-muted)', textDecoration: 'none' }}>
                            Details
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {nominated.length > 0 && <p style={sectionLabel}>Open nominations</p>}
              {nominated.length === 0 && confirmed.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No open nominations.</p>
                  {isAuthenticated && (
                    <Link href="/create/topic" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>Be the first to nominate a topic →</Link>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {nominated.map(topic => (
                  <TopicCard key={topic.id} topic={topic} userId={userId} onAction={handleAction} />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
