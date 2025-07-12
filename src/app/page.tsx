'use client';

import { useState, useEffect } from 'react';
import { WeAllExplainActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useRecentActivities } from '@/hooks/useLocalStorage';
import Link from 'next/link';

export default function HomePage() {
  const [activities, setActivities] = useState<WeAllExplainActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { value: recentActivities } = useRecentActivities();

  // Load activities
  useEffect(() => {
    const loadActivities = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const activitiesData = await ActivityService.getActivities();
        setActivities(activitiesData);
      } catch (err) {
        setError('Failed to load activities');
        console.error('Error loading activities:', err);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, []);

  // Filter recent activities
  const recentActivityData = recentActivities
    ? activities.filter(activity => recentActivities.includes(activity.id))
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            We All Explain
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Collaborative perspective mapping for better understanding
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/admin"
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Create Activity
            </Link>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Recent Activities */}
        {recentActivityData.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Recent Activities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentActivityData.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        )}

        {/* All Activities */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">
            {recentActivityData.length > 0 ? 'All Activities' : 'Activities'}
          </h2>
          
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-600 mb-2">No activities yet</h3>
              <p className="text-gray-500 mb-6">Create your first collaborative mapping activity to get started.</p>
              <Link
                href="/admin"
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Create Activity
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm">
          <p>We All Explain - Collaborative Perspective Mapping</p>
        </div>
      </div>
    </div>
  );
}

// Activity Card Component
interface ActivityCardProps {
  activity: WeAllExplainActivity;
}

function ActivityCard({ activity }: ActivityCardProps) {
  const participantCount = activity.participants.length;
  const ratingCount = activity.ratings.length;
  const commentCount = activity.comments.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="p-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${activity.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600 capitalize">{activity.status}</span>
          </div>
          <span className="text-xs text-gray-500">
            {FormattingService.formatTimestamp(activity.createdAt)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          {activity.title}
        </h3>

        {/* Map Question */}
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {activity.mapQuestion}
        </p>

        {/* Stats */}
        <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
          <span>{FormattingService.formatParticipantCount(participantCount)}</span>
          <span>{FormattingService.formatRatingCount(ratingCount)}</span>
          <span>{FormattingService.formatCommentCount(commentCount)}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/activity/${activity.id}`}
            className="flex-1 px-4 py-2 bg-blue-500 text-white text-center rounded-lg hover:bg-blue-600 transition-colors text-sm"
          >
            Join Activity
          </Link>
          <Link
            href={`/admin?activity=${activity.id}`}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}