'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FrameLine } from '@/components/frames/FrameGlyph';
import { OasService } from '@/services/oasService';
import type { Phase, Pulse } from '@/lib/types';

// /games — the public pulse of this deployment: which conversations (game
// threads) and spectrums are moving. Aggregate by design — topics, themes,
// codes, and counts; never names. Anyone can look; opening a game still
// asks for sign-in, same as any room link.

const PHASE_WORD: Record<Phase, string> = {
  lobby: 'forming',
  round1: 'brainstorming',
  round2: 'mapping',
  round3: 'mapping',
  round4: 'mapping',
  revise: 'revising',
  complete: 'complete',
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="min-w-0">
      <p className="display text-3xl leading-none">{n}</p>
      <p className="eyebrow mt-1 truncate !text-ink-faint">{label}</p>
    </div>
  );
}

export default function GamesPage() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    OasService.pulse()
      .then(setPulse)
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load'));
  }, []);

  return (
    <main className="mx-auto w-full max-w-md px-6 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">What&apos;s moving here</p>
          <Link href="/" className="text-xs text-ink-faint underline">start a game</Link>
        </div>
        <h1 className="display mt-2 text-5xl leading-[0.92]">The games</h1>
      </header>

      {error && <p className="mt-6 text-sm text-ax">{error}</p>}
      {!pulse && !error && <p className="eyebrow fade-in mt-10 text-center">Taking the pulse…</p>}

      {pulse && (
        <>
          <section className="rise-in mt-7 grid grid-cols-4 gap-3 border-y border-line py-4">
            <Stat n={pulse.stats.conversations} label="conversations" />
            <Stat n={pulse.stats.live} label="live now" />
            <Stat n={pulse.stats.mapsRevealed} label="maps revealed" />
            <Stat n={pulse.stats.spectrums} label="spectrums" />
          </section>

          <section className="rise-in mt-8" style={{ animationDelay: '0.05s' }}>
            <p className="eyebrow mb-2">Conversations</p>
            <ul className="space-y-2">
              {pulse.conversations.map(c => {
                const drifted = c.latestTopic !== c.rootTopic;
                return (
                  <li key={c.rootGameId}>
                    <Link
                      href={`/g/${c.latestCode}`}
                      className={`block rounded-2xl border bg-paper-raised px-4 py-3 ${
                        c.live > 0 ? 'border-ink shadow-[var(--shadow-card)]' : 'border-line'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="display min-w-0 truncate text-xl">{c.rootTopic}</span>
                        {c.live > 0 ? (
                          <span className="eyebrow flex shrink-0 items-center gap-1.5 text-ax">
                            <span className="h-1.5 w-1.5 rounded-full bg-ax" aria-hidden />
                            {PHASE_WORD[c.latestPhase]}
                          </span>
                        ) : (
                          <span className="eyebrow shrink-0 !text-ink-faint">{ago(c.lastActiveAt)}</span>
                        )}
                      </div>
                      {drifted && (
                        <p className="mt-0.5 truncate text-sm text-ink-soft">
                          now: {c.latestTopic}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        {c.latestThemes.join(' // ')}
                      </p>
                      <p className="eyebrow mt-2 !text-ink-soft">
                        {c.generations > 1
                          ? `${c.generations} generations · ${c.games} games`
                          : `${c.games} game${c.games === 1 ? '' : 's'}`}
                        {c.mapsRevealed > 0 && ` · ${c.mapsRevealed} map${c.mapsRevealed === 1 ? '' : 's'} revealed`}
                      </p>
                    </Link>
                  </li>
                );
              })}
              {pulse.conversations.length === 0 && (
                <li className="rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-soft">
                  Nothing yet — the first game starts the first conversation.
                </li>
              )}
            </ul>
          </section>

          <section className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
            <p className="eyebrow mb-2">Spectrums</p>
            <ul className="space-y-1.5">
              {pulse.spectrums.map(s => (
                <li
                  key={s.key}
                  className="rounded-xl border bg-paper-raised px-3 py-2.5"
                  style={{ borderColor: s.recent ? 'var(--line-strong)' : 'var(--line)' }}
                >
                  <div className="flex items-center gap-3">
                    <FrameLine
                      poleA={s.poleA}
                      poleB={s.poleB}
                      accent={s.recent ? 'var(--ink)' : 'var(--ink-soft)'}
                      className="min-w-0 flex-1"
                    />
                    <span className="eyebrow shrink-0 !text-ink-faint">
                      {s.games} game{s.games === 1 ? '' : 's'}
                    </span>
                  </div>
                  {s.subtopics.length > 0 && (
                    <p className="eyebrow mt-1 truncate !text-ink-faint">
                      on {s.subtopics.join(' · ')}
                    </p>
                  )}
                </li>
              ))}
              {pulse.spectrums.length === 0 && (
                <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
                  No spectrums coined yet.
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      <footer className="mt-12 border-t border-line pt-4">
        <p className="text-xs text-ink-faint">
          A{' '}
          <a href="https://holoscopic.io" className="underline" target="_blank" rel="noopener noreferrer">
            Holoscopic
          </a>{' '}
          game &middot; aggregate only — who played stays in the room
        </p>
      </footer>
    </main>
  );
}
