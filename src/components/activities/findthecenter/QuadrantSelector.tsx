'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating } from '@/models/Activity';

interface QuadrantSelectorProps {
  activity: HoloscopicActivity;
  onQuadrantSelect: (position: { x: number; y: number; quadrant: number }) => void;
  userRating?: Rating;
  stepLabel?: string;
}

export default function QuadrantSelector({
  activity,
  onQuadrantSelect,
  userRating,
  stepLabel
}: QuadrantSelectorProps) {
  const [selectedQuadrant, setSelectedQuadrant] = useState<number | null>(null);

  // Update state when userRating changes
  useEffect(() => {
    if (userRating) {
      // Determine quadrant from x,y position
      // Q1: top-right (x > 0.5, y > 0.5)
      // Q2: top-left (x < 0.5, y > 0.5)
      // Q3: bottom-left (x < 0.5, y < 0.5)
      // Q4: bottom-right (x > 0.5, y < 0.5)
      const x = userRating.position.x;
      const y = userRating.position.y;

      if (x > 0.5 && y > 0.5) setSelectedQuadrant(1);
      else if (x < 0.5 && y > 0.5) setSelectedQuadrant(2);
      else if (x < 0.5 && y < 0.5) setSelectedQuadrant(3);
      else if (x > 0.5 && y < 0.5) setSelectedQuadrant(4);
    }
  }, [userRating]);

  const handleQuadrantClick = (quadrant: number) => {
    setSelectedQuadrant(quadrant);

    // Map quadrant to x,y position (0-1 normalized)
    // Place in the center of each quadrant for consistent positioning
    let x: number, y: number;

    switch(quadrant) {
      case 1: // Top-right
        x = 0.75;
        y = 0.75;
        break;
      case 2: // Top-left
        x = 0.25;
        y = 0.75;
        break;
      case 3: // Bottom-left
        x = 0.25;
        y = 0.25;
        break;
      case 4: // Bottom-right
        x = 0.75;
        y = 0.25;
        break;
      default:
        x = 0.5;
        y = 0.5;
    }

    onQuadrantSelect({ x, y, quadrant });
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="space-y-4">
        {/* Question Title */}
        <h3 className="text-white text-2xl sm:text-3xl font-bold text-center leading-tight">
          {activity.mapQuestion}
        </h3>

        {/* Quadrant Grid */}
        <div className="relative w-full max-w-md mx-auto aspect-square">
          {/* SVG for the cross lines with gaps and center circle */}
          <svg
            viewBox="0 0 400 400"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1 }}
          >
            {/* Vertical line segments (with gap in middle) */}
            <line x1="200" y1="0" x2="200" y2="160" stroke="white" strokeWidth="2" />
            <line x1="200" y1="240" x2="200" y2="400" stroke="white" strokeWidth="2" />

            {/* Horizontal line segments (with gap in middle) */}
            <line x1="0" y1="200" x2="160" y2="200" stroke="white" strokeWidth="2" />
            <line x1="240" y1="200" x2="400" y2="200" stroke="white" strokeWidth="2" />

            {/* Center circle */}
            <circle cx="200" cy="200" r="30" fill="none" stroke="white" strokeWidth="2" />
          </svg>

          {/* Axis Labels */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
            {/* X-axis labels (horizontal, offset further from axis) */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 text-white text-xs sm:text-sm font-medium" style={{ left: '-20px' }}>
              {activity.xAxis.min}
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-white text-xs sm:text-sm font-medium" style={{ right: '-20px' }}>
              {activity.xAxis.max}
            </div>

            {/* Y-axis labels (rotated vertical) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-6 text-white text-xs sm:text-sm font-medium">
              <div className="transform -rotate-90 whitespace-nowrap">{activity.yAxis.max}</div>
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-6 text-white text-xs sm:text-sm font-medium">
              <div className="transform -rotate-90 whitespace-nowrap">{activity.yAxis.min}</div>
            </div>
          </div>

          {/* Quadrant buttons - Full square clickable areas */}
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0" style={{ zIndex: 3 }}>
            {/* Quadrant 3 - Bottom Left (now top-left in visual grid) */}
            <button
              onClick={() => handleQuadrantClick(3)}
              className={`relative transition-all duration-200 ${
                selectedQuadrant === 3
                  ? 'bg-blue-600/30'
                  : 'bg-transparent hover:bg-slate-700/20'
              }`}
            >
              {selectedQuadrant === 3 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white" />
                </div>
              )}
            </button>

            {/* Quadrant 4 - Bottom Right (now top-right in visual grid) */}
            <button
              onClick={() => handleQuadrantClick(4)}
              className={`relative transition-all duration-200 ${
                selectedQuadrant === 4
                  ? 'bg-blue-600/30'
                  : 'bg-transparent hover:bg-slate-700/20'
              }`}
            >
              {selectedQuadrant === 4 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white" />
                </div>
              )}
            </button>

            {/* Quadrant 2 - Top Left (now bottom-left in visual grid) */}
            <button
              onClick={() => handleQuadrantClick(2)}
              className={`relative transition-all duration-200 ${
                selectedQuadrant === 2
                  ? 'bg-blue-600/30'
                  : 'bg-transparent hover:bg-slate-700/20'
              }`}
            >
              {selectedQuadrant === 2 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white" />
                </div>
              )}
            </button>

            {/* Quadrant 1 - Top Right (now bottom-right in visual grid) */}
            <button
              onClick={() => handleQuadrantClick(1)}
              className={`relative transition-all duration-200 ${
                selectedQuadrant === 1
                  ? 'bg-blue-600/30'
                  : 'bg-transparent hover:bg-slate-700/20'
              }`}
            >
              {selectedQuadrant === 1 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white" />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
