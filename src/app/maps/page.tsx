'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ActivityService } from '@/services/activityService';
import { HoloscopicActivity } from '@/models/Activity';
import { FormattingService } from '@/utils/formatting';
import { useAllAnalytics } from '@/hooks/useAnalytics';
import UserMenu from '@/components/UserMenu';

export default function MapsPage() {
  const [activities, setActivities] = useState<HoloscopicActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { allStats } = useAllAnalytics();

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const activitiesData = await ActivityService.getActivities();
      // Only show published activities
      const publishedActivities = activitiesData.filter(a => !a.isDraft);
      setActivities(publishedActivities);
    } catch (err) {
      setError('Failed to load activities');
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActivityStats = (activityId: string) => {
    return allStats?.[activityId] || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55]">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/">
                <Image
                  src="/holoLogo_dark.svg"
                  alt="Holoscopic Logo"
                  width={32}
                  height={32}
                  className="sm:w-10 sm:h-10 hover:opacity-80 transition-opacity"
                />
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Maps</h1>
            </div>
            <UserMenu />
          </div>
        </div>

        {error && (
          <div className="text-center py-8">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={loadActivities}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {activities.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-6">
              No public activities available yet
            </div>
            <Link
              href="/admin"
              className="inline-block px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Create First Map
            </Link>
          </div>
        )}

        {activities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map(activity => {
              const stats = getActivityStats(activity.id);
              return (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName}`}
                  className="block bg-slate-800 rounded-lg p-6 hover:bg-slate-700 transition-colors group"
                >
                  <h2 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-300 transition-colors">
                    {activity.title}
                  </h2>
                  {activity.preamble && (
                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                      {activity.preamble}
                    </p>
                  )}
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>Created {FormattingService.formatTimestamp(activity.createdAt)}</div>
                    {stats && (
                      <div className="flex gap-3 mt-2 text-gray-400">
                        <span>{stats.participants} participants</span>
                        <span>{stats.comments} comments</span>
                      </div>
                    )}
                  </div>
                  {activity.status === 'active' && (
                    <span className="inline-block mt-3 px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-300">
                      Open
                    </span>
                  )}
                  {activity.status === 'completed' && (
                    <span className="inline-block mt-3 px-2 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-300">
                      Completed
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}