'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { TopicService, Inquiry } from '@/services/topicService';
import UserMenu from '@/components/UserMenu';

function StatusPip({ status }: { status: string }) {
  const color = status === 'active' ? '#34d399' : status === 'completed' ? 'var(--text-muted)' : 'var(--accent)';
  return (
    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: '0.4rem', verticalAlign: 'middle' }} />
  );
}

export default function InquiryPage() {
  const { userId, isAuthenticated } = useAuth();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    TopicService.listInquiries()
      .then(setInquiries)
      .catch(() => setInquiries([]))
      .finally(() => setLoading(false));
  }, []);

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
                  style={{ fontSize: '0.7rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', color: item === 'Inquiry' ? 'var(--accent)' : 'var(--text-muted)', textDecoration: 'none', textTransform: 'uppercase' }}>
                  {item}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu />
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.3rem 0' }}>Inquiry</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
              Active conversations on confirmed topics
            </p>
          </div>
        </div>

        {loading && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
        )}

        {!loading && inquiries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No inquiries set up yet.</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Topics that reach quorum appear here once their nominator links a session sequence.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {inquiries.map(inquiry => (
            <Link
              key={inquiry.id}
              href={`/inquiry/${inquiry.id}`}
              style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.25rem 1.5rem', transition: 'border-color 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    {inquiry.sequence && (
                      <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <StatusPip status={inquiry.sequence.status} />
                        {inquiry.sequence.status}
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.4rem 0', lineHeight: 1.3 }}>
                    {inquiry.title}
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {inquiry.description}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    {inquiry.supporterCount} supporters
                  </div>
                  {inquiry.confirmedAt && (
                    <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)' }}>
                      {new Date(inquiry.confirmedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {inquiry.sequence && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-dm-mono), monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Session sequence:
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {inquiry.sequence.title}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
