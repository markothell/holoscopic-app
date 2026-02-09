'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';
import ActivityTypeIcon from '@/components/icons/ActivityTypeIcon';
import { getActivityTypeLabel } from '@/components/activities/types';
import type { ActivityType } from '@/models/Activity';

interface Activity {
  id: string;
  title: string;
  urlName: string;
  mapQuestion: string;
  xAxis: {
    label: string;
    min: string;
    max: string;
  };
  yAxis: {
    label: string;
    min: string;
    max: string;
  };
  activityType?: string;
  status: 'draft' | 'active' | 'completed';
  isDraft?: boolean;
  participants: any[];
  ratings: any[];
  comments: any[];
  createdAt: string;
  isPublic?: boolean;
}

type TabType = 'activities' | 'sequences';

export default function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('activities');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId } = useAuth();

  useEffect(() => {
    async function fetchData() {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

        // Fetch activities
        const activityResponse = await fetch(`${API_URL}/activities`);
        if (!activityResponse.ok) {
          throw new Error('Failed to fetch activities');
        }
        const activityData = await activityResponse.json();
        if (activityData.success && activityData.data.activities) {
          // Filter to only show active, non-draft, public activities
          const publicActivities = activityData.data.activities.filter((activity: Activity) =>
            activity.status === 'active' &&
            !activity.isDraft &&
            activity.isPublic !== false
          );
          setActivities(publicActivities);
        }

        // Fetch public sequences
        const publicSequences = await SequenceService.getPublicSequences();
        setSequences(publicSequences);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <Link href="/" className="text-sky-400 hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/holoLogo_dark.svg"
                alt="Holoscopic"
                width={28}
                height={28}
              />
              <span className="text-white font-semibold">Holoscopic</span>
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-400">explore</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Explore</h1>
          <p className="text-gray-500 text-sm">
            Public mapping activities and learning sequences
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-6">
          <button
            onClick={() => setActiveTab('activities')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'activities'
                ? 'text-white border-sky-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            Activities ({activities.length})
          </button>
          <button
            onClick={() => setActiveTab('sequences')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'sequences'
                ? 'text-white border-sky-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            Sequences ({sequences.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'activities' ? (
          activities.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No public activities available at the moment.
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((activity, index) => (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName}`}
                  className="flex items-baseline gap-3 py-2 px-3 -mx-3 rounded hover:bg-white/5 transition-colors group"
                >
                  <span className="text-gray-600 text-sm w-6 text-right flex-shrink-0">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-white group-hover:text-sky-400 transition-colors">
                      {activity.title}
                    </span>
                    <span className="inline-flex items-center gap-1 text-gray-500 text-xs ml-2">
                      <ActivityTypeIcon type={(activity.activityType || 'dissolve') as ActivityType} size={12} />
                      {getActivityTypeLabel((activity.activityType || 'dissolve') as ActivityType)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                    <span>{activity.participants.length} participants</span>
                    <span>{activity.ratings.length} mappings</span>
                    <span>{activity.comments.length} comments</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          sequences.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No public sequences available at the moment.
            </div>
          ) : (
            <div className="space-y-1">
              {sequences.map((sequence, index) => {
                const total = sequence.activities.length;
                const opened = sequence.activities.filter(a => a.openedAt).length;

                return (
                  <Link
                    key={sequence.id}
                    href={`/sequence/${sequence.urlName}`}
                    className="flex items-baseline gap-3 py-2 px-3 -mx-3 rounded hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-gray-600 text-sm w-6 text-right flex-shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-white group-hover:text-sky-400 transition-colors">
                        {sequence.title}
                      </span>
                      {sequence.description && (
                        <span className="text-gray-600 text-sm ml-2 truncate">
                          — {sequence.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                      <span>{total} activities</span>
                      <span>{opened} open</span>
                      <span>{sequence.members.length} members</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-300">Home</Link>
          <Link href="/login" className="hover:text-gray-300">Log In</Link>
          <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className="hover:text-gray-300">Wiki</a>
        </div>
      </main>
    </div>
  );
}
