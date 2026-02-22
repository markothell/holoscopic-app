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
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center">
        <div className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#C83B50] mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-[#C83B50] hover:text-[#e04d63] transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
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
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Activity not found</p>
        </div>
      </div>
    );
  }

  // Auth check - private activities require authentication (not just anonymous ID)
  if (!activity.isPublic && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#111827] border border-white/10 rounded-lg shadow-xl p-8 text-center">
          <Image
            src="/HS.svg"
            alt="Holoscopic"
            width={44}
            height={60}
            className="mx-auto mb-6"
          />
          <h1 className="text-2xl font-bold text-white mb-4">Sign in Required</h1>
          <p className="text-gray-400 mb-6">
            This is a private activity. Please sign in or create an account to participate.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/login"
              className="px-6 py-3 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition"
            >
              Sign In
            </a>
            <a
              href="/signup"
              className="px-6 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 transition"
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
