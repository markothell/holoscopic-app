'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import GameHeader from '@/components/game/GameHeader';
import GameGraph from '@/components/graph/GameGraph';
import MapSheet from '@/components/map/MapSheet';
import MapReveal from '@/components/map/MapReveal';
import { THEME_ACCENT } from '@/components/graph/nodes';
import { useHistoryBackClose } from '@/hooks/useHistoryBackClose';
import { OasService } from '@/services/oasService';
import type { Game, MapDetail, Nomination } from '@/lib/types';

// The public reading room. A stranger with no account lands here and sees a
// finished game the way its players left it: the maps it revealed, the
// spectrums it coined, the web it grew.
//
// Three rules hold this surface apart from /g/<code>:
//   1. It reads the anonymous snapshot — no session, no socket, no balance.
//      GET /oas/games/<code> and its map details are open by design.
//   2. It refuses anything but `complete`. A game still being played belongs
//      to its room; only the finished record is public.
//   3. Nothing here writes. Every shared component is passed `readOnly`, and
//      the empty userId below is deliberate: no personalization, so the page
//      reads identically to everyone, signed in or not.

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      {children}
    </main>
  );
}

// The way back, on every terminal state: where the game runs, and the door in.
// `withSignIn={false}` where the surface already offers one (a running game
// sends you to its room), so the page never stacks two identical doors.
function WaysBack({ className = '', withSignIn = true }: { className?: string; withSignIn?: boolean }) {
  return (
    <footer className={`border-t border-line pt-5 ${className}`}>
      <p className="text-sm text-ink-soft">
        On a Spectrum runs at{' '}
        <Link href="/" className="text-ink underline">spectrum.holoscopic.io</Link>
        {' '}— start a topic, or join a room with a code.
      </p>
      {withSignIn && (
        <Link href="/login" className="mt-4 block">
          <Button>Sign in to play</Button>
        </Link>
      )}
      <p className="mt-4 text-xs text-ink-faint">
        A{' '}
        <a href="https://holoscopic.io" className="underline" target="_blank" rel="noopener noreferrer">
          Holoscopic
        </a>{' '}
        game
      </p>
    </footer>
  );
}

