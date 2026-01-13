'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { useAuth } from '@/contexts/AuthContext';
import ActivityRouter from './activities/ActivityRouter';
import Image from 'next/image';

interface ActivityPageProps {
  activityId: string;
  sequenceId?: string;
}

/**
 * ActivityPage - Loads an activity and routes to the appropriate activity type component
 *
 * This component handles:
 * 1. Loading the activity data from the API
 * 2. Auth checks for private activities
 * 3. Routing to the correct activity component based on activityType
 */
export default function ActivityPage({ activityId, sequenceId }: ActivityPageProps) {
  const { userId, isLoading: authLoading, isAuthenticated } = useAuth();
  const [activity, setActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load activity data
  useEffect(() => {
    const loadActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        const activityData = await ActivityService.getActivity(activityId);
        setActivity(activityData);
      } catch (err) {
        setError('Failed to load activity. Please try again.');
        console.error('Error loading activity:', err);
      } finally {
        setLoading(false);
      }
    };

    if (activityId && userId) {
      loadActivity();
    }
  }, [activityId, userId]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading activity...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Activity not found
  if (!activity) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Activity Not Found</h2>
          <p className="text-gray-600">The activity you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  // Auth check - private activities require authentication (not just anonymous ID)
  if (!activity.isPublic && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-800 rounded-lg shadow-xl p-8 text-center">
          <Image
            src="/holoLogo_dark.svg"
            alt="Holoscopic Logo"
            width={60}
            height={60}
            className="mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-white mb-4">Sign in Required</h1>
          <p className="text-gray-300 mb-6">
            This is a private activity. Please sign in or create an account to participate.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/login"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Sign In
            </a>
            <a
              href="/signup"
              className="px-6 py-3 bg-slate-700 text-white rounded-lg font-medium hover:bg-slate-600 transition"
            >
              Create Account
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Route to the appropriate activity type component
  return <ActivityRouter activity={activity} sequenceId={sequenceId} />;
}
