'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';
import DragList, { type DragItem } from '@/components/rank/DragList';
import MapReveal from '@/components/map/MapReveal';
import { THEME_ACCENT } from '@/components/graph/nodes';
import { useMapDetail } from '@/hooks/useMapDetail';
import { useCountdown } from '@/hooks/useCountdown';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Axis, Game, MapEntry } from '@/lib/types';

// One live map, full screen: gather (add items, suggest + vote the
// spectra) → rank (drag-order the items, axis by axis) → reveal (the
// aggregate map) with the token claim.

const MAX_ITEMS = 3;
const MAX_AXES = 2;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError && err.status === 402) return 'Out of tokens';
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function MapSheet({
  code,
  game,
  mapId,
  userId,
  onClose,
}: {
  code: string;
  game: Game;
  mapId: string;
  userId: string;
  onClose: () => void;
}) {
  const { loading, error, detail, refresh } = useMapDetail(code, mapId);
  const [itemText, setItemText] = useState('');
  const [axisText, setAxisText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ranking state: current axis + my order per axis.
  const [rankAxis, setRankAxis] = useState<Axis>('x');
  const [orders, setOrders] = useState<Partial<Record<Axis, string[]>>>({});

  const nom = detail?.nomination ?? null;
  const ms = nom?.mapState ?? null;
  const accent = THEME_ACCENT[nom?.themeIndex ?? 0];
  const theme = game.themes[nom?.themeIndex ?? 0] ?? '';
  const secondsLeft = useCountdown(ms?.stageDeadline ?? null, detail?.serverNow ?? null);
  const isMember = !!nom?.stakes.some(s => s.userId === userId);
  const canForce = !!nom && (nom.nominatedBy === userId || game.hostId === userId);
  const axes: Axis[] = nom?.dimensions === 2 ? ['x', 'y'] : ['x'];

  // Seed drag orders when ranking opens: resume my saved order or shuffle.
  useEffect(() => {
    if (!ms || ms.stage !== 'rank' || !detail) return;
    setOrders(prev => {
      const next = { ...prev };
      for (const axis of axes) {
        if (!next[axis]) {
          next[axis] = detail.myRankings?.[axis]
            ?? shuffle(ms.items.map(i => i.entryId));
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms?.stage, detail?.myRankings, mapId]);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      after?.();
    } catch (err) {
      setActionError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!detail && loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper">
        <p className="eyebrow fade-in">Opening map…</p>
      </div>
    );
  }
  if (!nom || !ms) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper px-6">
        <p className="text-base text-ink-soft">{error || 'Map not found'}</p>
        <button onClick={onClose} className="mt-4 text-sm underline">Close</button>
      </div>
    );
  }

  const myStake = nom.stakes.find(s => s.userId === userId);
  const myItems = detail!.items.filter(e => e.userId === userId);
  const myAxes = detail!.axisIdeas.filter(e => e.userId === userId);
  const doneSet = new Set(ms.rankingDone.map(d => `${d.userId}:${d.axis}`));
  const myDoneAxes = axes.filter(a => doneSet.has(`${userId}:${a}`));
  const complete = myItems.length > 0 && myDoneAxes.length === axes.length;

  const header = (
    <header className="sticky top-0 z-10 bg-paper/95 px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow" style={{ color: accent }}>
            {theme} · {nom.dimensions === 1 ? '1 spectrum' : '2 spectrums'} ·{' '}
            {ms.stage === 'gather' ? 'gathering' : ms.stage === 'rank' ? 'ranking' : 'revealed'}
          </p>
          <h2 className="display mt-1 truncate text-3xl">{nom.title}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close map"
          className="display shrink-0 rounded-full border border-line-strong px-4 py-1.5 text-lg"
        >
          ✕
        </button>
      </div>
      {ms.stage === 'gather' && secondsLeft !== null && (
        <p className="eyebrow mt-1" style={{ color: secondsLeft <= 15 ? 'var(--x-accent)' : undefined }}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} to gather
        </p>
      )}
    </header>
  );

  // ── Gather ────────────────────────────────────────────────────────────
  if (ms.stage === 'gather') {
    const sortedAxes = [...detail!.axisIdeas].sort((a, b) =>
      b.voteCount - a.voteCount || a.createdAt.localeCompare(b.createdAt));
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-paper pb-24">
        {header}
        <div className="mx-auto w-full max-w-md px-5">
          {!isMember && (
            <Button
              className="mt-4"
              disabled={busy}
              onClick={() => act(() => OasService.joinMap(code, mapId, userId), refresh)}
            >
              Join this map · ● 1
            </Button>
          )}

          <section className="mt-6">
            <p className="eyebrow">{theme} of {nom.title} — the things to map</p>
            <ul className="mt-2 space-y-1.5">
              {detail!.items.map((e: MapEntry) => (
                <li key={e.id} className="rise-in rounded-xl bg-paper-raised px-3 py-2">
                  <span className="text-base">{e.text}</span>
                  <span className="eyebrow ml-2 !text-ink-faint">{e.username}</span>
                </li>
              ))}
              {detail!.items.length === 0 && (
                <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
                  Nothing yet — add the first one.
                </li>
              )}
            </ul>
            {isMember && myItems.length < MAX_ITEMS && (
              <div className="mt-2 flex gap-2">
                <TextField
                  value={itemText}
                  maxLength={80}
                  placeholder={`An ${theme.toLowerCase().replace(/s$/, '')}…`}
                  onChange={e => setItemText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && itemText.trim()) {
                      act(() => OasService.submitMapItem(code, mapId, itemText.trim(), userId), () => setItemText(''));
                    }
                  }}
                />
                <button
                  disabled={busy || !itemText.trim()}
                  onClick={() => act(() => OasService.submitMapItem(code, mapId, itemText.trim(), userId), () => setItemText(''))}
                  className="display shrink-0 rounded-2xl border border-line-strong px-5 text-xl disabled:opacity-30"
                >
                  Add
                </button>
              </div>
            )}
          </section>

          <section className="mt-8">
            <p className="eyebrow">Spectra — vote for the lens{nom.dimensions === 2 ? 'es' : ''} ({game.config.votesPerUser} votes)</p>
            <ul className="mt-2 space-y-1.5">
              {sortedAxes.map((e, i) => {
                const mine = e.voterIds.includes(userId);
                const winning = i < (nom.dimensions ?? 2);
                return (
                  <li
                    key={e.id}
                    className="tally-row flex items-center gap-3 rounded-xl border bg-paper-raised px-3 py-2"
                    style={{ borderColor: winning && e.voteCount > 0 ? accent : 'var(--line)' }}
                  >
                    <span className="min-w-0 flex-1 truncate text-base">{e.text}</span>
                    <span className="eyebrow" style={{ color: e.voteCount > 0 ? accent : undefined }}>
                      {e.voteCount}
                    </span>
                    {isMember && e.userId !== userId && (
                      <button
                        disabled={busy}
                        onClick={() => act(() => OasService.voteMapAxis(code, mapId, e.id, userId))}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                          mine ? 'border-transparent text-white' : 'border-line-strong text-ink-soft'
                        }`}
                        style={mine ? { background: accent } : undefined}
                      >
                        {mine ? 'voted ✓' : 'vote'}
                      </button>
                    )}
                  </li>
                );
              })}
              {sortedAxes.length === 0 && (
                <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
                  Suggest a spectrum to rank along — “calm — heated”.
                </li>
              )}
            </ul>
            {isMember && myAxes.length < MAX_AXES && (
              <div className="mt-2 flex gap-2">
                <TextField
                  value={axisText}
                  maxLength={60}
                  placeholder="strict — lenient"
                  onChange={e => setAxisText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && axisText.trim()) {
                      act(() => OasService.nominateMapAxis(code, mapId, axisText.trim(), userId), () => setAxisText(''));
                    }
                  }}
                />
                <button
                  disabled={busy || !axisText.trim()}
                  onClick={() => act(() => OasService.nominateMapAxis(code, mapId, axisText.trim(), userId), () => setAxisText(''))}
                  className="display shrink-0 rounded-2xl border border-line-strong px-5 text-xl disabled:opacity-30"
                >
                  Add
                </button>
              </div>
            )}
          </section>

          {canForce && (
            <Button
              variant="ghost"
              className="mt-8"
              disabled={busy || detail!.items.length < 2 || detail!.axisIdeas.length < (nom.dimensions ?? 2)}
              onClick={() => act(() => OasService.advanceMap(code, mapId, userId))}
            >
              Start ranking now
            </Button>
          )}
          {actionError && <p className="mt-3 text-sm text-ax">{actionError}</p>}
        </div>
      </div>
    );
  }

  // ── Rank ──────────────────────────────────────────────────────────────
  if (ms.stage === 'rank') {
    const nextAxis = axes.find(a => !myDoneAxes.includes(a));
    const items = new Map<string, DragItem>(ms.items.map(i => [i.entryId, { id: i.entryId, name: i.label }]));

    if (!isMember || !nextAxis) {
      const stakerIds = [...new Set(nom.stakes.map(s => s.userId))];
      const nameOf = new Map(game.participants.map(p => [p.id, p.name]));
      return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-paper pb-24">
          {header}
          <div className="mx-auto w-full max-w-md px-5">
            <p className="mt-6 text-base text-ink-soft">
              {isMember ? 'Ranked — waiting for the others.' : 'Ranking in progress.'}
            </p>
            <ul className="mt-4 space-y-1.5">
              {stakerIds.map(id => {
                const doneCount = axes.filter(a => doneSet.has(`${id}:${a}`)).length;
                return (
                  <li key={id} className="flex items-center justify-between rounded-xl bg-paper-raised px-3 py-2">
                    <span className="text-base">{nameOf.get(id) || 'someone'}</span>
                    <span className="eyebrow" style={{ color: doneCount === axes.length ? accent : undefined }}>
                      {doneCount}/{axes.length} ranked
                    </span>
                  </li>
                );
              })}
            </ul>
            {isMember && complete && !myStake?.returned && (
              <Button
                className="mt-8"
                disabled={busy}
                onClick={() => act(() => OasService.claimMapStake(code, mapId, userId))}
              >
                Collect your token · ● 1
              </Button>
            )}
            {myStake?.returned && (
              <p className="eyebrow mt-8 text-center" style={{ color: accent }}>token returned ✓</p>
            )}
            {actionError && <p className="mt-3 text-sm text-ax">{actionError}</p>}
          </div>
        </div>
      );
    }

    const axisLabel = ms.winningAxes[nextAxis === 'x' ? 0 : 1]?.label ?? '';
    const order = orders[nextAxis] ?? ms.items.map(i => i.entryId);
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-paper pb-28">
        {header}
        <div className="mx-auto w-full max-w-md px-5">
          <p className="eyebrow mt-4" style={{ color: accent }}>
            {axes.length > 1 ? `Spectrum ${nextAxis === 'x' ? 1 : 2} of ${axes.length} — ` : ''}
            most “{axisLabel}” at the top
          </p>
          <div className="mt-3">
            <DragList
              members={items}
              order={order}
              onReorder={next => setOrders(o => ({ ...o, [nextAxis]: next }))}
              accent={accent}
            />
          </div>
          {myItems.length === 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              You didn’t add an item during gathering — you can still rank, but the
              token comes back only to contributors.
            </p>
          )}
          <Button
            className="mt-6"
            disabled={busy}
            onClick={() => act(
              () => OasService.submitMapRanking(code, mapId, nextAxis, order, true, userId),
              refresh,
            )}
          >
            {busy ? 'Saving…' : `Lock in “${axisLabel}”`}
          </Button>
          {actionError && <p className="mt-3 text-sm text-ax">{actionError}</p>}
        </div>
      </div>
    );
  }

  // ── Done / closed — the reveal ────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper pb-24">
      {header}
      <div className="mx-auto w-full max-w-md px-5 pt-6">
        {detail!.results ? (
          <MapReveal
            results={detail!.results}
            winningAxes={ms.winningAxes}
            dimensions={(nom.dimensions ?? 2) as 1 | 2}
            accent={accent}
          />
        ) : (
          <p className="text-base text-ink-soft">This map closed before it could be ranked.</p>
        )}
        {isMember && complete && myStake && !myStake.returned && (
          <Button
            className="mt-8"
            disabled={busy}
            onClick={() => act(() => OasService.claimMapStake(code, mapId, userId), refresh)}
          >
            Collect your token · ● 1
          </Button>
        )}
        {myStake?.returned && (
          <p className="eyebrow mt-8 text-center" style={{ color: accent }}>token returned ✓</p>
        )}
        {actionError && <p className="mt-3 text-sm text-ax">{actionError}</p>}
      </div>
    </div>
  );
}
