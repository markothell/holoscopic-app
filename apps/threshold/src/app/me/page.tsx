'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Page, Title, Note } from '@/components/Scaffold';

// Circles I'm in, and what is waiting on me. The in-app half of M4 — the other
// half is the mail that a phase transition sends, and this is what somebody
// lands on when mail is off or opted out of.
export default function MePage() {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    thresholdApi.myCircles(userId)
      .then(({ circles }) => setCircles(circles))
      .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load your circles'));
  }, [userId]);

  if (status === 'loading') return <Page><Note>…</Note></Page>;

  if (!userId) {
    return (
      <Page>
        <Title>Sign in</Title>
        <Link href="/login" className="underline underline-offset-4">Sign in</Link>
      </Page>
    );
  }

  return (
    <Page>
      <Title>Your circles</Title>
      {error && <Note>{error}</Note>}
      {circles?.length === 0 && <Note>Nothing yet.</Note>}
      <ul className="space-y-3">
        {circles?.map(c => (
          <li key={c.id}>
            <Link href={`/t/${c.urlName}`} className="underline underline-offset-4">{c.title}</Link>
            <span className="text-ink-faint text-sm">
              {' '}— {c.phase === 'cycle' && c.currentSeed
                ? `${c.currentSeed.payload.topic}, ${c.currentSeed.phase}`
                : c.phase}
            </span>
          </li>
        ))}
      </ul>
    </Page>
  );
}
