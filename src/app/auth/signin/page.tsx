'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignInPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Sign In to Holoscopic</h1>
          <p className="mt-2 text-gray-600">
            Use your MediaWiki account to access the app
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error === 'OAuthCallback' && 'Authentication failed. Please try again.'}
            {error === 'AccessDenied' && 'Access denied. You may not have permission.'}
            {error === 'Configuration' && 'There is a problem with the server configuration.'}
            {error === 'Default' && 'An error occurred during sign in.'}
          </div>
        )}

        <div className="bg-white shadow-lg rounded-lg px-8 py-6">
          <button
            onClick={() => signIn('mediawiki', { callbackUrl })}
            className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition"
          >
            Sign in with MediaWiki
          </button>

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600">
              Don't have a wiki account?{' '}
              <a
                href="http://157.245.188.98/wiki/Special:CreateAccount"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Create one on the wiki
              </a>
            </p>
          </div>
        </div>

        <div className="text-center text-sm text-gray-500">
          <Link href="/" className="hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}