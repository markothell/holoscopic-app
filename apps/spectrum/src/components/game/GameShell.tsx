'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Lobby from '@/components/game/Lobby';
import GameHeader from '@/components/game/GameHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useOasGame } from '@/hooks/useOasGame';
import { OasService } from '@/services/oasService';
import type { Game } from '@/lib/types';

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

// Placeholder stages — replaced as later phases land.
function RoundStage({ game, balance }: { game: Game; balance: number | null }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10">
      <GameHeader game={game} balance={balance} />
      <section className="mt-10 rounded-2xl border border-line bg-paper-raised p-5">
        <p className="eyebrow">Coming up</p>
        <p className="mt-2 text-base text-ink-soft">
          The topic web renders here — nominate, stake, and watch the graph grow.
        </p>
      </section>
    </main>
  );
}

export default function GameShell({ code }: { code: string }) {
  const { userId, isAuthenticated, isLoading } = useAuth();
  const { loading, error, game, balance, refresh } = useOasGame(code);

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
      return <RoundStage game={game} balance={balance} />;
    case 'revise':
    case 'complete':
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10">
          <GameHeader game={game} balance={balance} />
          <section className="mt-10 rounded-2xl border border-line bg-paper-raised p-5">
            <p className="eyebrow">{game.phase === 'revise' ? 'Revise' : 'Complete'}</p>
            <p className="mt-2 text-base text-ink-soft">
              {game.phase === 'revise'
                ? 'Reshape the game structure here — coming in a later phase.'
                : 'Suggested next games appear here — coming in a later phase.'}
            </p>
          </section>
        </main>
      );
    default:
      return null;
  }
}
