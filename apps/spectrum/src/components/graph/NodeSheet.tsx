'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { StakeDots, THEME_ACCENT } from '@/components/graph/nodes';
import { FrameLine, FramePreview, framesInPlay } from '@/components/frames/FrameGlyph';
import FrameComposer from '@/components/frames/FrameComposer';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, MapItem, Nomination } from '@/lib/types';

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
  onCarry,
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
  onCarry?: (source: { mapNom: Nomination; item: MapItem }) => void;
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

  // Rounds 3–4: a revealed map from the previous round is a source of items to
  // carry forward. Its frozen roster (with comments) drives the carry list.
  const canCarryFrom = nom.kind === 'map' && !!nom.mapState &&
    (nom.mapState.stage === 'done' || nom.mapState.stage === 'closed') &&
    currentRound !== null && currentRound >= 3 && nom.round === currentRound - 1;
  const carryAccent = THEME_ACCENT[(currentRound ?? 2) - 2] ?? 'var(--ink)';
  const carryTheme = currentRound ? game.themes[currentRound - 2] ?? '' : '';
  // The leading current-round carry of an item (confirmed first, else most
  // staked), so each row shows one honest progress state.
  const leadingCarry = (entryId: string): Nomination | null => {
    const carries = nominations.filter(
      n => n.kind === 'map' && n.round === currentRound && n.sourceEntryId === entryId
        && n.status !== 'expired');
    if (!carries.length) return null;
    return carries.sort((a, b) =>
      (a.status === 'confirmed' ? -1 : 0) - (b.status === 'confirmed' ? -1 : 0)
      || b.stakes.length - a.stakes.length)[0];
  };

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
      {nom.kind === 'map' && nom.sourceEntryId && (nom.themeIndex ?? 0) > 0 && (
        <p className="eyebrow mt-0.5 !text-ink-faint">
          carried forward from {game.themes[(nom.themeIndex ?? 0) - 1]}
        </p>
      )}
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

      {/* The nominator's own slate — theirs to shape until the map confirms.
          Everyone else just supports (or doesn't) what's proposed. */}
      {nom.kind === 'map' && nom.frameSlate && nom.status === 'nominated' && (() => {
        const slate = nom.frameSlate;
        const dims = nom.dimensions ?? 2;
        const openSlots = dims - slate.length;
        // Lenses the composer can't offer: already on this slate, or already
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
              The spectrum{dims === 2 ? 's' : ''} — locks when the map confirms
            </p>
            {slate.length > 0 && (
              <div className="mt-2">
                <FramePreview axes={slate} accent={accent} compact />
              </div>
            )}
            <ul className="mt-2 space-y-1.5">
              {slate.map(f => (
                <li
                  key={f.frameId}
                  className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <FrameLine poleA={f.poleA} poleB={f.poleB} accent={accent} />
                  </div>
                  {isNominator && (
                    <button
                      disabled={busy}
                      aria-label="Remove this spectrum"
                      onClick={() => act(() => OasService.removeFrame(game.code, nom.id, f.frameId, userId))}
                      className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-soft"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {isNominator && openSlots > 0 && (
              <div className="mt-3">
                <FrameComposer
                  accent={accent}
                  shelf={framesInPlay(nominations)}
                  disabledFrameIds={unavailable}
                  busy={busy}
                  onPick={pick => act(() => OasService.proposeFrame(
                    game.code, nom.id,
                    pick.frameId ? { frameId: pick.frameId } : { poleA: pick.poleA, poleB: pick.poleB },
                    userId,
                  ))}
                />
              </div>
            )}
            {!isNominator && (
              <p className="mt-2 text-xs text-ink-faint">
                Set by {nom.nominatedByName} — support the proposal as staked, or bring your own on a different lens.
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

      {/* Rounds 3–4: carry this map's comments forward into new maps. Vote (a
          1-token stake) here, or open the map to read them in full. */}
      {canCarryFrom && nom.mapState && (
        <section className="mt-5">
          <p className="eyebrow" style={{ color: carryAccent }}>
            Carry forward → {carryTheme}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Stake a token on the comments worth mapping through {carryTheme.toLowerCase()} —
            top picks become new maps.
          </p>
          <ul className="mt-3 space-y-1.5">
            {nom.mapState.items.map(item => {
              const carry = leadingCarry(item.entryId);
              const live = carry?.status === 'confirmed';
              const iBacked = !!carry?.stakes.some(s => s.userId === userId);
              return (
                <li key={item.entryId} className="rounded-xl border border-line bg-paper-raised px-3 py-2">
                  <p className="text-base">{item.label}</p>
                  {item.comment && (
                    <p className="mt-0.5 text-sm text-ink-soft">{item.comment}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {carry ? (
                      <StakeDots count={carry.stakes.length} quorum={carry.quorumThreshold} accent={carryAccent} />
                    ) : (
                      <span className="eyebrow !text-ink-faint">not carried yet</span>
                    )}
                    {live && carry ? (
                      <button
                        onClick={() => { onOpenMap(carry.id); onClose(); }}
                        className="shrink-0 rounded-full px-3 py-1.5 text-xs text-white"
                        style={{ background: carryAccent }}
                      >
                        open map
                      </button>
                    ) : carry ? (
                      <button
                        disabled={busy || iBacked || (balance !== null && balance < 1)}
                        onClick={() => act(() => OasService.stake(game.code, carry.id, userId))}
                        className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-xs text-ink-soft disabled:opacity-40"
                      >
                        {iBacked ? 'backing ✓' : 'support · ● 1'}
                      </button>
                    ) : (
                      <button
                        disabled={balance !== null && balance < 1}
                        onClick={() => { onCarry?.({ mapNom: nom, item }); onClose(); }}
                        className="shrink-0 rounded-full px-3 py-1.5 text-xs text-white disabled:opacity-40"
                        style={{ background: carryAccent }}
                      >
                        carry · ● 1
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
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
