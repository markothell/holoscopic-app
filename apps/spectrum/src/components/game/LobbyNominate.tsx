'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import ShareSheet from '@/components/game/ShareSheet';
import CountdownBar from '@/components/game/CountdownBar';
import { GameService } from '@/services/gameService';
import { useCountdown } from '@/hooks/useCountdown';
import type { GameState } from '@/hooks/useGame';
import type { Nomination, PlayerIdentity } from '@/lib/types';

// Stage 1 — lobby and nominate are ONE screen. Friends pop in as chips;
// the host starts the clock; ideas land on a live tally everyone votes on.
export default function LobbyNominate({
  code,
  state,
  identity,
  autoShare,
}: {
  code: string;
  state: GameState;
  identity: PlayerIdentity;
  autoShare: boolean;
}) {
  const game = state.game!;
  const isHost = identity.playerId === game.hostId;
  const nominating = game.phase === 'nominate';

  const [shareOpen, setShareOpen] = useState(autoShare);
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const secondsLeft = useCountdown(game.phaseDeadline, game.serverNow);

  const sorted = useMemo(
    () => [...state.nominations].sort((a, b) =>
      b.voteCount - a.voteCount ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [state.nominations],
  );

  const votesUsed = state.nominations.filter(n => n.voterIds.includes(identity.playerId)).length;
  const votesLeft = Math.max(0, game.config.votesPerUser - votesUsed);
  const mineCount = state.nominations.filter(n => n.userId === identity.playerId).length;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const startGame = () => act(() => GameService.start(code, identity));
  const closeEarly = () => act(() => GameService.advance(code, identity));
  const submitIdea = () => {
    const text = idea.trim();
    if (!text) return;
    setIdea('');
    return act(() => GameService.nominate(code, text, identity));
  };
  const toggleVote = (n: Nomination) => act(() => GameService.vote(code, n.id, identity));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {nominating && secondsLeft !== null && (
        <CountdownBar secondsLeft={secondsLeft} totalSeconds={game.config.nominateSeconds} />
      )}

      <header className="rise-in">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Room {code}</p>
          <button className="eyebrow underline" onClick={() => setShareOpen(true)}>
            Invite
          </button>
        </div>
        <h1 className="display mt-2 text-4xl">
          {nominating ? 'What should we measure?' : 'The room is filling'}
        </h1>
      </header>

      {/* Player chips — pop in live as friends join */}
      <div className="mt-4 flex flex-wrap gap-2">
        {game.participants.map(p => (
          <span
            key={p.id}
            className="fade-in rounded-full border border-line-strong bg-paper-raised px-3 py-1 text-sm"
          >
            {p.name}{p.isHost ? ' ★' : ''}
          </span>
        ))}
      </div>

      {!nominating && (
        <div className="mt-auto pt-10">
          <p className="mb-4 text-ink-soft">
            {game.participants.length < 2
              ? 'Waiting for at least one friend to join…'
              : `${game.participants.length} in. Ready when you are.`}
          </p>
          {isHost ? (
            <Button onClick={startGame} disabled={busy || game.participants.length < 2}>
              Start the clock
            </Button>
          ) : (
            <p className="eyebrow text-center">Waiting for the host to start…</p>
          )}
          {notice && <p className="mt-3 text-sm text-ax">{notice}</p>}
        </div>
      )}

      {nominating && (
        <>
          {/* Live tally */}
          <div className="mt-5 flex-1 space-y-2 overflow-y-auto pb-4">
            {sorted.length === 0 && (
              <p className="mt-8 text-center text-ink-faint">
                Throw the first idea out there — funniness, calmness, boldness…
              </p>
            )}
            {sorted.map((n, i) => {
              const mine = n.userId === identity.playerId;
              const voted = n.voterIds.includes(identity.playerId);
              const leading = i < 2 && n.voteCount > 0;
              return (
                <button
                  key={n.id}
                  disabled={mine || busy || (!voted && votesLeft === 0)}
                  onClick={() => toggleVote(n)}
                  className={`tally-row flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                    leading
                      ? 'border-ink bg-paper-raised'
                      : 'border-line bg-paper-raised/60'
                  } ${voted ? 'ring-2 ring-ink/70' : ''} disabled:opacity-100`}
                  style={{ boxShadow: leading ? 'var(--shadow-card)' : 'none' }}
                >
                  <span className="min-w-0">
                    <span className={`display block truncate text-2xl ${leading ? '' : 'text-ink-soft'}`}>
                      {n.text}
                    </span>
                    <span className="eyebrow">{mine ? 'your idea' : n.username}</span>
                  </span>
                  <span className="ml-3 flex shrink-0 items-center gap-1">
                    {Array.from({ length: n.voteCount }).map((_, k) => (
                      <span
                        key={k}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: i === 0 ? 'var(--x-accent)' : i === 1 ? 'var(--y-accent)' : 'var(--line-strong)' }}
                      />
                    ))}
                    {n.voteCount === 0 && <span className="eyebrow">0</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Input pinned at the bottom, budget beside it */}
          <div className="sticky bottom-0 -mx-5 border-t border-line bg-paper px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {state.needIdeasNudge > 0 && sorted.length < 2 && (
              <p className="mb-2 text-center text-sm text-ax">
                Need at least 2 ideas — clock extended!
              </p>
            )}
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">
                {mineCount < game.config.maxNominationsPerPlayer
                  ? `Ideas ${mineCount}/${game.config.maxNominationsPerPlayer}`
                  : 'All ideas in'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="eyebrow">Votes</span>
                {Array.from({ length: game.config.votesPerUser }).map((_, k) => (
                  <span
                    key={k}
                    className={`h-2.5 w-2.5 rounded-full ${k < votesLeft ? 'bg-ink' : 'bg-line-strong'}`}
                  />
                ))}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={idea}
                onChange={e => setIdea(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitIdea(); }}
                maxLength={60}
                placeholder="sexiness, calmness, best memory…"
                disabled={mineCount >= game.config.maxNominationsPerPlayer}
                className="w-full rounded-full border border-line-strong bg-paper-raised px-5 py-3 text-base placeholder:text-ink-faint focus:border-ink focus:outline-none disabled:opacity-40"
              />
              <button
                onClick={submitIdea}
                disabled={!idea.trim() || busy}
                className="display shrink-0 rounded-full bg-ink px-5 text-lg text-paper disabled:opacity-30"
              >
                Add
              </button>
            </div>
            {isHost && sorted.length >= 2 && (
              <button onClick={closeEarly} className="mt-2 w-full py-1 text-center text-sm text-ink-soft underline">
                Close voting early
              </button>
            )}
            {notice && <p className="mt-2 text-sm text-ax">{notice}</p>}
          </div>
        </>
      )}

      <ShareSheet code={code} open={shareOpen} onClose={() => setShareOpen(false)} />
    </main>
  );
}
