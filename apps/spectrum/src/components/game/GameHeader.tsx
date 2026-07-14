'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import BottomSheet from '@/components/ui/BottomSheet';
import CountdownBar from '@/components/game/CountdownBar';
import TokenChip from '@/components/game/TokenChip';
import FramesSheet from '@/components/frames/FramesSheet';
import { framesInPlay } from '@/components/frames/FrameGlyph';
import { useCountdown } from '@/hooks/useCountdown';
import { OasService } from '@/services/oasService';
import { TIMED_PHASES } from '@/lib/types';
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

// Manual-mode rounds have no phaseDeadline — the host moves the room along
// by hand from right where the countdown bar would otherwise sit.
function AdvanceControl({
  game,
  userId,
  label,
}: {
  game: Game;
  userId?: string;
  label: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = !!userId && game.hostId === userId;

  if (!isHost) {
    return <p className="eyebrow !text-ink-faint">Manual round — the host will move things along</p>;
  }

  async function confirmAdvance() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await OasService.advance(game.code, userId);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not advance the round');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="eyebrow flex w-full items-center justify-center rounded-full border border-line-strong py-2 !text-ink active:bg-paper-dim"
      >
        Next round now →
      </button>
      <BottomSheet open={confirmOpen} onClose={() => (busy ? null : setConfirmOpen(false))}>
        <p className="eyebrow">Are you sure?</p>
        <h2 className="display mt-2 text-2xl leading-tight">
          End {label.toLowerCase()} for everyone?
        </h2>
        <p className="mt-2 text-base text-ink-soft">
          Unconfirmed nominations expire and refund their stakes. This can&apos;t be undone.
        </p>
        <Button className="mt-6" onClick={confirmAdvance} disabled={busy}>
          {busy ? 'Advancing…' : 'Yes, move on'}
        </Button>
        <Button variant="ghost" className="mt-3" onClick={() => setConfirmOpen(false)} disabled={busy}>
          Cancel
        </Button>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
      </BottomSheet>
    </>
  );
}

export default function GameHeader({
  game,
  balance,
  nominations,
  userId,
}: {
  game: Game;
  balance: number | null;
  nominations?: Nomination[];
  userId?: string;
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
  // The mapping rounds walk the themes left→right (Experiences → Intentions →
  // Actions); light the current one so the masthead reads as the funnel.
  const activeThemeM = /^round([2-4])$/.exec(game.phase);
  const activeThemeIndex = activeThemeM ? Number(activeThemeM[1]) - 2 : -1;

  return (
    <header className="pt-4">
      {secondsLeft !== null && game.phaseDeadline && (
        <CountdownBar secondsLeft={secondsLeft} totalSeconds={phaseSeconds} />
      )}
      {!game.phaseDeadline && game.config.roundMode === 'manual' && TIMED_PHASES.includes(game.phase) && (
        <AdvanceControl game={game} userId={userId} label={PHASE_LABEL[game.phase] || 'this round'} />
      )}
      <div className="flex items-start justify-between gap-3 pt-3">
        <h1 className="display min-w-0 text-3xl leading-[0.95]">
          <span className="block truncate">{game.topic}:</span>
          <span className="mt-1 block text-lg text-ink-soft">
            {game.themes.map((t, i) => {
              const color = i === 0 ? 'text-ax' : i === 1 ? 'text-ay' : 'text-ink';
              const active = i === activeThemeIndex;
              const dimmed = activeThemeIndex >= 0 && !active;
              return (
                <span key={i}>
                  <span
                    className={`${color} ${active ? 'font-semibold underline decoration-2 underline-offset-4' : ''} ${dimmed ? 'opacity-40' : ''}`}
                  >
                    {t}
                  </span>
                  {i < 2 && <span className="text-ink-faint"> ▸ </span>}
                </span>
              );
            })}
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
