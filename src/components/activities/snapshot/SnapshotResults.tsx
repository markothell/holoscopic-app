'use client';

import { useState } from 'react';
import { ResultsViewProps } from '@/models/Activity';
import SnapshotDotGrid from './SnapshotDotGrid';

function getQuadrant(x: number, y: number): number {
  if (x >= 0.5 && y >= 0.5) return 1;
  if (x < 0.5 && y >= 0.5) return 2;
  if (x < 0.5 && y < 0.5) return 3;
  return 4;
}

function getSubCell(x: number, y: number, xPoints: number, yPoints: number, quadrant: number): number {
  if (xPoints < 4 && yPoints < 4) return 0;
  const xNorm = quadrant === 1 || quadrant === 4 ? (x - 0.5) / 0.5 : (0.5 - x) / 0.5;
  const yNorm = quadrant === 1 || quadrant === 2 ? (y - 0.5) / 0.5 : (0.5 - y) / 0.5;
  const xSub = xNorm < 0.5 ? 0 : 1;
  const ySub = yNorm < 0.5 ? 0 : 1;
  return ySub * 2 + xSub;
}

export default function SnapshotResults({
  activity,
  isVisible,
  currentUserId,
  externalHoveredCommentId,
  hoveredSlotNumber,
  onActiveCellChange,
}: ResultsViewProps) {
  const allQuestions = [...(activity.snapshotQuestions || [])].sort((a, b) => a.order - b.order);

  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());
  const [visibleQuestions, setVisibleQuestions] = useState<Set<string>>(
    () => new Set(allQuestions.map(q => q.id))
  );

  if (!isVisible) return null;

  const xPoints = activity.xAxisPoints || 2;
  const yPoints = activity.yAxisPoints || 2;

  const computeFilteredIds = (
    cells: Set<string>,
    visible: Set<string>
  ): string[] | null => {
    const questionFiltered = visible.size < allQuestions.length;
    const cellFiltered = cells.size > 0;
    if (!cellFiltered && !questionFiltered) return null;

    return activity.comments
      .filter(c => {
        if (questionFiltered && c.questionId && !visible.has(c.questionId)) return false;
        if (cellFiltered) {
          const rating = activity.ratings.find(r =>
            r.userId === c.userId &&
            r.slotNumber === c.slotNumber &&
            (r.questionId || null) === (c.questionId || null)
          );
          if (!rating) return false;
          const q = getQuadrant(rating.position.x, rating.position.y);
          const sc = (xPoints >= 4 || yPoints >= 4)
            ? getSubCell(rating.position.x, rating.position.y, xPoints, yPoints, q)
            : 0;
          if (!cells.has(`${q}-${sc}`)) return false;
        }
        return true;
      })
      .map(c => c.id);
  };

  const handleCellClick = (quadrant: number, subCell?: number) => {
    const key = `${quadrant}-${subCell ?? 0}`;
    const next = new Set(activeCells);
    if (next.has(key)) { next.delete(key); } else { next.add(key); }
    setActiveCells(next);
    onActiveCellChange?.(computeFilteredIds(next, visibleQuestions));
  };

  const handleToggleQuestion = (id: string) => {
    const next = new Set(visibleQuestions);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setVisibleQuestions(next);
    onActiveCellChange?.(computeFilteredIds(activeCells, next));
  };

  const filteredIds = computeFilteredIds(activeCells, visibleQuestions);
  const entryCount = filteredIds !== null && activeCells.size > 0 ? filteredIds.length : null;

  return (
    <div className="h-full flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-[560px]">
        <SnapshotDotGrid
          activity={activity}
          ratings={activity.ratings}
          onCellClick={handleCellClick}
          activeCells={activeCells}
          visibleQuestions={visibleQuestions}
          onToggleQuestion={handleToggleQuestion}
        />
        {activeCells.size > 0 && entryCount !== null && (
          <p
            className="text-center mt-2"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'rgba(215,205,195,0.4)', textTransform: 'uppercase' }}
          >
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'} across {activeCells.size} selected {activeCells.size === 1 ? 'cell' : 'cells'}
          </p>
        )}
      </div>
    </div>
  );
}
