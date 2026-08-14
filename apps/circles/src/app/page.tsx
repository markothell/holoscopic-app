'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Page, Action, Muted } from '@/components/Shell';

// The front door. Signed in, you belong on /circles — the product's home is
// the circles you're in, not a marketing page. Signed out, the offer in one
// breath. The full public lander is later work; this page's job is to route.
export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const signedIn = Boolean((session?.user as { id?: string } | undefined)?.id);

  useEffect(() => {
    if (signedIn) router.replace('/circles');
  }, [signedIn, router]);

  if (status === 'loading' || signedIn) return <Page><Muted>…</Muted></Page>;

  return (
    <Page>
      <div className="mt-16 max-w-md">
        <h1 className="text-4xl leading-tight">Thinking tools for community.</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
          A circle is a group of people who gather, each on their own time, to
          explore what they think — and keep what they make. This is where
          your circles live.
        </p>
        <div className="mt-8 flex items-center gap-5">
          <Action href="/login">Sign in</Action>
        </div>
        <p className="mt-6 text-sm text-ink-faint">
          Circles form by invitation for now — an invitation link is the way in.
        </p>
      </div>
    </Page>
  );
}
