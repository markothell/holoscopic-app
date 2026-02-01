'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

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

  // Redirect if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
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

      // Create account
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

      // Check for legacy localStorage userId to migrate
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

      // Auto sign in after successful signup
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

      // Clear legacy userId from localStorage
      localStorage.removeItem('userId');

      // Success - force page reload
      if (result?.ok) {
        window.location.href = callbackUrl;
      }

    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  // Show loading state while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Don't render signup form if already authenticated (will redirect)
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic"
              width={40}
              height={40}
            />
            <span className="text-xl font-semibold text-white">Holoscopic</span>
          </Link>
        </div>

        {/* Signup Form */}
        <div className="bg-[#111827] border border-white/10 rounded-lg p-6">
          <h1 className="text-lg font-medium text-white mb-6">Create account</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm text-gray-400 mb-1.5">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                placeholder="Your name"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm text-gray-400 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-gray-400 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                placeholder="At least 8 characters"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm text-gray-400 mb-1.5">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3 py-2 bg-[#0a0f1a] border border-white/10 rounded text-white text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
                placeholder="Confirm your password"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded transition-colors"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm">
            <span className="text-gray-500">Already have an account? </span>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="text-sky-400 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
