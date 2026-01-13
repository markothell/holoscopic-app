'use client';

import { useState } from 'react';
import { Comment, Rating } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';

interface CommentPopupProps {
  comment: Comment | undefined;
  rating: Rating;
  activityId: string;
  currentUserId?: string;
  onClose: () => void;
  onVote?: () => void;
}

export default function CommentPopup({
  comment,
  rating,
  activityId,
  currentUserId,
  onClose,
  onVote
}: CommentPopupProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(
    comment?.votes?.some(vote => vote.userId === currentUserId) || false
  );

  const handleVote = async () => {
    if (!comment || !currentUserId || isVoting) return;

    setIsVoting(true);
    try {
      await ActivityService.voteComment(activityId, comment.id, currentUserId);
      setHasVoted(!hasVoted); // Toggle vote state
      if (onVote) onVote();
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setIsVoting(false);
    }
  };

  // Don't render if no comment
  if (!comment) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-white font-bold text-lg">No Comment</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-300">This participant hasn't added a comment yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-lg p-6 max-w-md w-full shadow-xl border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with object name */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-white font-bold text-lg">{rating.objectName}</h3>
            {rating.userId === currentUserId && (
              <span className="text-xs text-blue-400">(Your response)</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Comment text */}
        <div className="bg-slate-700 rounded-lg p-4 mb-4">
          <p className="text-white text-base leading-relaxed">{comment.text}</p>
        </div>

        {/* Vote section */}
        <div className="flex items-center justify-between">
          <div className="text-gray-300 text-sm">
            <span className="font-semibold">{comment.voteCount || 0}</span> {comment.voteCount === 1 ? 'vote' : 'votes'}
          </div>

          {currentUserId && rating.userId !== currentUserId && (
            <button
              onClick={handleVote}
              disabled={isVoting}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                hasVoted
                  ? 'bg-green-600 text-white hover:bg-red-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } ${isVoting ? 'opacity-50 cursor-wait' : ''}`}
              title={hasVoted ? 'Click to remove your vote' : 'Click to vote'}
            >
              {hasVoted ? '✓ Voted' : 'Vote'}
            </button>
          )}

          {rating.userId === currentUserId && (
            <span className="text-sm text-gray-400">Can't vote for yourself</span>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-4 pt-4 border-t border-slate-600">
          <p className="text-xs text-gray-500">
            Posted {new Date(comment.timestamp).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
