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
  // Derived server-side and never stored (D32) — the stories I have not placed.
  const waiting = circle.waitingShareIds?.length ?? 0;
  const revealed = circle.seeds.filter(s => s.phase === 'revealed' || s.phase === 'skipped');

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

      {/* Idle is an OPEN circle with nothing queued — a pause, not an ending
          (D29). The only thing anybody can do about it is put a topic up. */}
      {circle.phase === 'idle' && (
        <div>
          <Note>Nothing is running. The topic with the most support goes next.</Note>
          <Link href={`${base}/seed`} className="underline underline-offset-4">Post a topic</Link>
        </div>
      )}

      {circle.phase === 'cycle' && seed && (
        <div>
          <Note>
            <strong>{seed.payload.topic}</strong>
            {' — '}{seed.payload.poleA} or {seed.payload.poleB}. {deadlineText(seed.phaseDeadline)}.
          </Note>
          {seed.phase === 'share' && (
            <Link href={`${base}/share`} className="underline underline-offset-4">Tell your story</Link>
          )}
          {seed.phase === 'rank' && (
            <Link href={`${base}/rank`} className="underline underline-offset-4">
              Sort the stories
              {waiting > 0 ? ` — ${waiting} still waiting on you` : ''}
            </Link>
          )}
        </div>
      )}

      {circle.phase === 'closed' && (
        <Note>This circle has closed.</Note>
      )}

      {/* The queue (§6 has no design for this yet — D27 settles the mechanic).
          Rendered in the order the machine will actually take it. */}
      {circle.queue.length > 0 && (
        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <p className="text-xs uppercase tracking-wider text-ink-faint mb-2">Waiting</p>
          <ul className="space-y-1 text-sm">
            {circle.queue.map(s => (
              <li key={s.id}>
                {s.payload.topic} · {s.supporterCount}
                {s.iSupport ? ' (yours in)' : ''}
                {s.promotedAt ? ' · promoted' : ''}
              </li>
            ))}
          </ul>
          <Link href={`${base}/seed`} className="underline underline-offset-4 text-sm">Post another</Link>
        </div>
      )}

      {/* Revealed cycles stay readable for the rest of the circle's life — and a
          member who arrives in week six reads every one of them (D32). A skipped
          topic is here too: it kept every story it had. */}
      {revealed.length > 0 && (
        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <p className="text-xs uppercase tracking-wider text-ink-faint mb-2">Revealed</p>
          <ul className="space-y-1 text-sm">
            {revealed.map(s => (
              <li key={s.id}>
                <Link href={`${base}/cycle/${s.id}`} className="underline underline-offset-4">
                  {s.payload.topic}
                </Link>
                {s.phase === 'skipped' ? ' · moved on' : ''}
              </li>
            ))}
          </ul>
          <Link href={`${base}/result`} className="underline underline-offset-4 text-sm">
            See them together
          </Link>
        </div>
      )}
    </Page>
  );
}
