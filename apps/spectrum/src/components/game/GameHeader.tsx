'use client';

import { useState } from 'react';
import CountdownBar from '@/components/game/CountdownBar';
import TokenChip from '@/components/game/TokenChip';
import FramesSheet from '@/components/frames/FramesSheet';
import { framesInPlay } from '@/components/frames/FrameGlyph';
import { useCountdown } from '@/hooks/useCountdown';
import type { Game, Nomination } from '@/lib/types';

// "PARENTING: EXPERIENCES // INTENTIONS // ACTIONS" — the game's standing
// masthead, plus the round eyebrow, countdown, token balance, and (once
// mapping rounds begin) the door to the frames shelf.

const PHASE_LABEL: Record<string, string> = {
  round1: 'Round 1 — map the territory',
  round2: 'Round 2',
  round3: 'Round 3',
  round4: 'Round 4',
  revise: 'Revise the game',
  complete: 'Complete',
};

function roundTheme(game: Game): string | null {
  const m = /^round([2-4])$/.exec(game.phase);
  if (!m) return null;
  return game.themes[Number(m[1]) - 2] ?? null;
}

export default function GameHeader({
  game,
  balance,
  nominations,
}: {
  game: Game;
  balance: number | null;
  nominations?: Nomination[];
}) {
  const [framesOpen, setFramesOpen] = useState(false);
  const frameCount = nominations ? framesInPlay(nominations).length : 0;
  const secondsLeft = useCountdown(game.phaseDeadline, game.serverNow);
  const phaseSeconds =
    game.phase in game.config.roundSeconds
      ? game.config.roundSeconds[game.phase as keyof typeof game.config.roundSeconds]
      : 0;
  const theme = roundTheme(game);
  const label = theme ? `${PHASE_LABEL[game.phase]} — ${theme}` : PHASE_LABEL[game.phase] || '';

  return (
    <header className="pt-4">
      {secondsLeft !== null && game.phaseDeadline && (
        <CountdownBar secondsLeft={secondsLeft} totalSeconds={phaseSeconds} />
      )}
      <div className="flex items-start justify-between gap-3 pt-3">
        <h1 className="display min-w-0 text-3xl leading-[0.95]">
          <span className="block truncate">{game.topic}:</span>
          <span className="mt-1 block text-lg text-ink-soft">
            {game.themes.map((t, i) => (
              <span key={i}>
                <span className={i === 0 ? 'text-ax' : i === 1 ? 'text-ay' : 'text-ink'}>
                  {t}
                </span>
                {i < 2 && <span className="text-ink-faint"> // </span>}
              </span>
            ))}
          </span>
        </h1>
        <TokenChip balance={balance} />
      </div>
      {(label || frameCount > 0) && (
        <div className="mt-2 flex items-center justify-between gap-3">
          {label && <p className="eyebrow">{label}</p>}
          {frameCount > 0 && (
            <button
              onClick={() => setFramesOpen(true)}
              className="eyebrow flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 !text-ink-soft"
            >
              <span className="flex w-4 items-center" aria-hidden>
                <span className="h-1 w-1 rounded-full border border-current" />
                <span className="h-px flex-1 bg-current" />
                <span className="h-1 w-1 rounded-full bg-current" />
              </span>
              {frameCount} spectrum{frameCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}
      {nominations && (
        <FramesSheet
          game={game}
          nominations={nominations}
          open={framesOpen}
          onClose={() => setFramesOpen(false)}
        />
      )}
    </header>
  );
}
