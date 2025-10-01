'use client';

import { useState, useRef, useEffect } from 'react';
import { Comment, CommentSectionProps, CommentSortOrder } from '@/models/Activity';
import { ValidationService } from '@/utils/validation';
import { FormattingService } from '@/utils/formatting';

export default function CommentSection({ 
  activity, 
  onCommentSubmit, 
  onCommentVote,
  userComment, 
  showAllComments = false,
  readOnly = false,
  currentUserId,
  onCommentHover,
  selectedCommentId,
  onSelectedCommentChange,
  onVisibleCommentsChange
}: CommentSectionProps) {
  const [commentText, setCommentText] = useState(userComment?.text || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Update comment text when userComment prop changes
  useEffect(() => {
    if (userComment?.text) {
      setCommentText(userComment.text);
    } else {
      setCommentText('');
    }
  }, [userComment]);

  // Get user's object name from their rating or comment
  const getUserObjectName = (userId: string): string | null => {
    const userRating = activity.ratings.find(r => r.userId === userId);
    if (userRating?.objectName) return userRating.objectName;
    
    const userComment = activity.comments.find(c => c.userId === userId);
    if (userComment?.objectName) return userComment.objectName;
    
    return null;
  };

  // Notify parent of visible comments when sort order changes
  useEffect(() => {
    if (onVisibleCommentsChange) {
      const comments = [...activity.comments];
      let visibleComments: Comment[] = [];
      
      switch (sortOrder) {
        case 'newest':
          visibleComments = comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          break;
        case 'oldest':
          visibleComments = comments.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          break;
        case 'votes':
          visibleComments = comments.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
          break;
        default:
          visibleComments = comments.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
      
      onVisibleCommentsChange(visibleComments.map(c => c.id));
    }
  }, [sortOrder, activity.comments, activity.ratings, onVisibleCommentsChange]);

  // Scroll to selected comment
  useEffect(() => {
    if (selectedCommentId && commentRefs.current[selectedCommentId]) {
      // Only scroll within the comment container, not the whole page
      const commentElement = commentRefs.current[selectedCommentId];
      const container = commentElement?.closest('.overflow-y-auto');
      
      if (container && commentElement) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = commentElement.getBoundingClientRect();
        
        // Check if element is already visible in container
        const isVisible = elementRect.top >= containerRect.top && 
                         elementRect.bottom <= containerRect.bottom;
        
        if (!isVisible) {
          // Scroll within container only
          const scrollTop = elementRect.top - containerRect.top + container.scrollTop - 
                           (containerRect.height - elementRect.height) / 2;
          container.scrollTo({
            top: scrollTop,
            behavior: 'smooth'
          });
        }
      }
      
      // Clear selection after highlighting
      setTimeout(() => {
        onSelectedCommentChange?.(null);
      }, 1000);
    }
  }, [selectedCommentId, onSelectedCommentChange]);

  // Handle mobile keyboard visibility
  useEffect(() => {
    const handleResize = () => {
      const heightDiff = window.screen.height - window.innerHeight;
      const isKeyboard = heightDiff > 150; // Threshold for keyboard detection
      setIsKeyboardVisible(isKeyboard);
    };

    const handleFocus = () => {
      setIsKeyboardVisible(true);
      // Scroll textarea into view after keyboard appears
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 300); // Give keyboard time to appear
    };

    const handleBlur = () => {
      setTimeout(() => setIsKeyboardVisible(false), 100);
    };

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('focus', handleFocus);
      textarea.addEventListener('blur', handleBlur);
    }

    window.addEventListener('resize', handleResize);
    
    return () => {
      if (textarea) {
        textarea.removeEventListener('focus', handleFocus);
        textarea.removeEventListener('blur', handleBlur);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
    } catch {
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

  // Get user color based on their rating position (matching by userId and slotNumber)
  const getUserColor = (comment: Comment) => {
    const userRating = activity.ratings.find(r =>
      r.userId === comment.userId && (r.slotNumber || 1) === (comment.slotNumber || 1)
    );
    if (userRating) {
      const quadrant = ValidationService.getQuadrant(userRating.position);
      return ValidationService.getQuadrantColor(quadrant);
    }
    // Fallback to username-based color for backward compatibility
    return FormattingService.generateColorFromString(comment.username);
  };

  // Get display name for comment (object name or username)
  const getDisplayName = (comment: Comment) => {
    // Use objectName if available
    if (comment.objectName) {
      return comment.objectName;
    }
    
    // Try to get objectName from user's rating
    const objectName = getUserObjectName(comment.userId);
    if (objectName) {
      return objectName;
    }
    
    // Fallback to username for backward compatibility
    return comment.username;
  };

  // Handle comment voting
  const handleVote = async (commentId: string) => {
    if (onCommentVote) {
      try {
        await onCommentVote(commentId);
      } catch {
        console.error('Vote failed');
      }
    }
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
        <form onSubmit={handleSubmit} className={`space-y-3 flex flex-col items-center px-4 ${isKeyboardVisible ? 'pb-4' : ''}`}>
          <div className="relative w-full max-w-[500px]">
            <textarea
              ref={textareaRef}
              value={commentText}
              onChange={handleTextChange}
              placeholder="Share your thoughts..."
              className="w-full p-3 border border-slate-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-black bg-slate-300"
              style={{ 
                height: isKeyboardVisible ? '120px' : '150px', // Smaller when keyboard is visible
                fontSize: '16px' // Prevents zoom on iOS
              }}
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
          {/* Sort Dropdown and Vote Counter */}
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            {/* Vote Counter - Left side - Show if vote limit is configured */}
            {activity.votesPerUser !== null && activity.votesPerUser !== undefined && currentUserId && (() => {
              const votedCommentIds = activity.comments.filter(c =>
                c.votes.some(v => v.userId === currentUserId)
              ).length;
              const remainingVotes = Math.max(0, activity.votesPerUser - votedCommentIds);
              return (
                <div className={`px-3 py-1 rounded text-sm font-medium ${
                  remainingVotes > 0 ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-200'
                }`}>
                  {remainingVotes > 0
                    ? `${remainingVotes} vote${remainingVotes !== 1 ? 's' : ''} left`
                    : 'No votes left'}
                </div>
              );
            })()}

            {!readOnly && (
              <h4 className="font-semibold text-gray-800">
                {FormattingService.formatCommentCount(activity.comments.length)}
              </h4>
            )}

            {/* Sort Dropdown - Right side */}
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
              </select>
            </div>
          </div>
          
          {/* Comments or No Comments Message */}
          {activity.comments.length > 0 ? (
            <div className={`space-y-3 overflow-y-auto ${readOnly ? "flex-1 min-h-0" : "max-h-60"}`}>
              {getSortedComments().map((comment) => {
                return (
                  <div
                    key={comment.id}
                    ref={(el) => { commentRefs.current[comment.id] = el; }}
                    className={`p-3 rounded-lg border-l-4 transition-all duration-200 ${
                      readOnly ? "bg-slate-600" : "bg-gray-50"
                    } ${selectedCommentId === comment.id ? 'ring-2 ring-blue-500' : ''}`}
                    style={{ borderLeftColor: getUserColor(comment) }}
                    onMouseEnter={() => onCommentHover?.(comment.id)}
                    onMouseLeave={() => onCommentHover?.(null)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span 
                        className="font-medium text-sm"
                        style={{ color: getUserColor(comment) }}
                      >
                        {getDisplayName(comment)}
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
                );
              })}
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