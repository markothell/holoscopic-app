'use client';

import type { ResolveAxis, ResolvePosition } from '@/lib/resolveLogic';
import { getQuadrantFromPosition } from '@/lib/resolveLogic';
import AxisFrame from './AxisFrame';

// The Unison-native resolve surface: the {x,y}∈[0,1] model and pole-A
// orientation come from @hs/activities as pure logic (lib/resolveLogic.ts);
// this component owns the presentation, keeping the dot-layout read Mark
// likes from the original ResolveGrid — dots gravitating into each quadrant,
// filling toward the inner corner — restyled to Unison's four named accents
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
  3: 'var(--synthesis)',
  4: 'var(--live)',
};

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

  // 1 axis → a ranked line: dots placed continuously along x∈[0,1].
  if (!y) {
    return (
      <div className={`rounded-2xl border border-line bg-dusk-raised px-4 ${compact ? 'py-3' : 'py-5'}`}>
        <div className="flex items-center gap-3">
          <span className={`${labelCls} max-w-[30%] truncate !text-mist-soft`}>{x.poleB}</span>
          <div className="relative h-8 min-w-8 flex-1">
            <span className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'var(--line-strong)' }} />
            {points.map(p => (
              <span
                key={p.key}
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${p.position.x * 100}%`,
                  background: 'var(--own)',
                  boxShadow: p.highlight ? '0 0 0 2px var(--dusk-raised), 0 0 0 3.5px var(--own)' : undefined,
                }}
              />
            ))}
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
