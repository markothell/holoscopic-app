'use client';

import type { ResolveAxis, ResolvePosition } from '@/lib/resolveLogic';
import { getQuadrantFromPosition, LINE_STOPS, binOf } from '@/lib/resolveLogic';
import AxisFrame from './AxisFrame';

// The Synthesis-native resolve surface: the {x,y}∈[0,1] model and pole-A
// orientation come from @hs/activities as pure logic (lib/resolveLogic.ts);
// this component owns the presentation, keeping the dot-layout read Mark
// likes from the original ResolveGrid — dots gravitating into each quadrant,
// filling toward the inner corner — restyled to Synthesis's four named accents
// instead of activity-agnostic colors, so a stance's color always traces
// back to something in the app's vocabulary. Reused as-is for the post-view
// reply map (D9) and the axis-picker preview.

export interface ResolvePoint {
  key: string;
  position: ResolvePosition;
  highlight?: boolean; // e.g. the viewer's own reply
}

// 1 = NE, 2 = NW, 3 = SW, 4 = SE — matches @hs/activities QUADRANT_POSITIONS.
const QUADRANT_COLOR: Record<number, string> = {
  1: 'var(--own)',
  2: 'var(--borrowed)',
  3: 'var(--join)',
  4: 'var(--live)',
};

// One-axis histogram: one column per stop on the shared scale, so a column
// is literally the stop the responder chose (LINE_STOPS in resolveLogic.ts).
const STACK_CAP = 6;   // taller stacks collapse into a +n above the column
const DOT_SIZE = 10;
const DOT_GAP = 3;

const FILL_DIR: Record<number, { fromRight: boolean; fromBottom: boolean }> = {
  1: { fromRight: false, fromBottom: true },
  2: { fromRight: true, fromBottom: true },
  3: { fromRight: true, fromBottom: false },
  4: { fromRight: false, fromBottom: false },
};

