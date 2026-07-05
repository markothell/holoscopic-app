'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import SpectrumGrid from '@/components/reveal/SpectrumGrid';
import StoryFeedSheet from '@/components/reveal/StoryFeedSheet';
import { GameService } from '@/services/gameService';
import type { Game, PlayerIdentity, ResultDot } from '@/lib/types';

// Stage 3 — the map. Tap a dot for the name; tap again for the stories.
export default function RevealScreen({
  code,
  game,
  results,
  identity,
  refresh,
}: {
  code: string;
  game: Game;
  results: ResultDot[] | null;
  identity: PlayerIdentity | null;
  refresh: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedDot, setFeedDot] = useState<ResultDot | null>(null);
  const [busy, setBusy] = useState(false);

  // Results ride in on the snapshot at reveal; if we got here via a socket
  // phase_changed that predates our snapshot, fetch once.
  useEffect(() => {
    if (!results) refresh();
  }, [results, refresh]);

  const xLabel = game.winningAxes[0]?.label ?? '';
  const yLabel = game.winningAxes[1]?.label ?? '';
  const isHost = identity?.playerId === game.hostId;

  function handleSelect(dot: ResultDot) {
    if (selectedId === dot.playerId) {
      setFeedDot(dot);
    } else {
      setSelectedId(dot.playerId);
    }
  }

  async function playAgain() {
    if (!identity) return;
    setBusy(true);
    try { await GameService.rematch(code, identity); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="rise-in text-center">
        <p className="eyebrow">Room {code} · the reveal</p>
        <h1 className="display mt-2 text-4xl leading-[0.95]">
          <span className="text-ax">{xLabel}</span>
          <span className="mx-2 text-ink-faint">×</span>
          <span className="text-ay">{yLabel}</span>
        </h1>
      </header>

      <div className="mt-6 flex-1">
        {results ? (
          <SpectrumGrid
            results={results}
            xLabel={xLabel}
            yLabel={yLabel}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        ) : (
          <p className="eyebrow mt-16 text-center">Plotting the room…</p>
        )}
        <p className="mt-4 text-center text-sm text-ink-soft">
          Tap a dot for the name — tap again for the stories.
        </p>
      </div>

      {isHost && (
        <div className="mt-6">
          <Button variant="ghost" onClick={playAgain} disabled={busy}>
            {busy ? 'Setting up…' : 'Play again — new spectrums'}
          </Button>
        </div>
      )}

      <StoryFeedSheet
        dot={feedDot}
        xLabel={xLabel}
        yLabel={yLabel}
        onClose={() => setFeedDot(null)}
      />
    </main>
  );
}
