'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { apiFetch } from '@/services/api';

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Same-origin paths only — an absolute or scheme-relative next here is an
  // open redirect off a credential form.
  // Control characters go first: URL parsing drops tab/LF/CR, so a
  // percent-encoded "/<TAB>//evil.com" decodes past a prefix check and
  // then resolves off-site.
  const rawNext = (params.get('next') || '/').replace(/[\u0000-\u001F\u007F]/g, '');
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
      ? rawNext
      : '/';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || password.length < 8) {
      setError('Email and a password of 8+ characters required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/auth/signup', {
        method: 'POST',
        body: { email: email.trim(), password, name: name.trim() },
      });
      const res = await signIn('credentials', { email: email.trim(), password, redirect: false });
      if (res?.error) throw new Error(res.error);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow">One account, every holoscopic game</p>
        <h1 className="display mt-3 text-6xl">
          Create<br /><span className="text-ay">account</span>
        </h1>
      </header>

      <section className="rise-in mt-auto pt-12" style={{ animationDelay: '0.1s' }}>
        <label className="eyebrow mb-2 block">Name</label>
        <TextField
          value={name}
          maxLength={40}
          onChange={e => setName(e.target.value)}
          placeholder="Maya"
          autoComplete="name"
        />
        <label className="eyebrow mb-2 mt-4 block">Email</label>
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
          autoComplete="new-password"
          placeholder="8+ characters"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <Button className="mt-5" onClick={submit} disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have one?{' '}
          <Link className="underline" href={`/login?next=${encodeURIComponent(next)}`}>
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
