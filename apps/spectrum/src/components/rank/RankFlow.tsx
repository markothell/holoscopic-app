'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import DragList from '@/components/rank/DragList';
import StorySheet from '@/components/rank/StorySheet';
import { GameService } from '@/services/gameService';
import type { Axis, Game, PlayerIdentity, RosterMember } from '@/lib/types';

const ACCENT: Record<Axis, string> = { x: 'var(--x-accent)', y: 'var(--y-accent)' };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stage 2 — rank everyone (yourself included) along each winning spectrum,
// one axis at a time. Initial order is shuffled per rater to avoid anchoring.
export default function RankFlow({
  code,
  game,
  identity,
  spectator,
  refresh,
}: {
  code: string;
  game: Game;
  identity: PlayerIdentity | null;
  spectator: boolean;
  refresh: () => Promise<void>;
}) {
  const myDone = useMemo(() => {
    const s = new Set<Axis>();
    if (identity) {
      for (const d of game.rankingDone) {
        if (d.playerId === identity.playerId) s.add(d.axis);
      }
    }
    return s;
  }, [game.rankingDone, identity]);

  const axis: Axis | null = !myDone.has('x') ? 'x' : !myDone.has('y') ? 'y' : null;

  if (spectator || !identity || axis === null) {
    return <WaitingRoom code={code} game={game} identity={identity} spectator={spectator} />;
  }
  return (
    <RankScreen
      key={axis}
      code={code}
      game={game}
      identity={identity}
      axis={axis}
      refresh={refresh}
    />
  );
}

function RankScreen({
  code,
  game,
  identity,
  axis,
  refresh,
}: {
  code: string;
  game: Game;
  identity: PlayerIdentity;
  axis: Axis;
  refresh: () => Promise<void>;
}) {
  const label = game.winningAxes[axis === 'x' ? 0 : 1]?.label ?? '';
  const accent = ACCENT[axis];
  const members = useMemo(
    () => new Map(game.roster.map(m => [m.id, m])),
    [game.roster],
  );
  const [order, setOrder] = useState<string[]>(() => shuffle(game.roster.map(m => m.id)));
  const [stories, setStories] = useState<Map<string, string>>(new Map());
  const [storySubject, setStorySubject] = useState<RosterMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function finishAxis() {
    setBusy(true);
    setNotice(null);
    try {
      await GameService.submitRanking(code, axis, order, true, identity);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not save your ranking');
      setBusy(false);
    }
  }

  async function saveStory(text: string) {
    if (!storySubject) return;
    await GameService.saveStory(code, axis, storySubject.subjectIndex, text, identity);
    setStories(prev => {
      const next = new Map(prev);
      if (text) next.set(storySubject.id, text);
      else next.delete(storySubject.id);
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="rise-in">
        <p className="eyebrow">
          Spectrum {axis === 'x' ? '1 of 2' : '2 of 2'} · drag to reorder
        </p>
        <h1 className="display mt-2 text-6xl" style={{ color: accent }}>{label}</h1>
      </header>

      <div className="mt-5 flex-1">
        <p className="eyebrow mb-2" style={{ color: accent }}>Most {label} ↑</p>
        <DragList
          members={members}
          order={order}
          onReorder={setOrder}
          accent={accent}
          storiesFor={new Set(stories.keys())}
          onStory={m => setStorySubject(m)}
        />
        <p className="eyebrow mt-2 text-right">↓ Least {label}</p>
      </div>

      <div className="sticky bottom-0 -mx-5 border-t border-line bg-paper px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <Button onClick={finishAxis} disabled={busy}>
          {busy ? 'Saving…' : axis === 'x' ? 'Done — next spectrum →' : 'Done — I’m ready'}
        </Button>
        {notice && <p className="mt-2 text-sm text-ax">{notice}</p>}
      </div>

      <StorySheet
        subject={storySubject}
        axisLabel={label}
        initialText={storySubject ? stories.get(storySubject.id) ?? '' : ''}
        onSave={saveStory}
        onClose={() => setStorySubject(null)}
      />
    </main>
  );
}

function WaitingRoom({
  code,
  game,
  identity,
  spectator,
}: {
  code: string;
  game: Game;
  identity: PlayerIdentity | null;
  spectator: boolean;
}) {
  const done = new Set(game.rankingDone.map(d => `${d.playerId}:${d.axis}`));
  const isHost = identity?.playerId === game.hostId;
  const [busy, setBusy] = useState(false);

  async function revealNow() {
    if (!identity) return;
    setBusy(true);
    try { await GameService.reveal(code, identity); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <p className="eyebrow rise-in">Room {code}</p>
      <h1 className="display rise-in mt-2 text-5xl">
        {spectator ? 'Round in progress' : 'Waiting for the others…'}
      </h1>
      <ul className="mt-8 space-y-3">
        {game.roster.map(m => (
          <li key={m.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper-raised px-4 py-3">
            <span className="display text-2xl">{m.name}</span>
            <span className="flex gap-2">
              {(['x', 'y'] as const).map(a => (
                <span
                  key={a}
                  className="eyebrow rounded-full border px-2.5 py-1"
                  style={done.has(`${m.id}:${a}`)
                    ? { borderColor: 'transparent', color: '#fff', background: ACCENT[a] }
                    : { borderColor: 'var(--line-strong)' }}
                >
                  {done.has(`${m.id}:${a}`) ? '✓' : '·'}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {isHost && (
        <div className="mt-auto pt-8">
          <Button variant="ghost" onClick={revealNow} disabled={busy}>
            Reveal now
          </Button>
          <p className="mt-2 text-center text-xs text-ink-soft">
            Reveals with whatever rankings are in.
          </p>
        </div>
      )}
    </main>
  );
}
