'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Seed, SeedResult, Share } from '@/lib/types';
import { Page, Muted } from '@/components/Shell';
import { CycleReveal } from '@/components/CycleReveal';

// One cycle's reveal (PLAN.md §6.3, D23/D24), for a member of the circle.
//
// The surface itself is `components/CycleReveal.tsx` — every design decision
// about it lives in that file's header. This page is the member half: the
// session, the fetch and the two states that are not a reveal. The read is
// member-gated server-side and stays that way; the public `/demo` renders the
// same component over a written fixture rather than being let through here.

export default function CyclePage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [data, setData] = useState<{ result: SeedResult; shares: Share[]; seed: Seed } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await thresholdApi.seedResult(seedId, userId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this topic');
    }
  }, [seedId, userId]);

  useEffect(() => {
    if (status === 'loading' || !userId) return;
    void load();
  }, [status, userId, load]);

  if (status === 'loading' || (!data && !error)) return <Page><Muted>…</Muted></Page>;
  if (!data) return <Page><Muted>{error}</Muted></Page>;

  return (
    <CycleReveal
      seed={data.seed}
      shares={data.shares}
      result={data.result}
      base={`/t/${urlName}`}
    />
  );
}
