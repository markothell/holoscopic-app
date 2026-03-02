'use client';

import { useState } from 'react';
import { HoloscopicActivity, Rating } from '@/models/Activity';
import { QUADRANT_POSITIONS, getQuadrantFromPosition } from '@/components/activities/types';

interface QuadrantSelectorProps {
  activity: HoloscopicActivity;
  onQuadrantSelect: (position: { x: number; y: number }) => void;
  userRating?: Rating;
}

export default function QuadrantSelector({ activity, onQuadrantSelect, userRating }: QuadrantSelectorProps) {
  const initialQuadrant = userRating
    ? getQuadrantFromPosition(userRating.position.x, userRating.position.y)
    : null;

  const [selectedQuadrant, setSelectedQuadrant] = useState<number | null>(initialQuadrant);

  const handleSelect = (quadrant: number) => {
    setSelectedQuadrant(quadrant);
    onQuadrantSelect(QUADRANT_POSITIONS[quadrant as keyof typeof QUADRANT_POSITIONS]);
  };

  // Quadrant layout: [q2 top-left, q1 top-right, q3 bottom-left, q4 bottom-right]
  const quadrants = [
    { id: 2, label: `${activity.xAxis.min} + ${activity.yAxis.max}`, corner: 'top-left' },
    { id: 1, label: `${activity.xAxis.max} + ${activity.yAxis.max}`, corner: 'top-right' },
    { id: 3, label: `${activity.xAxis.min} + ${activity.yAxis.min}`, corner: 'bottom-left' },
    { id: 4, label: `${activity.xAxis.max} + ${activity.yAxis.min}`, corner: 'bottom-right' },
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>
        {activity.mapQuestion}
      </h3>

      {/* Axis labels + grid */}
      <div className="flex flex-col items-center gap-1">
        {/* Y-max label */}
        <span className="text-xs text-[#A89F96] font-semibold" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {activity.yAxis.max}
        </span>

        <div className="flex items-center gap-1 w-full">
          {/* Y-min label (left side, rotated) */}
          <div className="flex-shrink-0 w-6 flex items-center justify-center">
            <span
              className="text-[#A89F96] font-semibold whitespace-nowrap"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
            >
              {activity.xAxis.min}
            </span>
          </div>

          {/* 2×2 quadrant grid */}
          <div className="flex-1 grid grid-cols-2 gap-1">
            {quadrants.map((q) => {
              const isSelected = selectedQuadrant === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => handleSelect(q.id)}
                  className={`
                    aspect-square rounded-lg border-2 transition-all duration-150 flex items-center justify-center p-2
                    ${isSelected
                      ? 'bg-[#C83B50] border-[#C83B50] text-white'
                      : 'bg-[#1A1714] border-[rgba(215,205,195,0.15)] text-[#7A7068] hover:border-[rgba(215,205,195,0.4)] hover:text-[#A89F96]'
                    }
                  `}
                >
                  <span
                    className="text-center leading-tight"
                    style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    {q.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* X-max label (right side) */}
          <div className="flex-shrink-0 w-6 flex items-center justify-center">
            <span
              className="text-[#A89F96] font-semibold whitespace-nowrap"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', writingMode: 'vertical-rl' }}
            >
              {activity.xAxis.max}
            </span>
          </div>
        </div>

        {/* Y-min label */}
        <span className="text-xs text-[#A89F96] font-semibold" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {activity.yAxis.min}
        </span>
      </div>
    </div>
  );
}
