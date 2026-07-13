'use client';

import BottomSheet from '@/components/ui/BottomSheet';
import { FrameLine, framesInPlay } from '@/components/frames/FrameGlyph';
import { THEME_ACCENT } from '@/components/graph/nodes';
import type { Game, Nomination } from '@/lib/types';

// The shelf — every lens this game has coined, as one gallery. A frame's
// row shows where it's been pointed: the same spectrum on two subtopics is
// the game doing its job. Borrowing happens in the nomination sheet; this
// surface is for seeing the group's vocabulary grow.

export default function FramesSheet({
  game,
  nominations,
  open,
  onClose,
}: {
  game: Game;
  nominations: Nomination[];
  open: boolean;
  onClose: () => void;
}) {
  const frames = framesInPlay(nominations);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <p className="eyebrow">The lenses of this game</p>
      <h2 className="display mt-1 text-3xl">Spectrums</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Every spectrum proposed so far. Reuse one on a new map — same
        spectrum, different subtopic — and the maps become comparable.
      </p>

      <ul className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto">
        {frames.map(f => {
          // The frame's strongest showing colors its glyph: an axis on a
          // live/revealed map beats a pending or expired slate.
          const win = f.usedOn.find(u => u.winning && u.status === 'confirmed');
          const accent = win ? THEME_ACCENT[win.themeIndex ?? 0] : 'var(--ink-soft)';
          const everConfirmed = !!win;
          return (
            <li key={f.frameId} className="rounded-xl border border-line bg-paper-raised px-3 py-2.5">
              <FrameLine poleA={f.poleA} poleB={f.poleB} accent={accent} muted={!everConfirmed} />
              <p className="eyebrow mt-1.5 !text-ink-faint">
                {f.usedOn.map((u, i) => {
                  const theme = game.themes[u.themeIndex ?? 0] ?? '';
                  const state = u.status === 'expired' ? 'expired'
                    : u.status === 'nominated' ? 'contesting'
                    : u.winning ? 'mapping' : 'lost the vote';
                  return (
                    <span key={`${u.nominationId}-${i}`}>
                      {i > 0 && ' · '}
                      <span style={u.winning && u.status === 'confirmed'
                        ? { color: THEME_ACCENT[u.themeIndex ?? 0] } : undefined}>
                        {state} {u.title}
                      </span>
                      <span className="opacity-60"> ({theme})</span>
                    </span>
                  );
                })}
              </p>
            </li>
          );
        })}
        {frames.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong px-3 py-2 text-sm text-ink-soft">
            No spectrums yet — the first map proposal coins one.
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
