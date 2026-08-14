'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toyrokApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Page, Action, Muted } from '@/components/Shell';

// Your circles — the signed-in home. Each row says what that circle is doing
// right now in its own words; the count of what is waiting on you lives on
// the circle home, where the snapshot that carries it is fetched anyway.

export default function CirclesPage() {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    toyrokApi.myCircles(userId)
      .then(({ circles }) => setCircles(circles))
      .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load your circles'));
  }, [userId]);

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 text-3xl">Sign in</h1>
        <Muted>Your circles are tied to your account.</Muted>
        <div className="mt-5"><Action href="/login">Sign in</Action></div>
      </Page>
    );
  }

  return (
    <Page>
      <header className="mb-8">
        <h1 className="text-3xl leading-tight">Your circles</h1>
        <p className="mt-1 text-sm text-ink-faint">What each one is doing.</p>
      </header>

      {error && <p className="mb-6 text-sm text-ochre">{error}</p>}

      {circles?.length === 0 ? (
        <Muted>You are not in a circle yet. One reaches you by invitation, or by its link.</Muted>
      ) : (
        <ul className="space-y-4">
          {circles?.map(c => (
            <li key={c.id}>
              <Link
                href={`/c/${c.urlName}`}
                className="-mx-3 block rounded-xl px-3 py-3 transition-colors hover:bg-ground-deep"
              >
                <span className="font-[family-name:var(--font-display)] text-xl">{c.title}</span>
                <span className="mt-0.5 block text-sm text-ink-faint">
                  {c.memberCount} {c.memberCount === 1 ? 'person' : 'people'}
                  {' · '}
                  {c.phase === 'cycle' && c.currentSeed
                    ? <>running: {c.currentSeed.payload.topic}</>
                    : c.phase === 'closed' ? 'closed' : 'open'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
