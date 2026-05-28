'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './page.module.css';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const { data: session, status } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const original = document.body.style.background;
    document.body.style.background = '#F7F4EF';
    return () => { document.body.style.background = original; };
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

      const signupRes = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });

      const signupData = await signupRes.json();

      if (!signupRes.ok || !signupData.success) {
        setError(signupData.error || 'Failed to create account');
        setIsLoading(false);
        return;
      }

      const legacyUserId = localStorage.getItem('userId');
      if (legacyUserId) {
        try {
          await fetch(`${apiUrl}/api/auth/migrate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: signupData.user.id,
              legacyUserId
            })
          });
        } catch (migrationError) {
          console.error('Migration error:', migrationError);
        }
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl
      });

      if (result?.error) {
        window.location.href = '/login?message=Account created. Please sign in.';
        return;
      }

      localStorage.removeItem('userId');

      if (result?.ok) {
        window.location.href = callbackUrl;
      }

    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (status === 'authenticated') {
    return <div className={styles.loading}>Redirecting...</div>;
  }

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
          <h1 className={styles.cardTitle}>Create Account</h1>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div>
              <label htmlFor="name" className={styles.fieldLabel}>Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={styles.fieldInput}
                placeholder="Your name"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="email" className={styles.fieldLabel}>Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={styles.fieldInput}
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className={styles.fieldLabel}>Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className={styles.fieldInput}
                placeholder="At least 8 characters"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={styles.fieldLabel}>Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className={styles.fieldInput}
                placeholder="Confirm your password"
                disabled={isLoading}
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              type="submit"
              disabled={isLoading}
              className={styles.submitBtn}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className={styles.divider}>
            <span className={styles.dividerText}>Already have an account? </span>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className={styles.dividerLink}
            >
              Sign in
            </Link>
          </div>
        </div>

        <Link href="/" className={styles.backLink}>
          &larr; Back to home
        </Link>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
      <SignupForm />
    </Suspense>
  );
}
