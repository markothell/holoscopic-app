'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment } from '@/models/Activity';
import { ValidationService } from '@/utils/validation';

interface DotGridProps {
  activity: HoloscopicActivity;
  currentUserId?: string;
  onDotClick?: (rating: Rating, comment: Comment | undefined) => void;
}

interface GridPosition {
  row: number;
  col: number;
  quadrant: number;
  x: number; // Screen position %
  y: number; // Screen position %
  rating?: Rating;
  comment?: Comment;
  filled: boolean;
}

// Helper to convert quadrant string to number
const quadrantToNumber = (q: 'q1' | 'q2' | 'q3' | 'q4'): 1 | 2 | 3 | 4 => {
  const map: Record<string, 1 | 2 | 3 | 4> = { q1: 1, q2: 2, q3: 3, q4: 4 };
  return map[q];
};

export default function DotGrid({ activity, currentUserId, onDotClick }: DotGridProps) {
  const [gridPositions, setGridPositions] = useState<GridPosition[]>([]);
  const [hoveredDot, setHoveredDot] = useState<string | null>(null);

  // Generate square-filling order: fills 1x1, then 2x2, then 3x3, etc.
  // Returns array of [row, col] pairs in the order they should be filled
  const getSquareFillingOrder = (): [number, number][] => {
    const order: [number, number][] = [];
    const seen = new Set<string>();

    // Fill in expanding squares: 1x1 (1 dot), 2x2 (4 dots), 3x3 (9 dots), 4x4 (16 dots), 5x5 (25 dots)
    for (let squareSize = 1; squareSize <= 5; squareSize++) {
      for (let row = 0; row < squareSize; row++) {
        for (let col = 0; col < squareSize; col++) {
          const key = `${row},${col}`;
          if (!seen.has(key)) {
            seen.add(key);
            order.push([row, col]);
          }
        }
      }
    }

    return order;
  };

  useEffect(() => {
    const positions: GridPosition[] = [];

    // Group ratings by quadrant
    const ratingsByQuadrant: { [key: number]: Array<{ rating: Rating; comment?: Comment }> } = {
      1: [], 2: [], 3: [], 4: []
    };

    activity.ratings.forEach(rating => {
      const quadrantStr = ValidationService.getQuadrant(rating.position);
      const quadrant = quadrantToNumber(quadrantStr);
      const comment = activity.comments.find(
        c => c.userId === rating.userId && (c.slotNumber || 1) === (rating.slotNumber || 1)
      );
      ratingsByQuadrant[quadrant].push({ rating, comment });
    });

    // Sort ratings by vote count (highest first) - most votes closest to center
    Object.keys(ratingsByQuadrant).forEach(key => {
      const quadrant = parseInt(key);
      ratingsByQuadrant[quadrant].sort((a, b) => {
        const votesA = a.comment?.voteCount || 0;
        const votesB = b.comment?.voteCount || 0;
        return votesB - votesA; // Descending order
      });
    });

    const fillingOrder = getSquareFillingOrder();

    [1, 2, 3, 4].forEach(quadrant => {
      const ratingsInQuadrant = ratingsByQuadrant[quadrant];
      const GRID_SIZE = 5; // Always 5x5 grid
      const DOT_SPACING = 32 / (GRID_SIZE + 1); // Tighter spacing for 5x5

      // Create a mapping from [row,col] to rating index
      const positionToRating = new Map<string, typeof ratingsInQuadrant[0]>();
      fillingOrder.forEach(([row, col], index) => {
        if (index < ratingsInQuadrant.length) {
          positionToRating.set(`${row},${col}`, ratingsInQuadrant[index]);
        }
      });

      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const ratingData = positionToRating.get(`${row},${col}`);

          // Calculate position based on quadrant
          let x: number, y: number;

          const CHANNEL = 53; // % where channel edge is
          const START_OFFSET = 3; // Start 3% from axis edge

          switch(quadrant) {
            case 1: // Top-right
              x = CHANNEL + START_OFFSET + (col * DOT_SPACING);
              y = CHANNEL + START_OFFSET + (row * DOT_SPACING);
              break;
            case 2: // Top-left
              x = (100 - CHANNEL - START_OFFSET) - (col * DOT_SPACING);
              y = CHANNEL + START_OFFSET + (row * DOT_SPACING);
              break;
            case 3: // Bottom-left
              x = (100 - CHANNEL - START_OFFSET) - (col * DOT_SPACING);
              y = (100 - CHANNEL - START_OFFSET) - (row * DOT_SPACING);
              break;
            case 4: // Bottom-right
              x = CHANNEL + START_OFFSET + (col * DOT_SPACING);
              y = (100 - CHANNEL - START_OFFSET) - (row * DOT_SPACING);
              break;
            default:
              x = 50;
              y = 50;
          }

          positions.push({
            row,
            col,
            quadrant,
            x,
            y,
            rating: ratingData?.rating,
            comment: ratingData?.comment,
            filled: !!ratingData
          });
        }
      }
    });

    setGridPositions(positions);
  }, [activity.ratings, activity.comments]);

  // Calculate max votes across all comments
  const maxVotes = Math.max(1, ...activity.comments.map(c => c.voteCount || 0));

  // Get color with saturation based on vote count
  // 0 votes = white, max votes = full color
  const getDotColor = (quadrant: number, voteCount: number): string => {
    // Base colors for each quadrant
    const baseColors = {
      1: { r: 125, g: 211, b: 252 },  // Sky blue
      2: { r: 45, g: 212, b: 191 },   // Teal
      3: { r: 167, g: 139, b: 250 },  // Lavender
      4: { r: 234, g: 179, b: 8 },    // Amber
    };

    const base = baseColors[quadrant as keyof typeof baseColors];
    if (!base) return '#3b82f6';

    // Calculate saturation ratio (0 = white, 1 = full color)
    const saturationRatio = maxVotes > 0 ? voteCount / maxVotes : 0;

    // Interpolate from white (255,255,255) to base color
    const r = Math.round(255 - (255 - base.r) * saturationRatio);
    const g = Math.round(255 - (255 - base.g) * saturationRatio);
    const b = Math.round(255 - (255 - base.b) * saturationRatio);

    return `rgb(${r}, ${g}, ${b})`;
  };

  const handleClick = (position: GridPosition) => {
    if (position.filled && position.rating && onDotClick) {
      onDotClick(position.rating, position.comment);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#111827]">
      {/* Axis channel background with border lines and arrows */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Vertical channel */}
        <rect x="47" y="0" width="6" height="100" fill="rgba(255,255,255,0.04)" />
        {/* Horizontal channel */}
        <rect x="0" y="47" width="100" height="6" fill="rgba(255,255,255,0.04)" />

        {/* Border lines on edges of channels */}
        {/* Vertical channel borders */}
        <line x1="47" y1="0" x2="47" y2="100" stroke="white" strokeWidth="0.5" />
        <line x1="53" y1="0" x2="53" y2="100" stroke="white" strokeWidth="0.5" />
        {/* Horizontal channel borders */}
        <line x1="0" y1="47" x2="100" y2="47" stroke="white" strokeWidth="0.5" />
        <line x1="0" y1="53" x2="100" y2="53" stroke="white" strokeWidth="0.5" />
      </svg>
      {/* Arrow markers at axis ends */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
        {/* Top arrow */}
        <polygon points="50,1 47.2,5 52.8,5" fill="white" opacity="0.85" />
        {/* Bottom arrow */}
        <polygon points="50,99 47.2,95 52.8,95" fill="white" opacity="0.85" />
        {/* Left arrow */}
        <polygon points="1,50 5,47.2 5,52.8" fill="white" opacity="0.85" />
        {/* Right arrow */}
        <polygon points="99,50 95,47.2 95,52.8" fill="white" opacity="0.85" />
      </svg>

      {/* Axis labels */}
      <div className="absolute inset-0 pointer-events-none text-white text-sm font-medium">
        {/* Y-axis labels (vertical - rotated) */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '15%' }}>
          <div className="transform -rotate-90 whitespace-nowrap">{activity.yAxis.max}</div>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '15%' }}>
          <div className="transform -rotate-90 whitespace-nowrap">{activity.yAxis.min}</div>
        </div>
        {/* X-axis labels (horizontal - not rotated) */}
        <div className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap" style={{ left: '15%' }}>
          {activity.xAxis.min}
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap" style={{ right: '15%' }}>
          {activity.xAxis.max}
        </div>
      </div>

      {/* Center circle - sized to fit inside channel */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white/80 bg-transparent" />

      {/* Render all grid positions */}
      {gridPositions.map((pos, index) => {
        const isUserDot = pos.filled && pos.rating?.userId === currentUserId;
        const isHovered = hoveredDot === `${pos.quadrant}-${pos.row}-${pos.col}`;

        if (pos.filled && pos.rating) {
          // Filled dot
          const voteCount = pos.comment?.voteCount || 0;
          return (
            <div
              key={`${pos.quadrant}-${pos.row}-${pos.col}`}
              className="absolute cursor-pointer transition-all duration-200 z-10"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onClick={() => handleClick(pos)}
              onMouseEnter={() => setHoveredDot(`${pos.quadrant}-${pos.row}-${pos.col}`)}
              onMouseLeave={() => setHoveredDot(null)}
            >
              <div
                className="w-6 h-6 rounded-full transition-all duration-200 border border-white/30"
                style={{
                  backgroundColor: getDotColor(pos.quadrant, voteCount),
                  outline: isHovered ? '2px solid white' : 'none',
                  outlineOffset: '2px'
                }}
              />
            </div>
          );
        } else {
          // Empty dot
          return (
            <div
              key={`${pos.quadrant}-${pos.row}-${pos.col}`}
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
            </div>
          );
        }
      })}
    </div>
  );
}
