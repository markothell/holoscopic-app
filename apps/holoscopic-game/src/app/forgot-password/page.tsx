'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '@/components/authCard.module.css';

// Step one of account recovery. Before this page existed the only reset was an
// admin-only endpoint, so a locked-out user's sole route back in was emailing a
// human — and the site had no contact link either.
//
// COPY NOTE: the confirmation says "if there's an account", not "we've sent
// you an email". The backend deliberately answers identically whether or not
// the address is registered (see routes/auth.js /forgot-password), so claiming
// a send would be a lie half the time. The wording has to carry that.

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      const res = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        // The only non-200 the route produces is the rate limiter, which is
        // about how often you asked rather than about the account.
        setError('Too many reset requests from here. Try again later.');
        setIsLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError('Could not reach the server. Try again in a moment.');
      setIsLoading(false);
    }
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
          <h1 className={styles.cardTitle}>Reset Password</h1>

          {sent ? (
            <>
              <p className={styles.sent}>
                If there&apos;s an account for {email}, a reset link is on its way.
                It works for one hour.
              </p>
              <p className={styles.sentNote}>
                Nothing in your inbox after a few minutes? Check the spam folder,
                then try again with another address you might have used.
              </p>
              <div className={styles.divider}>
                <Link href="/login" className={styles.dividerLink}>
                  Back to sign in
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className={styles.lede}>
                Give us the address on your account and we&apos;ll send a link for
                choosing a new password.
              </p>

              <form onSubmit={handleSubmit} className={styles.form}>
                <div>
                  <label htmlFor="email" className={styles.fieldLabel}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={styles.fieldInput}
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" disabled={isLoading} className={styles.submitBtn}>
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <div className={styles.divider}>
                <span className={styles.dividerText}>Remembered it? </span>
                <Link href="/login" className={styles.dividerLink}>
                  Sign in
                </Link>
              </div>
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
