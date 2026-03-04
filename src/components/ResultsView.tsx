'use client';

import { useState, useCallback } from 'react';
import { ResultsViewProps } from '@/models/Activity';
import { FormattingService } from '@/utils/formatting';
import MappingGrid from './MappingGrid';
import CommentSection from './CommentSection';

export default function ResultsView({
  activity,
  isVisible,
  onCommentVote,
  currentUserId,
  hoveredSlotNumber,
  sequenceId,
  hideCommentsPanel = false,
  onDotClick,
  externalHoveredCommentId,
}: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'comments'>('map');
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [visibleCommentIds, setVisibleCommentIds] = useState<string[]>([]);
  const [mobilePopupComment, setMobilePopupComment] = useState<string | null>(null);

  // Effective hovered comment: prefer external state (when panel is hidden) over internal
  const effectiveHoveredCommentId = externalHoveredCommentId !== undefined
    ? externalHoveredCommentId
    : hoveredCommentId;

  // Handle comment hover (internal panel)
  const handleCommentHover = useCallback((commentId: string | null) => {
    setHoveredCommentId(commentId);
  }, []);

  // Handle map dot click — works whether or not the internal panel is visible
  const handleMapDotClick = useCallback((commentId: string) => {
    setSelectedCommentId(commentId);
    onDotClick?.(commentId);
  }, [onDotClick]);

  // Handle mobile map dot tap
  const handleMobileMapDotTap = useCallback((commentId: string) => {
    // Use the commentId directly (now passed from MappingGrid)
    if (visibleCommentIds.includes(commentId)) {
      setMobilePopupComment(commentId);
    }
  }, [visibleCommentIds]);

  // Handle visible comments change from CommentSection
  const handleVisibleCommentsChange = useCallback((commentIds: string[]) => {
    setVisibleCommentIds(commentIds);
  }, []);

  // Calculate basic statistics
  const stats = {
    totalParticipants: activity.participants.length,
    totalRatings: activity.ratings.length,
    totalComments: activity.comments.length,
    averagePosition: activity.ratings.length > 0 ? {
      x: activity.ratings.reduce((sum, r) => sum + r.position.x, 0) / activity.ratings.length,
      y: activity.ratings.reduce((sum, r) => sum + r.position.y, 0) / activity.ratings.length,
    } : null,
  };

  return (
    <div className="h-full flex flex-col">

      {/* Results Content */}
      {isVisible && (
        <div className="h-full flex flex-col bg-transparent lg:p-0">
          {/* Desktop: Side-by-side layout, Mobile: Tab Navigation */}
          <div className="lg:hidden">
            {/* Mobile Tab Navigation */}
            <div className="flex justify-center mb-2">
              <div className="flex bg-[#111827] rounded-lg p-1 border border-white/10">
                <button
                  onClick={() => setActiveTab('map')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    activeTab === 'map' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'
                  }`}
                  style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                >
                  Map View
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    activeTab === 'comments' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'
                  }`}
                  style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                >
                  Comments
                </button>
              </div>
            </div>

            {/* Mobile Tab Content */}
            <div className="bg-transparent rounded-lg p-2">
              {activeTab === 'map' && (
                <div>
                  {/* Mobile Map Title */}
                  <div className="flex justify-center mb-2">
                    <div className="bg-[#111827] px-3 py-2 rounded-lg border border-white/10">
                      <h3 className="text-sm font-semibold text-white text-center" style={{ fontSize: 'clamp(0.8rem, 3vw, 0.9rem)', lineHeight: '1.2' }}>
                        {activity.xAxis.label} vs {activity.yAxis.label}
                      </h3>
                    </div>
                  </div>
                  
                  {stats.totalRatings > 0 ? (
                    <MappingGrid
                      activity={activity}
                      onRatingSubmit={() => {}} // No submission in results view
                      showAllRatings={true}
                      hoveredCommentId={effectiveHoveredCommentId}
                      onDotClick={handleMobileMapDotTap}
                      visibleCommentIds={visibleCommentIds}
                      hoveredSlotNumber={hoveredSlotNumber}
                      currentUserId={currentUserId}
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-300">
                      <svg
                        className="w-12 h-12 mx-auto mb-4 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <p>No ratings submitted yet</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <div>
                  {/* Mobile Comments Title */}
                  <p className="text-center text-white font-bold mb-3 px-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                    {activity.commentQuestion}
                  </p>
                  
                  <CommentSection
                    activity={activity}
                    onCommentSubmit={() => {}} // No submission in results view
                    onCommentVote={onCommentVote}
                    showAllComments={true}
                    readOnly={true}
                    currentUserId={currentUserId}
                    onCommentHover={handleCommentHover}
                    selectedCommentId={selectedCommentId}
                    onSelectedCommentChange={setSelectedCommentId}
                    onVisibleCommentsChange={handleVisibleCommentsChange}
                    sequenceId={sequenceId}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile Comment Popup */}
          {mobilePopupComment && (
            <div
              className="lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setMobilePopupComment(null)}
            >
              <div
                className="bg-[#252120] border border-[rgba(215,205,195,0.12)] rounded-lg p-6 max-w-md w-full shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const comment = activity.comments.find(c => c.id === mobilePopupComment);
                  if (!comment) return null;

                  const rating = activity.ratings.find(r =>
                    r.userId === comment.userId && (r.slotNumber || 1) === (comment.slotNumber || 1)
                  );
                  const displayName = comment.objectName || rating?.objectName || comment.username;
                  const isOwnComment = comment.userId === currentUserId;
                  const hasVoted = comment.votes?.some(v => v.userId === currentUserId) || false;
                  const canVote = onCommentVote && currentUserId && (activity.maxEntries === 0 || !isOwnComment);

                  return (
                    <div>
                      {/* Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-[#F5F0EB] font-bold text-lg" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase' }}>{displayName}</h3>
                          {isOwnComment && (
                            <span className="text-[#C83B50]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em' }}>(Your response)</span>
                          )}
                        </div>
                        <button
                          onClick={() => setMobilePopupComment(null)}
                          className="text-[#7A7068] hover:text-[#F5F0EB] transition text-2xl leading-none"
                        >
                          &#x2715;
                        </button>
                      </div>

                      {/* Comment text */}
                      <div className="bg-[#1A1714] border border-[rgba(215,205,195,0.12)] rounded-lg p-4 mb-4">
                        <p className="text-[#F5F0EB] text-base leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'var(--font-cormorant), Georgia, serif' }}>{comment.text}</p>
                      </div>

                      {/* Vote + timestamp */}
                      <div className="flex items-center justify-between">
                        <div className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                          <span className="font-semibold">{comment.voteCount || 0}</span> {comment.voteCount === 1 ? 'vote' : 'votes'}
                        </div>
                        {canVote ? (
                          <button
                            onClick={async () => {
                              try { await onCommentVote!(comment.id); } catch (e) { console.error('Vote failed:', e); }
                            }}
                            className={`px-4 py-2 rounded-lg font-medium transition ${hasVoted ? 'bg-emerald-600 text-white hover:bg-red-600' : 'bg-[#C83B50] hover:bg-[#B03248] text-white'}`}
                            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                          >
                            {hasVoted ? '\u2713 Voted' : 'Vote'}
                          </button>
                        ) : null}
                      </div>

                      {/* Timestamp */}
                      <div className="mt-4 pt-4 border-t border-[rgba(215,205,195,0.12)]">
                        <p className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em' }}>
                          {FormattingService.formatTimestamp(comment.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Desktop Side-by-side Layout */}
          <div className="hidden lg:flex lg:gap-0 lg:h-full">
            {/* Left: Map - takes remaining space */}
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center">
                {/* Map Title */}
                <div className="mb-4">
                  <div className="bg-[#111827] px-6 py-3 rounded-lg border border-white/10">
                    <h3 className="text-xl font-semibold text-white text-center">
                      {activity.xAxis.label} vs {activity.yAxis.label}
                    </h3>
                  </div>
                </div>

                {stats.totalRatings > 0 ? (
                  <MappingGrid
                    activity={activity}
                    onRatingSubmit={() => {}} // No submission in results view
                    showAllRatings={true}
                    hoveredCommentId={effectiveHoveredCommentId}
                    onDotClick={handleMapDotClick}
                    visibleCommentIds={visibleCommentIds}
                    hoveredSlotNumber={hoveredSlotNumber}
                    currentUserId={currentUserId}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-300" style={{ width: 'min(500px, 90vw)', height: 'min(500px, 90vw)' }}>
                    <svg
                      className="w-12 h-12 mx-auto mb-4 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <p>No ratings submitted yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Full-height Comments Panel - Only show if not hidden */}
            {!hideCommentsPanel && (
              <div className="w-[400px] flex-shrink-0 bg-[#111827] border-l border-white/10 flex flex-col h-full">
                {/* Comments Title - Inside panel at top */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-white/10">
                  <h3 className="text-xl font-semibold text-white text-center">
                    {activity.commentQuestion}
                  </h3>
                </div>

                {/* Comments Content - Scrollable */}
                <div className="flex-1 overflow-hidden p-4">
                  <CommentSection
                    activity={activity}
                    onCommentSubmit={() => {}} // No submission in results view
                    onCommentVote={onCommentVote}
                    showAllComments={true}
                    readOnly={true}
                    currentUserId={currentUserId}
                    onCommentHover={handleCommentHover}
                    selectedCommentId={selectedCommentId}
                    onSelectedCommentChange={setSelectedCommentId}
                    onVisibleCommentsChange={handleVisibleCommentsChange}
                    sequenceId={sequenceId}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}