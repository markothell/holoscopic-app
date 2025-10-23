'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

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
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center">
        <div className="text-white/80">Loading activities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-red-400 mb-4">{error}</div>
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            Back to Home
          </Link>
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
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                {activeTab === 'activities' ? 'Activities' : 'Sequences'}
              </h1>
            </div>
            <UserMenu />
          </div>
          <p className="text-gray-400 mb-4">
            {activeTab === 'activities'
              ? 'Open mapping activities you can participate in right now'
              : 'Public sequences you can enroll in'}
          </p>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-700 mt-6">
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activities'
                  ? 'text-white border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-slate-600'
              }`}
            >
              Activities ({activities.length})
            </button>
            <button
              onClick={() => setActiveTab('sequences')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sequences'
                  ? 'text-white border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-slate-600'
              }`}
            >
              Sequences ({sequences.length})
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'activities' ? (
          // Activities List
          activities.length === 0 ? (
            <div className="bg-slate-800 rounded-lg shadow-xl p-8 text-center">
              <p className="text-gray-300 mb-4">No public activities available at the moment.</p>
              <p className="text-gray-400 text-sm">Check back later for new activities!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {activities.map((activity) => (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName}`}
                  className="block bg-slate-800 rounded-lg shadow-xl p-6 hover:shadow-2xl transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-white mb-2">
                        {activity.title}
                      </h2>
                      <p className="text-gray-400 mb-3 text-sm">
                        Map: {activity.xAxis.label}//{activity.yAxis.label}
                      </p>
                    </div>
                  </div>

                  {/* Activity Stats */}
                  <div className="flex gap-4 text-xs text-gray-400 mb-4">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-300">
                        {activity.participants.length}
                      </span>
                      <span>participants</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-300">
                        {activity.ratings.length}
                      </span>
                      <span>mappings</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-300">
                        {activity.comments.length}
                      </span>
                      <span>comments</span>
                    </div>
                  </div>

                  {/* Enter Button */}
                  <div className="pt-3 border-t border-slate-700">
                    <span className="text-blue-400 font-medium hover:text-blue-300">
                      Enter
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          // Sequences List
          sequences.length === 0 ? (
            <div className="bg-slate-800 rounded-lg shadow-xl p-8 text-center">
              <p className="text-gray-300 mb-4">No public sequences available at the moment.</p>
              <p className="text-gray-400 text-sm">Check back later for new sequences!</p>
            </div>
          ) : (
            <div className="space-y-4 mb-8">
              {sequences.map((sequence) => {
                const total = sequence.activities.length;
                const opened = sequence.activities.filter(a => a.openedAt).length;

                return (
                  <Link
                    key={sequence.id}
                    href={`/sequence/${sequence.urlName}`}
                    className="block bg-slate-800 rounded-lg shadow-xl p-6 hover:shadow-2xl transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-white mb-2">
                          {sequence.title}
                        </h2>
                        {sequence.description && (
                          <p className="text-gray-400 text-sm">
                            {sequence.description}
                          </p>
                        )}
                      </div>
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-300">
                        Public
                      </span>
                    </div>

                    {/* Sequence Stats */}
                    <div className="flex gap-4 text-xs text-gray-400 mb-4">
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-gray-300">
                          {total}
                        </span>
                        <span>activities</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-gray-300">
                          {opened}
                        </span>
                        <span>opened</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-gray-300">
                          {sequence.members.length}
                        </span>
                        <span>members</span>
                      </div>
                    </div>

                    {/* View Button */}
                    <div className="pt-3 border-t border-slate-700">
                      <span className="text-blue-400 font-medium hover:text-blue-300">
                        View Details
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {/* Footer Links */}
        <div className="pt-8 mt-8 border-t border-white/20 flex justify-center gap-8">
          <Link
            href="/"
            className="text-white/80 hover:text-white text-sm underline underline-offset-4"
          >
            Home
          </Link>
          <Link
            href="/login"
            className="text-white/80 hover:text-white text-sm underline underline-offset-4"
          >
            Log In
          </Link>
          <a
            href="http://wiki.holoscopic.io"
            className="text-white/80 hover:text-white text-sm underline underline-offset-4"
          >
            Wiki
          </a>
        </div>
      </div>
    </div>
  );
}
