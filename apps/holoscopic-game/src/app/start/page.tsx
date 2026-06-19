'use client';

import { useState } from 'react';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import { SignupService } from '@/services/signupService';
import { mono, eyebrowCss, inputCss, btn } from '@/lib/ui';

/**
 * "Start your own" — minimal notify-me capture for people who want to run
 * their own interView edition once the platform opens to hosts.
 */
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function StartYourOwnPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setStatus('loading');
    try {
      await SignupService.create(email, 'start-your-own');
      setStatus('success');
    } catch {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
        <Link href="/" style={{ ...eyebrowCss, textDecoration: 'none' }}>← Holoscopic</Link>
        <UserMenu />
      </header>

      <main style={{ maxWidth: 520, margin: '0 auto', padding: '5rem 1.5rem' }}>
        <p style={{ ...eyebrowCss, marginBottom: '1.25rem' }}>Start your own</p>

        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 700, lineHeight: 1.05,
          margin: '0 0 1.25rem', letterSpacing: '-0.02em', color: 'var(--text-primary)',
          fontFamily: 'var(--font-barlow), system-ui, sans-serif', textTransform: 'uppercase',
        }}>
          Run your own<br />edition
        </h1>

        <p style={{
          fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)', color: 'var(--text-secondary)',
          lineHeight: 1.55, margin: '0 0 2.5rem',
          fontFamily: 'var(--font-cormorant), Georgia, serif',
        }}>
          Hosting your own interView — with your group, your topics, your economy — is coming soon.
          Leave your email and we&apos;ll tell you the moment it opens.
        </p>

        {status === 'success' ? (
          <div style={{
            border: '1px solid var(--border-default)', borderRadius: 12, padding: '1.5rem',
            background: 'var(--bg-elevated)',
          }}>
            <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              You&apos;re on the list. We&apos;ll be in touch when hosting opens.
            </p>
            <Link href="/" style={{ ...eyebrowCss, color: 'var(--accent)', textDecoration: 'none', display: 'inline-block', marginTop: '1rem' }}>
              ← Back to Holoscopic
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder="your@email.com"
                autoComplete="email"
                disabled={status === 'loading'}
                style={{ ...inputCss, flex: '1 1 220px', padding: '0.7rem 0.8rem', fontSize: 'var(--text-base)' }}
              />
              <button
                onClick={submit}
                disabled={status === 'loading'}
                style={{ ...btn('fill'), fontSize: 'var(--text-xs)', padding: '0.7rem 1.4rem', opacity: status === 'loading' ? 0.6 : 1 }}
              >
                {status === 'loading' ? 'Sending…' : 'Notify me'}
              </button>
            </div>
            {error && (
              <p style={{ margin: '0.75rem 0 0', fontSize: 'var(--text-xs)', fontFamily: mono, color: 'var(--accent)' }}>
                {error}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
