'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { signup, ApiError } from '@/services/api';
import { Page, Action, Quiet, Muted } from '@/components/Shell';
import { safeRedirect } from '@hs/auth/redirect';

// Making the account. An invitation link is how people arrive at circles, and
// most invitees have no account yet — this is their door. It is a Holoscopic
// account, the same one that works in every app on the domain (P18).
//
// Signing in immediately afterwards is deliberate: a verification email goes
// out and nothing waits for it, because the guard checks that a token's
// subject matches the claimed user rather than that an address is confirmed.
// A person who has just typed a password should be inside, not reading their
// inbox.

function SignupForm() {
  const params = useSearchParams();
  // Same-origin paths only — an unchecked redirect off a credential form
  // is a phishing hop from a real domain, taken the moment a password
  // has been typed in. The guard and its attack vectors live in
  // @hs/auth/redirect, because ten copies of it shared one hole.
  const callbackUrl = safeRedirect(params.get('callbackUrl'), '/circles');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup({ email, password, name });
      const res = await signIn('credentials', { email, password, redirect: false, callbackUrl });
      if (res?.error) {
        // The account exists either way, so send them to sign in rather than
        // implying the signup failed and inviting a duplicate attempt.
        setError('Your account is made. Signing in needs another go.');
        setBusy(false);
        return;
      }
      window.location.href = callbackUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      {/* Required, though the account itself allows an empty one: this is the
          name your stories carry when a topic reveals. */}
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="What your circle should call you" autoComplete="name" required
        className={field}
      />
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)}
        placeholder="Email" autoComplete="email" required
        className={field}
      />
      <input
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="Password — at least 8 characters" autoComplete="new-password"
        minLength={8} required
        className={field}
      />
      {error && <p className="text-sm text-ochre">{error}</p>}
      <div className="pt-1">
        <Action type="submit" disabled={busy}>{busy ? 'Making it…' : 'Make the account'}</Action>
      </div>
    </form>
  );
}

const field =
  'w-full rounded-lg border border-[var(--rule)] bg-card p-3 text-[15px] outline-none ' +
  'focus:border-[var(--rule-strong)]';

export default function SignupPage() {
  return (
    <Page>
      <header className="mb-8">
        <h1 className="text-3xl leading-tight">Make an account</h1>
        <p className="mt-1 text-sm text-ink-faint">
          A circle runs over days, and your account is how it reaches you.
        </p>
      </header>
      <Suspense fallback={<Muted>…</Muted>}>
        <SignupForm />
      </Suspense>
      <p className="mt-6 text-sm leading-relaxed text-ink-faint">
        One Holoscopic account — the same one works in every app on this domain.
      </p>
      <p className="mt-4">
        <Quiet href="/login">Already have one — sign in</Quiet>
      </p>
    </Page>
  );
}
