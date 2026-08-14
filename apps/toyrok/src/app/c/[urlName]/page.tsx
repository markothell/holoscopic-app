'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toyrokApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Page, Band, Card, Action, Muted } from '@/components/Shell';
import { CircleMap } from '@/components/CircleMap';

// The circle home — Toyrok's hero surface. The map IS the page: the circle
// seen whole, every member, what each has explored alone and together, and
// the one thing running now underneath it. Activity surfaces (telling,
// sorting, the reveal) arrive with the Threshold port; until then the topic
// pages are read-only.
//
// Re-fetches on focus. Rounds advance on a server tick, so a fetch when the
// tab comes back is exactly as fresh as it needs to be.

export default function CircleHomePage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circle } = await toyrokApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, userId]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, load]);

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 text-3xl">Sign in</h1>
        <Muted>Circles are member spaces, so this page needs to know who you are.</Muted>
        <div className="mt-5"><Action href={`/login?callbackUrl=/c/${urlName}`}>Sign in</Action></div>
      </Page>
    );
  }

  // 404 everywhere, never 403: an absent circle and one you are not a member
  // of look identical from outside, so this page can never say which it was.
  if (error && !circle) {
    return (
      <Page>
        <h1 className="mb-2 text-3xl">{urlName}</h1>
        <Muted>{error}</Muted>
      </Page>
    );
  }
  if (!circle) return <Page><Muted>…</Muted></Page>;

  const seed = circle.currentSeed;
  const record = circle.seeds.filter(s => s.phase === 'revealed' || s.phase === 'skipped');

  return (
    <Page>
      <header className="mb-2">
        <h1 className="text-3xl leading-tight">{circle.title}</h1>
        <p className="mt-1 text-sm text-ink-faint">
          {circle.memberCount} {circle.memberCount === 1 ? 'person' : 'people'}
          {record.length > 0 && ` · ${record.length} ${record.length === 1 ? 'exploration' : 'explorations'} so far`}
        </p>
      </header>

      {error && circle && <p className="mb-4 text-sm text-ochre">{error}</p>}

      {circle.isMember && circle.participation ? (
        <CircleMap circle={circle} userId={userId} />
      ) : (
        <Muted>
          A circle's map is for its members. If you were invited, the invitation link is the way in.
        </Muted>
      )}

      {circle.phase === 'cycle' && seed && circle.isMember && (
        <div className="mt-8">
          <Card>
            <Band>Running now</Band>
            <h2 className="text-2xl leading-snug">{seed.payload.topic}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {seed.payload.poleA} · {seed.payload.poleB}
            </p>
            <p className="mt-3 text-sm text-ink-faint">
              Taking part happens on the activity's own pages — they move into Toyrok with the
              Threshold port.
            </p>
          </Card>
        </div>
      )}

      {record.length > 0 && circle.isMember && (
        <section className="mt-10">
          <Band>The record</Band>
          <ul className="space-y-3">
            {record.map(s => (
              <li key={s.id}>
                <Link
                  href={`/c/${circle.urlName}/topic/${s.id}`}
                  className="-mx-3 block rounded-lg px-3 py-2 transition-colors hover:bg-ground-deep"
                >
                  <span className="font-[family-name:var(--font-display)] text-lg">
                    {s.payload.topic}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {s.payload.poleA} · {s.payload.poleB}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