export default function PublicGame({ code }: { code: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [details, setDetails] = useState<Record<string, MapDetail>>({});
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [view, setView] = useState<'maps' | 'web'>('maps');
  const [openMapId, setOpenMapId] = useState<string | null>(null);

  useHistoryBackClose(!!openMapId, () => setOpenMapId(null));

  // Anonymous snapshot — one fetch, no socket. A finished game doesn't move.
  useEffect(() => {
    let cancelled = false;
    OasService.snapshot(code)
      .then(snapshot => {
        if (cancelled) return;
        setGame(snapshot.game);
        setNominations(snapshot.nominations);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load this game');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [code]);

  const complete = game?.phase === 'complete';

  // Every map that got as far as a reveal, in the order the game played them.
  const revealed = useMemo(() => {
    if (!complete) return [];
    return nominations
      .filter(n => n.kind === 'map' && n.status === 'confirmed'
        && (n.mapState?.stage === 'done' || n.mapState?.stage === 'closed'))
      .sort((a, b) => a.round - b.round || a.createdAt.localeCompare(b.createdAt));
  }, [complete, nominations]);

  const revealedKey = revealed.map(n => n.id).join(',');

  // Aggregates (`results`) live on the per-map read, so the reveals need one
  // fetch each — all anonymous, all in parallel.
  useEffect(() => {
    if (!revealedKey) { setDetailsLoaded(true); return; }
    let cancelled = false;
    Promise.all(revealedKey.split(',').map(async id => {
      try {
        return [id, await OasService.mapDetail(code, id)] as const;
      } catch {
        return [id, null] as const;
      }
    })).then(pairs => {
      if (cancelled) return;
      const next: Record<string, MapDetail> = {};
      for (const [id, detail] of pairs) if (detail) next[id] = detail;
      setDetails(next);
      setDetailsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [code, revealedKey]);

  if (loading) {
    return (
      <Center>
        <p className="eyebrow fade-in text-center">Opening the record…</p>
      </Center>
    );
  }

  if (error || !game) {
    return (
      <Center>
        <h1 className="display text-4xl">No game here</h1>
        <p className="mt-3 text-base text-ink-soft">{error || 'This game does not exist.'}</p>
        <WaysBack className="mt-8" />
      </Center>
    );
  }

  // A game still being played is the room's, not the public's. No topic, no
  // themes, no maps — just the fact that it is running.
  if (!complete) {
    return (
      <Center>
        <p className="eyebrow rise-in">Game {game.code}</p>
        <h1 className="display rise-in mt-3 text-5xl leading-[0.92]">
          Still<br />running
        </h1>
        <p className="rise-in mt-4 text-base text-ink-soft">
          This one is still being played. A game opens to read when it
          completes — until then it belongs to the room.
        </p>
        <div className="rise-in mt-8" style={{ animationDelay: '0.1s' }}>
          <Link href={`/g/${game.code}`}>
            <Button>Take a seat in this game</Button>
          </Link>
        </div>
        <WaysBack className="mt-10" withSignIn={false} />
      </Center>
    );
  }

  const tabs = (
    <div className="mt-3 flex gap-2">
      {([['maps', 'The maps'], ['web', 'The web']] as const).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setView(key)}
          className={`display flex-1 rounded-full border px-4 py-2 text-lg transition-colors ${
            view === key ? 'border-ink bg-ink text-paper' : 'border-line-strong text-ink active:bg-paper-dim'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <main className={view === 'web' ? 'flex h-dvh w-full flex-col' : 'min-h-dvh w-full'}>
      <div className="mx-auto w-full max-w-md px-5 pb-2">
        {/* No balance and no identity: the header renders its masthead, the
            round eyebrow ("Complete") and the spectrums shelf, nothing else. */}
        <GameHeader game={game} balance={null} nominations={nominations} />
        {tabs}
      </div>

      {view === 'web' ? (
        <div className="min-h-0 flex-1">
          <GameGraph
            game={game}
            nominations={nominations}
            userId=""
            balance={null}
            readOnly
            onOpenMap={setOpenMapId}
            onProposeMap={() => {}}
            onBranchSubtopic={() => {}}
          />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md px-5 pb-16">
          <p className="eyebrow mt-7">What the group revealed</p>
          <p className="mt-2 text-base text-ink-soft">
            {game.participants.length} player{game.participants.length === 1 ? '' : 's'} ·{' '}
            {revealed.length} map{revealed.length === 1 ? '' : 's'} · finished, and open to read.
            Tap an item for what was said about it.
          </p>

          {revealed.map((nom, i) => {
            const accent = THEME_ACCENT[nom.themeIndex ?? 0];
            const detail = details[nom.id];
            const axes = nom.mapState?.winningAxes ?? [];
            return (
              <section
                key={nom.id}
                className="rise-in mt-9 border-t border-line pt-5"
                style={{ animationDelay: `${Math.min(i * 0.06, 0.4)}s` }}
              >
                <p className="eyebrow" style={{ color: accent }}>
                  {game.themes[nom.themeIndex ?? 0] ?? ''} ·{' '}
                  {nom.dimensions === 1 ? '1 spectrum' : '2 spectrums'}
                </p>
                <h2 className="display mt-1 text-3xl leading-[0.95]">{nom.title}</h2>
                {nom.sourceEntryId && (nom.themeIndex ?? 0) > 0 && (
                  <p className="eyebrow mt-0.5 !text-ink-faint">
                    carried forward from {game.themes[(nom.themeIndex ?? 0) - 1]}
                  </p>
                )}
                <div className="mt-5">
                  {detail?.results && detail.results.length > 0 ? (
                    <MapReveal
                      results={detail.results}
                      winningAxes={axes}
                      dimensions={(nom.dimensions ?? 2) as 1 | 2}
                      accent={accent}
                    />
                  ) : detailsLoaded ? (
                    <p className="text-base text-ink-soft">
                      This map closed before it could be ranked.
                    </p>
                  ) : (
                    <p className="eyebrow fade-in !text-ink-faint">Drawing the map…</p>
                  )}
                </div>
              </section>
            );
          })}

          {revealed.length === 0 && (
            <p className="mt-8 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft">
              This game finished without revealing a map.
            </p>
          )}

          <WaysBack className="mt-12" />
        </div>
      )}

      {openMapId && (
        <MapSheet
          code={game.code}
          game={game}
          mapId={openMapId}
          userId=""
          readOnly
          onClose={() => window.history.back()}
        />
      )}
    </main>
  );
}
