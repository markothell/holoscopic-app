'use client';

import { useState } from 'react';
import { WeAllExplainActivity, ResultsViewProps } from '@/models/Activity';
import { FormattingService } from '@/utils/formatting';
import MappingGrid from './MappingGrid';
import CommentSection from './CommentSection';

export default function ResultsView({ 
  activity, 
  isVisible, 
  onToggle,
  onCommentVote,
  currentUserId
}: ResultsViewProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'comments'>('map');

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
    <div className="space-y-4">

      {/* Results Content */}
      {isVisible && (
        <div className="space-y-6 bg-transparent p-6 rounded-lg">
          {/* Results Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{activity.title}</h2>
            <div className="flex justify-center text-sm text-gray-300">
              <span>{FormattingService.formatParticipantCount(stats.totalParticipants)}</span>
            </div>
          </div>


          {/* Desktop: Side-by-side layout, Mobile: Tab Navigation */}
          <div className="lg:hidden">
            {/* Mobile Tab Navigation */}
            <div className="flex justify-center mb-6">
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
            <div className="bg-transparent rounded-lg p-6">
              {activeTab === 'map' && (
                <div>
                  {stats.totalRatings > 0 ? (
                    <MappingGrid
                      activity={activity}
                      onRatingSubmit={() => {}} // No submission in results view
                      showAllRatings={true}
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
                <CommentSection
                  activity={activity}
                  onCommentSubmit={() => {}} // No submission in results view
                  onCommentVote={onCommentVote}
                  showAllComments={true}
                  readOnly={false}
                  currentUserId={currentUserId}
                />
              )}
            </div>
          </div>

          {/* Desktop Side-by-side Layout */}
          <div className="hidden lg:flex lg:gap-8 lg:justify-center lg:items-start">
            {/* Left: Map */}
            <div className="flex-shrink-0">
              {stats.totalRatings > 0 ? (
                <MappingGrid
                  activity={activity}
                  onRatingSubmit={() => {}} // No submission in results view
                  showAllRatings={true}
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

            {/* Right: Narrow Comments */}
            <div className="w-96 flex-shrink-0 min-h-0" style={{ marginTop: '2.5rem' }}>
              <div className="bg-slate-700 rounded-lg p-4 overflow-hidden w-full" style={{ height: 'min(500px, 90vw)' }}>
                <CommentSection
                  activity={activity}
                  onCommentSubmit={() => {}} // No submission in results view
                  onCommentVote={onCommentVote}
                  showAllComments={true}
                  readOnly={true}
                  currentUserId={currentUserId}
                />
              </div>
            </div>
          </div>

          {/* Activity Status */}
          <div className="text-center">
            <div className="flex justify-center items-center gap-2 text-sm">
              <div 
                className={`w-2 h-2 rounded-full ${
                  activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="text-gray-300">
                Activity {activity.status === 'active' ? 'Active' : 'Completed'}
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">
                Created {FormattingService.formatTimestamp(activity.createdAt)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}