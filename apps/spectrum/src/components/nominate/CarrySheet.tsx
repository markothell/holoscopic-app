'use client';

import { useEffect, useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { THEME_ACCENT } from '@/components/graph/nodes';
import { FrameLine, FramePreview, framesInPlay } from '@/components/frames/FrameGlyph';
import FrameComposer from '@/components/frames/FrameComposer';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { FrameSpec, Game, MapItem, Nomination } from '@/lib/types';

// Rounds 3–4: carry a previous-round item forward into a map through this
// round's theme. The subject is fixed (the carried comment); the lens comes
// pre-filled with the spectrum that item was already mapped on — one tap to
// keep it, or swap for a different one. Staking 1 token is the carry-vote; at
// quorum the map goes live.

interface ChosenFrame {
  frameId?: string;
  poleA: string;
  poleB: string;
}

export default function CarrySheet({
  game,
  nominations,
  userId,
  source,
  onClose,
  onCarried,
}: {
  game: Game;
  nominations: Nomination[];
  userId: string;
  // The prior-round map + the item being carried; null closes the sheet.
  source: { mapNom: Nomination; item: MapItem } | null;
  onClose: () => void;
  onCarried?: () => void;
}) {
  const [chosen, setChosen] = useState<ChosenFrame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = Number((/^round([2-4])$/.exec(game.phase) || [])[1] || 0);
  const themeIndex = round - 2;
  const theme = game.themes[themeIndex] ?? '';
  const accent = THEME_ACCENT[themeIndex] ?? 'var(--ink)';

  // Pre-fill the lens from the map this item came from, borrowed by frameId so
  // the two rounds stay comparable. Editable from there.
  useEffect(() => {
    if (!source) return;
    const seed = (source.mapNom.mapState?.winningAxes ?? []).map(a => ({
      frameId: a.frameId, poleA: a.poleA, poleB: a.poleB,
    }));
    setChosen(seed);
    setError(null);
  }, [source]);

  const shelf = framesInPlay(nominations);
  // Frames already carrying THIS item this round are off the table — bring a
  // different lens (a confirmed carry only claims its locked axes).
  const unavailable = new Set<string>();
  if (source) {
    for (const n of nominations) {
      if (n.kind !== 'map' || n.round !== round || n.status === 'expired') continue;
      if (n.sourceEntryId !== source.item.entryId) continue;
      const claimed = n.status === 'confirmed' && n.mapState
        ? n.mapState.winningAxes
        : n.frameSlate ?? [];
      for (const f of claimed) unavailable.add(f.frameId);
    }
  }
  for (const c of chosen) if (c.frameId) unavailable.add(c.frameId);

  async function submit() {
    if (!source) return;
    if (chosen.length < 1) { setError('Give the map a spectrum first'); return; }
    setBusy(true);
    setError(null);
    try {
      const frames: FrameSpec[] = chosen.map(c =>
        c.frameId ? { frameId: c.frameId } : { poleA: c.poleA, poleB: c.poleB });
      await OasService.nominateMap(game.code, { sourceEntryId: source.item.entryId }, frames, userId);
      onCarried?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Out of tokens — finish a map or wait for returns.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not carry this forward');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={!!source} onClose={onClose}>
      <p className="eyebrow" style={{ color: accent }}>Round {round} · {theme} · costs 1 token</p>
      <h2 className="display mt-1 text-3xl">Carry it forward</h2>

      {source && (
        <div className="mt-4 rounded-xl border border-line-strong bg-paper-raised px-3 py-2.5">
          <p className="eyebrow !text-ink-faint">{game.themes[source.mapNom.themeIndex ?? 0]} · carried from</p>
          <p className="mt-0.5 text-base">{source.item.label}</p>
          {source.item.comment && (
            <p className="mt-1 text-sm text-ink-soft">{source.item.comment}</p>
          )}
        </div>
      )}

      <p className="mt-4 text-sm text-ink-soft">
        Map it through <span className="text-ink">{theme}</span>. {game.config.quorum} tokens
        make it live; your spectrum can be challenged until it locks.
      </p>

      <p className="eyebrow mb-2 mt-5">
        The spectrum{chosen.length === 2 ? 's' : ''} — 1 makes a line, 2 make a 2×2
      </p>

      {chosen.length > 0 && (
        <>
          <FramePreview
            axes={chosen.map(c => ({ frameId: c.frameId ?? '', poleA: c.poleA, poleB: c.poleB }))}
            accent={accent}
            compact
          />
          <ul className="mt-2 space-y-1.5">
            {chosen.map((c, i) => (
              <li
                key={`${c.frameId ?? c.poleA}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3 py-2"
              >
                <span className="eyebrow shrink-0" style={{ color: accent }}>
                  {chosen.length === 2 ? (i === 0 ? '→' : '↑') : '→'}
                </span>
                <FrameLine poleA={c.poleA} poleB={c.poleB} accent={accent} className="min-w-0 flex-1" />
                <button
                  onClick={() => setChosen(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${c.poleB} — ${c.poleA}`}
                  className="shrink-0 text-sm text-ink-faint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {chosen.length < 2 && (
        <div className={chosen.length > 0 ? 'mt-3' : ''}>
          <FrameComposer
            accent={accent}
            shelf={shelf}
            disabledFrameIds={unavailable}
            busy={busy}
            onPick={pick => setChosen(prev => (prev.length >= 2 ? prev : [...prev, pick]))}
          />
        </div>
      )}

      <Button
        className="mt-6"
        onClick={submit}
        disabled={busy || chosen.length < 1}
      >
        {busy ? 'Carrying…' : 'Carry · ● 1'}
      </Button>
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
