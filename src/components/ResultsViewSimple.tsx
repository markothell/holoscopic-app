'use client';

import { useState, useEffect } from 'react';
import { ResultsViewProps, Rating, Comment } from '@/models/Activity';
import DotGrid from './DotGrid';
import CommentPopup from './CommentPopup';

export default function ResultsViewSimple({
  activity,
  isVisible,
  currentUserId,
  onDotClick,
}: ResultsViewProps) {
  const [selectedRating, setSelectedRating] = useState<{ rating: Rating; comment: Comment | undefined } | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Handle dot click: highlight in panel on desktop, popup on mobile
  const handleDotClick = (rating: Rating, comment: Comment | undefined) => {
    if (isDesktop && onDotClick && comment) {
      onDotClick(comment.id);
    } else {
      setSelectedRating({ rating, comment });
    }
  };

  const handleClosePopup = () => {
    setSelectedRating(null);
  };

  if (!isVisible) return null;

  return (
    <div className="h-full flex flex-col items-center justify-center p-4">
      {/* Dot Grid - Square aspect ratio */}
      <div className="w-full max-w-[600px] aspect-square bg-[#111827] border border-white/10 rounded-lg overflow-hidden relative">
        <DotGrid
          activity={activity}
          currentUserId={currentUserId}
          onDotClick={handleDotClick}
        />
      </div>

      {/* Comment Popup (mobile / when no external panel) */}
      {selectedRating && (
        <CommentPopup
          comment={activity.comments.find(c => c.id === selectedRating.comment?.id) ?? selectedRating.comment}
          rating={selectedRating.rating}
          activityId={activity.id}
          currentUserId={currentUserId}
          onClose={handleClosePopup}
          allowSelfVote={activity.maxEntries === 0}
          onVote={() => {
            // Reload activity data would happen via WebSocket in parent component
          }}
        />
      )}
    </div>
  );
}
