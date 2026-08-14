'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Page, Action, Muted } from '@/components/Shell';

// Sign in to Toyrok. The account machinery is the platform's shared backend,
// and no copy here says so (P18): these are Toyrok accounts as far as anyone
// on this page is concerned — including every account that already exists.

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/circles';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
    setBusy(false);
    if (res?.error) setError(res.error);
    else window.location.href = callbackUrl;
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email" autoComplete="email" required
        className={field}
      />
      <input
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Password" autoComplete="current-password" required
        className={field}
      />
      {error && <p className="text-sm text-ochre">{error}</p>}
      <div className="pt-1">
        <Action type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Action>
      </div>
    </form>
  );
}

const field =
  'w-full rounded-lg border border-[var(--rule)] bg-card p-3 text-[15px] outline-none ' +
  'focus:border-[var(--rule-strong)]';

export default function LoginPage() {
  return (
    <Page>
      <header className="mb-8">
        <h1 className="text-3xl leading-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-faint">Your circles are tied to your account.</p>
      </header>
      <Suspense fallback={<Muted>…</Muted>}>
        <LoginForm />
      </Suspense>
    </Page>
  );
}
