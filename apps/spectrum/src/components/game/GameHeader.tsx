'use client';

import CountdownBar from '@/components/game/CountdownBar';
import TokenChip from '@/components/game/TokenChip';
import { useCountdown } from '@/hooks/useCountdown';
import type { Game } from '@/lib/types';

// "PARENTING: EXPERIENCES // INTENTIONS // ACTIONS" — the game's standing
// masthead, plus the round eyebrow, countdown, and token balance.

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
}: {
  game: Game;
  balance: number | null;
}) {
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
      {label && <p className="eyebrow mt-2">{label}</p>}
    </header>
  );
}
