'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle } from '@/lib/types';
import { Page, Title, Note } from '@/components/Scaffold';

// THE page you return to. Every transition email links here rather than to a
// phase surface, because a link to a phase is the most likely thing to go stale
// — the round may have advanced between the mail going out and it being read.
// So this page reads the snapshot and routes to whatever is actually live.
//
// Re-fetches on focus. There is no realtime in v1 (D14) and nothing here is
// synchronous; a phase turns over on a 60s server tick, so a fetch when the tab
// comes back is exactly as fresh as it needs to be.

function deadlineText(iso: string | null): string {
  if (!iso) return 'no clock on this phase';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closing now';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `about ${hours || 1}h left`;
  return `about ${Math.round(hours / 24)}d left`;
}

export default function CirclePage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { circle } = await thresholdApi.getCircle(urlName, userId);
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

  if (status === 'loading') return <Page><Note>…</Note></Page>;

  if (!userId) {
    return (
      <Page>
        <Title>Sign in</Title>
        <Note>
          Threshold needs an account (D6): the rounds run over days, so it needs an identity that
          lasts and an address to tell you when it is your turn.
        </Note>
        <Link href="/login" className="underline underline-offset-4">Sign in</Link>
      </Page>
    );
  }

  if (error) return <Page><Title>{urlName}</Title><Note>{error}</Note></Page>;
  if (!circle) return <Page><Note>…</Note></Page>;

  const seed = circle.currentSeed;
  const base = `/t/${circle.urlName}`;

  return (
    <Page>
      <Title>{circle.title}</Title>
      <Note>
        {circle.memberCount} {circle.memberCount === 1 ? 'member' : 'members'} · {circle.seedCount}{' '}
        {circle.seedCount === 1 ? 'topic' : 'topics'} · {circle.mode === 'single' ? 'single' : 'sharing circle'}
      </Note>

      {/* The phase machine, rendered plainly. What each of these looks like is
          the design conversation; WHERE each one sends you is settled. */}
      {circle.phase === 'draft' && (
        <Note>Not started yet.{circle.isCreator ? ' You can open it when the group is ready.' : ''}</Note>
      )}

      {circle.phase === 'seeding' && (
        <div>
          <Note>
            Everyone posts a topic and the two ends of its polarity — {deadlineText(circle.phaseDeadline)}.
          </Note>
          {circle.mySeed
            ? <Note>Yours is in: “{circle.mySeed.payload.topic}”.</Note>
            : <Link href={`${base}/seed`} className="underline underline-offset-4">Post your topic</Link>}
        </div>
      )}

      {circle.phase === 'cycle' && seed && (
        <div>
          <Note>
            Topic {circle.cycleIndex + 1} of {circle.seedCount}: <strong>{seed.payload.topic}</strong>
            {' — '}{seed.payload.poleA} or {seed.payload.poleB}. {deadlineText(seed.phaseDeadline)}.
          </Note>
          {seed.phase === 'share' && (
            <Link href={`${base}/share`} className="underline underline-offset-4">Tell your story</Link>
          )}
          {seed.phase === 'rank' && (
            <Link href={`${base}/rank`} className="underline underline-offset-4">Sort the stories</Link>
          )}
          {seed.phase === 'revealed' && (
            <Link href={`${base}/cycle/${seed.id}`} className="underline underline-offset-4">See where the line fell</Link>
          )}
        </div>
      )}

      {circle.phase === 'complete' && (
        <Link href={`${base}/result`} className="underline underline-offset-4">
          See all {circle.seedCount} topics together
        </Link>
      )}

      {/* Revealed cycles stay readable for the rest of the circle's life. */}
      {circle.seeds.some(s => s.phase === 'revealed') && (
        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <p className="text-xs uppercase tracking-wider text-ink-faint mb-2">Revealed</p>
          <ul className="space-y-1 text-sm">
            {circle.seeds.filter(s => s.phase === 'revealed').map(s => (
              <li key={s.id}>
                <Link href={`${base}/cycle/${s.id}`} className="underline underline-offset-4">
                  {s.payload.topic}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
