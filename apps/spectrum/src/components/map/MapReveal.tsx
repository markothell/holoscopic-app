'use client';

import { useState } from 'react';
import type { MapResultDot, WinningAxis } from '@/lib/types';

// The aggregate view of a finished map: every item at its mean position.
// 1D — a spectrum of rounded bars (x = mean rank, height = group
// disagreement), echoing the game-card art; 2D — the quadrant grid. "Most"
// = poleA, plotting right (x) and top (y) — the same orientation as the
// frame glyph and the empty-frame preview this map grew from.

// 1D bar-chart geometry (SVG viewBox units).
const VB = { w: 320, h: 132, pad: 24, base: 112 };
const BAR_W = 22;
// Min height = bar width, so a consensus item reads as a clean circle on the
// axis rather than a squished pill; disagreement grows it upward.
const BAR_MIN_H = BAR_W;
const BAR_MAX_H = VB.base - 14;
// Scores live in [0,1]; the largest possible std dev (a 0/1 split) is 0.5,
// so heights stay comparable across maps.
const MAX_SPREAD = 0.5;

interface PlacedBar { dot: MapResultDot; cx: number; h: number; }

// Position each item at its mean, then nudge overlapping bars apart so a
// cluster (or the all-tied default) doesn't collapse into a single bar. The
// plot range is inset by half a bar so extreme items sit fully on the axis.
function layoutBars(results: MapResultDot[]): PlacedBar[] {
  const left = VB.pad + BAR_W / 2;
  const right = VB.w - VB.pad - BAR_W / 2;
  const usable = right - left;
  const bars: PlacedBar[] = results.map(dot => ({
    dot,
    cx: left + dot.x * usable,
    h: BAR_MIN_H + Math.min(1, dot.spread / MAX_SPREAD) * (BAR_MAX_H - BAR_MIN_H),
  })).sort((a, b) => a.cx - b.cx);

  const minGap = BAR_W + 6;
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].cx - bars[i - 1].cx < minGap) bars[i].cx = bars[i - 1].cx + minGap;
  }
  // If pushing right ran past the edge, slide the row back, then keep the
  // leftmost on-axis (a very dense row just packs from the left).
  if (bars.length) {
    const overflow = bars[bars.length - 1].cx - right;
    if (overflow > 0) for (const b of bars) b.cx -= overflow;
    const underflow = left - bars[0].cx;
    if (underflow > 0) for (const b of bars) b.cx += underflow;
  }
  return bars;
}

function spreadWord(spread: number): string {
  const norm = spread / MAX_SPREAD;
  if (norm < 0.12) return 'near-consensus';
  if (norm < 0.35) return 'some spread';
  return 'wide disagreement';
}

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
  const x = winningAxes[0] ?? null;
  const y = winningAxes[1] ?? null;

  if (dimensions === 1) {
    // Each item is a bar: x = the group's mean ranking, height = how much
    // the group disagreed (std dev). Consensus reads flat; a contested item
    // rises. Bars nudge apart horizontally so clustered items stay legible.
    const bars = layoutBars(results);
    const active = bars.find(b => b.dot.entryId === activeId) ?? null;
    // Sorted list under the strip doubles as the legend (most → least).
    const sorted = [...results].sort((a, b) => b.x - a.x);
    return (
      <div>
        <p className="eyebrow text-center" style={{ color: accent }}>
          {x?.poleB} — {x?.poleA}
        </p>

        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="mt-5 w-full" role="img" aria-label={`${x?.poleB} to ${x?.poleA} spectrum`}>
          <line x1={VB.pad} y1={VB.base} x2={VB.w - VB.pad} y2={VB.base} stroke="var(--line-strong)" strokeWidth={1} />
          {bars.map((b, i) => {
            const on = activeId === b.dot.entryId;
            const norm = Math.min(1, b.dot.spread / MAX_SPREAD);
            return (
              <g
                key={b.dot.entryId}
                className="dot-in cursor-pointer"
                style={{ animationDelay: `${i * 0.07}s` }}
                onClick={() => setActiveId(a => (a === b.dot.entryId ? null : b.dot.entryId))}
              >
                {/* full-height hit target */}
                <rect x={b.cx - BAR_W / 2 - 4} y={0} width={BAR_W + 8} height={VB.base} fill="transparent" />
                <rect
                  x={b.cx - BAR_W / 2}
                  y={VB.base - b.h}
                  width={BAR_W}
                  height={b.h}
                  rx={BAR_W / 2}
                  fill={accent}
                  opacity={on ? 1 : 0.28 + norm * 0.34}
                  stroke={on ? accent : 'none'}
                  strokeWidth={on ? 2 : 0}
                />
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex justify-between gap-4">
          <span className="eyebrow max-w-[45%] truncate !text-ink-faint">{x?.poleB}</span>
          <span className="eyebrow max-w-[45%] truncate" style={{ color: accent }}>{x?.poleA}</span>
        </div>

        <p className="mt-4 text-center text-sm text-ink-soft">
          {active
            ? <><span className="text-ink">{active.dot.label}</span>{' — '}{spreadWord(active.dot.spread)} ({active.dot.count} ranked)</>
            : 'Height shows how much the group disagreed. Tap a bar for its item.'}
        </p>

        <ol className="mt-6 space-y-1.5">
          {sorted.map((d, i) => {
            const on = activeId === d.entryId;
            return (
              <li key={d.entryId}>
                <button
                  onClick={() => setActiveId(a => (a === d.entryId ? null : d.entryId))}
                  className="flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                  style={{ background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--paper-raised)' }}
                >
                  <span className="eyebrow w-5 text-center" style={{ color: on || i === 0 ? accent : undefined }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-base">{d.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-sm rounded-2xl border border-line bg-paper-raised">
        {/* axes — same skeleton as the empty-frame preview, now inhabited */}
        <div className="absolute inset-y-3 left-1/2 w-px bg-line" />
        <div className="absolute inset-x-3 top-1/2 h-px bg-line" />
        <span className="eyebrow absolute right-2 top-1/2 max-w-[38%] -translate-y-1/2 truncate" style={{ color: accent }}>
          {x?.poleA}
        </span>
        <span className="eyebrow absolute left-2 top-1/2 max-w-[38%] -translate-y-1/2 truncate !text-ink-faint">
          {x?.poleB}
        </span>
        <span className="eyebrow absolute left-1/2 top-2 max-w-[80%] -translate-x-1/2 truncate" style={{ color: accent }}>
          {y?.poleA}
        </span>
        <span className="eyebrow absolute bottom-2 left-1/2 max-w-[80%] -translate-x-1/2 truncate !text-ink-faint">
          {y?.poleB}
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
      <p className="eyebrow mt-3 text-center">
        {x?.poleB} — {x?.poleA} → · {y?.poleB} — {y?.poleA} ↑
      </p>
      <p className="mt-2 text-center text-sm text-ink-soft">Tap a dot for its item.</p>
    </div>
  );
}
