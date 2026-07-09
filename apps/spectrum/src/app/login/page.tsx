'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) { setError('Email and password required'); return; }
    setBusy(true);
    setError(null);
    const res = await signIn('credentials', { email: email.trim(), password, redirect: false });
    if (res?.error) {
      setError(res.error === 'CredentialsSignin' ? 'Wrong email or password' : res.error);
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow">Welcome back</p>
        <h1 className="display mt-3 text-6xl">
          Sign<br /><span className="text-ax">in</span>
        </h1>
      </header>

      <section className="rise-in mt-auto pt-12" style={{ animationDelay: '0.1s' }}>
        <label className="eyebrow mb-2 block">Email</label>
        <TextField
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
        <label className="eyebrow mb-2 mt-4 block">Password</label>
        <TextField
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <Button className="mt-5" onClick={submit} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
        <p className="mt-6 text-center text-sm text-ink-soft">
          New here?{' '}
          <Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
