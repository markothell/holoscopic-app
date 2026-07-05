'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { GameService } from '@/services/gameService';
import { getStoredName } from '@/hooks/useIdentity';
import type { Game, PlayerIdentity } from '@/lib/types';

// The invitee's first screen: one field, one tap, you're in.
export default function NameGate({
  code,
  game,
  onJoined,
}: {
  code: string;
  game: Game;
  onJoined: (identity: PlayerIdentity) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setName(getStoredName()); }, []);

  const host = game.participants.find(p => p.isHost);
  const count = game.participants.length;

  async function join() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Your friends need to know who you are'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await GameService.join(code, trimmed);
      if (res.spectator || !res.player) {
        setError('This round already started — you can watch the reveal.');
        setBusy(false);
        return;
      }
      onJoined({ playerId: res.player.id, name: res.player.name, token: res.token ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="rise-in">
        <p className="eyebrow">Room {code}</p>
        <h1 className="display mt-3 text-5xl leading-[0.9]">
          {host ? `${host.name} put you` : 'You’ve been put'}<br />
          on the <span className="text-ax">spec</span><span className="text-ay">trum</span>
        </h1>
        <p className="mt-4 text-ink-soft">
          {count === 1 ? '1 friend is inside.' : `${count} friends are inside.`}
        </p>
      </div>

      <div className="rise-in mt-auto pt-10" style={{ animationDelay: '0.08s' }}>
        <div className="mb-5 flex flex-wrap gap-2">
          {game.participants.map(p => (
            <span
              key={p.id}
              className="rounded-full border border-line-strong bg-paper-raised px-3 py-1 text-sm"
            >
              {p.name}
            </span>
          ))}
        </div>
        <label className="eyebrow mb-2 block">Your name</label>
        <TextField
          value={name}
          maxLength={20}
          onChange={e => setName(e.target.value)}
          placeholder="Maya"
          autoComplete="off"
          onKeyDown={e => { if (e.key === 'Enter') join(); }}
        />
        <Button className="mt-3" onClick={join} disabled={busy}>
          {busy ? 'Joining…' : 'Jump in'}
        </Button>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
      </div>
    </main>
  );
}
