'use client';

import { useState, useRef, useEffect } from 'react';
import { WeAllExplainActivity, Comment, CommentSectionProps, CommentSortOrder } from '@/models/Activity';
import { ValidationService } from '@/utils/validation';
import { FormattingService } from '@/utils/formatting';

export default function CommentSection({ 
  activity, 
  onCommentSubmit, 
  onCommentVote,
  userComment, 
  showAllComments = false,
  readOnly = false,
  currentUserId
}: CommentSectionProps) {
  const [commentText, setCommentText] = useState(userComment?.text || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Remove auto-resize functionality since we want fixed size

  // Handle comment submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    // Validate comment
    const validation = ValidationService.validateComment(commentText);
    if (!validation.isValid) {
      setValidationError(validation.errors.text);
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      await onCommentSubmit(commentText.trim());
      // Keep the text in the input after submission for editing
    } catch (error) {
      setValidationError('Failed to submit comment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle text change
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommentText(e.target.value);
    setValidationError(null);
  };

  // Get user color
  const getUserColor = (username: string) => FormattingService.generateColorFromString(username);

  // Handle comment voting
  const handleVote = async (commentId: string) => {
    if (onCommentVote) {
      try {
        await onCommentVote(commentId);
      } catch (error) {
        console.error('Vote failed:', error);
      }
    }
  };

  // Get user's quadrant based on their rating
  const getUserQuadrant = (userId: string): string => {
    const userRating = activity.ratings.find(r => r.userId === userId);
    if (!userRating) return 'unknown';
    
    const { x, y } = userRating.position;
    if (x >= 0.5 && y >= 0.5) return 'i';
    if (x < 0.5 && y >= 0.5) return 'ii';
    if (x < 0.5 && y < 0.5) return 'iii';
    if (x >= 0.5 && y < 0.5) return 'iv';
    return 'unknown';
  };

  // Sort comments based on selected order
  const getSortedComments = (): Comment[] => {
    const comments = [...activity.comments];
    
    switch (sortOrder) {
      case 'newest':
        return comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'oldest':
        return comments.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      case 'votes':
        return comments.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
      case 'quadrant-i':
        return comments.filter(c => getUserQuadrant(c.userId) === 'i')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'quadrant-ii':
        return comments.filter(c => getUserQuadrant(c.userId) === 'ii')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'quadrant-iii':
        return comments.filter(c => getUserQuadrant(c.userId) === 'iii')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'quadrant-iv':
        return comments.filter(c => getUserQuadrant(c.userId) === 'iv')
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      default:
        return comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
  };

  // Check if current user has voted on a comment
  const hasUserVoted = (comment: Comment): boolean => {
    if (!currentUserId || !comment.votes) return false;
    return comment.votes.some(vote => vote.userId === currentUserId);
  };

  return (
    <div className={readOnly ? "h-full flex flex-col" : "space-y-4"}>

      {/* Comment Input */}
      {!readOnly && (
        <form onSubmit={handleSubmit} className="space-y-3 flex flex-col items-center px-4">
          <div className="relative w-full max-w-[500px]">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={handleTextChange}
              placeholder="Share your thoughts..."
              className="w-full p-3 border border-slate-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-black bg-slate-300"
              style={{ height: '150px' }}
              maxLength={280}
              disabled={isSubmitting}
            />
            <div className="absolute bottom-2 right-2 text-xs text-gray-500">
              {commentText.length}/280
            </div>
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="text-red-600 text-sm">{validationError}</p>
          )}

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isSubmitting || !commentText.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Submitting...' : userComment ? 'Update Comment' : 'Submit Comment'}
            </button>
          </div>
        </form>
      )}

      {/* All Comments (when showing results) */}
      {showAllComments && (
        <div className={readOnly ? "h-full flex flex-col" : "space-y-3"}>
          {/* Sort Dropdown */}
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            {!readOnly && (
              <h4 className="font-semibold text-gray-800">
                {FormattingService.formatCommentCount(activity.comments.length)}
              </h4>
            )}
            <div className="flex items-center space-x-2">
              <label className={`text-sm font-medium ${readOnly ? "text-gray-300" : "text-gray-700"}`}>
                Order:
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as CommentSortOrder)}
                className={`px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  readOnly 
                    ? "bg-slate-700 border-slate-600 text-gray-200" 
                    : "bg-white border-gray-300 text-gray-900"
                }`}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="votes">Votes</option>
                <option value="quadrant-i">Quadrant I</option>
                <option value="quadrant-ii">Quadrant II</option>
                <option value="quadrant-iii">Quadrant III</option>
                <option value="quadrant-iv">Quadrant IV</option>
              </select>
            </div>
          </div>
          
          {/* Comments or No Comments Message */}
          {activity.comments.length > 0 ? (
            <div className={`space-y-3 overflow-y-auto ${readOnly ? "flex-1 min-h-0" : "max-h-60"}`}>
              {getSortedComments().map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-lg border-l-4 ${readOnly ? "bg-slate-600" : "bg-gray-50"}`}
                    style={{ borderLeftColor: getUserColor(comment.username) }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span 
                        className="font-medium text-sm"
                        style={{ color: getUserColor(comment.username) }}
                      >
                        {comment.username}
                      </span>
                      <div className="flex flex-col items-end space-y-1">
                        {/* Upvote Button */}
                        {showAllComments && onCommentVote && (
                          <button
                            onClick={() => handleVote(comment.id)}
                            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                              hasUserVoted(comment)
                                ? readOnly 
                                  ? "bg-blue-900 text-blue-300 hover:bg-blue-800"
                                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                : readOnly
                                  ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                            disabled={!currentUserId}
                          >
                            <span className="text-base">▲</span>
                            <span>{comment.voteCount || 0}</span>
                          </button>
                        )}
                        {/* Vote count for when no vote handler */}
                        {showAllComments && !onCommentVote && (
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                            readOnly ? "bg-slate-700 text-gray-300" : "bg-gray-100 text-gray-600"
                          }`}>
                            <span className="text-base">▲</span>
                            <span>{comment.voteCount || 0}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className={`text-sm whitespace-pre-wrap mb-2 ${readOnly ? "text-gray-100" : "text-gray-700"}`}>
                      {comment.text}
                    </p>
                    {/* Timestamp moved to bottom */}
                    <div className="flex justify-end">
                      <span className={`text-xs ${readOnly ? "text-gray-300" : "text-gray-500"}`}>
                        {FormattingService.formatTimestamp(comment.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className={`text-center py-8 ${readOnly ? "text-gray-300 flex-1 flex items-center justify-center" : "text-gray-500"}`}>
              <p>No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}