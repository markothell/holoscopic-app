'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGame } from '@/hooks/useGame';
import { useIdentity, getStoredIdentity, storeIdentity } from '@/hooks/useIdentity';
import NameGate from '@/components/game/NameGate';
import LobbyNominate from '@/components/game/LobbyNominate';
import RankFlow from '@/components/rank/RankFlow';
import RevealScreen from '@/components/reveal/RevealScreen';
import Interstitial from '@/components/game/Interstitial';
import type { Phase } from '@/lib/types';

// The whole game lives at one URL. This component routes between phase
// screens; useGame keeps the state live.
export default function GameRoom({ code }: { code: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const state = useGame(code);
  const { identity, hydrated, save } = useIdentity(code);

  const prevPhase = useRef<Phase | null>(null);
  const [interstitial, setInterstitial] = useState(false);

  // The nominate→rank cut is the game's dramatic beat — give it a moment.
  useEffect(() => {
    const phase = state.game?.phase ?? null;
    if (prevPhase.current === 'nominate' && phase === 'rank') {
      setInterstitial(true);
      const t = setTimeout(() => setInterstitial(false), 2600);
      return () => clearTimeout(t);
    }
    prevPhase.current = phase;
  }, [state.game?.phase]);

  useEffect(() => {
    prevPhase.current = state.game?.phase ?? prevPhase.current;
  }, [state.game?.phase]);

  // Rematch: same people, same player ids — carry the identity to the new
  // room and follow the host there.
  useEffect(() => {
    if (state.rematchCode && identity) {
      storeIdentity(state.rematchCode, identity);
      router.replace(`/g/${state.rematchCode}`);
    } else if (state.rematchCode && !getStoredIdentity(state.rematchCode)) {
      router.replace(`/g/${state.rematchCode}`);
    }
  }, [state.rematchCode, identity, router]);

  if (state.error) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="eyebrow">Room {code}</p>
        <h1 className="display mt-3 text-4xl">Can’t find that game</h1>
        <p className="mt-3 text-ink-soft">{state.error}</p>
        <button className="mt-6 underline" onClick={() => router.push('/')}>Start your own</button>
      </main>
    );
  }

  if (state.loading || !state.game || !hydrated) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="eyebrow fade-in">Opening room {code}…</p>
      </main>
    );
  }

  const game = state.game;
  const isMember = !!identity && game.participants.some(p => p.id === identity.playerId);

  if (!isMember && (game.phase === 'lobby' || game.phase === 'nominate')) {
    return <NameGate code={code} game={game} onJoined={save} />;
  }

  if (interstitial && game.winningAxes.length === 2) {
    return <Interstitial axes={game.winningAxes} />;
  }

  const spectator = !isMember;

  switch (game.phase) {
    case 'lobby':
    case 'nominate':
      return (
        <LobbyNominate
          code={code}
          state={state}
          identity={identity!}
          autoShare={search.get('new') === '1'}
        />
      );
    case 'rank':
      return (
        <RankFlow
          code={code}
          game={game}
          identity={identity}
          spectator={spectator}
          refresh={state.refresh}
        />
      );
    case 'reveal':
      return (
        <RevealScreen
          code={code}
          game={game}
          results={state.results}
          identity={identity}
          refresh={state.refresh}
        />
      );
  }
}
