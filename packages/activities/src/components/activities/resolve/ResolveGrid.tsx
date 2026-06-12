'use client';

import { HoloscopicActivity, Rating } from '../../../types/Activity';

interface ResolveGridProps {
  activity: HoloscopicActivity;
  ratings: Rating[];
  onCellClick?: (quadrant: number) => void;
  activeCells?: Set<number>;
}

const QUADRANT_COLORS: Record<number, string> = {
  1: '#7dd3fc', // sky      — top-right
  2: '#2dd4bf', // teal     — top-left
  3: '#a78bfa', // lavender — bottom-left
  4: '#fbbf24', // amber    — bottom-right
};

function getQuadrant(x: number, y: number): number {
  if (x >= 0.5 && y >= 0.5) return 1;
  if (x < 0.5 && y >= 0.5) return 2;
  if (x < 0.5 && y < 0.5) return 3;
  return 4;
}

// Dots gravitate toward the inner corner (closest to the graph center)
const FILL_DIR: Record<number, { fromRight: boolean; fromBottom: boolean }> = {
  1: { fromRight: false, fromBottom: true  }, // inner = bottom-left of cell
  2: { fromRight: true,  fromBottom: true  }, // inner = bottom-right of cell
  3: { fromRight: true,  fromBottom: false }, // inner = top-right of cell
  4: { fromRight: false, fromBottom: false }, // inner = top-left of cell
};

function QuadrantCell({
  quadrant,
  ratings,
  isActive,
  onClick,
}: {
  quadrant: number;
  ratings: Rating[];
  isActive: boolean;
  onClick: () => void;
}) {
  const color = QUADRANT_COLORS[quadrant];
  const count = ratings.length;
  const { fromRight, fromBottom } = FILL_DIR[quadrant];

  // Minimum n=5 so the grid always fills the cell visually
  const n = Math.max(5, Math.ceil(Math.sqrt(count)));

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        borderRadius: 12,
        border: isActive ? `1.5px solid ${color}` : '1.5px solid var(--border-default)',
        background: isActive ? `${color}12` : 'var(--bg-primary)',
        cursor: 'pointer',
        padding: 8,
        minHeight: 80,
        display: 'flex',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* fr-based grid: columns/rows stretch to fill cell */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, 1fr)`,
          gridTemplateRows: `repeat(${n}, 1fr)`,
          gap: 4,
          direction: fromRight ? 'rtl' : 'ltr',
        }}
      >
        {Array.from({ length: n }).map((_, rowIdx) => {
          // Row reversal anchors filled dots to the bottom edge when fromBottom
          const actualRow = fromBottom ? n - 1 - rowIdx : rowIdx;
          return Array.from({ length: n }).map((_, colIdx) => {
            // Slot 0 is at (actualRow=0, colIdx=0); with RTL colIdx=0 is visual-right
            const slotIdx = actualRow * n + colIdx;
            const filled = slotIdx < count;
            return (
              <div
                key={`${actualRow}-${colIdx}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{
                  width: '72%',
                  aspectRatio: '1',
                  borderRadius: '50%',
                  background: filled ? color : 'var(--border-default)',
                }} />
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

export default function ResolveGrid({ activity, ratings, onCellClick, activeCells = new Set() }: ResolveGridProps) {
  const xLabels = activity.xAxisLabels || [];
  const yLabels = activity.yAxisLabels || [];

  const xLeftLabel   = xLabels[0]                ?? activity.xAxis?.min ?? '';
  const xRightLabel  = xLabels[xLabels.length - 1] ?? activity.xAxis?.max ?? '';
  const yBottomLabel = yLabels[0]                ?? activity.yAxis?.min ?? '';
  const yTopLabel    = yLabels[yLabels.length - 1] ?? activity.yAxis?.max ?? '';

  const AXIS_STRIP = 36;
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.65rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'rgba(15,13,11,0.5)',
    whiteSpace: 'nowrap',
  };

  const ratingsByQ: Record<number, Rating[]> = { 1: [], 2: [], 3: [], 4: [] };
  ratings.forEach(r => {
    const q = getQuadrant(r.position.x, r.position.y);
    ratingsByQ[q].push(r);
  });

  return (
    <div style={{
      position: 'relative',
      aspectRatio: '1',
      display: 'grid',
      gridTemplateColumns: `1fr ${AXIS_STRIP}px 1fr`,
      gridTemplateRows: `1fr ${AXIS_STRIP}px 1fr`,
      width: '100%',
      maxWidth: 520,
      margin: '0 auto',
    }}>
      {/* Dashed axis lines */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed var(--border-default)' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px dashed var(--border-default)' }} />
      </div>

      {/* Q2 — top-left */}
      <div style={{ gridColumn: 1, gridRow: 1, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <QuadrantCell quadrant={2} ratings={ratingsByQ[2]} isActive={activeCells.has(2)} onClick={() => onCellClick?.(2)} />
      </div>
      <div style={{ gridColumn: 2, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {yTopLabel && <span style={{ ...labelStyle, writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>{yTopLabel}</span>}
      </div>
      {/* Q1 — top-right */}
      <div style={{ gridColumn: 3, gridRow: 1, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <QuadrantCell quadrant={1} ratings={ratingsByQ[1]} isActive={activeCells.has(1)} onClick={() => onCellClick?.(1)} />
      </div>

      <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {xLeftLabel && <span style={labelStyle}>{xLeftLabel}</span>}
      </div>
      {/* Center circle */}
      <div style={{ gridColumn: 2, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(15,13,11,0.3)', background: 'var(--bg-primary)' }} />
      </div>
      <div style={{ gridColumn: 3, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {xRightLabel && <span style={labelStyle}>{xRightLabel}</span>}
      </div>

      {/* Q3 — bottom-left */}
      <div style={{ gridColumn: 1, gridRow: 3, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <QuadrantCell quadrant={3} ratings={ratingsByQ[3]} isActive={activeCells.has(3)} onClick={() => onCellClick?.(3)} />
      </div>
      <div style={{ gridColumn: 2, gridRow: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        {yBottomLabel && <span style={{ ...labelStyle, writingMode: 'vertical-lr' }}>{yBottomLabel}</span>}
      </div>
      {/* Q4 — bottom-right */}
      <div style={{ gridColumn: 3, gridRow: 3, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
        <QuadrantCell quadrant={4} ratings={ratingsByQ[4]} isActive={activeCells.has(4)} onClick={() => onCellClick?.(4)} />
      </div>
    </div>
  );
}
