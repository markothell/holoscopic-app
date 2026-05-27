'use client';

import { HoloscopicActivity, Rating, SnapshotQuestion } from '@/models/Activity';

interface SnapshotDotGridProps {
  activity: HoloscopicActivity;
  ratings: Rating[];
  onCellClick?: (quadrant: number, subCell?: number) => void;
  activeCells?: Set<string>;
  visibleQuestions: Set<string>;
  onToggleQuestion: (id: string) => void;
}

// Quadrant number convention (matches existing QUADRANT_POSITIONS):
// 1 = top-right (+x, +y)   2 = top-left  (-x, +y)
// 4 = bottom-right (+x,-y) 3 = bottom-left(-x,-y)
function getQuadrant(x: number, y: number): number {
  if (x >= 0.5 && y >= 0.5) return 1;
  if (x < 0.5 && y >= 0.5) return 2;
  if (x < 0.5 && y < 0.5) return 3;
  return 4;
}

// For 4-point axes, get which sub-cell (0-3) within the quadrant
// Sub-cells are numbered: 0=innerX+innerY, 1=outerX+innerY, 2=innerX+outerY, 3=outerX+outerY
// "inner" meaning closer to the axis center
function getSubCell(x: number, y: number, xPoints: number, yPoints: number, quadrant: number): number {
  if (xPoints < 4 && yPoints < 4) return 0; // no sub-cells
  const xNorm = quadrant === 1 || quadrant === 4 ? (x - 0.5) / 0.5 : (0.5 - x) / 0.5;
  const yNorm = quadrant === 1 || quadrant === 2 ? (y - 0.5) / 0.5 : (0.5 - y) / 0.5;
  const xSub = xNorm < 0.5 ? 0 : 1; // 0 = inner (near axis), 1 = outer
  const ySub = yNorm < 0.5 ? 0 : 1;
  return ySub * 2 + xSub;
}

// Fill order: from inner corner outward
// Returns sorted array indices where index 0 = position closest to center
function getFillPositions(n: number, col: number): { row: number; col: number }[] {
  const positions: { row: number; col: number }[] = [];
  for (let row = 0; row < n; row++) {
    for (let c = 0; c < n; c++) {
      positions.push({ row, col: c });
    }
  }
  return positions; // row 0 is closest to x-axis, col 0 is closest to y-axis
}

interface QuadrantCellProps {
  question: SnapshotQuestion | null;
  ratings: Rating[];
  questions: SnapshotQuestion[];
  visibleQuestions: Set<string>;
  isActive: boolean;
  onClick: () => void;
  // Fill direction for this quadrant
  fillFromRight: boolean;
  fillFromTop: boolean;
}

