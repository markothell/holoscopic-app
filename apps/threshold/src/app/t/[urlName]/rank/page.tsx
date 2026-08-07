'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, Placement, Pole, Share } from '@/lib/types';
import { Page, Band, Card, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';
import { StoryPlayer, StoryText } from '@/components/Playback';

// The ranking space (PLAN.md §6.2, D21): a QUEUE, then a REVIEW screen.
//
// One story at a time, full width, with two big targets. You hear it, you
// choose a side, it advances — placing a story is the same gesture as listening
// to it, which is what makes "sort while listening" literal. Drag-and-drop
// between two columns was the obvious answer and is the wrong one: dragging two
// dozen cards on a phone while audio plays is fiddly, drag is poor for
// accessibility, and arranging things in a column implies an ordering that
// explicitly carries no meaning (D11).
//
// The review screen is where the whole set comes back, where rearranging
// happens, and where submit lives. Submit is complete-or-nothing (D11): a
// partial ranking would make each story's agreement denominator depend on who
// bothered, which biases the result invisibly.
//
// UNFINISHED READS AS THE STORIES STILL QUEUED — never as a count, and never as
// a dead button. What is left to do is shown as the thing itself.

/**
 * A stable per-reader order.
 *
 * The server returns stories oldest-first, and reading them in that order for a
 * whole circle would give whoever posts first a permanent position — the same
 * anchoring D17 keeps the share phase closed to avoid. This is deterministic in
 * (viewer, seed), so it survives a reload and a re-entry while differing
 * between people.
 */
function readerOrder<T extends { id: string }>(items: T[], salt: string): T[] {
  const key = (id: string) => {
    let h = 2166136261;
    for (const ch of `${salt}:${id}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...items].sort((a, b) => key(a.id) - key(b.id));
}

export default function RankPage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placements, setPlacements] = useState<Record<string, Pole>>({});
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { circle } = await thresholdApi.getCircle(urlName, userId);
      setCircle(circle);
      setError(null);

      // Your own story arrives ALREADY PLACED, on the side you chose when you
      // told it (D22) — the server does that when the rank phase opens, so
      // there is nothing to seed here and nothing for this client to get wrong.
      // You can move it like any other.
      const next: Record<string, Pole> = {};
      for (const p of circle.myRanking?.placements ?? []) next[p.shareId] = p.pole;
      setPlacements(next);
      // Somebody returning to a finished sort wants the whole set, not the
      // queue they already emptied.
      if (circle.myRanking?.submittedAt) setReviewing(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, userId]);

  useEffect(() => {
    if (status === 'loading' || !userId) return;
    void load();
  }, [status, userId, load]);

  const seed = circle?.currentSeed ?? null;
  const shares = useMemo(
    () => readerOrder(circle?.shares ?? [], `${userId}:${seed?.id ?? ''}`),
    [circle?.shares, userId, seed?.id],
  );

  if (status === 'loading' || (!circle && !error)) return <Page><Muted>…</Muted></Page>;
  if (!circle) return <Page><Muted>{error}</Muted></Page>;

  const base = `/t/${circle.urlName}`;

  if (!seed || seed.phase !== 'rank') {
    return (
      <Page>
        <Muted>
          {seed?.phase === 'share'
            ? 'This topic is still collecting stories.'
            : 'The sorting on this topic has closed.'}
        </Muted>
        <div className="mt-4"><Action href={base}>Back to the circle</Action></div>
      </Page>
    );
  }

  const submitted = Boolean(circle.myRanking?.submittedAt);
  const label = (pole: Pole) => (pole === 'A' ? seed.payload.poleA : seed.payload.poleB);
  const queue = shares.filter(s => !placements[s.id]);
  const current = queue[0] ?? null;

  const asPlacements = (map: Record<string, Pole>): Placement[] =>
    Object.entries(map).map(([shareId, pole]) => ({ shareId, pole }));

  const place = async (shareId: string, pole: Pole) => {
    const next = { ...placements, [shareId]: pole };
    setPlacements(next);
    // The queue empties into the review screen rather than into a blank page.
    if (shares.filter(s => !next[s.id]).length === 0) setReviewing(true);
    if (submitted) return;
    // Drafts save as you sort and count toward nothing; `submittedAt` is what
    // makes a ranking real, so a failed draft save is worth a line and never
    // worth losing the placement over.
    try {
      await thresholdApi.saveRankingDraft(seed.id, asPlacements(next), userId!);
    } catch {
      setError('That placement is saved here but did not reach the server yet.');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await thresholdApi.submitRanking(seed.id, asPlacements(placements), userId!);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not submit');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <header className="mb-8">
      <Quiet href={base}>{circle.title}</Quiet>
      <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
        {seed.payload.topic}
      </h1>
      <Polarity poleA={seed.payload.poleA} poleB={seed.payload.poleB} className="mt-3" />
    </header>
  );

  // ── The queue ─────────────────────────────────────────────────────────────

  if (!reviewing && current) {
    return (
      <Page>
        {header}
        {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}
        <Card>
          {/* No name, and none arrived: the server withholds attribution for
              everybody but you while the group is sorting (D9). */}
          <Band>Someone in the circle</Band>
          {/* Listening and placing are the same gesture, so the player sits
              directly above the two targets — you hear it, you choose. */}
          {current.audio && <div className="mb-4"><StoryPlayer share={current} /></div>}
          <StoryText share={current} className="text-[17px] leading-relaxed" />
        </Card>

        <p className="mt-6 mb-3 text-center text-sm text-ink-soft">Which side is this?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['A', 'B'] as Pole[]).map(pole => (
            <button
              key={pole}
              type="button"
              onClick={() => place(current.id, pole)}
              className="rounded-xl border px-4 py-5 text-[15px] font-medium transition-colors hover:opacity-80"
              style={{
                borderColor: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)',
                color: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)',
              }}
            >
              {label(pole)}
            </button>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-5">
          <Quiet onClick={() => setReviewing(true)}>See them all</Quiet>
          <Quiet href={base}>Come back to this</Quiet>
        </div>
      </Page>
    );
  }

  // ── The review ────────────────────────────────────────────────────────────

  const remaining = queue;

  return (
    <Page>
      {header}
      {error && <p className="mb-6 text-sm text-pole-b">{error}</p>}

      {submitted && (
        <Card className="mb-8">
          <Muted>
            Your sorting is in. The topic reveals once the group is done, or when its clock runs out.
          </Muted>
          <div className="mt-4"><Action href={base}>Back to the circle</Action></div>
        </Card>
      )}

      <div className="space-y-8">
        {(['A', 'B'] as Pole[]).map(pole => (
          <section key={pole}>
            <Band>
              <span style={{ color: pole === 'A' ? 'var(--pole-a)' : 'var(--pole-b)' }}>
                {label(pole)}
              </span>
            </Band>
            {shares.filter(s => placements[s.id] === pole).length === 0 ? (
              <Muted>Nothing here yet.</Muted>
            ) : (
              <ul className="space-y-3">
                {shares.filter(s => placements[s.id] === pole).map(s => (
                  <PlacedStory
                    key={s.id}
                    share={s}
                    pole={pole}
                    otherLabel={label(pole === 'A' ? 'B' : 'A')}
                    locked={submitted}
                    onMove={() => place(s.id, pole === 'A' ? 'B' : 'A')}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* What is left to do IS the remaining stories — never a count, and
            never a disabled submit (§6.2). */}
        {remaining.length > 0 && (
          <section>
            <Band>Still to hear</Band>
            <ul className="mb-4 space-y-2">
              {remaining.map(s => (
                <li key={s.id} className="text-sm leading-relaxed text-ink-soft">
                  {s.text || (s.audio ? 'A recording, still to hear.' : '')}
                </li>
              ))}
            </ul>
            <Action onClick={() => setReviewing(false)}>Hear the rest</Action>
          </section>
        )}
      </div>

      {!submitted && remaining.length === 0 && (
        <div className="mt-10 border-t border-[var(--rule)] pt-6">
          <Muted>
            Everything is placed. Sending it in is what puts it into the group&rsquo;s picture.
          </Muted>
          <div className="mt-4 flex items-center gap-5">
            <Action disabled={busy} onClick={submit}>Send in your sorting</Action>
            <Quiet href={base}>Leave it for now</Quiet>
          </div>
        </div>
      )}
    </Page>
  );
}

/**
 * A placed story on the review screen. There is no position WITHIN a side (D11)
 * — a story is on one side or the other, and arranging them in a column would
 * imply an ordering that carries no meaning.
 */
function PlacedStory({ share, pole, otherLabel, locked, onMove }: {
  share: Share;
  pole: Pole;
  otherLabel: string;
  locked: boolean;
  onMove: () => void;
}) {
  const wash = pole === 'A' ? 'var(--pole-a-soft)' : 'var(--pole-b-soft)';
  return (
    <li className="rounded-lg p-3" style={{ background: wash }}>
      {share.audio && <div className="mb-2"><StoryPlayer share={share} /></div>}
      <StoryText share={share} className="text-sm leading-relaxed" />
      <div className="mt-2 flex items-center gap-3 text-xs text-ink-faint">
        {share.isMine && <span>yours</span>}
        {!locked && (
          <button type="button" onClick={onMove} className="underline underline-offset-4 hover:text-ink">
            move to {otherLabel}
          </button>
        )}
      </div>
    </li>
  );
}
