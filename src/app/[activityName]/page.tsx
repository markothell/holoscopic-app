'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WeAllExplainActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import ActivityPage from '@/components/ActivityPage';
import { OfflineStorage } from '@/hooks/useLocalStorage';
import Link from 'next/link';

export default function ActivityByNamePage() {
  const params = useParams();
  const activityName = params.activityName as string;
  
  const [activity, setActivity] = useState<WeAllExplainActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    const loadActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get activity by URL name
        const foundActivity = await ActivityService.getActivityByUrlName(activityName);
        
        if (foundActivity) {
          setActivity(foundActivity);
          // Track this activity as recently visited
          OfflineStorage.addRecentActivity(foundActivity.id);
        } else {
          setError('Activity not found');
        }
      } catch (err) {
        console.error('Error loading activity:', err);
        setError('Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    if (activityName) {
      loadActivity();
    }
  }, [activityName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading activity...</p>
        </div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-8">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-2xl font-semibold text-white mb-2">Activity Not Found</h2>
            <p className="text-gray-300 mb-6">
              The activity "{activityName}" could not be found.
            </p>
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <ActivityPage activityId={activity.id} />;
}