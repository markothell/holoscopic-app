'use client';

import { useState } from 'react';
import TextField from '@/components/ui/TextField';
import { FrameLine, type FrameInPlay } from '@/components/frames/FrameGlyph';

// Build one frame: type a new pole pair, or borrow a lens already in play
// this game (the shelf gets richer every round, so proposing gets faster).
// Used by the map nomination sheet and the pre-quorum slate on NodeSheet.
//
// Field order matches the glyph: left field = poleB (open dot), right
// field = poleA (the "most" end — filled dot, right/top on the map).

export default function FrameComposer({
  accent,
  shelf,
  disabledFrameIds,
  onPick,
  busy = false,
}: {
  accent: string;
  shelf: FrameInPlay[];
  // Lenses unavailable here (already on this slate / this subtopic).
  disabledFrameIds: Set<string>;
  onPick: (pick: { frameId?: string; poleA: string; poleB: string }) => void;
  busy?: boolean;
}) {
  const [poleB, setPoleB] = useState('');
  const [poleA, setPoleA] = useState('');
  const ready = poleA.trim().length > 0 && poleB.trim().length > 0;
  const borrowable = shelf.filter(f => !disabledFrameIds.has(f.frameId));

  function add() {
    if (!ready) return;
    onPick({ poleA: poleA.trim().slice(0, 40), poleB: poleB.trim().slice(0, 40) });
    setPoleA('');
    setPoleB('');
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <TextField
          value={poleB}
          maxLength={40}
          placeholder="calm"
          aria-label="One end of the spectrum"
          onChange={e => setPoleB(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
        />
        <span className="flex w-8 shrink-0 items-center" aria-hidden>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full border" style={{ borderColor: accent }} />
          <span className="h-px flex-1" style={{ background: accent }} />
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
        </span>
        <TextField
          value={poleA}
          maxLength={40}
          placeholder="heated"
          aria-label="The other end — “most” of the spectrum"
          onChange={e => setPoleA(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) add(); }}
        />
        <button
          disabled={busy || !ready}
          onClick={add}
          className="display shrink-0 rounded-2xl border border-line-strong px-4 py-2.5 text-xl disabled:opacity-30"
        >
          Add
        </button>
      </div>

      {borrowable.length > 0 && (
        <>
          <p className="eyebrow mb-1.5 mt-3 !text-ink-faint">or borrow a spectrum from this game</p>
          <ul className="max-h-36 space-y-1.5 overflow-y-auto">
            {borrowable.map(f => (
              <li key={f.frameId}>
                <button
                  disabled={busy}
                  onClick={() => onPick({ frameId: f.frameId, poleA: f.poleA, poleB: f.poleB })}
                  className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2 text-left active:bg-paper-dim"
                >
                  <FrameLine poleA={f.poleA} poleB={f.poleB} accent="var(--ink-soft)" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
