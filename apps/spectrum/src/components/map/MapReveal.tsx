'use client';

import { useState } from 'react';
import type { MapResultDot, WinningAxis } from '@/lib/types';

// The aggregate view of a finished map: every item at its mean position.
// 1D — a horizontal spectrum strip; 2D — the quadrant grid. "Most" plots
// right (x) and top (y), the On-the-Spectrum convention.

function Dot({ dot, accent, active, onTap, style }: {
  dot: MapResultDot;
  accent: string;
  active: boolean;
  onTap: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      onClick={onTap}
      className="dot-in absolute -translate-x-1/2 -translate-y-1/2"
      style={style}
      aria-label={dot.label}
    >
      <span
        className="block h-4 w-4 rounded-full border-2 border-paper-raised"
        style={{ background: accent, boxShadow: active ? `0 0 0 4px color-mix(in srgb, ${accent} 25%, transparent)` : 'var(--shadow-card)' }}
      />
      {active && (
        <span className="absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-xs text-paper">
          {dot.label}
        </span>
      )}
    </button>
  );
}

export default function MapReveal({
  results,
  winningAxes,
  dimensions,
  accent,
}: {
  results: MapResultDot[];
  winningAxes: WinningAxis[];
  dimensions: 1 | 2;
  accent: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const xLabel = winningAxes[0]?.label ?? '';
  const yLabel = winningAxes[1]?.label ?? '';

  if (dimensions === 1) {
    // Sorted list under the strip doubles as the legend.
    const sorted = [...results].sort((a, b) => b.x - a.x);
    return (
      <div>
        <p className="eyebrow text-center" style={{ color: accent }}>{xLabel}</p>
        <div className="relative mt-6 h-10">
          <div className="absolute inset-x-2 top-1/2 h-px bg-line-strong" />
          <span className="eyebrow absolute left-0 top-full mt-1 !text-ink-faint">least</span>
          <span className="eyebrow absolute right-0 top-full mt-1 !text-ink-faint">most</span>
          {results.map((d, i) => (
            <Dot
              key={d.entryId}
              dot={d}
              accent={accent}
              active={activeId === d.entryId}
              onTap={() => setActiveId(a => (a === d.entryId ? null : d.entryId))}
              style={{ left: `${8 + d.x * 84}%`, top: '50%', animationDelay: `${i * 0.07}s` }}
            />
          ))}
        </div>
        <ol className="mt-10 space-y-1.5">
          {sorted.map((d, i) => (
            <li key={d.entryId} className="flex items-baseline gap-3 rounded-xl bg-paper-raised px-3 py-2">
              <span className="eyebrow w-5 text-center" style={{ color: i === 0 ? accent : undefined }}>{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-base">{d.label}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm rounded-2xl border border-line bg-paper-raised">
        {/* axes */}
        <div className="absolute inset-y-3 left-1/2 w-px bg-line" />
        <div className="absolute inset-x-3 top-1/2 h-px bg-line" />
        <span className="eyebrow absolute bottom-2 right-3 !text-ink-faint">most {xLabel}</span>
        <span className="eyebrow absolute bottom-2 left-3 !text-ink-faint">least</span>
        <span className="eyebrow absolute left-1/2 top-2 -translate-x-1/2" style={{ color: accent }}>
          most {yLabel}
        </span>
        {results.map((d, i) => (
          <Dot
            key={d.entryId}
            dot={d}
            accent={accent}
            active={activeId === d.entryId}
            onTap={() => setActiveId(a => (a === d.entryId ? null : d.entryId))}
            style={{
              left: `${6 + d.x * 88}%`,
              top: `${6 + (1 - d.y) * 88}%`,
              animationDelay: `${i * 0.07}s`,
            }}
          />
        ))}
      </div>
      <p className="eyebrow mt-3 text-center">{xLabel} → · {yLabel} ↑</p>
      <p className="mt-2 text-center text-sm text-ink-soft">Tap a dot for its item.</p>
    </div>
  );
}
