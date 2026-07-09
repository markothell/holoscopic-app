'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { StakeDots, THEME_ACCENT } from '@/components/graph/nodes';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, Nomination } from '@/lib/types';

// Tap a graph node → its action sheet: who staked, and what a token can do
// here right now. All mutations broadcast back through the socket, so the
// sheet re-renders from the same nomination stream as the graph.

function roundOf(phase: string): number | null {
  const m = /^round([1-4])$/.exec(phase);
  return m ? Number(m[1]) : null;
}

export default function NodeSheet({
  game,
  nomination,
  userId,
  balance,
  onClose,
  onOpenMap,
  onProposeMap,
}: {
  game: Game;
  nomination: Nomination | null;
  userId: string;
  balance: number | null;
  onClose: () => void;
  onOpenMap: (mapId: string) => void;
  onProposeMap: (subtopicId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!nomination) return null;
  const nom = nomination;

  const names = new Map(game.participants.map(p => [p.id, p.name]));
  const stakers = nom.stakes.map(s => names.get(s.userId) || 'someone');
  const myStake = nom.stakes.some(s => s.userId === userId && !s.returned);
  const isNominator = nom.nominatedBy === userId;
  const currentRound = roundOf(game.phase);
  const inItsRound = currentRound === nom.round;
  const accent = nom.kind === 'map' ? THEME_ACCENT[nom.themeIndex ?? 0] : 'var(--ink)';
  const theme = nom.kind === 'map' ? game.themes[nom.themeIndex ?? 0] : null;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Out of tokens — finish a map or wait for a round to close.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose}>
      <p className="eyebrow" style={{ color: accent }}>
        {nom.kind === 'map' ? `${theme} map` : 'Subtopic'}
        {nom.status === 'confirmed' ? ' · confirmed' : nom.status === 'expired' ? ' · expired' : ''}
      </p>
      <h2 className="display mt-1 text-3xl">{nom.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        nominated by {isNominator ? 'you' : nom.nominatedByName}
      </p>

      <div className="mt-4 flex items-center gap-3">
        <StakeDots count={nom.stakes.length} quorum={nom.quorumThreshold} accent={accent} />
        <span className="text-sm text-ink-soft">
          {nom.status === 'confirmed'
            ? `${nom.stakes.length} staked`
            : `${nom.stakes.length} of ${nom.quorumThreshold} tokens to confirm`}
        </span>
      </div>
      {stakers.length > 0 && (
        <p className="mt-2 text-sm text-ink-faint">{stakers.join(' · ')}</p>
      )}

      {nom.status === 'nominated' && inItsRound && (
        <>
          {!myStake ? (
            <Button
              className="mt-6"
              disabled={busy || (balance !== null && balance < 1)}
              onClick={() => act(() => OasService.stake(game.code, nom.id, userId))}
            >
              {busy ? 'Staking…' : 'Stake a token'}
            </Button>
          ) : isNominator ? (
            <p className="mt-6 text-center text-sm text-ink-soft">
              Your nomination — your token rides until the round ends.
            </p>
          ) : (
            <Button
              variant="ghost"
              className="mt-6"
              disabled={busy}
              onClick={() => act(() => OasService.unstake(game.code, nom.id, userId))}
            >
              {busy ? 'Withdrawing…' : 'Withdraw my token'}
            </Button>
          )}
        </>
      )}

      {nom.status === 'confirmed' && nom.kind === 'subtopic' && (
        currentRound !== null && currentRound >= 2 ? (
          <Button
            className="mt-6"
            onClick={() => { onProposeMap(nom.id); onClose(); }}
          >
            Propose a map · ● 1
          </Button>
        ) : currentRound === 1 ? (
          <p className="mt-6 text-center text-sm text-ink-soft">
            In the game — mappable from round 2.
          </p>
        ) : (
          <p className="mt-6 text-center text-sm text-ink-soft">
            Part of this game&apos;s web — tap its maps to see the reveals.
          </p>
        )
      )}

      {nom.status === 'confirmed' && nom.kind === 'map' && (
        <Button
          className="mt-6"
          onClick={() => { onOpenMap(nom.id); onClose(); }}
          style={{ background: accent }}
        >
          {nom.mapState?.stage === 'gather' ? 'Open map — gathering'
            : nom.mapState?.stage === 'rank' ? 'Open map — ranking'
            : 'See the reveal'}
        </Button>
      )}

      {nom.status === 'expired' && (
        <p className="mt-6 text-center text-sm text-ink-soft">
          Never reached quorum — every staked token went home.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
