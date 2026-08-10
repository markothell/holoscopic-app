'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { signup, ApiError } from '@/services/api';
import { Page, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine } from '@/components/TideLine';

// Making the account. Threshold had none of this: a person following an
// invitation could sign in with an account they already had, and otherwise had
// nowhere to go — on an app whose every route requires one (D6).
//
// The account is the platform's, not this app's. Signing up here is signing up
// for holoscopic, and the same email and password work in every other app on
// the domain, which is worth saying out loud to somebody who thinks they are
// making their fourth account this month.
//
// Signing in immediately afterwards is deliberate: a verification email goes
// out and nothing waits for it, because Threshold's guard checks that a token's
// subject matches the claimed user rather than that an address is confirmed. A
// person who has just typed a password should be inside, not reading their inbox.

function SignupForm() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') || '/';

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
        // implying the signup failed and inviting a second attempt that will
        // now be refused as a duplicate.
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
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Required, though the account itself allows an empty one: this is the
          name a story carries when its topic reveals, and an account with none
          reads as "Member" there. */}
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="What the circle should call you" autoComplete="name" required
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
      {error && <p className="text-sm text-pole-b">{error}</p>}
      <div className="pt-1">
        <Action type="submit" disabled={busy}>{busy ? 'Making it…' : 'Make the account'}</Action>
      </div>
    </form>
  );
}

const field =
  'w-full rounded-lg border border-[var(--rule)] bg-ground/40 p-3 text-[15px] outline-none ' +
  'focus:border-[var(--rule-strong)]';

export default function SignupPage() {
  return (
    <Page>
      <header className="mb-8">
        <Quiet href="/">Threshold</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Make an account
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          A circle runs over days, and this is how it reaches you.
        </p>
        <TideLine />
      </header>

      <Suspense fallback={<Muted>…</Muted>}>
        <SignupForm />
      </Suspense>

      <p className="mt-6 text-sm leading-relaxed text-ink-faint">
        One holoscopic account, the same one every other app on this domain uses.
      </p>
      <p className="mt-4">
        <Quiet href="/login">Already have one — sign in</Quiet>
      </p>
    </Page>
  );
}
