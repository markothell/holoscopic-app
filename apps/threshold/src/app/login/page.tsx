'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Page, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine } from '@/components/TideLine';
import { safeRedirect } from '@hs/auth/redirect';

// A holoscopic account, the same one that plays every other app here (D6).
//
// In the tide-line language now rather than the placeholder chrome: this is the
// first screen an invited person sees, and a sign-in that looks unfinished is a
// sign-in people abandon. It also carries the way to make an account, which it
// could not before, because until today there was nothing to link to.

function LoginForm() {
  const params = useSearchParams();
  // Same-origin paths only — an unchecked redirect off a credential form
  // is a phishing hop from a real domain, taken the moment a password
  // has been typed in. The guard and its attack vectors live in
  // @hs/auth/redirect, because ten copies of it shared one hole.
  const callbackUrl = safeRedirect(params.get('callbackUrl'), '/me');
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
    <form onSubmit={onSubmit} className="space-y-3">
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
      {error && <p className="text-sm text-pole-b">{error}</p>}
      <div className="pt-1">
        <Action type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Action>
      </div>
    </form>
  );
}

const field =
  'w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none ' +
  'focus:border-[var(--rule-strong)]';

export default function LoginPage() {
  return (
    <Page>
      <header className="mb-8">
        <Quiet href="/">Threshold</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Sign in
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          The same holoscopic account that plays every other app here.
        </p>
        <TideLine />
      </header>

      <Suspense fallback={<Muted>…</Muted>}>
        <LoginForm />
      </Suspense>

      <p className="mt-6">
        <Quiet href="/signup">Make an account</Quiet>
      </p>
    </Page>
  );
}
