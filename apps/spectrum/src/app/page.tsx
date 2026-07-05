'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import { GameService } from '@/services/gameService';
import { getStoredName, storeIdentity, storeName } from '@/hooks/useIdentity';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setName(getStoredName()); }, []);

  async function createGame() {
    const trimmed = name.trim();
    if (!trimmed) { setError('Tell us your name first'); return; }
    setBusy(true);
    setError(null);
    try {
      const { game, player, token } = await GameService.create(trimmed);
      storeName(trimmed);
      storeIdentity(game.code, { playerId: player.id, name: player.name, token: token ?? null });
      router.push(`/g/${game.code}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start a game');
      setBusy(false);
    }
  }

  function joinByCode() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { setError('That code looks too short'); return; }
    router.push(`/g/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow">A game for people who know each other</p>
        <h1 className="display mt-3 text-[4.2rem] leading-[0.88]">
          On<br />the<br />
          <span className="text-ax">Spec</span><span className="text-ay">trum</span>
        </h1>
        <p className="mt-4 max-w-[26ch] text-base text-ink-soft">
          Nominate what to measure. Rank each other. Meet on the map.
        </p>
      </header>

      <section className="rise-in mt-auto pt-12" style={{ animationDelay: '0.1s' }}>
        <label className="eyebrow mb-2 block">Your name</label>
        <TextField
          value={name}
          maxLength={20}
          onChange={e => setName(e.target.value)}
          placeholder="Maya"
          autoComplete="off"
        />
        <Button className="mt-3" onClick={createGame} disabled={busy}>
          {busy ? 'Setting up…' : 'Start a game'}
        </Button>

        <div className="mt-8 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="eyebrow">Have a code?</span>
          <div className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-3 flex gap-2">
          <TextField
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM"
            maxLength={5}
            autoComplete="off"
            autoCapitalize="characters"
            className="font-mono tracking-[0.3em] uppercase"
            onKeyDown={e => { if (e.key === 'Enter') joinByCode(); }}
          />
          <button
            onClick={joinByCode}
            className="display shrink-0 rounded-2xl border border-line-strong px-6 text-xl text-ink active:bg-paper-dim"
          >
            Join
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-ax">{error}</p>}
      </section>
    </main>
  );
}
