'use client';

import { useRef } from 'react';
import { ActivityEntry, MappingGridProps, positionedEntries, entryTimestamp } from '../types/Activity';
import { FormattingService } from '../utils/formatting';
import { ValidationService } from '../utils/validation';

export default function MappingGrid({
  activity,
  onRatingSubmit,
  userRating,
  showAllRatings = false,
  hoveredCommentId,
  onDotClick,
  visibleCommentIds = [],
  hoveredSlotNumber,
  currentUserId
}: MappingGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const positioned = positionedEntries(activity);

  // Handle click on grid to place rating
  const handleGridClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;

    const rect = gridRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Clamp values between 0 and 1
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, 1 - y)); // Flip Y-axis: clicking top gives high Y value

    // Submit rating immediately
    onRatingSubmit({ x: clampedX, y: clampedY });
  };

  // Get position style for an entry dot
  const getPositionStyle = (entry: ActivityEntry) => ({
    left: `${entry.position!.x * 100}%`,
    top: `${(1 - entry.position!.y) * 100}%`, // Flip Y-axis: high values go to top
    transform: 'translate(-50%, -50%)',
  });

  // Get user color based on position
  const getUserColor = (entry: ActivityEntry) => {
    const quadrant = ValidationService.getQuadrant(entry.position!);
    return ValidationService.getQuadrantColor(quadrant);
  };

  // Check if entry should be highlighted
  const isHighlighted = (entry: ActivityEntry): boolean => {
    // Highlight if its comment is hovered
    if (hoveredCommentId && entry.id === hoveredCommentId) return true;

    // Highlight if slot button is hovered and this entry belongs to current user and hovered slot
    if (hoveredSlotNumber && currentUserId) {
      return entry.userId === currentUserId && (entry.slotNumber || 1) === hoveredSlotNumber;
    }

    return false;
  };

  // Check if entry should be visible (based on comment filters)
  const isVisible = (entry: ActivityEntry): boolean => {
    if (visibleCommentIds.length === 0) return true;
    return visibleCommentIds.includes(entry.id);
  };

  // Get dot size based on vote count (proportional to max votes in activity)
  const getDotSize = (entry: ActivityEntry): { width: string; height: string } => {
    const votes = entry.voteCount || 0;
    const mindiam = 12; // Base size for 0 votes
    const maxdiam = 30; // Max size

    // Find highest vote count in current activity
    const highestVotes = Math.max(1, ...positioned.map(e => e.voteCount || 0));

    // Formula: (votes/highest votes)*(maxdiam-mindiam)+12px
    const scaledSize = (votes / highestVotes) * (maxdiam - mindiam) + 12;

    return {
      width: `${scaledSize}px`,
      height: `${scaledSize}px`
    };
  };

  // Handle entry dot click
  const handleEntryClick = (entry: ActivityEntry, event: React.MouseEvent) => {
    event.stopPropagation();
    if (onDotClick && entry.text && entry.text.trim()) {
      onDotClick(entry.id);
    }
  };

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
        <div className="text-[var(--text-primary)] text-sm font-semibold text-center p-2" style={{ width: 'min(500px, calc(90vw - 56px))' }}>{activity.yAxis.max}</div>

        <div className="flex items-center justify-center gap-2">
          {/* Left label */}
          <div className="text-[var(--text-primary)] text-sm font-semibold text-center p-2 w-5 flex items-center justify-center flex-shrink-0"
               style={{ writingMode: 'vertical-lr', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>
            {activity.xAxis.min}
          </div>

          {/* Grid Container */}
          <div
            ref={gridRef}
            className="relative bg-[var(--bg-secondary)] border-2 border-[var(--border-default)] rounded-lg cursor-crosshair select-none aspect-square"
            onClick={handleGridClick}
            style={{ width: 'min(500px, calc(90vw - 56px))', height: 'min(500px, calc(90vw - 56px))' }}
          >
          {/* Grid Lines */}
          <div className="absolute inset-0 opacity-20">
            {/* Vertical lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 w-px bg-[rgba(15,13,11,0.3)]"
                style={{ left: `${(i + 1) * 16.666}%` }}
              />
            ))}
            {/* Horizontal lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 h-px bg-[rgba(15,13,11,0.3)]"
                style={{ top: `${(i + 1) * 16.666}%` }}
              />
            ))}
          </div>

          {/* Center Axis Lines */}
          <div className="absolute inset-0">
            {/* Vertical center line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[rgba(15,13,11,0.35)]"
              style={{ left: '50%', transform: 'translateX(-50%)' }}
            />
            {/* Horizontal center line */}
            <div
              className="absolute left-0 right-0 h-0.5 bg-[rgba(15,13,11,0.35)]"
              style={{ top: '50%', transform: 'translateY(-50%)' }}
            />
          </div>

          {/* Axis Labels on Grid */}
          {activity.showAxisLabels !== false && (
            <>
              {/* X-axis label (horizontal, positioned to the right of the horizontal axis line) */}
              <div className="absolute transform -translate-y-1/2" style={{ top: '50%', left: '55%' }}>
                <span className="text-[var(--text-secondary)] text-sm font-semibold bg-[var(--bg-primary)] px-2 py-1 rounded shadow-sm">
                  {activity.xAxis.label}
                </span>
              </div>

              {/* Y-axis label (vertical, positioned to the left of the vertical axis line) */}
              <div
                className="absolute transform -translate-x-1/2 -translate-y-1/2 -rotate-90"
                style={{ left: '50%', top: '25%', transformOrigin: 'center' }}
              >
                <span className="text-[var(--text-secondary)] text-sm font-semibold bg-[var(--bg-primary)] px-2 py-1 rounded whitespace-nowrap shadow-sm">
                  {activity.yAxis.label}
                </span>
              </div>
            </>
          )}

          {/* Existing Entries */}
          {showAllRatings && positioned.filter(isVisible).map((entry) => {
            const highlighted = isHighlighted(entry);
            const hasComment = !!(entry.text && entry.text.trim());
            const dotSize = getDotSize(entry);

            return (
              <div
                key={entry.id}
                className={`absolute rounded-full border-2 border-white shadow-md z-10 transition-all duration-200 ${
                  hasComment && onDotClick ? 'cursor-pointer hover:scale-110' : ''
                }`}
                style={{
                  ...getPositionStyle(entry),
                  backgroundColor: getUserColor(entry),
                  boxShadow: highlighted ? '0 0 0 4px rgba(255, 215, 0, 0.9)' : undefined,
                  width: dotSize.width,
                  height: dotSize.height,
                }}
                title={entry.objectName ? (hasComment ? `${entry.objectName}\n${entry.text}` : entry.objectName) : (entry.text || '')}
                onClick={hasComment ? (e) => handleEntryClick(entry, e) : undefined}
              />
            );
          })}

          {/* User's Current Rating */}
          {userRating && userRating.position && (
            <div
              className="absolute w-4 h-4 rounded-full border-3 border-white shadow-lg z-20"
              style={{
                ...getPositionStyle(userRating),
                backgroundColor: getUserColor(userRating),
                boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.5)',
              }}
              title={`Your rating - ${FormattingService.formatTimestamp(entryTimestamp(userRating))}`}
            />
          )}

          </div>

          {/* Right label */}
          <div className="text-[var(--text-primary)] text-sm font-semibold text-center p-2 w-5 flex items-center justify-center flex-shrink-0"
               style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            {activity.xAxis.max}
          </div>
        </div>

        {/* Bottom label */}
        <div className="text-[var(--text-primary)] text-sm font-semibold text-center p-2" style={{ width: 'min(500px, calc(90vw - 56px))' }}>{activity.yAxis.min}</div>
      </div>

    </div>
  );
}
