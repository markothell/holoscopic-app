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
      const apiUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

      // Create account
      const signupRes = await fetch(`${apiUrl}/api/auth/signup`, {
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
          // Don't block signup if migration fails
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
        // Account created but login failed - redirect to login page
        window.location.href = '/login?message=Account created. Please sign in.';
        return;
      }

      // Clear legacy userId from localStorage
      localStorage.removeItem('userId');

      // Success - force page reload to ensure session is loaded
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
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Loading...</div>
      </div>
    );
  }

  // Don't render signup form if already authenticated (will redirect)
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/holoLogo_dark.svg"
              alt="Holoscopic Logo"
              width={80}
              height={80}
              className="invert"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Holoscopic</h1>
          <p className="text-white/80">Create your account</p>
        </div>

        {/* Signup Form */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Field */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                placeholder="Your name"
                required
                disabled={isLoading}
              />
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                placeholder="your@email.com"
                disabled={isLoading}
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                placeholder="At least 8 characters"
                disabled={isLoading}
              />
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                placeholder="Confirm your password"
                disabled={isLoading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            {/* Sign In Link */}
            <p className="text-center text-sm text-gray-600">
              Already have an account?{' '}
              <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="text-blue-600 hover:text-blue-700 font-medium">
                Sign in
              </Link>
            </p>

            {/* Back to Home */}
            <p className="text-center text-sm text-gray-600 mt-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Loading...</div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
