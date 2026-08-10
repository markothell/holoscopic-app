'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Seed, SeedResult, Share, ShareResult } from '@/lib/types';
import { Page, Band, Action, Quiet, Muted } from '@/components/Shell';
import { Polarity } from '@/components/TideLine';
import { StoryPlayer, StoryText, storyPreview } from '@/components/Playback';

// One cycle's reveal (PLAN.md §6.3, D23/D24).
//
// THREE GROUPS — two poles and the threshold — with no position inside a group.
// The threshold band's POPULATION is the finding: sparse means the group knows
// where its line falls, crowded means the line is where the argument is. Giving
// dots a position inside the band would add a second thing to read in the one
// zone that is already the subject of the screen.
//
// A story is a dot with a short preview, expanding on tap; playback will live
// inside the expanded state when M3b lands, never on every dot.
//
// WHERE THE LINE SITS IS A READER'S CONTROL, defaulting to three in four. This
// is what D15 bought: `agreement` is stored and no band classification ever is,
// so moving the line is a re-render and never a migration. Moving it is also
// the argument the screen makes — the threshold is a function of how much
// agreement you decide to require, and sliding from "all of them" to "more than
// half" narrows the band toward nothing in front of you.
//
// THE THRESHOLD APPEARS ONCE THREE PEOPLE HAVE SUBMITTED. Below that this page
// still renders — the stories are here and attributed, with how the sorting
// split — and simply says nothing about a group's line. Three is the floor
// because it is the smallest number with a shape: at one ranker every story is
// unanimous by construction, at two a disagreement is two people differing.
// The gate is on rankings submitted, never on membership, so a twelve-person
// circle that drew three rankings behaves like a three-person one.

type Cutoff = 'half' | 'three-quarters' | 'all';
type BandKey = 'A' | 'threshold' | 'B';

const CUTOFFS: { key: Cutoff; label: string; c: number }[] = [
  { key: 'half', label: 'more than half', c: 0.5 },
  { key: 'three-quarters', label: 'three in four', c: 0.75 },
  { key: 'all', label: 'all of them', c: 1 },
];

const MIN_RANKERS = 3;

/**
 * Which group a story falls in, at this cutoff. Computed at render, stored
 * nowhere (D15/D24).
 *
 * The `> 0.5` / `< 0.5` clauses are what make "more than half" behave: an exact
 * tie belongs to neither side, so at that setting the threshold holds ties only
 * and is empty by construction at an odd number of rankers.
 */
function bandOf(agreement: number | null, c: number): BandKey {
  if (agreement === null) return 'threshold';
  if (agreement >= c && agreement > 0.5) return 'A';
  if (agreement <= 1 - c && agreement < 0.5) return 'B';
  return 'threshold';
}

