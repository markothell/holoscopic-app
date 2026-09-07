'use client';

// The circle home's bands, lifted out of app/c/[urlName]/page.tsx so that page
// and /demo render the SAME surface rather than two that look alike. Behaviour
// for a real circle is unchanged — this is a move, not a rewrite.
//
// Two props are new, and only for the demo's sake:
//   • `basePath` — where a seed's link points. Defaults to the circle's own
//     /c/<urlName>, so the real page passes nothing.
//   • `readOnly` — withhold the controls that would write, rather than render
//     a dead one. Defaults to false.

import { useState } from 'react';
import Link from 'next/link';
import { Band, Card, Action } from '@/components/Shell';
import { circlesApi } from '@/services/api';
import type { Circle, Seed } from '@/lib/types';
import { seedActivityOf } from '@/lib/types';

const baseOf = (circle: Circle, basePath?: string) => basePath ?? `/c/${circle.urlName}`;

/** What a finished gather ask made, in the record's own words. */
const SHAPE_LABELS: Record<string, string> = {
  story: 'a wall of stories',
  placement: 'where everyone stands',
  'story-placement': 'stories on a line',
  words: 'a word portrait',
};

export function CircleHeader({ circle }: { circle: Circle }) {
  const record = circle.seeds.filter(s => s.phase === 'revealed' || s.phase === 'skipped');
  return (
    <header className="mb-2">
      <h1 className="text-3xl leading-tight">{circle.title}</h1>
      <p className="mt-1 text-sm text-ink-faint">
        {circle.memberCount} {circle.memberCount === 1 ? 'person' : 'people'}
        {record.length > 0 && ` · ${record.length} ${record.length === 1 ? 'exploration' : 'explorations'} so far`}
      </p>
    </header>
  );
}

/**
 * One live cycle. A circle runs up to maxLive at once (B1; 1 unless the circle
 * opted into more), so the home page maps this over `liveSeedIds` — it is a
 * list of one-or-more, never a single slot. Each activity reads its own extras
 * from seedExtras; the flat-merged top level is only the FIRST live seed's.
 */
export function LiveSeedCard({ circle, live, basePath, readOnly = false }: {
  circle: Circle;
  live: Seed;
  basePath?: string;
  readOnly?: boolean;
}) {
  const base = baseOf(circle, basePath);
  const extras = (circle.seedExtras?.[live.id] ?? {}) as {
    shares?: { isMine: boolean }[];
    waitingShareIds?: string[];
    responses?: unknown[];
    myResponse?: unknown;
  };

  if (seedActivityOf(circle, live) === 'gather') {
    const mineIn = Boolean(extras.myResponse);
    const openWall = live.payload.reveal === 'open';
    const answered = (extras.responses ?? []).length;
    return (
      <div className="mt-8">
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
            <Action href={`${base}/activity/${live.id}`}>
              {readOnly ? 'Look at it' : mineIn ? 'See where it stands' : 'Add yours'}
            </Action>
          </div>
        </Card>
      </div>
    );
  }

  const shares = extras.shares ?? circle.shares ?? [];
  const iTold = shares.some(s => s.isMine);
  const waiting = (extras.waitingShareIds ?? circle.waitingShareIds)?.length ?? 0;
  const topicHref = `${base}/topic/${live.id}`;
  return (
    <div className="mt-8">
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
}

/**
 * What has been put to the circle and not yet taken up (B3 revised,
 * 2026-08-20: EVERY ask walks through approval — one member must not be able
 * to commit the whole group's attention alone). Unordered by design; backing
 * is a count toward approvalsToStart, not a rank. Synthesis documents keep
 * their own band below — same mechanic, different words.
 */
export function NominationsBand({ circle, userId, onChanged, readOnly = false }: {
  circle: Circle;
  userId: string | null;
  onChanged: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const nominations = (circle.nominations ?? []).filter(s => s.activity !== 'synthesis');
  const queued = (circle.queue ?? []).filter(s => s.activity !== 'synthesis');
  if (nominations.length === 0 && queued.length === 0) return null;

  const back = async (seedId: string) => {
    if (readOnly || !userId) return;
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
              {!readOnly && (
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
              )}
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

/** Everything the circle has finished, oldest first — the record. */
export function RecordBand({ circle, basePath }: { circle: Circle; basePath?: string }) {
  const base = baseOf(circle, basePath);
  const record = circle.seeds.filter(s => s.phase === 'revealed' || s.phase === 'skipped');
  if (record.length === 0) return null;

  return (
    <section className="mt-10">
      <Band>The record</Band>
      <ul className="space-y-3">
        {record.map(s => (
          <li key={s.id}>
            <Link
              href={seedActivityOf(circle, s) === 'gather'
                ? `${base}/activity/${s.id}`
                : `${base}/topic/${s.id}`}
              className="-mx-3 block rounded-lg px-3 py-2 transition-colors hover:bg-ground-deep"
            >
              <span className="font-[family-name:var(--font-display)] text-lg">
                {s.payload.topic}
              </span>
              <span className="mt-0.5 block text-xs text-ink-faint">
                {seedActivityOf(circle, s) === 'gather'
                  ? (SHAPE_LABELS[s.payload.shape ?? 'story'] ?? 'an activity')
                  : `${s.payload.poleA} · ${s.payload.poleB}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
