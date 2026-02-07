'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Sequence } from '@/models/Sequence';
import { SequenceService } from '@/services/sequenceService';
import { FormattingService } from '@/utils/formatting';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from '@/components/UserMenu';

const SequenceGraphView = dynamic(
  () => import('@/components/graph/SequenceGraphView'),
  { ssr: false, loading: () => <div className="h-[500px] bg-[#111827] rounded-lg animate-pulse" /> }
);

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
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');

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
        setError('Failed to load sequence.');
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
      await SequenceService.addMember(sequence.id, userId, userEmail || undefined);
      setIsEnrolled(true);

      // Reload sequence to get updated data
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
      return { text: 'Not Started', color: 'bg-gray-800 text-gray-500' };
    }
    if (closedAt && now > closedAt) {
      return { text: 'Closed', color: 'bg-gray-800 text-gray-400' };
    }
    return { text: 'Open', color: 'bg-emerald-900/50 text-emerald-400' };
  };

  // Calculate days remaining
  const getDaysRemaining = (activity: any) => {
    if (!activity.openedAt) return null;
    if (!activity.autoClose || !activity.closedAt) return null;

    const now = new Date();
    const closedAt = new Date(activity.closedAt);

    if (now > closedAt) return 0;

    const diff = closedAt.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error || !sequence) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-400 mb-4">{error || 'Sequence not found'}</div>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="text-sky-400 hover:underline text-sm">
              ← Dashboard
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="text-gray-400 hover:underline text-sm"
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
            <span className="text-gray-400 truncate max-w-[150px]">{sequence.title}</span>
          </div>
          <UserMenu />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Link href="/dashboard" className="text-sm text-sky-400 hover:underline mb-4 inline-block">
          ← Dashboard
        </Link>

        {/* Page Title */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-white mb-2">{sequence.title}</h1>
              {sequence.description && (
                <p className="text-gray-500">{sequence.description}</p>
              )}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
              sequence.status === 'active'
                ? 'bg-emerald-900/50 text-emerald-400'
                : sequence.status === 'completed'
                ? 'bg-gray-800 text-gray-400'
                : 'bg-gray-800 text-gray-500'
            }`}>
              {sequence.status}
            </span>
          </div>
        </div>

        {/* Enrollment / Welcome Section */}
        {!isEnrolled && sequence.status !== 'completed' && (
          <div className="bg-[#111827] border border-white/10 rounded-lg p-6 mb-6">
            {sequence.welcomePage?.enabled && sequence.welcomePage.welcomeText ? (
              <>
                <div className="text-gray-300 whitespace-pre-wrap mb-6">{sequence.welcomePage.welcomeText}</div>
                {sequence.welcomePage.referenceLink && (
                  <a
                    href={sequence.welcomePage.referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline text-sm mb-6 inline-block"
                  >
                    Reference Material →
                  </a>
                )}
                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="w-full py-3 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 text-white font-medium rounded transition-colors"
                >
                  {enrolling ? 'Enrolling...' : 'Enroll in This Sequence'}
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-medium mb-1">Not Enrolled</h2>
                  <p className="text-sm text-gray-500">Join this sequence to participate</p>
                </div>
                <button
                  onClick={handleEnroll}
                  disabled={enrolling}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-700 text-white text-sm font-medium rounded transition-colors"
                >
                  {enrolling ? 'Enrolling...' : 'Enroll'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Progress Section (for enrolled users) */}
        {isEnrolled && (
          <div className="bg-[#111827] border border-white/10 rounded-lg mb-6">
            <button
              onClick={() => setDetailsExpanded(!detailsExpanded)}
              className="w-full px-4 py-3 flex justify-between items-center hover:bg-white/5 transition-colors rounded-lg"
            >
              <div className="flex items-center gap-4">
                <span className="text-white font-medium">Progress</span>
                <span className="text-sm text-gray-500">{stats.participated}/{stats.total} completed</span>
                <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
              <span className="text-gray-500">{detailsExpanded ? '−' : '+'}</span>
            </button>

            {detailsExpanded && (
              <div className="px-4 pb-4 border-t border-white/5">
                <div className="pt-4 flex gap-6 text-sm text-gray-500">
                  <span><strong className="text-white">{stats.opened}</strong> open</span>
                  <span><strong className="text-white">{sequence.members.length}</strong> members</span>
                </div>
                {sequence.welcomePage?.enabled && sequence.welcomePage.welcomeText && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">About</h3>
                    <p className="text-sm text-gray-500 whitespace-pre-wrap">{sequence.welcomePage.welcomeText}</p>
                  </div>
                )}
                {sequence.welcomePage?.enabled && sequence.welcomePage.referenceLink && (
                  <a
                    href={sequence.welcomePage.referenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline text-sm mt-4 inline-block"
                  >
                    Reference Material →
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activities Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-white">Activities</h2>
          {sequence.activities.length > 0 && (
            <div className="flex gap-0.5 bg-[#111827] border border-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === 'graph' ? 'bg-sky-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Graph
              </button>
            </div>
          )}
        </div>
        {sequence.activities.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No activities in this sequence yet.
          </div>
        ) : viewMode === 'graph' ? (
          <SequenceGraphView
            activities={sequence.activities}
            sequenceId={sequence.id}
            isEnrolled={isEnrolled}
          />
        ) : (
          <div className="space-y-2">
            {sequence.activities
              .sort((a, b) => a.order - b.order)
              .map((seqActivity, index) => {
                const activity = seqActivity.activity;
                const status = getActivityStatus(seqActivity);
                const daysRemaining = getDaysRemaining(seqActivity);

                return (
                  <div
                    key={seqActivity.activityId}
                    className="bg-[#111827] border border-white/10 rounded-lg p-4 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-sm text-gray-400 font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex-1">
                            <h3 className="text-white font-medium">
                              {activity?.title || 'Activity Not Found'}
                            </h3>
                            {seqActivity.openedAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                Opened {FormattingService.formatTimestamp(seqActivity.openedAt)}
                                {daysRemaining !== null && daysRemaining > 0 && (
                                  <span className="ml-2">• {daysRemaining} days remaining</span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 items-end flex-shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                              {status.text}
                            </span>
                            {seqActivity.hasParticipated && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-900/50 text-sky-400">
                                Done
                              </span>
                            )}
                          </div>
                        </div>

                        {activity && (
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                            <span>{activity.participants || 0} participants</span>
                            <span>{activity.completedMappings || 0} mappings</span>
                            {seqActivity.autoClose && seqActivity.duration && (
                              <span>Duration: {seqActivity.duration} days</span>
                            )}
                          </div>
                        )}

                        {/* Action */}
                        {activity && seqActivity.openedAt && isEnrolled && (
                          <Link
                            href={`/${activity.urlName}?sequence=${sequence.id}`}
                            className="inline-block mt-3 text-sm text-sky-400 hover:underline"
                          >
                            {status.text === 'Closed' || seqActivity.hasParticipated ? 'View Results →' : 'Participate →'}
                          </Link>
                        )}
                        {activity && seqActivity.openedAt && status.text !== 'Closed' && !isEnrolled && (
                          <p className="text-sm text-gray-500 mt-3">Enroll to participate</p>
                        )}
                        {!activity && (
                          <p className="text-sm text-red-400 mt-3">Activity data unavailable</p>
                        )}
                        {!seqActivity.openedAt && (
                          <p className="text-sm text-gray-500 mt-3">Opens later</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/10 flex gap-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-300">Home</Link>
          <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
          <a href="https://wiki.holoscopic.io" className="hover:text-gray-300">Wiki</a>
        </div>
      </main>
    </div>
  );
}
