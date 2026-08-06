'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Page, Title, Note } from '@/components/Scaffold';

// A holoscopic account, the same one that plays every other game here.
// Unstyled on purpose — §9.2.
function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/me';
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
        className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2"
      />
      <input
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Password" autoComplete="current-password" required
        className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2"
      />
      {error && <p className="text-sm text-ink-soft">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="rounded bg-ink px-4 py-2 text-[var(--ground)] disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Page>
      <Title>Sign in</Title>
      <Note>The same holoscopic account that plays every other game here.</Note>
      <Suspense fallback={<Note>…</Note>}>
        <LoginForm />
      </Suspense>
    </Page>
  );
}
