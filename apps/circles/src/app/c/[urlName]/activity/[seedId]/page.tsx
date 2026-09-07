'use client';

// One gather ask, phase-routed (PRIMITIVES.md §9): respond while it runs,
// the reveal once it closes — and because input stays open after the reveal
// (B4), the two are one surface with the compose offered wherever it is still
// honest. Visibility is all server-side: sealed serves own-only until the
// close, so this page renders whatever arrives and never filters.
//
// The surface itself lives in components/GatherSurface.tsx, because /demo
// renders the same one against a written fixture (lib/demo.ts). This page is
// the loader and the guards; that file is the surface.

import { use, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Page, Card, Muted, Action, Quiet } from '@/components/Shell';
import { GatherSurface } from '@/components/GatherSurface';
import { circlesApi, ApiError } from '@/services/api';
import type { Circle, GatherExtras } from '@/lib/types';
import { seedActivityOf } from '@/lib/types';

export default function ActivityPage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const base = `/c/${urlName}`;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [extras, setExtras] = useState<GatherExtras | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circle } = await circlesApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);
      if (userId && circle.isMember) {
        try {
          const { seed: _seed, ...ex } = await circlesApi.seedResponses(circle.id, seedId, userId);
          setExtras(ex as GatherExtras);
        } catch (e) {
          // A 404 is the ordinary queued state — the guard below says so in
          // words. Anything else is a real failure and must not be swallowed
          // into an empty surface.
          setExtras(null);
          if (!(e instanceof ApiError && e.status === 404)) {
            console.error('[gather] responses read failed:', e);
            setError(e instanceof ApiError ? e.message : 'Could not load the responses — reload to retry');
          }
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, seedId, userId]);

  useEffect(() => {
    if (status === 'loading') return;
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, load]);

  if (status === 'loading' || (!circle && !error)) return <Page><Muted>…</Muted></Page>;
  if (!userId) {
    return (
      <Page>
        <Card>
          <Muted>This is a member space.</Muted>
          <div className="mt-4">
            <Action href={`/login?callbackUrl=${encodeURIComponent(`${base}/activity/${seedId}`)}`}>Sign in</Action>
          </div>
        </Card>
      </Page>
    );
  }
  if (!circle) return <Page><p className="text-ochre">{error}</p></Page>;

  const seed = circle.seeds.find(s => s.id === seedId);
  if (!seed || seedActivityOf(circle, seed) !== 'gather') {
    return (
      <Page>
        <Muted>Nothing here by that name.</Muted>
        <div className="mt-4"><Action href={base}>To the circle</Action></div>
      </Page>
    );
  }
  if (!circle.isMember) {
    return (
      <Page>
        <Muted>This activity belongs to {circle.title}&rsquo;s members.</Muted>
        <div className="mt-4"><Action href={base}>To the circle</Action></div>
      </Page>
    );
  }

  const queued = seed.phase === 'pending' || seed.phase === 'nominated';
  const header = (
    <div className="pt-2">
      <Quiet href={base}>{circle.title}</Quiet>
      <h1 className="mt-1 text-2xl leading-snug" style={{ textWrap: 'balance' }}>
        {seed.payload.prompt}
      </h1>
      {seed.payload.context && <Muted>{seed.payload.context}</Muted>}
    </div>
  );

  if (queued) {
    const more = Math.max(0, (circle.approvalsToStart ?? 3) - seed.supporterCount);
    return (
      <Page>
        {header}
        <div className="mt-6">
          {seed.phase === 'nominated' ? (
            <>
              <Muted>
                Put to the circle — {more === 0
                  ? 'ready to start.'
                  : `${more} more ${more === 1 ? 'backer' : 'backers'} and it starts.`}
              </Muted>
              <div className="mt-4">
                <Action onClick={async () => {
                  await circlesApi.supportSeed(circle.id, seed.id, userId);
                  await load();
                }}>
                  {seed.iSupport ? 'Backed — take it back' : 'Back this'}
                </Action>
              </div>
            </>
          ) : (
            <Muted>Approved — waiting for a slot.</Muted>
          )}
        </div>
      </Page>
    );
  }

  return (
    <GatherSurface
      key={`${seed.id}:${seed.phase}`}
      circle={circle}
      seed={seed}
      extras={extras}
      userId={userId}
      header={header}
      onChanged={load}
      pageError={error}
    />
  );
}
