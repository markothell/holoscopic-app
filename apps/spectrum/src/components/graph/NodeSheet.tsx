'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { StakeDots, THEME_ACCENT } from '@/components/graph/nodes';
import { FrameLine, FramePreview, framesInPlay, leadingAxes } from '@/components/frames/FrameGlyph';
import FrameComposer from '@/components/frames/FrameComposer';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, Nomination } from '@/lib/types';

// Tap a graph node → its action sheet: who staked, and what a token can do
// here right now. For a map still seeking quorum this is also the frame
// contest: the slate renders as glyphs, stakers vote the lens and float
// rivals, and the leaders preview the exact map that will confirm. All
// mutations broadcast back through the socket, so the sheet re-renders from
// the same nomination stream as the graph.

function roundOf(phase: string): number | null {
  const m = /^round([1-4])$/.exec(phase);
  return m ? Number(m[1]) : null;
}

export default function NodeSheet({
  game,
  nominations,
  nomination,
  userId,
  balance,
  onClose,
  onOpenMap,
  onProposeMap,
  onBranchSubtopic,
}: {
  game: Game;
  nominations: Nomination[];
  nomination: Nomination | null;
  userId: string;
  balance: number | null;
  onClose: () => void;
  onOpenMap: (mapId: string) => void;
  onProposeMap: (subtopicId: string) => void;
  onBranchSubtopic: (parentSubtopicId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenging, setChallenging] = useState(false);

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

      {/* The frame contest — live while the map seeks quorum, then locked. */}
      {nom.kind === 'map' && nom.frameSlate && nom.status === 'nominated' && (() => {
        const slate = nom.frameSlate;
        const leaders = leadingAxes(slate, nom.dimensions ?? 2);
        const leaderIds = new Set(leaders.map(f => f.frameId));
        const myVotes = slate.reduce((n, f) => n + (f.voterIds.includes(userId) ? 1 : 0), 0);
        const myProposed = slate.filter(f => f.proposedBy === userId).length;
        const canChallenge = myStake && inItsRound && myProposed < 2;
        // Lenses this composer can't offer: already on the slate, or already
        // claimed on this subtopic by a rival nomination this round (a
        // confirmed rival only claims its locked axes).
        const unavailable = new Set(slate.map(f => f.frameId));
        for (const rival of nominations) {
          if (rival.kind === 'map' && rival.id !== nom.id && rival.round === nom.round &&
              rival.subtopicId === nom.subtopicId && rival.status !== 'expired') {
            const claimed = rival.status === 'confirmed' && rival.mapState
              ? rival.mapState.winningAxes
              : rival.frameSlate ?? [];
            for (const f of claimed) unavailable.add(f.frameId);
          }
        }
        return (
          <section className="mt-5">
            <p className="eyebrow" style={{ color: accent }}>
              The spectrum{(nom.dimensions ?? 2) === 2 ? 's — lock' : ' — locks'} when the map confirms
            </p>
            <div className="mt-2">
              <FramePreview axes={leaders} accent={accent} compact />
            </div>
            {slate.length > (nom.dimensions ?? 2) || slate.some(f => f.voterIds.length > 0) ? (
              <p className="mt-1.5 text-xs text-ink-faint">
                {myStake
                  ? `Vote for the spectrums you want${slate.length > 1 ? ` — ${game.config.votesPerUser - myVotes} of ${game.config.votesPerUser} votes left` : ''}.`
                  : 'Stakers pick the spectrums by vote.'}
              </p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {slate.map(f => {
                const mine = f.voterIds.includes(userId);
                const leading = leaderIds.has(f.frameId);
                return (
                  <li
                    key={f.frameId}
                    className="flex items-center gap-3 rounded-xl border bg-paper-raised px-3 py-2"
                    style={{ borderColor: leading ? accent : 'var(--line)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <FrameLine poleA={f.poleA} poleB={f.poleB} accent={leading ? accent : 'var(--ink-soft)'} />
                      <span className="eyebrow !text-ink-faint">
                        {f.proposedBy === userId ? 'yours' : f.proposedByName}
                      </span>
                    </div>
                    {f.voterIds.length > 0 && (
                      <span className="eyebrow" style={{ color: accent }}>{f.voterIds.length}</span>
                    )}
                    {myStake && f.proposedBy !== userId && (
                      <button
                        disabled={busy}
                        onClick={() => act(() => OasService.voteFrame(game.code, nom.id, f.frameId, userId))}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                          mine ? 'border-transparent text-white' : 'border-line-strong text-ink-soft'
                        }`}
                        style={mine ? { background: accent } : undefined}
                      >
                        {mine ? 'voted ✓' : 'vote'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {canChallenge && (
              challenging ? (
                <div className="mt-3">
                  <FrameComposer
                    accent={accent}
                    shelf={framesInPlay(nominations)}
                    disabledFrameIds={unavailable}
                    busy={busy}
                    onPick={pick => act(async () => {
                      await OasService.proposeFrame(
                        game.code, nom.id,
                        pick.frameId ? { frameId: pick.frameId } : { poleA: pick.poleA, poleB: pick.poleB },
                        userId,
                      );
                      setChallenging(false);
                    })}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setChallenging(true)}
                  className="mt-2 text-sm text-ink-soft underline"
                >
                  + challenge with a different spectrum
                </button>
              )
            )}
            {!myStake && inItsRound && (
              <p className="mt-2 text-xs text-ink-faint">
                Stake a token to vote on the spectrums or float your own.
              </p>
            )}
          </section>
        );
      })()}

      {/* Confirmed map: the locked lens, drawn as the map it became. */}
      {nom.kind === 'map' && nom.status === 'confirmed' && nom.mapState && (
        <div className="mt-5">
          <FramePreview axes={nom.mapState.winningAxes} accent={accent} compact />
        </div>
      )}

      {nom.status === 'nominated' && inItsRound && (
        <>
          {!myStake ? (
            <Button
              className="mt-6"
              disabled={busy || (balance !== null && balance < 1)}
              onClick={() => act(() => OasService.stake(game.code, nom.id, userId))}
            >
              {/* Your token is the deciding vote when it reaches quorum. */}
              {(() => {
                const willConfirm = nom.stakes.length + 1 >= nom.quorumThreshold;
                if (busy) return willConfirm ? 'Confirming…' : 'Supporting…';
                return willConfirm ? 'Confirm · ● 1' : 'Support · ● 1';
              })()}
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="mt-6"
                disabled={busy}
                onClick={() => act(() => OasService.unstake(game.code, nom.id, userId))}
              >
                {busy ? 'Withdrawing…' : 'Withdraw my token'}
              </Button>
              {nom.stakes.length === 1 && (
                <p className="mt-2 text-center text-xs text-ink-faint">
                  {isNominator
                    ? 'You’re its only backer — withdrawing removes this nomination.'
                    : 'You’re its only backer — withdrawing removes it.'}
                </p>
              )}
            </>
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

      {/* Round 1: branch a deeper subtopic — only confirmed nodes grow. */}
      {currentRound === 1 && nom.kind === 'subtopic' && nom.status === 'confirmed' && (
        <Button
          variant="ghost"
          className="mt-3"
          disabled={busy || (balance !== null && balance < 1)}
          onClick={() => { onBranchSubtopic(nom.id); onClose(); }}
        >
          {balance !== null && balance < 1 ? 'Out of tokens' : '+ Subtopic here · ● 1'}
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
