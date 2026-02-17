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
        <div className="bg-[#252120] border border-[rgba(215,205,195,0.12)] rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-[#F5F0EB] font-bold text-lg" style={{ fontFamily: 'var(--font-barlow), sans-serif' }}>No Comment</h3>
            <button
              onClick={onClose}
              className="text-[#7A7068] hover:text-[#F5F0EB] transition"
            >
              &#x2715;
            </button>
          </div>
          <p className="text-[#7A7068]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>This participant hasn&apos;t added a comment yet.</p>
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
        className="bg-[#252120] rounded-lg p-6 max-w-md w-full shadow-xl border border-[rgba(215,205,195,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with object name */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-[#F5F0EB] font-bold text-lg" style={{ fontFamily: 'var(--font-barlow), sans-serif' }}>{rating.objectName}</h3>
            {rating.userId === currentUserId && (
              <span className="text-xs text-[#C83B50]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em' }}>(Your response)</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#7A7068] hover:text-[#F5F0EB] transition text-2xl leading-none"
          >
            &#x2715;
          </button>
        </div>

        {/* Comment text */}
        <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] rounded-lg p-4 mb-4">
          <p className="text-[#F5F0EB] text-base leading-relaxed" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{comment.text}</p>
        </div>

        {/* Vote section */}
        <div className="flex items-center justify-between">
          <div className="text-[#7A7068] text-sm" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
            <span className="font-semibold">{comment.voteCount || 0}</span> {comment.voteCount === 1 ? 'vote' : 'votes'}
          </div>

          {currentUserId && rating.userId !== currentUserId && (
            <button
              onClick={handleVote}
              disabled={isVoting}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                hasVoted
                  ? 'bg-emerald-600 text-white hover:bg-red-600'
                  : 'bg-[#C83B50] hover:bg-[#B03248] text-white'
              } ${isVoting ? 'opacity-50 cursor-wait' : ''}`}
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              title={hasVoted ? 'Click to remove your vote' : 'Click to vote'}
            >
              {hasVoted ? '\u2713 Voted' : 'Vote'}
            </button>
          )}

          {rating.userId === currentUserId && (
            <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em' }}>Can&apos;t vote for yourself</span>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-4 pt-4 border-t border-[rgba(215,205,195,0.12)]">
          <p className="text-xs text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em' }}>
            Posted {new Date(comment.timestamp).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
