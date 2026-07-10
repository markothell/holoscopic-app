'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { OasService } from '@/services/oasService';
import type { Game } from '@/lib/types';

// The final screen is an invitation: every structure proposed during
// revise, each one a doorway into its own lobby. Joining lazily creates
// the child game (hosted by whoever proposed it) and walks you in.
export default function ProposalsScreen({
  game,
  userId,
}: {
  game: Game;
  userId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function join(proposalId: string) {
    setBusyId(proposalId);
    setError(null);
    try {
      const { code } = await OasService.joinProposal(game.code, proposalId, userId);
      router.push(`/g/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-16">
      <p className="eyebrow mt-8">Where next?</p>
      <p className="mt-2 text-base text-ink-soft">
        These are the games this group wants to play. Sign up and you&apos;re in
        its lobby — it starts when its host starts it.
      </p>

      {game.proposals.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">
          No structures were proposed this time.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {game.proposals.map((p, i) => (
            <li
              key={p.id}
              className="rise-in rounded-2xl border border-line bg-paper-raised p-4"
              style={{ animationDelay: `${Math.min(i * 0.06, 0.5)}s`, boxShadow: 'var(--shadow-card)' }}
            >
              <p className="eyebrow">
                proposed by {p.proposedBy === userId ? 'you' : p.proposedByName}
                {p.childGameId && <span className="ml-2 text-ax">· lobby open</span>}
              </p>
              <h3 className="display mt-1 text-3xl leading-[0.95]">{p.topic}</h3>
              <p className="display mt-1 text-lg text-ink-soft">
                {p.themes.map((t, j) => (
                  <span key={j}>
                    <span className={j === 0 ? 'text-ax' : j === 1 ? 'text-ay' : 'text-ink'}>{t}</span>
                    {j < p.themes.length - 1 && <span className="text-ink-faint"> // </span>}
                  </span>
                ))}
              </p>
              <Button
                className="mt-4"
                variant={p.childGameId ? 'primary' : 'ghost'}
                disabled={busyId !== null}
                onClick={() => join(p.id)}
              >
                {busyId === p.id ? 'Joining…' : p.childGameId ? 'Join the lobby' : 'Sign up to play'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}

      <button
        onClick={() => router.push('/')}
        className="mt-10 w-full py-2 text-center text-sm text-ink-soft underline"
      >
        Or start something new
      </button>
    </div>
  );
}
