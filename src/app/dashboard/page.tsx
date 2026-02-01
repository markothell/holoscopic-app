'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { HoloscopicActivity } from '@/models/Activity';
import { SequenceService } from '@/services/sequenceService';
import { ActivityService } from '@/services/activityService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

type TabType = 'activities' | 'sequences';
type SequenceFilterType = 'enrolled' | 'invitations' | 'open';
type ActivityFilterType = 'open' | 'completed';

export default function DashboardPage() {
  const router = useRouter();
  const { userId, userEmail, isLoading: authLoading } = useAuth();

  // Tab and filter state
  const [activeTab, setActiveTab] = useState<TabType>('sequences');
  const [sequenceFilter, setSequenceFilter] = useState<SequenceFilterType>('enrolled');
  const [activityFilter, setActivityFilter] = useState<ActivityFilterType>('open');

  // Data state
  const [enrolledSequences, setEnrolledSequences] = useState<Sequence[]>([]);
  const [publicSequences, setPublicSequences] = useState<Sequence[]>([]);
  const [invitedSequences, setInvitedSequences] = useState<Sequence[]>([]);
  const [standaloneActivities, setStandaloneActivities] = useState<HoloscopicActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user's sequences and standalone activities
  useEffect(() => {
    if (!userId) return;

    const loadUserData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load enrolled sequences
        const enrolledData = await SequenceService.getUserSequences(userId);
        setEnrolledSequences(enrolledData);

        // Load public sequences (for "Open" filter)
        const publicData = await SequenceService.getPublicSequences();
        const enrolledIds = enrolledData.map(s => s.id);
        const notEnrolledPublic = publicData.filter(s => !enrolledIds.includes(s.id));
        setPublicSequences(notEnrolledPublic);

        // Load invited sequences
        if (userEmail) {
          const allPublicAndPrivate = await SequenceService.getAdminSequences();
          const invited = allPublicAndPrivate.filter(seq =>
            seq.requireInvitation &&
            seq.invitedEmails?.includes(userEmail.toLowerCase()) &&
            !enrolledIds.includes(seq.id)
          );
          setInvitedSequences(invited);
        }

        // Load all activities user has participated in
        const allActivities = await ActivityService.getUserActivities(userId);

        // Filter out activities that are part of sequences
        const sequenceActivityIds = enrolledData.flatMap(seq =>
          seq.activities.map(a => a.activityId)
        );
        const standalone = allActivities.filter(
          activity => !sequenceActivityIds.includes(activity.id)
        );
        setStandaloneActivities(standalone);
      } catch (err) {
        setError('Failed to load dashboard data.');
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [userId, userEmail]);

  // Calculate activity stats for a sequence
  const getSequenceStats = (sequence: Sequence) => {
    const total = sequence.activities.length;
    const participated = sequence.activities.filter(a => a.hasParticipated).length;
    const opened = sequence.activities.filter(a => a.openedAt).length;
    return { total, participated, opened };
  };

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
          <button
            onClick={() => window.location.reload()}
            className="text-sky-400 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Get filtered sequences based on active filter
  const getFilteredSequences = () => {
    switch (sequenceFilter) {
      case 'enrolled': return enrolledSequences;
      case 'invitations': return invitedSequences;
      case 'open': return publicSequences;
      default: return [];
    }
  };

  // Get filtered activities based on active filter
  const getFilteredActivities = () => {
    switch (activityFilter) {
      case 'open':
        return standaloneActivities.filter(activity => {
          const userRating = activity.ratings?.find(r => r.userId === userId);
          return !userRating;
        });
      case 'completed':
        return standaloneActivities.filter(activity => {
          const userRating = activity.ratings?.find(r => r.userId === userId);
          return !!userRating;
        });
      default: return [];
    }
  };

  const filteredSequences = getFilteredSequences();
  const filteredActivities = getFilteredActivities();

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
            <span className="text-gray-400">dashboard</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Dashboard</h1>
          <p className="text-gray-500 text-sm">
            Your sequences and activities
          </p>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-6 border-b border-white/10 mb-6">
          <button
            onClick={() => setActiveTab('sequences')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'sequences'
                ? 'text-white border-sky-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            Sequences
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'activities'
                ? 'text-white border-sky-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            Activities
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {activeTab === 'sequences' ? (
            <>
              <button
                onClick={() => setSequenceFilter('enrolled')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  sequenceFilter === 'enrolled'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Enrolled ({enrolledSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('invitations')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  sequenceFilter === 'invitations'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Invitations ({invitedSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('open')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  sequenceFilter === 'open'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Open ({publicSequences.length})
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActivityFilter('open')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  activityFilter === 'open'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Open ({standaloneActivities.filter(a => !a.ratings?.find(r => r.userId === userId)).length})
              </button>
              <button
                onClick={() => setActivityFilter('completed')}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  activityFilter === 'completed'
                    ? 'bg-sky-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                Completed ({standaloneActivities.filter(a => !!a.ratings?.find(r => r.userId === userId)).length})
              </button>
            </>
          )}
        </div>

        {/* Content */}
        {activeTab === 'sequences' && filteredSequences.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {sequenceFilter === 'enrolled' && 'You haven\'t enrolled in any sequences yet.'}
            {sequenceFilter === 'invitations' && 'No pending invitations.'}
            {sequenceFilter === 'open' && 'No public sequences available.'}
            <div className="mt-4">
              <Link href="/activities" className="text-sky-400 hover:underline text-sm">
                Browse activities →
              </Link>
            </div>
          </div>
        ) : activeTab === 'activities' && filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {activityFilter === 'open' && 'No open activities.'}
            {activityFilter === 'completed' && 'No completed activities yet.'}
            <div className="mt-4">
              <Link href="/activities" className="text-sky-400 hover:underline text-sm">
                Explore activities →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Sequences List */}
            {activeTab === 'sequences' && filteredSequences.map((sequence, index) => {
              const stats = getSequenceStats(sequence);
              const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

              return (
                <div
                  key={sequence.id}
                  className="py-3 px-3 -mx-3 rounded hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-gray-600 text-sm w-6 text-right flex-shrink-0 pt-0.5">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-4 mb-1">
                        <Link
                          href={`/sequence/${sequence.urlName}`}
                          className="text-white hover:text-sky-400 transition-colors font-medium"
                        >
                          {sequence.title}
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          sequence.status === 'active'
                            ? 'bg-emerald-900/50 text-emerald-400'
                            : sequence.status === 'completed'
                            ? 'bg-gray-800 text-gray-400'
                            : 'bg-gray-800 text-gray-500'
                        }`}>
                          {sequence.status}
                        </span>
                      </div>
                      {sequence.description && (
                        <p className="text-gray-500 text-sm mb-2 truncate">{sequence.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{stats.participated}/{stats.total} completed</span>
                        <span>{stats.opened} open</span>
                        <span>{sequence.members.length} members</span>
                        {/* Simple progress bar */}
                        <div className="flex-1 max-w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 rounded-full"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/sequence/${sequence.urlName}`}
                      className="text-xs text-sky-400 hover:underline flex-shrink-0"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              );
            })}

            {/* Activities List */}
            {activeTab === 'activities' && filteredActivities.map((activity, index) => {
              const userRating = activity.ratings?.find(r => r.userId === userId);
              const hasSubmitted = !!userRating;

              return (
                <div
                  key={activity.id}
                  className="py-3 px-3 -mx-3 rounded hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-gray-600 text-sm w-6 text-right flex-shrink-0 pt-0.5">
                      {index + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-4 mb-1">
                        <Link
                          href={`/${activity.urlName}`}
                          className="text-white hover:text-sky-400 transition-colors font-medium"
                        >
                          {activity.title}
                        </Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          hasSubmitted
                            ? 'bg-emerald-900/50 text-emerald-400'
                            : 'bg-yellow-900/50 text-yellow-400'
                        }`}>
                          {hasSubmitted ? 'Completed' : 'In Progress'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{activity.participants?.length || 0} participants</span>
                        <span>{activity.comments?.length || 0} comments</span>
                        <span>
                          {hasSubmitted
                            ? `Completed ${FormattingService.formatTimestamp(userRating.timestamp || activity.createdAt)}`
                            : `Joined ${FormattingService.formatTimestamp(activity.createdAt)}`
                          }
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/${activity.urlName}`}
                      className="text-xs text-sky-400 hover:underline flex-shrink-0"
                    >
                      {hasSubmitted ? 'Results →' : 'Continue →'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-300">Home</Link>
          <Link href="/activities" className="hover:text-gray-300">Explore</Link>
          <a href="https://wiki.holoscopic.io" className="hover:text-gray-300">Wiki</a>
        </div>
      </main>
    </div>
  );
}
