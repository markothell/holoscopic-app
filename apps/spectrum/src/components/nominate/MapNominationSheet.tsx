'use client';

import { useState } from 'react';
import BottomSheet from '@/components/ui/BottomSheet';
import Button from '@/components/ui/Button';
import { THEME_ACCENT } from '@/components/graph/nodes';
import { OasService } from '@/services/oasService';
import { ApiError } from '@/services/api';
import type { Game, Nomination } from '@/lib/types';

// Rounds 2–4: propose mapping a surviving subtopic through this round's
// theme. The nominator picks the format (one spectrum or two); the spectra
// themselves get nominated and voted inside the live map.
export default function MapNominationSheet({
  game,
  nominations,
  userId,
  open,
  preselectedSubtopicId,
  onClose,
}: {
  game: Game;
  nominations: Nomination[];
  userId: string;
  open: boolean;
  preselectedSubtopicId?: string | null;
  onClose: () => void;
}) {
  const [subtopicId, setSubtopicId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = Number((/^round([2-4])$/.exec(game.phase) || [])[1] || 0);
  const themeIndex = round - 2;
  const theme = game.themes[themeIndex] ?? '';
  const accent = THEME_ACCENT[themeIndex] ?? 'var(--ink)';

  const confirmedSubtopics = nominations.filter(
    n => n.kind === 'subtopic' && n.status === 'confirmed');
  // A subtopic already nominated or live this round can't be re-proposed.
  const takenThisRound = new Set(nominations
    .filter(n => n.kind === 'map' && n.round === round && n.status !== 'expired')
    .map(n => n.subtopicId));

  const effectiveSubtopicId = subtopicId ?? preselectedSubtopicId ?? null;

  async function submit() {
    if (!effectiveSubtopicId) { setError('Pick a subtopic first'); return; }
    setBusy(true);
    setError(null);
    try {
      await OasService.nominateMap(game.code, effectiveSubtopicId, dimensions, userId);
      setSubtopicId(null);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError('Out of tokens — finish a map or wait for returns.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not nominate');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow" style={{ color: accent }}>Round {round} · {theme} · costs 1 token</p>
      <h2 className="display mt-1 text-3xl">Propose a map</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {game.config.quorum} tokens make it live; the group then gathers items
        and votes the spectra.
      </p>

      <p className="eyebrow mb-2 mt-5">Subtopic</p>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
        {confirmedSubtopics.map(s => {
          const taken = takenThisRound.has(s.id);
          const selected = effectiveSubtopicId === s.id;
          return (
            <li key={s.id}>
              <button
                disabled={taken}
                onClick={() => setSubtopicId(s.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-base transition-colors ${
                  selected ? 'border-ink bg-ink text-paper'
                  : taken ? 'border-line text-ink-faint'
                  : 'border-line-strong bg-paper-raised active:bg-paper-dim'
                }`}
              >
                {s.title}
                {taken && <span className="eyebrow ml-2 !text-ink-faint">already this round</span>}
              </button>
            </li>
          );
        })}
        {confirmedSubtopics.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
            No subtopics survived round 1.
          </li>
        )}
      </ul>

      <p className="eyebrow mb-2 mt-5">Format</p>
      <div className="flex gap-2">
        {([1, 2] as const).map(d => (
          <button
            key={d}
            onClick={() => setDimensions(d)}
            className={`display flex-1 rounded-2xl border px-3 py-3 text-lg transition-colors ${
              dimensions === d ? 'border-ink bg-ink text-paper' : 'border-line-strong active:bg-paper-dim'
            }`}
          >
            {d === 1 ? '1 spectrum' : '2 spectrums'}
            <span className="eyebrow mt-0.5 block !text-inherit opacity-70">
              {d === 1 ? 'a ranked line' : 'a 2×2 map'}
            </span>
          </button>
        ))}
      </div>

      <Button className="mt-6" onClick={submit} disabled={busy || !effectiveSubtopicId}>
        {busy ? 'Proposing…' : 'Propose · ● 1'}
      </Button>
      {error && <p className="mt-3 text-sm text-ax">{error}</p>}
    </BottomSheet>
  );
}
