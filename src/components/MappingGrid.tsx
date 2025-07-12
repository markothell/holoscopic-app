'use client';

import { useRef } from 'react';
import { WeAllExplainActivity, Rating, MappingGridProps } from '@/models/Activity';
import { FormattingService } from '@/utils/formatting';

export default function MappingGrid({ 
  activity, 
  onRatingSubmit, 
  userRating, 
  showAllRatings = false 
}: MappingGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Handle click on grid to place rating
  const handleGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Clamp values between 0 and 1
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    // Submit rating immediately
    onRatingSubmit({ x: clampedX, y: clampedY });
  };

  // Get position style for a rating dot
  const getPositionStyle = (rating: Rating) => ({
    left: `${rating.position.x * 100}%`,
    top: `${rating.position.y * 100}%`,
    transform: 'translate(-50%, -50%)',
  });

  // Get user color
  const getUserColor = (username: string) => FormattingService.generateColorFromString(username);

  return (
    <div className="space-y-4">

      {/* Mapping Grid 
          IMPORTANT: Grid sizing uses single constraint min(500px, 90vw)
          - 500px max size for desktop
          - 90vw for mobile responsiveness
          - Applied consistently to grid and all labels
          - Avoid conflicting responsive classes that override this
      */}
      <div className="flex flex-col items-center justify-center mx-auto px-4">
        {/* Top label */}
        <div className="text-white text-sm font-semibold text-center p-2" style={{ width: 'min(500px, 90vw)' }}>{activity.yAxis.max}</div>
        
        <div className="flex items-center justify-center gap-2">
          {/* Left label */}
          <div className="text-white text-sm font-semibold text-center p-2 w-5 flex items-center justify-center flex-shrink-0" 
               style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
            {activity.xAxis.min}
          </div>
          
          {/* Grid Container */}
          <div
            ref={gridRef}
            className="relative bg-gray-50 border-2 border-gray-200 rounded-lg cursor-crosshair select-none aspect-square"
            onClick={handleGridClick}
            style={{ width: 'min(500px, 90vw)', height: 'min(500px, 90vw)' }}
          >
          {/* Grid Lines */}
          <div className="absolute inset-0 opacity-20">
            {/* Vertical lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 w-px bg-gray-300"
                style={{ left: `${(i + 1) * 16.666}%` }}
              />
            ))}
            {/* Horizontal lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 h-px bg-gray-300"
                style={{ top: `${(i + 1) * 16.666}%` }}
              />
            ))}
          </div>

          {/* Center Axis Lines */}
          <div className="absolute inset-0">
            {/* Vertical center line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gray-600"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
            {/* Horizontal center line */}
            <div
              className="absolute left-0 right-0 h-0.5 bg-gray-600"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>

          {/* Axis Labels on Grid */}
          {/* X-axis label (horizontal, positioned to the right of the horizontal axis line) */}
          <div className="absolute transform -translate-y-1/2" style={{ top: '50%', left: '55%' }}>
            <span className="text-gray-800 text-xs font-semibold bg-white bg-opacity-90 px-2 py-1 rounded">
              {activity.xAxis.label}
            </span>
          </div>
          
          {/* Y-axis label (vertical, positioned to the left of the vertical axis line) */}
          <div className="absolute transform -translate-y-1/2 -rotate-90" style={{ left: '32%', top: '35%' }}>
            <span className="text-gray-800 text-xs font-semibold bg-white bg-opacity-90 px-2 py-1 rounded whitespace-nowrap">
              {activity.yAxis.label}
            </span>
          </div>

          {/* Existing Ratings */}
          {showAllRatings && activity.ratings.map((rating) => (
            <div
              key={rating.id}
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow-md z-10"
              style={{
                ...getPositionStyle(rating),
                backgroundColor: getUserColor(rating.username),
              }}
              title={`${rating.username} - ${FormattingService.formatTimestamp(rating.timestamp)}`}
            />
          ))}

          {/* User's Current Rating */}
          {userRating && (
            <div
              className="absolute w-4 h-4 rounded-full border-3 border-white shadow-lg z-20"
              style={{
                ...getPositionStyle(userRating),
                backgroundColor: getUserColor(userRating.username),
                boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.5)',
              }}
              title={`Your rating - ${FormattingService.formatTimestamp(userRating.timestamp)}`}
            />
          )}

          </div>
          
          {/* Right label */}
          <div className="text-white text-sm font-semibold text-center p-2 w-5 flex items-center justify-center flex-shrink-0"
               style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            {activity.xAxis.max}
          </div>
        </div>
        
        {/* Bottom label */}
        <div className="text-white text-sm font-semibold text-center p-2" style={{ width: 'min(500px, 90vw)' }}>{activity.yAxis.min}</div>
      </div>

      {/* Instructions */}
      {!showAllRatings && (
        <div className="text-center text-sm text-gray-600">
          {!userRating && (
            <p>Click or tap anywhere on the map to place your rating</p>
          )}
        </div>
      )}
    </div>
  );
}