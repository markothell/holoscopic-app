'use client';

import { useState } from 'react';
import type { SynFrame } from '@/lib/types';
import { TextField } from '@/components/ui/TextField';

// A thought owns 1–2 axes (spectrums) — this picks from the community's
// existing frame vocabulary or coins a new pole pair. Selection order
// matters: the first pick is x, the second is y (FrameGlyph's convention).
export default function AxisPicker({
  frames,
  selected,
  onChange,
  onCoin,
}: {
  frames: SynFrame[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onCoin: (poleA: string, poleB: string) => void;
}) {
  const [coining, setCoining] = useState(false);
  const [poleB, setPoleB] = useState('');
  const [poleA, setPoleA] = useState('');

  function toggle(id: string) {
    if (selected.includes(id)) { onChange(selected.filter(s => s !== id)); return; }
    if (selected.length >= 2) return;
    onChange([...selected, id]);
  }

  return (
    <div>
      <p className="eyebrow mb-2">Spectrums (1–2)</p>
      <div className="flex flex-wrap gap-2">
        {frames.map(f => {
          const isOn = selected.includes(f.id);
          const idx = selected.indexOf(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              className="rounded-full border px-3 py-2 text-xs transition-colors"
              style={{
                borderColor: isOn ? 'var(--own)' : 'var(--line-strong)',
                background: isOn ? 'var(--own-soft)' : 'transparent',
                color: isOn ? 'var(--own)' : 'var(--mist-soft)',
              }}
            >
              {f.poleB} — {f.poleA} {isOn && <span className="eyebrow">{idx === 0 ? '· x' : '· y'}</span>}
            </button>
          );
        })}
        {!coining && selected.length < 2 && (
          <button type="button" onClick={() => setCoining(true)} className="rounded-full border border-dashed border-line-strong px-3 py-2 text-xs text-mist-faint">
            + Coin a spectrum
          </button>
        )}
      </div>
      {coining && (
        <div className="mt-3 flex items-center gap-2">
          <TextField value={poleB} onChange={e => setPoleB(e.target.value)} placeholder="left pole" className="!py-2.5 !text-sm" />
          <span className="text-mist-faint">—</span>
          <TextField value={poleA} onChange={e => setPoleA(e.target.value)} placeholder="most (right pole)" className="!py-2.5 !text-sm" />
          <button
            type="button"
            className="eyebrow shrink-0 rounded-full px-3 py-2.5"
            style={{ background: 'var(--own)', color: 'var(--dusk-deep)' }}
            onClick={() => {
              if (!poleA.trim() || !poleB.trim()) return;
              onCoin(poleA.trim(), poleB.trim());
              setPoleA(''); setPoleB(''); setCoining(false);
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
