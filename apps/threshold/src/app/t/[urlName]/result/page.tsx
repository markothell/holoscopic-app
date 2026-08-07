'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { thresholdApi, ApiError } from '@/services/api';
import type { Circle, CircleResult, CircleResultTopic } from '@/lib/types';
import { Page, Band, Action, Quiet, Muted } from '@/components/Shell';
import { TideLine } from '@/components/TideLine';

// The circle seen whole (PLAN.md §6.3, D25). Every topic it has run, each one
// carrying its name, how many took part, its two ends, and one minimal bar
// split three ways — the same three groups as the per-cycle reveal, so the two
// screens read as one idea at two scales.
//
// THIS IS A RECORD OF A CONVERSATION, NOT A VERDICT. No winner, no league
// table, no most-contested headline — an earlier cut computed one and it has
// been taken out of the payload entirely, because a sharing circle that ends by
// ranking its own topics has turned into something else. The topics are in the
// order the group actually talked about them, which is the order a record reads.
//
// READABLE AT ANY TIME (D29). A circle has no completion condition, so this is
// the conversation so far rather than a state somebody unlocks — a circle three
// topics in has a three-topic record.
//
// The cutoff control is here too, and it answers §13's Q1: a cutoff has to
// exist for the bars to say anything crisp across topics, and reusing the
// reveal's own control is what keeps the two scales the same idea. Nothing is
// stored either way (D15).
//
// D33 — a one-off has one node, and a graph of one node is not a graph, so
// `mode: 'single'` routes to that cycle's reveal instead of drawing this.

type Cutoff = 'half' | 'three-quarters' | 'all';

const CUTOFFS: { key: Cutoff; label: string; c: number }[] = [
  { key: 'half', label: 'more than half', c: 0.5 },
  { key: 'three-quarters', label: 'three in four', c: 0.75 },
  { key: 'all', label: 'all of them', c: 1 },
];

/** Same rule as the per-cycle reveal, applied per story to size the bar. */
function split(agreements: (number | null)[], c: number) {
  let a = 0, b = 0, middle = 0;
  for (const v of agreements) {
    if (v !== null && v >= c && v > 0.5) a++;
    else if (v !== null && v <= 1 - c && v < 0.5) b++;
    else middle++;
  }
  return { a, b, middle, total: agreements.length };
}

export default function ResultPage({ params }: { params: Promise<{ urlName: string }> }) {
  const { urlName } = use(params);
  const router = useRouter();
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [circle, setCircle] = useState<Circle | null>(null);
  const [result, setResult] = useState<CircleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState<Cutoff>('three-quarters');

  const load = useCallback(async () => {
    try {
      const { circle } = await thresholdApi.getCircle(urlName, userId);
      setCircle(circle);
      const { result } = await thresholdApi.circleResult(circle.id, userId);
      // D33 — one node is not a graph. Send a one-off to its own reveal.
      if (result.mode === 'single' && result.topics.length === 1) {
        router.replace(`/t/${urlName}/cycle/${result.topics[0].seedId}`);
        return;
      }
      setResult(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this circle');
    }
  }, [urlName, userId, router]);

  useEffect(() => {
    if (status === 'loading' || !userId) return;
    void load();
  }, [status, userId, load]);

  if (status === 'loading' || (!result && !error)) return <Page><Muted>…</Muted></Page>;
  if (!result || !circle) return <Page><Muted>{error}</Muted></Page>;

  const base = `/t/${urlName}`;
  const c = CUTOFFS.find(x => x.key === cutoff)!.c;

  return (
    <Page>
      <header className="mb-8">
        <Quiet href={base}>Back to the circle</Quiet>
        <h1 className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl leading-tight">
          {circle.title}
        </h1>
        <p className="mt-1 mb-4 text-sm text-ink-faint">
          {result.topics.length} {result.topics.length === 1 ? 'topic' : 'topics'} ·{' '}
          {circle.memberCount} {circle.memberCount === 1 ? 'person' : 'people'}
          {result.phase === 'closed' ? ' · closed' : ' · still going'}
        </p>
        <TideLine />
      </header>

      {result.topics.length === 0 ? (
        <Muted>
          Nothing has been shared and sorted yet. The record fills in as the circle runs topics.
        </Muted>
      ) : (
        <>
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

          <ul className="grid gap-4 sm:grid-cols-2">
            {result.topics.map(t => <Node key={t.seedId} topic={t} c={c} base={base} />)}
          </ul>
        </>
      )}

      <div className="mt-10 border-t border-[var(--rule)] pt-6">
        <Action href={base}>Back to the circle</Action>
      </div>
    </Page>
  );
}

/**
 * One topic. The pole names sit above the bar so the colours are read as this
 * topic's own words rather than as a fixed scale — the colours are the app's
 * (D26), the words are the seed's.
 */
function Node({ topic, c, base }: { topic: CircleResultTopic; c: number; base: string }) {
  const s = split(topic.agreements, c);
  const pct = (n: number) => (s.total === 0 ? 0 : (n / s.total) * 100);

  return (
    <li>
      <Link
        href={`${base}/cycle/${topic.seedId}`}
        className="block rounded-xl bg-card p-4 transition-transform hover:-translate-y-0.5"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <p className="font-[family-name:var(--font-source-serif)] text-lg leading-snug">
          {topic.topic}
        </p>

        <div className="mt-3 mb-1 flex items-baseline justify-between gap-3 text-[11px]">
          <span className="font-medium text-pole-a">{topic.poleA}</span>
          <span className="font-medium text-pole-b">{topic.poleB}</span>
        </div>

        {/* One bar, three parts, sized by how many stories fell in each. The
            grey middle is the finding: wide is a fuzzy line, thin is a sharp
            one. There is no number on it, because the shape is the point. */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-ground-deep">
          <span style={{ width: `${pct(s.a)}%`, background: 'var(--pole-a)' }} />
          <span style={{ width: `${pct(s.middle)}%`, background: 'var(--threshold)' }} />
          <span style={{ width: `${pct(s.b)}%`, background: 'var(--pole-b)' }} />
        </div>

        <p className="mt-2 text-xs text-ink-faint">
          {topic.shareCount} {topic.shareCount === 1 ? 'story' : 'stories'} ·{' '}
          {topic.rankers} sorted
          {topic.skipped && ' · moved on part-way'}
        </p>
      </Link>
    </li>
  );
}
