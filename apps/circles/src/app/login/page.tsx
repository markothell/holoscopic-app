'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Page, Action, Muted, Quiet } from '@/components/Shell';

// Sign in with your Holoscopic account — the same one that plays every app
// on the platform (P18, revised: the product IS Holoscopic, so saying so is
// correct now). Every existing account works here from day one.

function LoginForm() {
  const params = useSearchParams();
  // Same-origin paths only — an absolute or scheme-relative callbackUrl here
  // is an open redirect off a credential form.
  // Control characters go first: URL parsing drops tab/LF/CR, so a
  // percent-encoded "/<TAB>//evil.com" decodes past a prefix check and
  // then resolves off-site.
  const rawCallback = (params.get('callbackUrl') || '/circles').replace(/[\u0000-\u001F\u007F]/g, '');
  const callbackUrl =
    rawCallback.startsWith('/') && !rawCallback.startsWith('//') && !rawCallback.startsWith('/\\')
      ? rawCallback
      : '/circles';
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
      <p className="mt-6">
        <Suspense fallback={null}><SignupLink /></Suspense>
      </p>
    </Page>
  );
}

/** Keeps the invitation destination through the account-making detour. */
function SignupLink() {
  const params = useSearchParams();
  const cb = params.get('callbackUrl');
  return (
    <Quiet href={cb ? `/signup?callbackUrl=${encodeURIComponent(cb)}` : '/signup'}>
      New here — make an account
    </Quiet>
  );
}
