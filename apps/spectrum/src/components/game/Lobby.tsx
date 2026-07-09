'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import ShareSheet from '@/components/game/ShareSheet';
import TokenChip from '@/components/game/TokenChip';
import { OasService } from '@/services/oasService';
import type { Game } from '@/lib/types';

const ROUND_LABEL = (s: number) =>
  s >= 86400 ? '1 day' : s >= 3600 ? `${Math.round(s / 3600)} hr` : `${Math.round(s / 60)} min`;

export default function Lobby({
  game,
  userId,
  balance,
}: {
  game: Game;
  userId: string;
  balance: number | null;
}) {
  const params = useSearchParams();
  const [shareOpen, setShareOpen] = useState(params.get('new') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = game.hostId === userId;

  // Freshly created room: surface the invite immediately.
  useEffect(() => {
    if (params.get('new') === '1') setShareOpen(true);
  }, [params]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await OasService.start(game.code, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Gathering — room {game.code}</p>
          <TokenChip balance={balance} />
        </div>
        <h1 className="display mt-3 text-5xl leading-[0.92]">{game.topic}</h1>
        <p className="display mt-2 text-2xl text-ink-soft">
          {game.themes.map((t, i) => (
            <span key={i}>
              <span className={i === 0 ? 'text-ax' : i === 1 ? 'text-ay' : 'text-ink'}>{t}</span>
              {i < 2 && <span className="text-ink-faint"> // </span>}
            </span>
          ))}
        </p>
        <p className="eyebrow mt-3">
          {ROUND_LABEL(game.config.roundSeconds.round1)} rounds · {game.config.startingTokens} tokens each · quorum {game.config.quorum}
        </p>
      </header>

      <section className="mt-10">
        <p className="eyebrow mb-3">
          {game.participants.length} player{game.participants.length === 1 ? '' : 's'}
        </p>
        <ul className="flex flex-wrap gap-2">
          {game.participants.map((p, i) => (
            <li
              key={p.id}
              className="dot-in rounded-full border border-line bg-paper-raised px-4 py-2 text-base"
              style={{ animationDelay: `${Math.min(i * 0.05, 0.6)}s` }}
            >
              {p.name}
              {p.isHost && <span className="eyebrow ml-2 !text-ink-faint">host</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-auto pt-10">
        <Button variant="ghost" onClick={() => setShareOpen(true)}>
          Invite players
        </Button>
        {isHost ? (
          <Button className="mt-3" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Start round 1'}
          </Button>
        ) : (
          <p className="mt-4 text-center text-sm text-ink-soft">
            Waiting for the host to start…
          </p>
        )}
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
      </section>

      <ShareSheet code={game.code} open={shareOpen} onClose={() => setShareOpen(false)} />
    </main>
  );
}
