'use client';

import { useState } from 'react';
import { ResultsViewProps, Rating, Comment } from '@/models/Activity';
import DotGrid from './DotGrid';
import CommentPopup from './CommentPopup';

export default function ResultsViewSimple({
  activity,
  isVisible,
  currentUserId,
}: ResultsViewProps) {
  const [selectedRating, setSelectedRating] = useState<{ rating: Rating; comment: Comment | undefined } | null>(null);

  // Handle dot click
  const handleDotClick = (rating: Rating, comment: Comment | undefined) => {
    setSelectedRating({ rating, comment });
  };

  // Handle popup close
  const handleClosePopup = () => {
    setSelectedRating(null);
  };

  // Calculate basic statistics
  const stats = {
    totalParticipants: activity.participants.length,
    totalRatings: activity.ratings.length,
    totalComments: activity.comments.length,
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

      {/* Comment Popup */}
      {selectedRating && (
        <CommentPopup
          comment={selectedRating.comment}
          rating={selectedRating.rating}
          activityId={activity.id}
          currentUserId={currentUserId}
          onClose={handleClosePopup}
          onVote={() => {
            // Reload activity data would happen via WebSocket in parent component
          }}
        />
      )}
    </div>
  );
}