function QuadrantCell({
  quadrant, points, isActive, onClick,
}: {
  quadrant: number; points: ResolvePoint[]; isActive: boolean; onClick?: () => void;
}) {
  const color = QUADRANT_COLOR[quadrant];
  const count = points.length;
  const { fromRight, fromBottom } = FILL_DIR[quadrant];
  const n = Math.max(4, Math.ceil(Math.sqrt(count)));

  return (
    <div
      onClick={onClick}
      className="flex flex-1 rounded-xl transition-colors duration-150"
      style={{
        border: isActive ? `1.5px solid ${color}` : '1.5px solid var(--line)',
        background: isActive ? `color-mix(in srgb, ${color} 14%, transparent)` : 'var(--dusk)',
        cursor: onClick ? 'pointer' : 'default',
        padding: 6,
        minHeight: 76,
      }}
    >
      <div
        className="flex-1 grid"
        style={{
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gridTemplateRows: `repeat(${n}, 1fr)`,
          gap: 3,
          direction: fromRight ? 'rtl' : 'ltr',
        }}
      >
        {Array.from({ length: n }).map((_, rowIdx) => {
          const actualRow = fromBottom ? n - 1 - rowIdx : rowIdx;
          return Array.from({ length: n }).map((_, colIdx) => {
            const slotIdx = actualRow * n + colIdx;
            const p = points[slotIdx];
            const filled = slotIdx < count;
            return (
              <div key={`${actualRow}-${colIdx}`} className="flex items-center justify-center">
                <div
                  className="rounded-full"
                  style={{
                    width: '68%',
                    aspectRatio: '1',
                    background: filled ? color : 'var(--line)',
                    boxShadow: filled && p?.highlight ? `0 0 0 2px var(--dusk-raised), 0 0 0 3.5px ${color}` : undefined,
                  }}
                />
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

export default function ResolveGrid({
  axes,
  points,
  activeQuadrant,
  onQuadrantClick,
  compact = false,
}: {
  axes: ResolveAxis[];
  points: ResolvePoint[];
  activeQuadrant?: number | null;
  onQuadrantClick?: (q: number) => void;
  compact?: boolean;
}) {
  const x = axes[0];
  const y = axes[1] ?? null;
  if (!x) return null;

  const labelCls = 'eyebrow whitespace-nowrap';

  // 1 axis → a ranked line, drawn as a stack of dots per bin.
  //
  // Stacking is the whole point. Placing every reply at the line's vertical
  // centre meant agreeing replies drew on top of each other, so the one place
  // a distribution is most interesting — where people converge — was the one
  // place it went invisible, and a unanimous spectrum looked identical to a
  // single reply. Binning x and stacking each bin upward keeps the same
  // physics as the 2-axis quadrants (countable dots accumulating into mass),
  // in one dimension: a peak, a bimodal split, or a flat spread all read at a
  // glance, and one reply is still one dot.
  //
  // Colour stays single here on purpose. The quadrant palette codes *which
  // quadrant*; on a line there are no quadrants, and reaching for --borrowed
  // or --join would collide with what those colours mean on the map.
  // Position and height carry the information instead.
  if (!y) {
    const bins: ResolvePoint[][] = Array.from({ length: LINE_STOPS }, () => []);
    for (const p of points) bins[binOf(p.position.x)].push(p);
    const tallest = Math.max(0, ...bins.map(b => b.length));
    const rows = Math.min(STACK_CAP, Math.max(1, tallest));
    const stackH = rows * DOT_SIZE + (rows - 1) * DOT_GAP;

    return (
      <div className={`rounded-2xl border border-line bg-dusk-raised px-4 ${compact ? 'py-3' : 'py-5'}`}>
        <div className="flex items-end gap-3">
          <span className={`${labelCls} max-w-[30%] truncate !text-mist-soft`}>{x.poleB}</span>
          <div className="min-w-8 flex-1">
            <div className="flex items-end" style={{ height: stackH + 12 }}>
              {bins.map((bin, i) => {
                const shown = bin.slice(0, STACK_CAP);
                const hidden = bin.length - shown.length;
                return (
                  <div
                    key={i}
                    className="flex flex-1 flex-col items-center justify-end"
                    style={{ gap: DOT_GAP }}
                  >
                    {hidden > 0 && (
                      <span className="eyebrow !text-[0.55rem] leading-none" style={{ color: 'var(--mist-faint)' }}>
                        +{hidden}
                      </span>
                    )}
                    {shown.map(p => (
                      <span
                        key={p.key}
                        className="rounded-full"
                        style={{
                          width: DOT_SIZE, height: DOT_SIZE, background: 'var(--own)',
                          boxShadow: p.highlight
                            ? '0 0 0 2px var(--dusk-raised), 0 0 0 3.5px var(--own)'
                            : undefined,
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="h-px" style={{ background: 'var(--line-strong)' }} />
            {/* Ticks at the bin centres — the scale stays legible when the
                spectrum is still empty, and they show where dots will land. */}
            <div className="flex">
              {bins.map((_, i) => (
                <div key={i} className="flex flex-1 justify-center">
                  <span className="h-1 w-px" style={{ background: 'var(--line)' }} />
                </div>
              ))}
            </div>
          </div>
          <span className={`${labelCls} max-w-[30%] truncate`} style={{ color: 'var(--own)' }}>{x.poleA}</span>
        </div>
      </div>
    );
  }

  const byQ: Record<number, ResolvePoint[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of points) byQ[getQuadrantFromPosition(p.position.x, p.position.y)].push(p);

  return (
    <div className={`rounded-2xl border border-line bg-dusk-raised px-4 ${compact ? 'py-3' : 'py-5'}`}>
      <div className="mx-auto w-full" style={{ maxWidth: 420 }}>
        <AxisFrame x={x} y={y}>
          <div className="relative grid grid-cols-2 grid-rows-2 gap-2" style={{ aspectRatio: '1' }}>
            <div className="pointer-events-none absolute inset-0 z-0">
              <div className="absolute left-0 right-0 top-1/2" style={{ borderTop: '1px dashed var(--line-strong)' }} />
              <div className="absolute bottom-0 top-0 left-1/2" style={{ borderLeft: '1px dashed var(--line-strong)' }} />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ borderColor: 'var(--line-strong)', background: 'var(--dusk)' }} />

            <div className="z-10" style={{ gridColumn: 1, gridRow: 1 }}>
              <QuadrantCell quadrant={2} points={byQ[2]} isActive={activeQuadrant === 2} onClick={onQuadrantClick ? () => onQuadrantClick(2) : undefined} />
            </div>
            <div className="z-10" style={{ gridColumn: 2, gridRow: 1 }}>
              <QuadrantCell quadrant={1} points={byQ[1]} isActive={activeQuadrant === 1} onClick={onQuadrantClick ? () => onQuadrantClick(1) : undefined} />
            </div>
            <div className="z-10" style={{ gridColumn: 1, gridRow: 2 }}>
              <QuadrantCell quadrant={3} points={byQ[3]} isActive={activeQuadrant === 3} onClick={onQuadrantClick ? () => onQuadrantClick(3) : undefined} />
            </div>
            <div className="z-10" style={{ gridColumn: 2, gridRow: 2 }}>
              <QuadrantCell quadrant={4} points={byQ[4]} isActive={activeQuadrant === 4} onClick={onQuadrantClick ? () => onQuadrantClick(4) : undefined} />
            </div>
          </div>
        </AxisFrame>
      </div>
    </div>
  );
}
