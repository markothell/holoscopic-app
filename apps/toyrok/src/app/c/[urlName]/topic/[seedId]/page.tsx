'use client';

import { use, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toyrokApi, ApiError } from '@/services/api';
import type { Circle, Seed } from '@/lib/types';
import { Page, Band, Muted, Quiet } from '@/components/Shell';

// One exploration, read-only. The full surfaces — telling, sorting, the
// reveal — move into Toyrok with the Threshold port; until then this page
// keeps every map click landing somewhere honest.

export default function TopicPage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading' || !userId) return;
    toyrokApi.getCircle(urlName, userId)
      .then(({ circle }) => setCircle(circle))
      .catch(e => setError(e instanceof ApiError ? e.message : 'Could not load this circle'));
  }, [status, urlName, userId]);

  if (status === 'loading' || (!circle && !error)) return <Page><Muted>…</Muted></Page>;
  if (error || !circle) return <Page><Muted>{error || 'Not found'}</Muted></Page>;

  const seed: Seed | undefined = circle.seeds.find(s => s.id === seedId);
  if (!seed) return <Page><Muted>Not found</Muted></Page>;

  return (
    <Page>
      <p className="mb-6"><Quiet href={`/c/${circle.urlName}`}>{circle.title}</Quiet></p>
      <h1 className="text-3xl leading-tight">{seed.payload.topic}</h1>
      <p className="mt-1 text-sm text-ink-soft">{seed.payload.poleA} · {seed.payload.poleB}</p>

      <div className="mt-8">
        <Band>{seed.phase === 'revealed' || seed.phase === 'skipped' ? 'Finished' : 'In motion'}</Band>
        <Muted>
          The full view of this exploration — the stories, the sorting, where the line fell —
          arrives when the activity surfaces move into Toyrok.
        </Muted>
      </div>
    </Page>
  );
}
