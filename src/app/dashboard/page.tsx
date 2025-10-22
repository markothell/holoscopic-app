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
        // Filter out sequences user is already enrolled in
        const enrolledIds = enrolledData.map(s => s.id);
        const notEnrolledPublic = publicData.filter(s => !enrolledIds.includes(s.id));
        setPublicSequences(notEnrolledPublic);

        // Load invited sequences (user's email is in invitedEmails but not enrolled)
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
        setError('Failed to load dashboard data. The backend server may not be running.');
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
    const closed = sequence.activities.filter(a =>
      a.closedAt && new Date() > new Date(a.closedAt)
    ).length;

    return { total, participated, opened, closed };
  };

  // Get status badge for sequence
  const getStatusBadge = (sequence: Sequence) => {
    if (sequence.status === 'draft') {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-700 text-gray-300">Draft</span>;
    }
    if (sequence.status === 'completed') {
      return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-900 text-red-300">Completed</span>;
    }
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-300">Active</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-red-400 mb-4 text-sm sm:text-base">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
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
      case 'enrolled':
        return enrolledSequences;
      case 'invitations':
        return invitedSequences;
      case 'open':
        return publicSequences;
      default:
        return [];
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
      default:
        return [];
    }
  };

  const filteredSequences = getFilteredSequences();
  const filteredActivities = getFilteredActivities();

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
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
            </div>
            <UserMenu />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-700">
            <button
              onClick={() => setActiveTab('sequences')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sequences'
                  ? 'text-white border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-slate-600'
              }`}
            >
              Sequences
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activities'
                  ? 'text-white border-blue-500'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-slate-600'
              }`}
            >
              Activities
            </button>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="mb-6">
          {activeTab === 'sequences' ? (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSequenceFilter('enrolled')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sequenceFilter === 'enrolled'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Enrolled ({enrolledSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('invitations')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sequenceFilter === 'invitations'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Invitations ({invitedSequences.length})
              </button>
              <button
                onClick={() => setSequenceFilter('open')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sequenceFilter === 'open'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Open ({publicSequences.length})
              </button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActivityFilter('open')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activityFilter === 'open'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Open ({standaloneActivities.filter(a => !a.ratings?.find(r => r.userId === userId)).length})
              </button>
              <button
                onClick={() => setActivityFilter('completed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activityFilter === 'completed'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                Completed ({standaloneActivities.filter(a => !!a.ratings?.find(r => r.userId === userId)).length})
              </button>
            </div>
          )}
        </div>

        {/* Content Sections */}
        {activeTab === 'sequences' && filteredSequences.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8 text-center text-gray-400">
            <p className="mb-4">
              {sequenceFilter === 'enrolled' && 'You haven\'t enrolled in any sequences yet.'}
              {sequenceFilter === 'invitations' && 'You have no pending sequence invitations.'}
              {sequenceFilter === 'open' && 'No public sequences available at the moment.'}
            </p>
            {sequenceFilter === 'open' && (
              <Link
                href="/activities"
                className="inline-block px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Browse Activities
              </Link>
            )}
          </div>
        ) : activeTab === 'activities' && filteredActivities.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 sm:p-8 text-center text-gray-400">
            <p className="mb-4">
              {activityFilter === 'open' && 'You have no open activities.'}
              {activityFilter === 'completed' && 'You haven\'t completed any activities yet.'}
            </p>
            <Link
              href="/activities"
              className="inline-block px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Explore Activities
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Sequences Section */}
            {activeTab === 'sequences' && filteredSequences.length > 0 && (
              <div>
                <div className="space-y-4">
                  {filteredSequences.map((sequence) => {
                    const stats = getSequenceStats(sequence);
                    const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

                    return (
                      <div
                        key={sequence.id}
                        className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6"
                      >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-white mb-1">{sequence.title}</h3>
                            {sequence.description && (
                              <p className="text-sm text-gray-400">{sequence.description}</p>
                            )}
                          </div>
                          {getStatusBadge(sequence)}
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-400">Progress</span>
                            <span className="text-xs text-gray-400">
                              {stats.participated} / {stats.total} completed
                            </span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-4 text-xs text-gray-400 mb-3">
                          <div>
                            <span className="font-semibold text-white">{stats.opened}</span> open
                          </div>
                          <div>
                            <span className="font-semibold text-white">{stats.closed}</span> closed
                          </div>
                          <div>
                            <span className="font-semibold text-white">{sequence.members.length}</span> members
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center mt-3">
                          <div className="text-xs text-gray-500">
                            {sequenceFilter === 'enrolled' && `Started ${FormattingService.formatTimestamp(sequence.startedAt || sequence.createdAt)}`}
                            {sequenceFilter === 'invitations' && 'You have been invited to this sequence'}
                            {sequenceFilter === 'open' && `${sequence.members.length} members enrolled`}
                          </div>
                          <button
                            onClick={() => router.push(`/sequence/${sequence.urlName}`)}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                          >
                            {sequenceFilter === 'enrolled' && 'View'}
                            {sequenceFilter === 'invitations' && 'View Invitation'}
                            {sequenceFilter === 'open' && 'View Details'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Standalone Activities Section */}
            {activeTab === 'activities' && filteredActivities.length > 0 && (
              <div>
                <div className="space-y-4">
                  {filteredActivities.map((activity) => {
                    // Check if user has submitted (has rating)
                    const userRating = activity.ratings?.find(r => r.userId === userId);
                    const hasSubmitted = !!userRating;

                    return (
                      <div
                        key={activity.id}
                        className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6"
                      >
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-white mb-1">{activity.title}</h3>
                          </div>
                          {hasSubmitted ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-900 text-green-300">
                              Completed
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-900 text-yellow-300">
                              In Progress
                            </span>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="flex gap-4 text-xs text-gray-400 mb-3">
                          <div>
                            <span className="font-semibold text-white">{activity.participants?.length || 0}</span> participants
                          </div>
                          <div>
                            <span className="font-semibold text-white">{activity.comments?.length || 0}</span> comments
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center mt-3">
                          <div className="text-xs text-gray-500">
                            {hasSubmitted
                              ? `Completed ${FormattingService.formatTimestamp(userRating.timestamp || activity.createdAt)}`
                              : `Joined ${FormattingService.formatTimestamp(activity.participants?.find(p => p.id === userId)?.joinedAt || activity.createdAt)}`
                            }
                          </div>
                          <button
                            onClick={() => router.push(`/${activity.urlName}`)}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                          >
                            {hasSubmitted ? 'View Results' : 'Continue'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}