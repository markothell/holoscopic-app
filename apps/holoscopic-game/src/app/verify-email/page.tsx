'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '@/components/authCard.module.css';

// Where the confirmation link lands.
//
// It redeems on mount rather than asking for a click: the person already
// clicked, in their mail app, and a second button here is a step that exists
// only to make the page feel like it did something.

type State = 'working' | 'done' | 'failed';

function VerifyEmail() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<State>(token ? 'working' : 'failed');
  const [error, setError] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (!token) {
      setError('This page needs the link from your confirmation email.');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
        const res = await fetch(`${apiUrl}/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok || !data.success) {
          setError(data.error || 'That confirmation link did not work.');
          setState('failed');
          return;
        }
        setState('done');
      } catch {
        if (!cancelled) {
          setError('Could not reach the server. Try the link again in a moment.');
          setState('failed');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      await fetch(`${apiUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
    } catch {
      // The backend answers identically whatever happens, so there is nothing
      // a failure here could tell the visitor that the copy below does not.
    }
    setResent(true);
  };

  return (
    <div className={styles.page}>
      <div className={styles.grain} />

      <div className={styles.wrapper}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoText}>
            Holo<span className={styles.logoAccent}>scopic</span>
          </span>
        </Link>

        <div className={styles.card}>
          <h1 className={styles.cardTitle}>
            {state === 'done' ? 'Confirmed' : 'Confirm Email'}
          </h1>

          {state === 'working' && (
            <p className={styles.lede}>Confirming your address…</p>
          )}

          {state === 'done' && (
            <>
              <p className={styles.sent}>
                Your email address is confirmed. You can join games with other
                people now.
              </p>
              <div className={styles.divider}>
                <Link href="/dashboard" className={styles.dividerLink}>
                  Go to your dashboard
                </Link>
              </div>
            </>
          )}

          {state === 'failed' && (
            <>
              <p className={styles.sent}>{error}</p>
              {resent ? (
                <p className={styles.sentNote}>
                  If that address has an account waiting to be confirmed, a new
                  link is on its way.
                </p>
              ) : (
                <>
                  <p className={styles.sentNote}>
                    Links expire after a week. Give us the address on your
                    account and we&apos;ll send a fresh one.
                  </p>
                  <form onSubmit={resend} className={styles.form} style={{ marginTop: '1.25rem' }}>
                    <div>
                      <label htmlFor="email" className={styles.fieldLabel}>Email</label>
                      <input
                        id="email"
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className={styles.fieldInput}
                        placeholder="you@example.com"
                      />
                    </div>
                    <button type="submit" className={styles.submitBtn}>
                      Send a new link
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>

        <Link href="/" className={styles.backLink}>
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
      <VerifyEmail />
    </Suspense>
  );
}
