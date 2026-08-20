'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { circlesApi, synthesisApi, ApiError, SYNTHESIS_URL } from '@/services/api';
import type { Circle, MyIdea } from '@/lib/types';
import { Page, Band, Card, Action, Muted } from '@/components/Shell';
import { CircleMap } from '@/components/CircleMap';

// The circle home — the product's hero surface. The map IS the page: the circle
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
      const { circle } = await circlesApi.getCircle(urlName, userId);
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
        <JoinCard circle={circle} userId={userId} onJoined={load} />
      )}

      {circle.isMember && (
        <div className="mt-4">
          <Link
            href={`/c/${circle.urlName}/new`}
            className="text-sm text-ink-faint underline underline-offset-4 hover:text-ink"
          >
            + Start an activity
          </Link>
        </div>
      )}

      {/* Every live cycle gets a card — a circle runs up to maxLive at once
          (B1; 1 unless the circle opted into more), so this is a list of
          one-or-more, never a single slot. Each activity reads its own
          extras from seedExtras; the flat-merged top level is only the
          FIRST live seed's. */}
      {circle.phase === 'cycle' && circle.isMember && (circle.liveSeedIds ?? (seed ? [seed.id] : []))
        .map(id => circle.seeds.find(s => s.id === id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map(live => {
          const extras = (circle.seedExtras?.[live.id] ?? {}) as {
            shares?: { isMine: boolean }[];
            waitingShareIds?: string[];
            responses?: unknown[];
            myResponse?: unknown;
          };
          if (live.activity === 'gather') {
            const mineIn = Boolean(extras.myResponse);
            const openWall = live.payload.reveal === 'open';
            const answered = (extras.responses ?? []).length;
            return (
              <div key={live.id} className="mt-8">
                <Card>
                  <Band>Running now</Band>
                  <h2 className="text-2xl leading-snug">{live.payload.prompt}</h2>
                  {live.payload.context && (
                    <p className="mt-1 text-sm text-ink-soft">{live.payload.context}</p>
                  )}
                  <p className="mt-3 text-sm text-ink-soft">
                    {mineIn
                      ? openWall
                        ? `Yours is in — ${answered} of ${circle.memberCount} have answered.`
                        : 'Yours is in. Waiting on results.'
                      : openWall
                        ? `${answered} of ${circle.memberCount} have answered.`
                        : 'Sealed until everyone has answered.'}
                  </p>
                  <div className="mt-4">
                    <Action href={`/c/${circle.urlName}/activity/${live.id}`}>
                      {mineIn ? 'See where it stands' : 'Add yours'}
                    </Action>
                  </div>
                </Card>
              </div>
            );
          }
          const shares = extras.shares ?? circle.shares ?? [];
          const iTold = shares.some(s => s.isMine);
          const waiting = (extras.waitingShareIds ?? circle.waitingShareIds)?.length ?? 0;
          const topicHref = `/c/${circle.urlName}/topic/${live.id}`;
          return (
            <div key={live.id} className="mt-8">
              <Card>
                <Band>Running now</Band>
                <h2 className="text-2xl leading-snug">{live.payload.topic}</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {live.payload.poleA} · {live.payload.poleB}
                </p>
                {live.phase === 'share' && (
                  <>
                    <p className="mt-3 text-sm text-ink-soft">
                      {iTold
                        ? 'Your story is in. You can change it while this round is open.'
                        : 'Tell a time it was one of those two things.'}
                    </p>
                    <div className="mt-4">
                      <Action href={topicHref}>{iTold ? 'Change your story' : 'Tell your story'}</Action>
                    </div>
                  </>
                )}
                {live.phase === 'rank' && (
                  <>
                    <p className="mt-3 text-sm text-ink-soft">
                      {waiting > 0
                        ? `${waiting} ${waiting === 1 ? 'story is' : 'stories are'} waiting on you.`
                        : 'Your sorting is in.'}
                    </p>
                    <div className="mt-4">
                      <Action href={topicHref}>{waiting > 0 ? 'Read and sort' : 'See your sorting'}</Action>
                    </div>
                  </>
                )}
              </Card>
            </div>
          );
        })}

      {!circle.isMember && (
        <p className="mt-8 text-sm text-ink-faint">
          {circle.phase === 'cycle' && seed
            ? `Running now: ${seed.payload.topic}.`
            : 'The circle is open, gathering its next topic.'}
        </p>
      )}

      {circle.isMember && userId && (
        <NominationsBand circle={circle} userId={userId} onChanged={load} />
      )}

      {record.length > 0 && circle.isMember && (
        <section className="mt-10">
          <Band>The record</Band>
          <ul className="space-y-3">
            {record.map(s => (
              <li key={s.id}>
                <Link
                  href={s.activity === 'gather'
                    ? `/c/${circle.urlName}/activity/${s.id}`
                    : `/c/${circle.urlName}/topic/${s.id}`}
                  className="-mx-3 block rounded-lg px-3 py-2 transition-colors hover:bg-ground-deep"
                >
                  <span className="font-[family-name:var(--font-display)] text-lg">
                    {s.payload.topic}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-faint">
                    {s.activity === 'gather'
                      ? ({ story: 'a wall of stories', placement: 'where everyone stands',
                          'story-placement': 'stories on a line', words: 'a word portrait' }[s.payload.shape ?? 'story'] ?? 'an activity')
                      : `${s.payload.poleA} · ${s.payload.poleB}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {circle.isMember && (
        <SynthesesBand circle={circle} userId={userId} onShared={load} />
      )}
    </Page>
  );
}

/**
 * What has been put to the circle and not yet taken up (B3 revised,
 * 2026-08-20: EVERY ask walks through approval — one member must not be able
 * to commit the whole group's attention alone). Unordered by design; backing
 * is a count toward approvalsToStart, not a rank. Synthesis documents keep
 * their own band below — same mechanic, different words.
 */
function NominationsBand({ circle, userId, onChanged }: {
  circle: Circle;
  userId: string;
  onChanged: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const nominations = (circle.nominations ?? []).filter(s => s.activity !== 'synthesis');
  const queued = (circle.queue ?? []).filter(s => s.activity !== 'synthesis');
  if (nominations.length === 0 && queued.length === 0) return null;

  const back = async (seedId: string) => {
    setBusyId(seedId);
    try {
      await circlesApi.supportSeed(circle.id, seedId, userId);
      await onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-10">
      <Band>Proposed</Band>
      <ul className="space-y-3">
        {nominations.map(s => {
          const more = Math.max(0, (circle.approvalsToStart ?? 3) - s.supporterCount);
          return (
            <li key={s.id} className="flex items-baseline justify-between gap-4">
              <div>
                <span className="font-[family-name:var(--font-display)] text-lg">{s.payload.topic}</span>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {more === 0 ? 'Ready to start' : `${more} more ${more === 1 ? 'backer' : 'backers'} to start`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => back(s.id)}
                disabled={busyId === s.id}
                aria-pressed={s.iSupport}
                className="flex-none cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
                style={s.iSupport
                  ? { borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--card)' }
                  : { borderColor: 'var(--rule-strong)', color: 'var(--ink-soft)' }}
              >
                {s.iSupport ? 'Backed' : 'Back this'}
              </button>
            </li>
          );
        })}
        {queued.map(s => (
          <li key={s.id} className="flex items-baseline justify-between gap-4">
            <div>
              <span className="font-[family-name:var(--font-display)] text-lg">{s.payload.topic}</span>
              <span className="mt-0.5 block text-xs text-ink-faint">Approved — waiting for a slot</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Documents shared with this circle. A synthesis is an ongoing mapping —
 * everyone grows their own thought map and what people respond to weaves
 * together — and it starts life as ONE person's, private, in the synthesis
 * app. Sharing it here is what lets the circle read and add to it.
 *
 * Shared is not the same as taken on: a shared document sits outside the
 * queue until somebody other than its author backs it, which is what the
 * support control below does. Until then it is an offer.
 *
 * These are ordinary seeds now (2026-08-20) — they arrive in the circle
 * snapshot like any topic, so there is no second fetch and nothing to keep
 * in sync.
 */
function SynthesesBand({ circle, userId, onShared }: {
  circle: Circle;
  userId: string;
  onShared: () => Promise<void>;
}) {
  const [mine, setMine] = useState<MyIdea[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shared = circle.seeds.filter(s => s.activity === 'synthesis');
  const sharedIds = new Set(shared.map(s => s.payload.ideaId).filter(Boolean));

  const openPicker = async () => {
    setPicking(true);
    setError(null);
    if (mine) return;
    try {
      const { ideas } = await synthesisApi.myIdeas(userId);
      setMine(ideas);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach your documents');
      setMine([]);
    }
  };

  const share = async (idea: MyIdea) => {
    setBusy(true);
    setError(null);
    try {
      await circlesApi.postSeed(circle.id, userId, { ideaId: idea.id }, 'synthesis');
      setPicking(false);
      await onShared();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  const back = async (seedId: string) => {
    setBusy(true);
    try {
      await circlesApi.supportSeed(circle.id, seedId, userId);
      await onShared();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10">
      <Band>Syntheses</Band>
      {shared.length === 0 && (
        <Muted>
          A synthesis is an ongoing mapping the whole circle is in — everyone grows their own
          thought map, and what people respond to weaves together. Write one in Synthesis, then
          share it here when it is ready for company.
        </Muted>
      )}
      {shared.length > 0 && (
        <ul className="space-y-3">
          {shared.map(seed => (
            <li key={seed.id} className="flex items-start justify-between gap-3">
              {/* ?idea= opens THIS document rather than whichever map the
                  reader had open last — without it the link is a lie. */}
              <a
                href={seed.payload.ideaCode ? `${SYNTHESIS_URL}/?idea=${seed.payload.ideaCode}` : SYNTHESIS_URL}
                className="-mx-3 block flex-1 rounded-lg px-3 py-2 transition-colors hover:bg-ground-deep"
              >
                <span className="font-[family-name:var(--font-display)] text-lg">
                  {seed.payload.title || seed.payload.topic}
                </span>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  {seed.phase === 'nominated'
                    ? 'shared — open to read and add to'
                    : seed.phase === 'pending'
                      ? `taken up · ${seed.supporterCount} backing`
                      : seed.phase === 'exploring'
                        ? 'the circle is on it'
                        : 'closed for now'}
                </span>
              </a>
              {seed.phase === 'nominated' && seed.authorId !== userId && (
                <Action onClick={() => void back(seed.id)} disabled={busy}>
                  Take it up
                </Action>
              )}
            </li>
          ))}
        </ul>
      )}

      {!picking && (
        <button
          type="button"
          onClick={() => void openPicker()}
          className="mt-4 text-sm underline underline-offset-4 text-ink-faint hover:text-ink"
        >
          + Share a document
        </button>
      )}
      {picking && (
        <div className="mt-4 max-w-md">
          {mine === null && <Muted>Looking…</Muted>}
          {mine && mine.length === 0 && (
            <Muted>
              Nothing to share yet. Documents you write in Synthesis show up here.
            </Muted>
          )}
          {mine && mine.length > 0 && (
            <ul className="space-y-1.5">
              {mine.filter(i => !sharedIds.has(i.id)).map(idea => (
                <li key={idea.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void share(idea)}
                    className="-mx-3 block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-ground-deep disabled:opacity-50"
                  >
                    <span className="text-sm">{idea.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-3 text-xs underline underline-offset-4 text-ink-faint"
          >
            Never mind
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-pole-b">{error}</p>}
    </section>
  );
}

/**
 * The seat at the edge of the circle. A signed-in visitor who is not a member
 * sees the shell — title, people, what is running — and this card. The
 * invitation gate lives server-side (joinCircle): when the circle requires
 * one, the email entered here must be an address the invitation went to, so
 * the card asks for it in exactly those words. The same address becomes where
 * this circle's mail reaches you, which the card also says — one field, both
 * facts, no fine print.
 */
function JoinCard({ circle, userId, onJoined }: {
  circle: Circle;
  userId: string;
  onJoined: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      await circlesApi.join(circle.id, userId, email.trim() || undefined);
      await onJoined();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not work');
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 max-w-md">
      <Card>
        <Band>Take a seat</Band>
        <Muted>
          {circle.memberCount === 0
            ? 'This circle is just forming.'
            : `${circle.memberCount} ${circle.memberCount === 1 ? 'person is' : 'people are'} in this circle.`}{' '}
          If an invitation brought you here, enter the email it went to — that address is also
          where the circle&rsquo;s mail will reach you.
        </Muted>
        <form
          onSubmit={e => { e.preventDefault(); void join(); }}
          className="mt-4 space-y-3"
        >
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email your invitation went to"
            autoComplete="email"
            className="w-full rounded-lg border border-[var(--rule)] bg-ground/50 p-3 text-[15px] outline-none focus:border-[var(--rule-strong)]"
          />
          {error && <p className="text-sm text-pole-b">{error}</p>}
          <Action type="submit" disabled={busy}>
            {busy ? 'Taking your seat…' : 'Take your seat'}
          </Action>
        </form>
      </Card>
    </div>
  );
}
