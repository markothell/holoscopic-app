'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, Seed } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine, Polarity } from '@/components/TideLine';

// THE page you return to. Every transition email links here rather than to a
// phase surface, because a link to a phase is the most likely thing to go stale
// — the round may have advanced between the mail going out and it being read.
// So this page reads the snapshot and routes to whatever is actually live.
//
// It is built in three bands, in the order somebody arriving from an email
// needs them: what is running now and what it wants from me, what the group has
// queued, and what the circle has already found. A circle that never closes
// (D29) means the third band is the durable part — somebody joining in week six
// lands on a page whose bottom half is the conversation they missed (D32).
//
// Re-fetches on focus. There is no realtime in v1 (D14) and nothing here is
// synchronous; a phase turns over on a 60s server tick, so a fetch when the tab
// comes back is exactly as fresh as it needs to be.

function deadlineText(iso: string | null): string {
  if (!iso) return '';
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
  const [busy, setBusy] = useState(false);

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

  // Every mutation re-reads the snapshot rather than trusting what it returned:
  // the mutation routes answer with the circle alone, while this page also needs
  // `shares`, `myRanking` and the derived waiting marker, which only the
  // snapshot route assembles.
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (status === 'loading') return <Page><Muted>…</Muted></Page>;

  if (!userId) {
    return (
      <Page>
        <h1 className="mb-2 font-[family-name:var(--font-source-serif)] text-3xl">Sign in</h1>
        <Muted>
          Threshold runs over days, so it needs an identity that lasts that long and an address to
          tell you when it is your turn.
        </Muted>
        <div className="mt-5"><Action href="/login">Sign in</Action></div>
      </Page>
    );
  }

  // 404 everywhere, never 403: an absent circle and one you are not a member of
  // look identical from outside, so this page can never say which it was.
  if (error && !circle) {
    return (
      <Page>
        <h1 className="mb-2 font-[family-name:var(--font-source-serif)] text-3xl">{urlName}</h1>
        <Muted>{error}</Muted>
      </Page>
    );
  }
  if (!circle) return <Page><Muted>…</Muted></Page>;

  const seed = circle.currentSeed;
  const base = `/t/${circle.urlName}`;
  // Derived server-side and never stored (D32) — the stories I have yet to place.
  const waiting = circle.waitingShareIds?.length ?? 0;
  const iShared = (circle.shares ?? []).some(s => s.isMine);
  const record = circle.seeds.filter(s => s.phase === 'revealed' || s.phase === 'skipped');
  // A one-off has one topic and no queue, so it has nothing to steer (D30).
  const facilitating = circle.isCreator && circle.mode === 'circle' && circle.phase !== 'closed';

  return (
    <Page>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          {circle.title}
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          {circle.memberCount} {circle.memberCount === 1 ? 'person' : 'people'}
          {record.length > 0 && ` · ${record.length} ${record.length === 1 ? 'topic' : 'topics'} so far`}
        </p>
        <TideLine />
      </header>

      {error && circle && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      {/* ── What is running now ─────────────────────────────────────────── */}

      {circle.phase === 'draft' && (
        <Card>
          <Muted>This circle opens when its host is ready.</Muted>
          {circle.isCreator && (
            <div className="mt-4">
              <Action pending={busy} onClick={() => act(() => thresholdApi.start(circle.id, userId))}>
                Open the circle
              </Action>
            </div>
          )}
        </Card>
      )}

      {circle.phase === 'idle' && (
        <Card>
          <Band>The circle is open</Band>
          <Muted>
            The topic with the most support goes next. Put one up, or back one that is already
            waiting.
          </Muted>
          <div className="mt-4"><Action href={`${base}/seed`}>Post a topic</Action></div>
        </Card>
      )}

      {circle.phase === 'cycle' && seed && (
        <Card>
          <Band>Running now</Band>
          <h2 className="mb-3 font-[family-name:var(--font-source-serif)] text-2xl leading-snug">
            {seed.payload.topic}
          </h2>
          <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mb-4" />

          {seed.phase === 'share' && (
            <>
              <Muted>
                {iShared
                  ? 'Your story is in. You can change it while this round is open.'
                  : 'Tell us about a time it was one of those two things.'}
              </Muted>
              <div className="mt-4 flex items-center gap-4">
                <Action href={`${base}/share`}>{iShared ? 'Change your story' : 'Tell your story'}</Action>
                <span className="text-sm text-ink-faint">{deadlineText(seed.phaseDeadline)}</span>
              </div>
            </>
          )}

          {seed.phase === 'rank' && (
            <>
              <Muted>
                {/* The marker is the stories themselves, never a count of work
                    outstanding — and a member who joined this week reads the
                    same sentence as everybody else, because they have no
                    ranking and so everything is waiting (D32). */}
                {waiting > 0
                  ? `${waiting} ${waiting === 1 ? 'story is' : 'stories are'} waiting on you.`
                  : 'Your sorting is in.'}
              </Muted>
              <div className="mt-4 flex items-center gap-4">
                <Action href={`${base}/rank`}>
                  {waiting > 0 ? 'Listen and sort' : 'See your sorting'}
                </Action>
                <span className="text-sm text-ink-faint">{deadlineText(seed.phaseDeadline)}</span>
              </div>
            </>
          )}
        </Card>
      )}

      {circle.phase === 'closed' && (
        <Card>
          <Band>Closed</Band>
          <Muted>
            {record.length === 1
              ? 'One topic, shared and sorted.'
              : `${record.length} topics, shared and sorted.`}
          </Muted>
          <div className="mt-4"><Action href={`${base}/result`}>See the whole circle</Action></div>
        </Card>
      )}

      {/* ── The queue ───────────────────────────────────────────────────── */}

      {circle.phase !== 'closed' && circle.queue.length > 0 && (
        <section className="mt-10">
          <Band>Waiting to run</Band>
          <ul className="space-y-5">
            {circle.queue.map((s, i) => (
              <QueuedTopic
                key={s.id}
                seed={s}
                position={i}
                isCreator={circle.isCreator}
                mine={circle.mySeedIds.includes(s.id)}
                busy={busy}
                onSupport={() => act(() => thresholdApi.toggleSupport(s.id, userId))}
                onPromote={() => act(() => thresholdApi.promote(s.id, userId))}
              />
            ))}
          </ul>
          {circle.phase === 'cycle' && (
            <div className="mt-4"><Quiet href={`${base}/seed`}>Post a topic</Quiet></div>
          )}
        </section>
      )}

      {/* ── What the circle has found ───────────────────────────────────── */}

      {record.length > 0 && (
        <section className="mt-10">
          <Band>Where the lines fell</Band>
          <ul className="space-y-3">
            {record.map(s => (
              <li key={s.id}>
                <Link
                  href={`${base}/cycle/${s.id}`}
                  className="block rounded-lg px-3 py-2 -mx-3 transition-colors hover:bg-ground-deep"
                >
                  <span className="font-[family-name:var(--font-source-serif)] text-lg">
                    {s.payload.topic}
                  </span>
                  <Polarity poleA={s.payload.poleA} poleB={s.payload.poleB} className="mt-1" />
                  {s.phase === 'skipped' && (
                    <span className="mt-1 block text-xs text-ink-faint">
                      the group moved on part-way
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {circle.mode === 'circle' && (
            <div className="mt-4"><Quiet href={`${base}/result`}>See them together</Quiet></div>
          )}
        </section>
      )}

      {/* ── Steering ────────────────────────────────────────────────────── */}

      {facilitating && (
        <section className="mt-12 border-t border-[var(--rule)] pt-5">
          <Band>Yours to steer</Band>
          <div className="flex flex-wrap gap-5">
            {seed && (
              <Quiet onClick={() => act(() => thresholdApi.advance(circle.id, userId))}>
                Move the group on
              </Quiet>
            )}
            {seed && (
              <Quiet
                onClick={() => {
                  if (confirm(`Move past “${seed.payload.topic}”? It keeps every story told on it.`)) {
                    void act(() => thresholdApi.skip(circle.id, userId));
                  }
                }}
              >
                Skip this topic
              </Quiet>
            )}
            <Quiet
              onClick={() => {
                if (confirm('Close this circle? It stops running topics, and the record stays readable.')) {
                  void act(() => thresholdApi.close(circle.id, userId));
                }
              }}
            >
              Close the circle
            </Quiet>
          </div>
        </section>
      )}
    </Page>
  );
}

/**
 * One queued topic. Support is the whole mechanic here (D27): one per member,
 * freely taken back, and the count is what decides which topic runs next.
 *
 * The count is a word plus a number, inline, rather than a numeral in a column
 * down the left — a bare number beside a list that is already in order reads as
 * the position in that order, which is the one thing it is not.
 *
 * `position` is what makes "up next" honest: the top of the queue runs next
 * whether it got there on support or on a promotion, and a reader needs the
 * fact rather than the mechanism.
 */
function QueuedTopic({ seed, position, isCreator, mine, busy, onSupport, onPromote }: {
  seed: Seed;
  position: number;
  isCreator: boolean;
  mine: boolean;
  busy: boolean;
  onSupport: () => void;
  onPromote: () => void;
}) {
  return (
    <li>
      <p className="font-[family-name:var(--font-source-serif)] text-lg leading-snug">
        {seed.payload.topic}
        {position === 0 && <span className="ml-2 align-middle text-xs text-ink-faint">up next</span>}
      </p>
      <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mt-1" />
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onSupport}
          disabled={busy}
          aria-pressed={seed.iSupport}
          className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
            seed.iSupport
              ? 'border-transparent bg-pole-a text-white'
              : 'border-[var(--rule-strong)] text-ink-soft hover:border-ink hover:text-ink'
          }`}
        >
          {seed.iSupport
            ? `Backing · ${seed.supporterCount}`
            : seed.supporterCount > 0 ? `Back this · ${seed.supporterCount}` : 'Back this'}
        </button>
        {mine && <span className="text-xs text-ink-faint">yours</span>}
        {isCreator && position > 0 && (
          <button
            type="button"
            onClick={onPromote}
            disabled={busy}
            className="text-xs text-ink-faint underline underline-offset-4 hover:text-ink"
          >
            run this next
          </button>
        )}
      </div>
    </li>
  );
}
