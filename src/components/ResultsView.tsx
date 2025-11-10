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
  hideCommentsPanel = false
}: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'comments'>('map');
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [visibleCommentIds, setVisibleCommentIds] = useState<string[]>([]);
  const [mobilePopupComment, setMobilePopupComment] = useState<string | null>(null);

  // Handle comment hover
  const handleCommentHover = useCallback((commentId: string | null) => {
    setHoveredCommentId(commentId);
  }, []);

  // Handle map dot click
  const handleMapDotClick = useCallback((commentId: string) => {
    // Use the commentId directly (now passed from MappingGrid)
    if (visibleCommentIds.includes(commentId)) {
      setSelectedCommentId(commentId);
      // Scroll to comment will be handled by CommentSection
    }
  }, [visibleCommentIds]);

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
              <div className="flex bg-white rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setActiveTab('map')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'map'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Map View
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'comments'
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
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
                    <div className="bg-slate-600 px-3 py-2 rounded-lg border border-slate-500">
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
                      hoveredCommentId={hoveredCommentId}
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
                  <div className="flex justify-center mb-2">
                    <div className="bg-slate-600 px-3 py-2 rounded-lg max-w-xs border border-slate-500">
                      <h3 className="text-sm font-semibold text-white text-center" style={{ fontSize: 'clamp(0.8rem, 3vw, 0.9rem)', lineHeight: '1.2' }}>
                        {activity.commentQuestion}
                      </h3>
                    </div>
                  </div>
                  
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
            <div className="lg:hidden fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white bg-opacity-95 backdrop-blur-sm rounded-lg p-6 max-w-sm w-full max-h-[70vh] overflow-y-auto shadow-xl border border-gray-200">
                {(() => {
                  const comment = activity.comments.find(c => c.id === mobilePopupComment);
                  if (!comment) return null;
                  
                  return (
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Comment</h3>
                        <button
                          onClick={() => setMobilePopupComment(null)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: FormattingService.generateColorFromString(comment.username) }}
                          />
                          <span className="font-medium text-sm" style={{ color: FormattingService.generateColorFromString(comment.username) }}>
                            {comment.username}
                          </span>
                        </div>
                        
                        <p className="text-gray-700 text-sm whitespace-pre-wrap">
                          {comment.text}
                        </p>
                        
                        <div className="flex justify-between items-center pt-2 border-t">
                          <span className="text-xs text-gray-500">
                            {FormattingService.formatTimestamp(comment.timestamp)}
                          </span>
                          {onCommentVote && currentUserId ? (
                            <button
                              onClick={async () => {
                                try {
                                  await onCommentVote(comment.id);
                                } catch (error) {
                                  console.error('Vote failed:', error);
                                }
                              }}
                              className="flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                              <span>▲</span>
                              <span>{comment.voteCount || 0}</span>
                            </button>
                          ) : (
                            <div className="flex items-center space-x-1 text-xs text-gray-600">
                              <span>▲</span>
                              <span>{comment.voteCount || 0}</span>
                            </div>
                          )}
                        </div>
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
                  <div className="bg-slate-600 px-6 py-3 rounded-lg border border-slate-500">
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
                    hoveredCommentId={hoveredCommentId}
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
              <div className="w-[400px] flex-shrink-0 bg-slate-700 flex flex-col h-full">
                {/* Comments Title - Inside panel at top */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-slate-600">
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