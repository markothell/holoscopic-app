'use client';

import { useState } from 'react';
import { ResultsViewProps } from '../types/Activity';
import ResolveGrid from './activities/resolve/ResolveGrid';

function getQuadrant(x: number, y: number): number {
  if (x >= 0.5 && y >= 0.5) return 1;
  if (x < 0.5 && y >= 0.5) return 2;
  if (x < 0.5 && y < 0.5) return 3;
  return 4;
}

export default function ResultsViewSimple({
  activity,
  isVisible,
  onActiveCellChange,
}: ResultsViewProps) {
  const [activeCells, setActiveCells] = useState<Set<number>>(new Set());

  if (!isVisible) return null;

  const handleCellClick = (quadrant: number) => {
    const next = new Set(activeCells);
    if (next.has(quadrant)) { next.delete(quadrant); } else { next.add(quadrant); }
    setActiveCells(next);

    if (onActiveCellChange) {
      if (next.size === 0) {
        onActiveCellChange(null);
      } else {
        const ids = activity.comments
          .filter(c => {
            const rating = activity.ratings.find(
              r => r.userId === c.userId && (r.slotNumber ?? 1) === (c.slotNumber ?? 1)
            );
            return rating ? next.has(getQuadrant(rating.position.x, rating.position.y)) : false;
          })
          .map(c => c.id);
        onActiveCellChange(ids);
      }
    }
  };

  const filteredCount = activeCells.size > 0
    ? activity.comments.filter(c => {
        const rating = activity.ratings.find(
          r => r.userId === c.userId && (r.slotNumber ?? 1) === (c.slotNumber ?? 1)
        );
        return rating ? activeCells.has(getQuadrant(rating.position.x, rating.position.y)) : false;
      }).length
    : null;

  return (
    <div className="h-full flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-[560px]">
        <ResolveGrid
          activity={activity}
          ratings={activity.ratings}
          onCellClick={handleCellClick}
          activeCells={activeCells}
        />
        {activeCells.size > 0 && filteredCount !== null && (
          <p
            className="text-center mt-2"
            style={{
              fontFamily: 'var(--font-dm-mono), monospace',
              fontSize: '0.6rem',
              letterSpacing: '0.08em',
              color: 'rgba(215,205,195,0.4)',
              textTransform: 'uppercase',
            }}
          >
            {filteredCount} {filteredCount === 1 ? 'entry' : 'entries'} in{' '}
            {activeCells.size} selected {activeCells.size === 1 ? 'quadrant' : 'quadrants'}
          </p>
        )}
      </div>
    </div>
  );
}
