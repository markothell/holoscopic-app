'use client';

import { useState, useRef, useEffect } from 'react';
import { ActivityEntry, CommentSectionProps, CommentSortOrder, commentEntries, positionedEntries, entryTimestamp } from '../types/Activity';
import { ValidationService } from '../utils/validation';
import { FormattingService } from '../utils/formatting';

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
  onVisibleCommentsChange,
  gameSlug,
  filterCommentIds,
}: CommentSectionProps) {
  const [commentText, setCommentText] = useState(userComment?.text || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<CommentSortOrder>('newest');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const comments = commentEntries(activity);

  // Update comment text when userComment prop changes
  useEffect(() => {
    if (userComment?.text) {
      setCommentText(userComment.text);
    } else {
      setCommentText('');
    }
  }, [userComment]);

  const sortComments = (list: ActivityEntry[]): ActivityEntry[] => {
    const sorted = [...list];
    switch (sortOrder) {
      case 'oldest':
        return sorted.sort((a, b) => entryTimestamp(a).getTime() - entryTimestamp(b).getTime());
      case 'votes':
        return sorted.sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
      case 'newest':
      default:
        return sorted.sort((a, b) => entryTimestamp(b).getTime() - entryTimestamp(a).getTime());
    }
  };

  // Notify parent of visible comments when sort order changes
  useEffect(() => {
    if (onVisibleCommentsChange) {
      onVisibleCommentsChange(sortComments(comments).map(c => c.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, activity.entries, onVisibleCommentsChange]);

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

  // Get user color based on the entry's position (or question color for snapshot)
  const getUserColor = (entry: ActivityEntry) => {
    // Snapshot: use the question's color
    if (entry.questionId && activity.snapshotQuestions) {
      const question = activity.snapshotQuestions.find(q => q.id === entry.questionId);
      if (question?.color) return question.color;
    }
    if (entry.position) {
      const quadrant = ValidationService.getQuadrant(entry.position);
      return ValidationService.getQuadrantColor(quadrant);
    }
    return FormattingService.generateColorFromString(entry.username);
  };

  // Get display name for comment (object name or username)
  const getDisplayName = (entry: ActivityEntry) => {
    if (entry.objectName) return entry.objectName;
    // Any of the author's entries may carry the object name
    const named = positionedEntries(activity).find(e => e.userId === entry.userId && e.objectName);
    return named?.objectName || entry.username;
  };

  // Handle comment voting
  const handleVote = async (entryId: string) => {
    if (onCommentVote) {
      try {
        await onCommentVote(entryId);
      } catch {
        console.error('Vote failed');
      }
    }
  };

  // Sort comments based on selected order, applying quadrant filter if set
  const getSortedComments = (): ActivityEntry[] => {
    let list = comments;
    if (filterCommentIds != null) {
      const idSet = new Set(filterCommentIds);
      list = list.filter(c => idSet.has(c.id));
    }
    return sortComments(list);
  };

  // Check if current user has voted on a comment
  const hasUserVoted = (entry: ActivityEntry): boolean => {
    if (!currentUserId) return false;
    return (entry.voterIds || []).includes(currentUserId);
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
              className="w-full p-3 border border-[var(--border-default)] rounded-lg focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none text-[var(--text-primary)] bg-[var(--bg-primary)]"
              style={{
                height: isKeyboardVisible ? '120px' : '150px', // Smaller when keyboard is visible
                fontSize: '16px', // Prevents zoom on iOS
                fontFamily: 'var(--font-cormorant), Georgia, serif',
              }}
              maxLength={280}
              disabled={isSubmitting}
            />
            <div className="absolute bottom-2 right-2 text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.5rem' }}>
              {commentText.length}/280
            </div>
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="text-[var(--accent)] text-sm">{validationError}</p>
          )}

          {/* Submit Button */}
          <div className="flex justify-center">
            <button
              type="submit"
              disabled={isSubmitting || !commentText.trim()}
              className="px-6 py-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase' }}
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
            {/* Vote Counter - Left side - Show if vote limit is configured (not for solo tracker mode) */}
            {activity.maxEntries !== 0 && activity.votesPerUser !== null && activity.votesPerUser !== undefined && currentUserId && (() => {
              const votedCount = (activity.entries || []).filter(e =>
                (e.voterIds || []).includes(currentUserId)
              ).length;
              const remainingVotes = Math.max(0, activity.votesPerUser - votedCount);
              return (
                <div
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    remainingVotes > 0 ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                  }`}
                  style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em' }}
                >
                  {remainingVotes > 0
                    ? `${remainingVotes} vote${remainingVotes !== 1 ? 's' : ''} left`
                    : 'No votes left'}
                </div>
              );
            })()}

            {!readOnly && (
              <h4 className="font-semibold text-[var(--text-secondary)]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {FormattingService.formatCommentCount(comments.length)}
              </h4>
            )}

            {/* Sort Dropdown - Right side */}
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Order:
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as CommentSortOrder)}
                className="px-3 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-[var(--bg-primary)] border-[var(--border-default)] text-[var(--text-secondary)]"
                style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem' }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="votes">Votes</option>
              </select>
            </div>
          </div>

          {/* Comments or No Comments Message */}
          {comments.length > 0 ? (
            <div className={`space-y-3 overflow-y-auto ${readOnly ? "flex-1 min-h-0" : "max-h-60"}`}>
              {getSortedComments().map((comment) => {
                return (
                  <div
                    key={comment.id}
                    ref={(el) => { commentRefs.current[comment.id] = el; }}
                    className={`p-3 rounded-lg border-l-4 border border-[var(--border-default)] shadow-sm transition-all duration-200 bg-[var(--bg-secondary)] ${selectedCommentId === comment.id ? 'ring-2 ring-[var(--accent)]' : ''}`}
                    style={{ borderLeftColor: getUserColor(comment) }}
                    onMouseEnter={() => onCommentHover?.(comment.id)}
                    onMouseLeave={() => onCommentHover?.(null)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span
                        className="font-medium text-sm"
                        style={{ color: getUserColor(comment), fontFamily: 'var(--font-barlow), sans-serif', fontWeight: 600 }}
                      >
                        {getDisplayName(comment)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {/* Profile Icon — links to the author's game-scoped profile */}
                        {activity.showProfileLinks !== false && comment.userId && !comment.isSeed && !comment.userId.startsWith('anon_') && gameSlug && (
                          <a
                            href={`/profile/${comment.userId}?game=${gameSlug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-center transition-opacity hover:opacity-80 opacity-90"
                            title="View profile"
                          >
                            <img
                              src="/profile_icon.svg"
                              alt="Profile"
                              className="w-6 h-6"
                            />
                          </a>
                        )}
                        {/* Upvote Button — visible for all comments in solo tracker mode, hidden for own comments otherwise */}
                        {showAllComments && onCommentVote && (activity.maxEntries === 0 || comment.userId !== currentUserId) && (
                          <button
                            onClick={() => handleVote(comment.id)}
                            className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
                              hasUserVoted(comment)
                                ? "bg-[rgba(200,59,80,0.2)] text-[var(--accent)] hover:bg-[rgba(200,59,80,0.3)]"
                                : "bg-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--border-strong)]"
                            }`}
                            disabled={!currentUserId}
                          >
                            <span className="text-base">&#x25B2;</span>
                            <span>{comment.voteCount || 0}</span>
                          </button>
                        )}
                        {/* Vote count display for own comments (standard mode only) */}
                        {showAllComments && onCommentVote && activity.maxEntries !== 0 && comment.userId === currentUserId && (
                          <div className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-[var(--border-subtle)] text-[var(--text-muted)]">
                            <span className="text-base">&#x25B2;</span>
                            <span>{comment.voteCount || 0}</span>
                          </div>
                        )}
                        {/* Vote count for when no vote handler */}
                        {showAllComments && !onCommentVote && (
                          <div className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-[var(--border-subtle)] text-[var(--text-secondary)]">
                            <span className="text-base">&#x25B2;</span>
                            <span>{comment.voteCount || 0}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap mb-2 text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>
                      {comment.text}
                    </p>
                    {/* Timestamp moved to bottom */}
                    <div className="flex justify-end">
                      <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.5rem', letterSpacing: '0.06em' }}>
                        {FormattingService.formatTimestamp(entryTimestamp(comment))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`text-center py-8 ${readOnly ? "text-[var(--text-secondary)] flex-1 flex items-center justify-center" : "text-[var(--text-muted)]"}`} style={{ fontFamily: 'var(--font-cormorant), Georgia, serif', fontStyle: 'italic' }}>
              <p>No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
