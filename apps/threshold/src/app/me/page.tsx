'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Page, Band, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine, Polarity } from '@/components/TideLine';

// Circles I'm in, and what each is doing. The in-app half of M4 — the other
// half is the mail a phase transition sends, and this is where somebody lands
// when mail is off, muted, or simply not read.

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

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 font-[family-name:var(--font-source-serif)] text-3xl">Sign in</h1>
        <Muted>Your circles are tied to your account.</Muted>
        <div className="mt-5"><Action href="/login">Sign in</Action></div>
      </Page>
    );
  }

  return (
    <Page>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          Your circles
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">What each one is doing.</p>
        <TideLine />
      </header>

      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      {circles?.length === 0 ? (
        <Muted>You are not in a circle yet. One reaches you by invitation, or by its link.</Muted>
      ) : (
        <ul className="space-y-5">
          {circles?.map(c => <CircleRow key={c.id} circle={c} />)}
        </ul>
      )}

      <div className="mt-10 border-t border-[var(--rule)] pt-6">
        <Band>Being told</Band>
        <Muted>Everything the circles have told you, and which ones may email.</Muted>
        <div className="mt-3"><Quiet href="/notifications">Notifications and email</Quiet></div>
      </div>
    </Page>
  );
}

/**
 * What this circle is doing, in its own words.
 *
 * The list route serves the circle alone — no stories and no ranking — so this
 * says what is RUNNING rather than counting what is waiting on you. The count
 * lives on the circle page, where the snapshot that carries it is already
 * being fetched, and asking for it here would be one extra query per circle to
 * say something the next tap says anyway.
 */
function CircleRow({ circle }: { circle: Circle }) {
  const seed = circle.currentSeed;
  return (
    <li>
      <Link
        href={`/t/${circle.urlName}`}
        className="block rounded-lg px-3 py-2 -mx-3 transition-colors hover:bg-ground-deep"
      >
        <span className="font-[family-name:var(--font-source-serif)] text-lg">{circle.title}</span>

        {circle.phase === 'cycle' && seed ? (
          <>
            <p className="text-sm text-ink-soft">
              {seed.payload.topic} — {seed.phase === 'share' ? 'telling stories' : 'sorting them'}
            </p>
            <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mt-1" />
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            {circle.phase === 'idle' && 'Open, waiting for a topic'}
            {circle.phase === 'draft' && 'Not started yet'}
            {circle.phase === 'closed' && 'Closed'}
          </p>
        )}

        {circle.myEmailOptOut && (
          <p className="mt-1 text-xs text-ink-faint">email muted</p>
        )}
      </Link>
    </li>
  );
}
