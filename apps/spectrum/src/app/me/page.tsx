'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { FrameLine } from '@/components/frames/FrameGlyph';
import { useAuth } from '@/contexts/AuthContext';
import { OasService } from '@/services/oasService';
import type { GameCard, MeGames, MyGameStats, Phase } from '@/lib/types';

// /me — strictly personal: active rooms to jump back into, the history of
// finished games (sortable), and the spectrums this player has coined with
// anonymous cross-game usage counts. Nothing here is visible to anyone else.

const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'in the lobby',
  round1: 'round 1 — subtopics',
  round2: 'round 2',
  round3: 'round 3',
  round4: 'round 4',
  revise: 'revising',
  complete: 'complete',
};

type SortKey = 'latest' | 'players' | 'maps' | 'nuance' | 'mine';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: 'Latest' },
  { key: 'players', label: 'Biggest' },
  { key: 'maps', label: 'Most mapped' },
  { key: 'nuance', label: 'Most contested' },
  { key: 'mine', label: 'My part' },
];

function nuanceWord(spread: number | null): string | null {
  if (spread === null) return null;
  const norm = spread / 0.5;
  if (norm < 0.12) return 'near-consensus';
  if (norm < 0.35) return 'some spread';
  return 'wide disagreement';
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function sortHistory(history: (GameCard & { my: MyGameStats })[], sort: SortKey) {
  const list = [...history];
  switch (sort) {
    case 'players':
      return list.sort((a, b) => b.players - a.players);
    case 'maps':
      return list.sort((a, b) => (b.summary?.mapsRevealed ?? 0) - (a.summary?.mapsRevealed ?? 0));
    case 'nuance':
      return list.sort((a, b) => (b.summary?.spread ?? -1) - (a.summary?.spread ?? -1));
    case 'mine':
      return list.sort((a, b) =>
        (b.my.mapsCompleted * 3 + b.my.items + b.my.framesProposed)
        - (a.my.mapsCompleted * 3 + a.my.items + a.my.framesProposed));
    default:
      return list; // server order = updatedAt desc
  }
}

export default function MePage() {
  const { userId, userName, isAuthenticated, isLoading } = useAuth();
  const [data, setData] = useState<MeGames | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('latest');

  useEffect(() => {
    if (!userId) return;
    OasService.myGames(userId)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load'));
  }, [userId]);

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
        <p className="eyebrow fade-in text-center">Opening your games…</p>
      </main>
    );
  }

  if (!isAuthenticated || !userId) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <p className="eyebrow rise-in">Your games</p>
        <h1 className="display rise-in mt-3 text-5xl leading-[0.92]">Sign in<br />first</h1>
        <p className="rise-in mt-4 text-base text-ink-soft">
          Your history is yours alone — it needs your account.
        </p>
        <div className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
          <Link href={`/login?next=${encodeURIComponent('/me')}`}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </main>
    );
  }

  const history = data ? sortHistory(data.history, sort) : [];

  return (
    <main className="mx-auto w-full max-w-md px-6 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Playing as {userName}</p>
          <Link href="/" className="text-xs text-ink-faint underline">start a game</Link>
        </div>
        <h1 className="display mt-2 text-5xl leading-[0.92]">My games</h1>
      </header>

      {error && <p className="mt-6 text-sm text-ax">{error}</p>}
      {!data && !error && <p className="eyebrow fade-in mt-10 text-center">Gathering…</p>}

      {data && (
        <>
          {data.active.length > 0 && (
            <section className="rise-in mt-8">
              <p className="eyebrow mb-2">In play — jump back in</p>
              <ul className="space-y-2">
                {data.active.map(g => (
                  <li key={g.id}>
                    <Link
                      href={`/g/${g.code}`}
                      className="block rounded-2xl border border-ink bg-paper-raised px-4 py-3 shadow-[var(--shadow-card)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="display min-w-0 truncate text-xl">{g.topic}</span>
                        <span className="eyebrow flex shrink-0 items-center gap-1.5 text-ax">
                          <span className="h-1.5 w-1.5 rounded-full bg-ax" aria-hidden />
                          live
                        </span>
                      </div>
                      <p className="eyebrow mt-1 !text-ink-faint">
                        {PHASE_LABEL[g.phase]} · {g.players} playing
                        {g.hostedByMe ? ' · you host' : ''} · {ago(g.updatedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rise-in mt-8" style={{ animationDelay: '0.05s' }}>
            <p className="eyebrow mb-2">History</p>
            {history.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SORTS.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={`eyebrow rounded-full border px-2.5 py-1 transition-colors ${
                      sort === s.key
                        ? 'border-ink bg-ink !text-paper'
                        : 'border-line-strong !text-ink-soft active:bg-paper-dim'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <ul className="space-y-2">
              {history.map(g => {
                const nuance = nuanceWord(g.summary?.spread ?? null);
                return (
                  <li key={g.id}>
                    <Link
                      href={`/g/${g.code}`}
                      className="block rounded-2xl border border-line bg-paper-raised px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="display min-w-0 truncate text-xl">{g.topic}</span>
                        <span className="eyebrow shrink-0 !text-ink-faint">{ago(g.updatedAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        {g.themes.join(' // ')}
                      </p>
                      {g.summary && (
                        <p className="eyebrow mt-2 !text-ink-soft">
                          {g.summary.players} played · {g.summary.mapsRevealed} map
                          {g.summary.mapsRevealed === 1 ? '' : 's'} revealed ·{' '}
                          {g.summary.spectrums} spectrum{g.summary.spectrums === 1 ? '' : 's'}
                          {nuance ? ` · ${nuance}` : ''}
                        </p>
                      )}
                      <p className="eyebrow mt-1 !text-ink-faint">
                        you{g.my.hosted ? ' hosted ·' : ':'} {g.my.items} item{g.my.items === 1 ? '' : 's'} ·{' '}
                        {g.my.mapsCompleted} map{g.my.mapsCompleted === 1 ? '' : 's'} completed ·{' '}
                        {g.my.framesProposed} spectrum{g.my.framesProposed === 1 ? '' : 's'} proposed
                      </p>
                    </Link>
                  </li>
                );
              })}
              {history.length === 0 && data.active.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft">
                  No games yet —{' '}
                  <Link href="/" className="underline">start one</Link> or join with a code.
                </li>
              )}
            </ul>
          </section>

          {data.spectrums.length > 0 && (
            <section className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
              <p className="eyebrow mb-2">My spectrums</p>
              <ul className="space-y-1.5">
                {data.spectrums.map(s => (
                  <li
                    key={s.key}
                    className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2"
                  >
                    <FrameLine poleA={s.poleA} poleB={s.poleB} accent="var(--ink-soft)" className="min-w-0 flex-1" />
                    <span className="eyebrow shrink-0 !text-ink-faint">
                      {s.games} game{s.games === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