export default function CyclePage({ params }: { params: Promise<{ urlName: string; seedId: string }> }) {
  const { urlName, seedId } = use(params);
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [data, setData] = useState<{ result: SeedResult; shares: Share[]; seed: Seed } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState<Cutoff>('three-quarters');
  const [open, setOpen] = useState<string | null>(null);

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

  const c = CUTOFFS.find(x => x.key === cutoff)!.c;

  const groups = useMemo(() => {
    const out: Record<BandKey, { share: Share; row: ShareResult }[]> = { A: [], threshold: [], B: [] };
    if (!data) return out;
    const byId = new Map(data.shares.map(s => [s.id, s]));
    for (const row of data.result.shares) {
      const share = byId.get(row.shareId);
      if (share) out[bandOf(row.agreement, c)].push({ share, row });
    }
    return out;
  }, [data, c]);

  if (status === 'loading' || (!data && !error)) return <Page><Muted>…</Muted></Page>;
  if (!data) return <Page><Muted>{error}</Muted></Page>;

  const { result, seed } = data;
  const base = `/t/${urlName}`;
  const poleA = seed.payload.poleA;
  const poleB = seed.payload.poleB;
  const enough = result.rankers >= MIN_RANKERS;
  const middle = groups.threshold.length;

  return (
    <Page>
      <header className="mb-8">
        <Quiet href={base}>Back to the circle</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          {seed.payload.topic}
        </h1>
        <Polarity poleA={poleA} poleB={poleB} className="mt-3" />
        <p className="mt-3 text-sm text-ink-faint">
          {result.shares.length} {result.shares.length === 1 ? 'story' : 'stories'} ·{' '}
          {result.rankers} {result.rankers === 1 ? 'person' : 'people'} sorted them
          {seed.phase === 'skipped' && ' · the group moved on part-way'}
        </p>
      </header>

      {enough ? (
        <>
          {/* The control IS the argument: the threshold is a function of how
              much agreement you decide to require. */}
          <div className="mb-8">
            <Band>A story is at an end when</Band>
            <div className="flex flex-wrap gap-2">
              {CUTOFFS.map(o => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setCutoff(o.key)}
                  aria-pressed={cutoff === o.key}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    cutoff === o.key
                      ? 'border-ink bg-ink text-ground'
                      : 'border-[var(--rule-strong)] text-ink-soft hover:border-ink hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <Group
            label={poleA}
            tint="var(--pole-a)"
            wash="var(--pole-a-soft)"
            rows={groups.A}
            open={open}
            onOpen={setOpen}
            poleA={poleA}
            poleB={poleB}
            empty="No story was read this way by that many people."
          />

          {/* The subject of the screen. Its POPULATION is the finding, so the
              line under it says what the population means and stops there — no
              verdict, no headline. */}
          <section className="my-8 rounded-xl border border-[var(--rule)] bg-threshold-soft/40 p-5">
            <Band>The threshold</Band>
            <p className="mb-4 text-[15px] leading-relaxed text-ink-soft">
              {middle === 0
                // An empty band means two different things, and only one of
                // them is unanimity. At a loose cutoff it means the line was
                // drawn loosely — saying "everyone read every story the same
                // way" there claims an agreement the sorting does not show.
                ? cutoff === 'all'
                  ? 'Nothing sits across the line: every person read every story the same way.'
                  : 'Nothing sits across the line at this setting. Ask for more agreement to see where it comes apart.'
                : middle === 1
                  ? 'One story sits across the line. The group agreed about the rest.'
                  : `${middle} stories sit across the line. That is where the group's reading came apart.`}
            </p>
            {middle > 0 && (
              <Dots
                rows={groups.threshold}
                tint="var(--threshold)"
                wash="var(--threshold-soft)"
                open={open}
                onOpen={setOpen}
                poleA={poleA}
                poleB={poleB}
              />
            )}
          </section>

          <Group
            label={poleB}
            tint="var(--pole-b)"
            wash="var(--pole-b-soft)"
            rows={groups.B}
            open={open}
            onOpen={setOpen}
            poleA={poleA}
            poleB={poleB}
            empty="No story was read this way by that many people."
          />
        </>
      ) : (
        <>
          {/* Below three rankings the stories are all here and attributed, and
              the screen says nothing about a group's line — there is no group
              yet to have one. */}
          <Muted>
            {result.rankers === 0
              ? 'Nobody sorted these, so the stories stand as they were told.'
              : `${result.rankers} ${result.rankers === 1 ? 'person' : 'people'} sorted these. Where a group's line falls takes three, so here are the stories and how the sorting went.`}
          </Muted>
          <ul className="mt-6 space-y-3">
            {data.result.shares.map(row => {
              const share = data.shares.find(s => s.id === row.shareId);
              if (!share) return null;
              return (
                <Story
                  key={row.shareId}
                  share={share}
                  row={row}
                  tint="var(--threshold)"
                  wash="var(--threshold-soft)"
                  expanded={open === row.shareId}
                  onOpen={() => setOpen(open === row.shareId ? null : row.shareId)}
                  poleA={poleA}
                  poleB={poleB}
                />
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-10 border-t border-[var(--rule)] pt-6">
        <Action href={base}>Back to the circle</Action>
      </div>
    </Page>
  );
}

function Group({ label, tint, wash, rows, open, onOpen, poleA, poleB, empty }: {
  label: string;
  tint: string;
  wash: string;
  rows: { share: Share; row: ShareResult }[];
  open: string | null;
  onOpen: (id: string | null) => void;
  poleA: string;
  poleB: string;
  empty: string;
}) {
  return (
    <section>
      <Band><span style={{ color: tint }}>{label}</span></Band>
      {rows.length === 0
        ? <Muted>{empty}</Muted>
        : <Dots rows={rows} tint={tint} wash={wash} open={open} onOpen={onOpen} poleA={poleA} poleB={poleB} />}
    </section>
  );
}

/** No position within a group — a dot is a dot (D23). */
function Dots({ rows, tint, wash, open, onOpen, poleA, poleB }: {
  rows: { share: Share; row: ShareResult }[];
  tint: string;
  wash: string;
  open: string | null;
  onOpen: (id: string | null) => void;
  poleA: string;
  poleB: string;
}) {
  return (
    <ul className="space-y-2">
      {rows.map(({ share, row }) => (
        <Story
          key={share.id}
          share={share}
          row={row}
          tint={tint}
          wash={wash}
          expanded={open === share.id}
          onOpen={() => onOpen(open === share.id ? null : share.id)}
          poleA={poleA}
          poleB={poleB}
        />
      ))}
    </ul>
  );
}

/**
 * A dot with a short preview, expanding on tap. The expanded state is where the
 * whole story, its teller and the split live — and where the player goes when
 * M3b lands. Putting playback on every dot would make a wall of controls out of
 * a screen whose subject is a shape.
 */
function Story({ share, row, tint, wash, expanded, onOpen, poleA, poleB }: {
  share: Share;
  row: ShareResult;
  tint: string;
  wash: string;
  expanded: boolean;
  onOpen: () => void;
  poleA: string;
  poleB: string;
}) {
  // Never `share.text` alone: a recorded story has none, and the dot came out
  // blank on the one screen this whole app builds toward.
  const preview = storyPreview(share);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-ground-deep"
      >
        <span
          aria-hidden
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: tint }}
        />
        {/* Expanded, a typed story becomes its whole self here — while a
            recorded one says nothing twice, because the block below is already
            about to show its player and its transcript. */}
        <span className={`text-sm leading-relaxed ${expanded ? 'text-ink' : 'text-ink-soft'}`}>
          {expanded ? (share.text || (share.audio ? '' : preview)) : preview}
        </span>
      </button>

      {expanded && (
        <div className="ml-8 mt-1 rounded-lg p-3 text-xs" style={{ background: wash }}>
          {/* Playback lives INSIDE the expanded state, never on every dot — a
              wall of play buttons would make a control panel out of a screen
              whose subject is a shape (D23). */}
          {share.audio && (
            <div className="mb-3">
              <StoryPlayer share={share} />
              {!share.text && <StoryText share={share} className="mt-2 text-sm leading-relaxed text-ink" />}
            </div>
          )}
          {/* Attributed, because the cycle has revealed (D9). */}
          <p className="text-ink-soft">
            {share.username ? <strong className="font-medium text-ink">{share.username}</strong> : 'Someone'}
            {' told it as '}
            {share.pole === 'A' ? poleA : poleB}
          </p>
          {row.agreement !== null && (
            <p className="mt-1 text-ink-faint">
              {row.splits.a} read it as {poleA} · {row.splits.b} as {poleB}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
