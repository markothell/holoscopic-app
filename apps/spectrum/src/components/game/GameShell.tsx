'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Lobby from '@/components/game/Lobby';
import GameHeader from '@/components/game/GameHeader';
import GameGraph from '@/components/graph/GameGraph';
import SubtopicSheet from '@/components/nominate/SubtopicSheet';
import MapNominationSheet from '@/components/nominate/MapNominationSheet';
import MapSheet from '@/components/map/MapSheet';
import ReviseFlow from '@/components/revise/ReviseFlow';
import ProposalsScreen from '@/components/final/ProposalsScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useOasGame } from '@/hooks/useOasGame';
import { OasService } from '@/services/oasService';
import type { Game, Nomination } from '@/lib/types';

// The single game URL. Gates (auth → membership) first, then switches on
// the server-authoritative phase.

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      {children}
    </main>
  );
}

function SignInGate({ code }: { code: string }) {
  const next = `/g/${code}`;
  return (
    <Center>
      <p className="eyebrow rise-in">Room {code}</p>
      <h1 className="display rise-in mt-3 text-5xl leading-[0.92]">
        You&apos;re<br />invited
      </h1>
      <p className="rise-in mt-4 text-base text-ink-soft">
        Sign in with your holoscopic account to take a seat.
      </p>
      <div className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
        <Link href={`/login?next=${encodeURIComponent(next)}`}>
          <Button>Sign in</Button>
        </Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`}>
          <Button variant="ghost" className="mt-3">Create an account</Button>
        </Link>
      </div>
    </Center>
  );
}

function JoinGate({
  game,
  userId,
  onJoined,
}: {
  game: Game;
  userId: string;
  onJoined: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await OasService.join(game.code, userId);
      onJoined();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusy(false);
    }
  }

  return (
    <Center>
      <p className="eyebrow rise-in">Room {game.code}</p>
      <h1 className="display rise-in mt-3 text-5xl leading-[0.92]">{game.topic}</h1>
      <p className="display rise-in mt-2 text-xl text-ink-soft">
        {game.themes.join(' // ')}
      </p>
      <p className="rise-in mt-4 text-base text-ink-soft">
        {game.participants.length} playing · joining grants you{' '}
        {game.config.startingTokens} tokens to stake on what matters.
      </p>
      <div className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
        <Button onClick={join} disabled={busy}>
          {busy ? 'Joining…' : 'Join the game'}
        </Button>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
      </div>
    </Center>
  );
}

// Rounds 1–4: masthead over the full-bleed topic web. Sheets layer on top:
// nominate (subtopic or map proposal) and the live map surface.
function RoundStage({
  game,
  nominations,
  userId,
  balance,
}: {
  game: Game;
  nominations: Nomination[];
  userId: string;
  balance: number | null;
}) {
  const [nominateOpen, setNominateOpen] = useState(false);
  const [proposeSubtopicId, setProposeSubtopicId] = useState<string | null>(null);
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const isRound1 = game.phase === 'round1';
  const noTokens = balance !== null && balance < 1;

  return (
    <main className="flex h-dvh w-full flex-col">
      <div className="mx-auto w-full max-w-md px-5">
        <GameHeader game={game} balance={balance} />
      </div>
      <div className="min-h-0 flex-1">
        <GameGraph
          game={game}
          nominations={nominations}
          userId={userId}
          balance={balance}
          onOpenMap={setOpenMapId}
          onProposeMap={(subtopicId) => { setProposeSubtopicId(subtopicId); setNominateOpen(true); }}
        />
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md px-5">
          <Button
            className="pointer-events-auto shadow-lg"
            onClick={() => { setProposeSubtopicId(null); setNominateOpen(true); }}
            disabled={noTokens}
          >
            {noTokens ? 'Out of tokens' : isRound1 ? '+ Subtopic · ● 1' : '+ Propose a map · ● 1'}
          </Button>
        </div>
      </div>
      {isRound1 ? (
        <SubtopicSheet
          game={game}
          userId={userId}
          open={nominateOpen}
          onClose={() => setNominateOpen(false)}
        />
      ) : (
        <MapNominationSheet
          game={game}
          nominations={nominations}
          userId={userId}
          open={nominateOpen}
          preselectedSubtopicId={proposeSubtopicId}
          onClose={() => { setNominateOpen(false); setProposeSubtopicId(null); }}
        />
      )}
      {openMapId && (
        <MapSheet
          code={game.code}
          game={game}
          mapId={openMapId}
          userId={userId}
          onClose={() => setOpenMapId(null)}
        />
      )}
    </main>
  );
}

export default function GameShell({ code }: { code: string }) {
  const { userId, isAuthenticated, isLoading } = useAuth();
  const { loading, error, game, nominations, balance, refresh } = useOasGame(code);

  if (isLoading || (loading && !game)) {
    return (
      <Center>
        <p className="eyebrow fade-in text-center">Setting the table…</p>
      </Center>
    );
  }

  if (!isAuthenticated || !userId) return <SignInGate code={code} />;

  if (error || !game) {
    return (
      <Center>
        <h1 className="display text-4xl">No game here</h1>
        <p className="mt-3 text-base text-ink-soft">{error || 'This room does not exist.'}</p>
        <Link href="/" className="mt-6">
          <Button variant="ghost">Back to start</Button>
        </Link>
      </Center>
    );
  }

  const isParticipant = game.participants.some(p => p.id === userId);
  if (!isParticipant) {
    if (game.phase === 'complete') {
      return (
        <Center>
          <p className="eyebrow">Room {game.code}</p>
          <h1 className="display mt-3 text-4xl">This game has ended</h1>
          <Link href="/" className="mt-6">
            <Button variant="ghost">Start your own</Button>
          </Link>
        </Center>
      );
    }
    return <JoinGate game={game} userId={userId} onJoined={refresh} />;
  }

  switch (game.phase) {
    case 'lobby':
      return <Lobby game={game} userId={userId} balance={balance} />;
    case 'round1':
    case 'round2':
    case 'round3':
    case 'round4':
      return (
        <RoundStage
          game={game}
          nominations={nominations}
          userId={userId}
          balance={balance}
        />
      );
    case 'revise':
      return (
        <main className="min-h-dvh w-full">
          <div className="mx-auto w-full max-w-md px-5">
            <GameHeader game={game} balance={balance} />
          </div>
          <ReviseFlow game={game} userId={userId} />
        </main>
      );
    case 'complete':
      return (
        <main className="min-h-dvh w-full">
          <div className="mx-auto w-full max-w-md px-5">
            <GameHeader game={game} balance={balance} />
          </div>
          <ProposalsScreen game={game} userId={userId} />
        </main>
      );
    default:
      return null;
  }
}