function DotCell({
  ratings,
  questions,
  visibleQuestions,
  isActive,
  onClick,
  fillFromRight,
  fillFromBottom,
}: {
  ratings: Rating[];
  questions: SnapshotQuestion[];
  visibleQuestions: Set<string>;
  isActive: boolean;
  onClick: () => void;
  fillFromRight: boolean;
  fillFromBottom: boolean;
}) {
  const visibleRatings = ratings.filter(r => {
    if (!r.questionId) return visibleQuestions.size === 0;
    return visibleQuestions.has(r.questionId);
  });

  const count = visibleRatings.length;
  const n = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(count))));
  const dotSize = Math.max(8, Math.min(16, Math.floor(60 / n)));
  const gap = 2;
  const cellSize = n * (dotSize + gap);

  // Build grid: fill from inner corner
  const grid: (Rating | null)[][] = Array.from({ length: n }, () => Array(n).fill(null));
  let placed = 0;
  outer: for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (placed >= visibleRatings.length) break outer;
      grid[row][col] = visibleRatings[placed++];
    }
  }

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer transition-all duration-150"
      style={{
        flex: 1,
        minHeight: 80,
        borderRadius: 8,
        border: isActive ? '1px solid rgba(200,59,80,0.5)' : '1px solid rgba(215,205,195,0.08)',
        background: isActive ? 'rgba(200,59,80,0.05)' : 'rgba(255,255,255,0.02)',
        padding: 8,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, ${dotSize}px)`,
          gridTemplateRows: `repeat(${n}, ${dotSize}px)`,
          gap: `${gap}px`,
          direction: fillFromRight ? 'rtl' : 'ltr',
        }}
      >
        {/* Render in fill order: row 0 = near x-axis */}
        {Array.from({ length: n }).map((_, rowIdx) => {
          const actualRow = fillFromBottom ? (n - 1 - rowIdx) : rowIdx;
          return Array.from({ length: n }).map((_, colIdx) => {
            const rating = grid[actualRow][colIdx];
            const question = rating?.questionId
              ? questions.find(q => q.id === rating.questionId)
              : null;
            return (
              <div
                key={`${actualRow}-${colIdx}`}
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: '50%',
                  background: rating ? (question?.color || '#7A7068') : 'rgba(215,205,195,0.15)',
                  transition: 'background 0.15s',
                }}
              />
            );
          });
        })}
      </div>
    </div>
  );
}

interface QuadrantCardProps {
  quadrant: number; // 1-4
  ratings: Rating[];
  questions: SnapshotQuestion[];
  visibleQuestions: Set<string>;
  xPoints: number;
  yPoints: number;
  activeSubCells: Set<number>;
  onCellClick: (subCell: number) => void;
  // Orientation
  fillFromRight: boolean;
  fillFromBottom: boolean;
}

function QuadrantCard({
  quadrant,
  ratings,
  questions,
  visibleQuestions,
  xPoints,
  yPoints,
  activeSubCells,
  onCellClick,
  fillFromRight,
  fillFromBottom,
}: QuadrantCardProps) {
  const hasSubCells = xPoints >= 4 || yPoints >= 4;

  if (!hasSubCells) {
    return (
      <div
        style={{
          flex: 1,
          borderRadius: 12,
          border: activeSubCells.has(0) ? '1.5px solid rgba(200,59,80,0.5)' : '1.5px solid rgba(215,205,195,0.12)',
          background: '#0d1220',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DotCell
          ratings={ratings}
          questions={questions}
          visibleQuestions={visibleQuestions}
          isActive={activeSubCells.has(0)}
          onClick={() => onCellClick(0)}
          fillFromRight={fillFromRight}
          fillFromBottom={fillFromBottom}
        />
      </div>
    );
  }

  // 4-point: 2×2 sub-cells within the quadrant card
  // Sub-cell layout within card mirrors the axis:
  // For top-right quadrant: subCell[0]=inner-inner (bottom-left), subCell[1]=outer-inner (bottom-right)
  //                         subCell[2]=inner-outer (top-left),    subCell[3]=outer-outer (top-right)
  const subCellRatings = [0, 1, 2, 3].map(sc =>
    ratings.filter(r => {
      const q = quadrant;
      return getSubCell(r.position.x, r.position.y, xPoints, yPoints, q) === sc;
    })
  );

  // Arrange 2×2 grid of sub-cells so inner is always near the center of the whole grid
  // Row 0 = nearest x-axis, Row 1 = further
  // Col 0 = nearest y-axis, Col 1 = further
  const cellOrder = [
    [2, 3], // top row: inner-y then outer-y
    [0, 1], // bottom row: inner-y then outer-y
  ];
  // Flip if needed based on fill direction
  const rows = fillFromBottom ? cellOrder : [...cellOrder].reverse();
  const cols = fillFromRight ? [1, 0] : [0, 1];

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 12,
        border: '1.5px solid rgba(215,205,195,0.12)',
        background: '#0d1220',
        padding: 6,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 4,
      }}
    >
      {rows.map((row, rowIdx) =>
        cols.map((colIdx, ci) => {
          const sc = row[colIdx];
          return (
            <DotCell
              key={sc}
              ratings={subCellRatings[sc]}
              questions={questions}
              visibleQuestions={visibleQuestions}
              isActive={activeSubCells.has(sc)}
              onClick={() => onCellClick(sc)}
              fillFromRight={fillFromRight}
              fillFromBottom={fillFromBottom}
            />
          );
        })
      )}
    </div>
  );
}

export default function SnapshotDotGrid({ activity, ratings, onCellClick, activeCells = new Set(), visibleQuestions, onToggleQuestion }: SnapshotDotGridProps) {
  const questions = [...(activity.snapshotQuestions || [])].sort((a, b) => a.order - b.order);
  const xPoints = activity.xAxisPoints || 2;
  const yPoints = activity.yAxisPoints || 2;
  const xLabels = activity.xAxisLabels || [];
  const yLabels = activity.yAxisLabels || [];

  const getRatingsForQuadrant = (q: number) =>
    ratings.filter(r => getQuadrant(r.position.x, r.position.y) === q);

  // Axis labels
  // x: 2-point → [xLabels[0], xLabels[1]]; 4-point → [xLabels[0], xLabels[1], xLabels[2], xLabels[3]]
  const xInnerLeft = xPoints >= 4 ? xLabels[1] : xLabels[0];
  const xInnerRight = xPoints >= 4 ? xLabels[2] : xLabels[1];
  const xOuterLeft = xPoints >= 4 ? xLabels[0] : null;
  const xOuterRight = xPoints >= 4 ? xLabels[3] : null;
  const yInnerBottom = yPoints >= 4 ? yLabels[1] : yLabels[0];
  const yInnerTop = yPoints >= 4 ? yLabels[2] : yLabels[1];
  const yOuterBottom = yPoints >= 4 ? yLabels[0] : null;
  const yOuterTop = yPoints >= 4 ? yLabels[3] : null;

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: '0.65rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'rgba(215,205,195,0.6)',
    whiteSpace: 'nowrap',
  };

  const outerLabelStyle: React.CSSProperties = {
    ...labelStyle,
    color: 'rgba(215,205,195,0.55)',
    fontSize: '0.58rem',
  };

  // Axis strip: width of center column / height of center row — shared by x and y labels
  const AXIS_STRIP = 36;

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center">
          {questions.map(q => (
            <button
              key={q.id}
              type="button"
              onClick={() => onToggleQuestion(q.id)}
              className="flex items-center gap-1.5 transition-opacity"
              style={{ opacity: visibleQuestions.has(q.id) ? 1 : 0.35 }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: q.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ ...labelStyle, textTransform: 'none', letterSpacing: '0.04em', color: '#D9D4CC' }}>{q.topic || q.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Outer top label (4-point y) */}
      {yOuterTop && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingLeft: xOuterLeft ? AXIS_STRIP : 0, paddingRight: xOuterRight ? AXIS_STRIP : 0 }}>
          <span style={outerLabelStyle}>{yOuterTop}</span>
        </div>
      )}

      {/* Flex row: outer-left x label | 3×3 grid | outer-right x label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, maxWidth: 520 + (xOuterLeft ? AXIS_STRIP : 0) + (xOuterRight ? AXIS_STRIP : 0), width: '100%', margin: '0 auto' }}>

        {/* Outer left x label (4-point) */}
        {xOuterLeft && (
          <div style={{ width: AXIS_STRIP, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
            <span style={{ ...outerLabelStyle, writingMode: 'vertical-lr', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{xOuterLeft}</span>
          </div>
        )}

      {/* 3×3 CSS Grid: quadrants in corners, axis labels in edges, circle in center */}
      <div style={{
        flex: 1,
        aspectRatio: '1',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `1fr ${AXIS_STRIP}px 1fr`,
        gridTemplateRows: `1fr ${AXIS_STRIP}px 1fr`,
      }}>
        {/* Dashed axis lines — behind everything */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          {/* Horizontal */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: '1px dashed rgba(215,205,195,0.15)' }} />
          {/* Vertical */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px dashed rgba(215,205,195,0.15)' }} />
        </div>

        {/* Q2 — top-left */}
        <div style={{ gridColumn: 1, gridRow: 1, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          <QuadrantCard
            quadrant={2} ratings={getRatingsForQuadrant(2)} questions={questions}
            visibleQuestions={visibleQuestions} xPoints={xPoints} yPoints={yPoints}
            activeSubCells={new Set([0,1,2,3].filter(sc => activeCells.has(`2-${sc}`)))}
            onCellClick={(sc) => onCellClick?.(2, sc)}
            fillFromRight={true} fillFromBottom={false}
          />
        </div>

        {/* TOP y-label — top-center */}
        <div style={{ gridColumn: 2, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {yInnerTop && <span style={{ ...labelStyle, writingMode: 'vertical-lr', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>{yInnerTop}</span>}
        </div>

        {/* Q1 — top-right */}
        <div style={{ gridColumn: 3, gridRow: 1, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          <QuadrantCard
            quadrant={1} ratings={getRatingsForQuadrant(1)} questions={questions}
            visibleQuestions={visibleQuestions} xPoints={xPoints} yPoints={yPoints}
            activeSubCells={new Set([0,1,2,3].filter(sc => activeCells.has(`1-${sc}`)))}
            onCellClick={(sc) => onCellClick?.(1, sc)}
            fillFromRight={false} fillFromBottom={false}
          />
        </div>

        {/* LEFT x-label — center-left */}
        <div style={{ gridColumn: 1, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {xInnerLeft && <span style={labelStyle}>{xInnerLeft}</span>}
        </div>

        {/* Center circle — center-center */}
        <div style={{ gridColumn: 2, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            border: '2px solid rgba(215,205,195,0.4)',
            background: '#0a0f1a',
          }} />
        </div>

        {/* RIGHT x-label — center-right */}
        <div style={{ gridColumn: 3, gridRow: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {xInnerRight && <span style={labelStyle}>{xInnerRight}</span>}
        </div>

        {/* Q3 — bottom-left */}
        <div style={{ gridColumn: 1, gridRow: 3, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          <QuadrantCard
            quadrant={3} ratings={getRatingsForQuadrant(3)} questions={questions}
            visibleQuestions={visibleQuestions} xPoints={xPoints} yPoints={yPoints}
            activeSubCells={new Set([0,1,2,3].filter(sc => activeCells.has(`3-${sc}`)))}
            onCellClick={(sc) => onCellClick?.(3, sc)}
            fillFromRight={true} fillFromBottom={true}
          />
        </div>

        {/* BOTTOM y-label — bottom-center */}
        <div style={{ gridColumn: 2, gridRow: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {yInnerBottom && <span style={{ ...labelStyle, writingMode: 'vertical-lr', whiteSpace: 'nowrap' }}>{yInnerBottom}</span>}
        </div>

        {/* Q4 — bottom-right */}
        <div style={{ gridColumn: 3, gridRow: 3, padding: 3, display: 'flex', flexDirection: 'column', zIndex: 1 }}>
          <QuadrantCard
            quadrant={4} ratings={getRatingsForQuadrant(4)} questions={questions}
            visibleQuestions={visibleQuestions} xPoints={xPoints} yPoints={yPoints}
            activeSubCells={new Set([0,1,2,3].filter(sc => activeCells.has(`4-${sc}`)))}
            onCellClick={(sc) => onCellClick?.(4, sc)}
            fillFromRight={false} fillFromBottom={true}
          />
        </div>
      </div>{/* end 3×3 grid */}

        {/* Outer right x label (4-point) */}
        {xOuterRight && (
          <div style={{ width: AXIS_STRIP, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
            <span style={{ ...outerLabelStyle, writingMode: 'vertical-lr', whiteSpace: 'nowrap' }}>{xOuterRight}</span>
          </div>
        )}

      </div>{/* end outer-x flex row */}

      {/* Outer bottom label (4-point y) */}
      {yOuterBottom && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingLeft: xOuterLeft ? AXIS_STRIP : 0, paddingRight: xOuterRight ? AXIS_STRIP : 0 }}>
          <span style={outerLabelStyle}>{yOuterBottom}</span>
        </div>
      )}
    </div>
  );
}
