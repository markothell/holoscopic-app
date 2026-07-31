'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '@/components/authCard.module.css';

// Step two of account recovery: redeem the emailed token and choose a new
// password. Whoever holds the link has proven control of the mailbox, which is
// the same claim signing in makes — so on success we sign them straight in
// rather than bouncing them to /login to type the password they just set.

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api';
      const res = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not reset your password.');
        setIsLoading(false);
        return;
      }

      const result = await signIn('credentials', {
        email: data.user.email,
        password,
        redirect: false,
      });

      // The password IS changed at this point whatever happens next, so the
      // fallback sends them to sign in rather than reporting a failure that
      // would make them request a second reset for an account already fixed.
      if (result?.ok) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/login?message=Password updated. Please sign in.';
      }
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
          <h1 className={styles.cardTitle}>New Password</h1>

          {token ? (
            <>
              <p className={styles.lede}>
                Choose a new password and we&apos;ll sign you in with it.
              </p>

              <form onSubmit={handleSubmit} className={styles.form}>
                <div>
                  <label htmlFor="password" className={styles.fieldLabel}>
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={styles.fieldInput}
                    placeholder="At least 8 characters"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className={styles.fieldLabel}>
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={styles.fieldInput}
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" disabled={isLoading} className={styles.submitBtn}>
                  {isLoading ? 'Saving...' : 'Set password and sign in'}
                </button>
              </form>
            </>
          ) : (
            // Reached without a token: someone opened /reset-password directly,
            // or a mail client mangled the link.
            <>
              <p className={styles.sent}>
                This page needs the link from your reset email.
              </p>
              <div className={styles.divider}>
                <Link href="/forgot-password" className={styles.dividerLink}>
                  Send me a new one
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
