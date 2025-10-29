'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

export default function SequenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const urlName = params.urlName as string;
  const { userId, userEmail, isAuthenticated, isLoading: authLoading } = useAuth();

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Load sequence details
  useEffect(() => {
    if (!urlName || !userId) return;

    const loadSequence = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await SequenceService.getSequenceByUrlName(urlName, userId);
        setSequence(data);

        // Check if user is enrolled
        const member = data.members.find(m => m.userId === userId);
        setIsEnrolled(!!member);
      } catch (err) {
        setError('Failed to load sequence. The backend server may not be running.');
        console.error('Error loading sequence:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSequence();
  }, [urlName, userId]);

  // Handle enrollment
  const handleEnroll = async () => {
    if (!sequence || !userId) return;

    // Check if user is authenticated - redirect to signup if not
    if (!isAuthenticated) {
      router.push(`/signup?callbackUrl=${encodeURIComponent(`/sequence/${urlName}`)}`);
      return;
    }

    try {
      setEnrolling(true);
      await SequenceService.addMember(
        sequence.id,
        userId,
        userEmail || undefined
      );
      setIsEnrolled(true);

      // Reload sequence to get updated member count
      const updated = await SequenceService.getSequenceByUrlName(urlName, userId);
      setSequence(updated);
    } catch (err: any) {
      console.error('Error enrolling:', err);
      alert('Failed to enroll in sequence');
    } finally {
      setEnrolling(false);
    }
  };

  // Get activity status
  const getActivityStatus = (activity: any) => {
    const now = new Date();
    const openedAt = activity.openedAt ? new Date(activity.openedAt) : null;
    const closedAt = activity.closedAt ? new Date(activity.closedAt) : null;

    if (!openedAt) {
      return { text: 'Not Started', color: 'bg-gray-700 text-gray-300' };
    }
    if (closedAt && now > closedAt) {
      return { text: 'Closed', color: 'bg-red-900 text-red-300' };
    }
    return { text: 'Open', color: 'bg-green-900 text-green-300' };
  };

  // Calculate days remaining for an activity
  const getDaysRemaining = (activity: any) => {
    if (!activity.openedAt) return null;
    if (!activity.autoClose || !activity.closedAt) return null; // No limit if autoClose is false

    const now = new Date();
    const closedAt = new Date(activity.closedAt);

    if (now > closedAt) return 0;

    const diff = closedAt.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="text-center text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#3d5577] to-[#2a3b55] p-4 sm:p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-red-400 mb-4 text-sm sm:text-base">
            {error || 'Sequence not found'}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 sm:px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = sequence.activities.length > 0 ? {
    total: sequence.activities.length,
    participated: sequence.activities.filter(a => a.hasParticipated).length,
    opened: sequence.activities.filter(a => a.openedAt).length,
  } : { total: 0, participated: 0, opened: 0 };

  const progressPercent = stats.total > 0 ? Math.round((stats.participated / stats.total) * 100) : 0;

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
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{sequence.title}</h1>
            </div>
            <UserMenu />
          </div>
          <Link href="/dashboard" className="inline-flex items-center text-blue-400 hover:text-blue-300 mb-4">
            ← Back to Dashboard
          </Link>
          {sequence.description && (
            <p className="text-gray-400 mb-4">{sequence.description}</p>
          )}

          {/* Welcome Page or Enrollment Status */}
          {!isEnrolled && sequence.status !== 'completed' && (
            <div className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6 mb-6">
              {sequence.welcomePage?.enabled ? (
                <>
                  {/* Welcome Page Content */}
                  {sequence.welcomePage.welcomeText && (
                    <div className="mb-6">
                      <div className="text-gray-300 whitespace-pre-wrap">{sequence.welcomePage.welcomeText}</div>
                    </div>
                  )}

                  {/* Reference Link */}
                  {sequence.welcomePage.referenceLink && (
                    <div className="mb-6">
                      <a
                        href={sequence.welcomePage.referenceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Reference Material →
                      </a>
                    </div>
                  )}

                  {/* Enroll Button */}
                  <div className="max-w-md mx-auto">
                    <button
                      onClick={handleEnroll}
                      disabled={enrolling}
                      className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium rounded-lg transition-colors"
                    >
                      {enrolling ? 'Enrolling...' : 'Enroll in This Sequence'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-white mb-1">Not Enrolled</h2>
                    <p className="text-sm text-gray-400">Join this sequence to participate in the activities</p>
                  </div>
                  <button
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium rounded-lg transition-colors"
                  >
                    {enrolling ? 'Enrolling...' : 'Enroll Now'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Details Section (expandable) */}
          {isEnrolled && (
            <div className="bg-slate-800 rounded-lg shadow-xl mb-6">
              <button
                onClick={() => setDetailsExpanded(!detailsExpanded)}
                className="w-full p-4 sm:p-6 flex justify-between items-center hover:bg-slate-750 transition-colors"
              >
                <h2 className="text-lg font-semibold text-white">Details</h2>
                <span className="text-gray-400 text-xl">
                  {detailsExpanded ? '−' : '+'}
                </span>
              </button>

              {detailsExpanded && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-slate-700">
                  {/* Progress */}
                  <div className="mt-4 mb-6">
                    <h3 className="text-sm font-semibold text-gray-300 mb-2">Your Progress</h3>
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-400">Completed Activities</span>
                        <span className="text-sm text-gray-400">
                          {stats.participated} / {stats.total}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-3">
                        <div
                          className="bg-blue-500 h-3 rounded-full transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm text-gray-400">
                      <div>
                        <span className="font-semibold text-white">{stats.opened}</span> activities open
                      </div>
                      <div>
                        <span className="font-semibold text-white">{sequence.members.length}</span> members enrolled
                      </div>
                    </div>
                  </div>

                  {/* Welcome Text */}
                  {sequence.welcomePage?.enabled && sequence.welcomePage.welcomeText && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-300 mb-2">About This Sequence</h3>
                      <div className="text-sm text-gray-400 whitespace-pre-wrap">
                        {sequence.welcomePage.welcomeText}
                      </div>
                    </div>
                  )}

                  {/* Reference Link */}
                  {sequence.welcomePage?.enabled && sequence.welcomePage.referenceLink && (
                    <div className="mt-4">
                      <a
                        href={sequence.welcomePage.referenceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm inline-flex items-center gap-1"
                      >
                        Reference Material →
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activities List */}
        <h2 className="text-xl font-semibold text-white mb-4">Activities</h2>
        {sequence.activities.length === 0 ? (
          <div className="bg-slate-800 rounded-lg shadow-xl p-6 text-center text-gray-400">
            No activities in this sequence yet.
          </div>
        ) : (
          <div className="space-y-4">
            {sequence.activities
              .sort((a, b) => a.order - b.order)
              .map((seqActivity, index) => {
                const activity = seqActivity.activity;
                const status = getActivityStatus(seqActivity);
                const daysRemaining = getDaysRemaining(seqActivity);

                return (
                  <div
                    key={seqActivity.activityId}
                    className="bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">
                            {activity?.title || 'Activity Not Found'}
                          </h3>
                          {activity?.author && (
                            <p className="text-xs text-gray-400 mb-1">
                              Author: {activity.author.name}
                            </p>
                          )}
                          {seqActivity.openedAt && (
                            <p className="text-xs text-gray-400">
                              Opened {FormattingService.formatTimestamp(seqActivity.openedAt)}
                              {daysRemaining !== null && daysRemaining > 0 && (
                                <span className="ml-2">• {daysRemaining} days remaining</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>
                          {status.text}
                        </span>
                        {seqActivity.hasParticipated && (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-900 text-blue-300">
                            Completed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    {activity && (
                      <div className="flex gap-4 text-xs text-gray-400 mb-3">
                        <div>
                          <span className="font-semibold text-white">{activity.participants || 0}</span> participants
                        </div>
                        <div>
                          <span className="font-semibold text-white">{activity.completedMappings || 0}</span> mappings
                        </div>
                        {seqActivity.autoClose && seqActivity.duration && (
                          <div>Duration: <span className="font-semibold text-white">{seqActivity.duration}</span> days</div>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    {activity && seqActivity.openedAt && isEnrolled && (
                      <Link
                        href={`/${activity.urlName}?sequence=${sequence.id}`}
                        className="inline-block px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                      >
                        {status.text === 'Closed' ? 'View Results' : (seqActivity.hasParticipated ? 'View Results' : 'Participate Now')}
                      </Link>
                    )}
                    {activity && seqActivity.openedAt && status.text !== 'Closed' && !isEnrolled && (
                      <div className="text-sm text-gray-400">Enroll to participate</div>
                    )}
                    {!activity && (
                      <div className="text-sm text-red-400">Activity data unavailable</div>
                    )}
                    {!seqActivity.openedAt && (
                      <div className="text-sm text-gray-400">This activity will open later</div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}