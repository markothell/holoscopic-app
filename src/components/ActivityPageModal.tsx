'use client';

import { useState, useEffect } from 'react';
import { HoloscopicActivity, Rating, Comment } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { webSocketService } from '@/services/websocketService';
import { useAuth } from '@/contexts/AuthContext';
import Image from 'next/image';
import Link from 'next/link';
import ResultsView from './ResultsView';
import ResultsViewSimple from './ResultsViewSimple';
import CommentSection from './CommentSection';
import PreambleModal from './modals/PreambleModal';
import EntryModal from './modals/EntryModal';
import { normalizeActivityType } from './activities/types';

interface ActivityPageModalProps {
  activityId: string;
  sequenceId?: string;
}

export default function ActivityPageModal({ activityId, sequenceId }: ActivityPageModalProps) {
  const { userId, isLoading: authLoading } = useAuth();
  const [activity, setActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');

  // Tab state for resolve activity type
  const [resolveTab, setResolveTab] = useState<'map' | 'comments'>('map');

  // Modal state
  const [showPreamble, setShowPreamble] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  // Initialize username
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      const newUsername = `User${Math.floor(Math.random() * 10000)}`;
      localStorage.setItem('username', newUsername);
      setUsername(newUsername);
    }
  }, []);

  // Load activity
  useEffect(() => {
    if (!userId) return;

    const loadActivity = async () => {
      try {
        setLoading(true);
        const data = await ActivityService.getActivity(activityId);
        setActivity(data);

        // Show preamble modal on first load if there's content
        if (data.preamble || data.wikiLink) {
          setShowPreamble(true);
        }
      } catch (err) {
        setError('Failed to load activity');
        console.error('Error loading activity:', err);
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [activityId, userId]);

  // WebSocket connection
  useEffect(() => {
    if (!activity || !userId || !username) return;

    webSocketService.connect(activityId, userId, username);

    const handleActivityUpdate = (data: { activity: HoloscopicActivity }) => {
      setActivity(data.activity);
    };

    const unsubscribe = webSocketService.on('activity_updated', handleActivityUpdate);

    return () => {
      unsubscribe();
      webSocketService.disconnect();
    };
  }, [activity, activityId, userId, username]);

  // Get slot data helper
  const getSlotData = (slotNum: number) => {
    if (!activity || !userId) return { hasData: false, objectName: '', rating: undefined, comment: undefined };

    const rating = activity.ratings.find(r =>
      r.userId === userId && (r.slotNumber || 1) === slotNum
    );
    const comment = activity.comments.find(c =>
      c.userId === userId && (c.slotNumber || 1) === slotNum
    );

    return {
      hasData: !!(rating || comment),
      objectName: rating?.objectName || comment?.objectName || '',
      rating,
      comment
    };
  };

  // Solo Tracker Mode helpers
  const isSoloTracker = activity?.maxEntries === 0;
  const isCreator = activity?.author?.userId === userId;
  const canAddEntries = !isSoloTracker || isCreator;

  // Count user's existing entries for solo tracker mode
  const userEntryCount = activity?.ratings.filter(r => r.userId === userId).length || 0;

  // Determine slots to show
  const slotsToShow = isSoloTracker
    ? Math.max(1, userEntryCount + (canAddEntries ? 1 : 0))
    : (activity?.maxEntries || 1);

  // Handle entry submission
  const handleEntrySubmit = async (data: {
    objectName: string;
    position: { x: number; y: number };
    comment: string;
  }) => {
    if (!activity || !userId) return;

    try {
      // Submit rating
      await ActivityService.submitRating(
        activityId,
        userId,
        data.position,
        data.objectName,
        currentSlot
      );

      // Submit comment
      await ActivityService.submitComment(
        activityId,
        userId,
        data.comment,
        data.objectName,
        currentSlot
      );

      // Close modal
      setShowEntryModal(false);

      // Reload activity
      const updated = await ActivityService.getActivity(activityId);
      setActivity(updated);
    } catch (err) {
      console.error('Error submitting entry:', err);
      alert('Failed to submit entry. Please try again.');
    }
  };

  const handleEntryClick = (slot: number) => {
    setCurrentSlot(slot);
    setShowEntryModal(true);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center">
        <div className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading...</div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#C83B50] mb-4">{error || 'Activity not found'}</p>
          <Link href="/" className="text-[#C83B50] hover:text-[#e04d63] transition-colors" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  const maxEntries = isSoloTracker ? slotsToShow : (activity.maxEntries || 1);

  return (
    <div className="min-h-screen lg:h-screen bg-[#1A1714]">
      {/* Fixed Logo in top-left */}
      <div className="fixed top-4 left-4 z-20">
        <Link href="/">
          <Image
            src="/HS.svg"
            alt="Holoscopic"
            width={29}
            height={40}
            className="hover:opacity-80 transition-opacity"
          />
        </Link>
      </div>

      {/* Mobile Layout */}
      <div className="sm:hidden flex-1 flex flex-col pt-4 pb-4">
        <div className="flex-shrink-0 px-4 mb-4">
          {/* Title with Info Icon */}
          <div className="ml-16 flex items-center gap-2">
            <h2 className="text-2xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
              {activity.title}
            </h2>
            {(activity.preamble || activity.wikiLink) && (
              <button
                onClick={() => setShowPreamble(true)}
                className="w-6 h-6 rounded-full bg-[rgba(215,205,195,0.1)] hover:bg-[rgba(215,205,195,0.18)] text-[#F5F0EB] text-xs font-bold flex items-center justify-center transition-colors flex-shrink-0"
                aria-label="View information"
                title="View activity information"
              >
                i
              </button>
            )}
          </div>

          {/* Entry Circles */}
          {activity.status !== 'completed' && canAddEntries && (
            <div className="flex flex-col items-start ml-16 mt-3">
              <span className="text-xs text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {isSoloTracker ? `Your entries (${userEntryCount}):` : 'Click to add mapping:'}
              </span>
              <div className="flex gap-2 flex-wrap mt-2">
                {Array.from({ length: maxEntries }, (_, i) => i + 1).map((slot) => {
                  const slotData = getSlotData(slot);
                  const isAddNewSlot = isSoloTracker && slot > userEntryCount;

                  return (
                    <button
                      key={slot}
                      onClick={() => handleEntryClick(slot)}
                      onMouseEnter={() => setHoveredSlot(slot)}
                      onMouseLeave={() => setHoveredSlot(null)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        slotData.hasData
                          ? 'bg-[#F5F0EB] border-[#F5F0EB] hover:bg-[#F5F0EB]/90'
                          : isAddNewSlot
                            ? 'bg-green-500/30 border-green-500/50 hover:bg-green-500/40'
                            : 'bg-transparent border-[rgba(215,205,195,0.3)] hover:border-[rgba(215,205,195,0.5)]'
                      }`}
                      aria-label={isAddNewSlot ? 'Add new entry' : `Entry ${slot}`}
                    >
                      <span className={`text-xs font-semibold ${
                        slotData.hasData ? 'text-[#1A1714]' : isAddNewSlot ? 'text-green-300' : 'text-[#A89F96]'
                      }`}>
                        {isAddNewSlot ? '+' : slot}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {normalizeActivityType(activity.activityType) === 'resolve' ? (
          <div className="flex-1 min-h-0 flex flex-col px-4">
            {/* Tab bar */}
            <div className="flex-shrink-0 flex justify-center mb-2">
              <div className="flex bg-[#111827] rounded-lg p-1 border border-white/10">
                <button
                  onClick={() => setResolveTab('map')}
                  className={`px-4 py-2 rounded-md transition-colors ${resolveTab === 'map' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'}`}
                  style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                >
                  Map View
                </button>
                <button
                  onClick={() => setResolveTab('comments')}
                  className={`px-4 py-2 rounded-md transition-colors ${resolveTab === 'comments' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'}`}
                  style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                >
                  Comments
                </button>
              </div>
            </div>
            {/* Tab content */}
            <div className="flex-1 min-h-0">
              {resolveTab === 'map' ? (
                <ResultsViewSimple
                  activity={activity}
                  isVisible={true}
                  onToggle={() => {}}
                  currentUserId={userId || ''}
                />
              ) : (
                <div className="h-full flex flex-col overflow-y-auto">
                  <p className="text-center text-white font-bold mb-3 px-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                    {activity.commentQuestion}
                  </p>
                  <CommentSection
                    activity={activity}
                    onCommentSubmit={() => {}}
                    onCommentVote={activity.status === 'completed' ? undefined : async (commentId) => {
                      try {
                        await ActivityService.voteComment(activityId, commentId, userId!);
                        const updated = await ActivityService.getActivity(activityId);
                        setActivity(updated);
                      } catch (err) {
                        console.error('Error voting:', err);
                      }
                    }}
                    showAllComments={true}
                    readOnly={true}
                    currentUserId={userId || ''}
                    sequenceId={sequenceId}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 px-4">
            <ResultsView
              activity={activity}
              isVisible={true}
              onToggle={() => {}}
              onCommentVote={activity.status === 'completed' ? undefined : async (commentId) => {
                try {
                  await ActivityService.voteComment(activityId, commentId, userId!);
                  const updated = await ActivityService.getActivity(activityId);
                  setActivity(updated);
                } catch (err) {
                  console.error('Error voting:', err);
                }
              }}
              currentUserId={userId || ''}
              hoveredSlotNumber={hoveredSlot}
              sequenceId={sequenceId}
            />
          </div>
        )}
      </div>

      {/* Desktop Layout - Split into columns */}
      <div className="hidden sm:flex sm:h-full lg:h-full">
        {/* Left Column: Title + Entry Buttons + Map */}
        <div className="flex-1 flex flex-col px-8 py-6">
          <div className="flex-shrink-0 mb-6 ml-24 xl:ml-32">
            {/* Title with Info Icon */}
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-3xl font-bold text-[#F5F0EB]" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{activity.title}</h2>
              {(activity.preamble || activity.wikiLink) && (
                <button
                  onClick={() => setShowPreamble(true)}
                  className="w-8 h-8 rounded-full bg-[rgba(215,205,195,0.1)] hover:bg-[rgba(215,205,195,0.18)] text-[#F5F0EB] text-sm font-bold flex items-center justify-center transition-colors"
                  aria-label="View information"
                  title="View activity information"
                >
                  i
                </button>
              )}
            </div>

            {/* Entry Circles */}
            {activity.status !== 'completed' && canAddEntries && (
              <div className="flex flex-col items-start">
                <span className="text-sm text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {isSoloTracker ? `Your entries (${userEntryCount}):` : 'Click to add mapping:'}
                </span>
                <div className="flex gap-3 flex-wrap mt-2">
                  {Array.from({ length: maxEntries }, (_, i) => i + 1).map((slot) => {
                    const slotData = getSlotData(slot);
                    const isAddNewSlot = isSoloTracker && slot > userEntryCount;

                    return (
                      <button
                        key={slot}
                        onClick={() => handleEntryClick(slot)}
                        onMouseEnter={() => setHoveredSlot(slot)}
                        onMouseLeave={() => setHoveredSlot(null)}
                        className={`w-10 h-10 rounded-full border-2 transition-all ${
                          slotData.hasData
                            ? 'bg-[#F5F0EB] border-[#F5F0EB] hover:bg-[#F5F0EB]/90'
                            : isAddNewSlot
                              ? 'bg-green-500/30 border-green-500/50 hover:bg-green-500/40'
                              : 'bg-transparent border-[rgba(215,205,195,0.3)] hover:border-[rgba(215,205,195,0.5)]'
                        }`}
                        aria-label={isAddNewSlot ? 'Add new entry' : `Entry ${slot}`}
                      >
                        <span className={`text-sm font-semibold ${
                          slotData.hasData ? 'text-[#1A1714]' : isAddNewSlot ? 'text-green-300' : 'text-[#A89F96]'
                        }`}>
                          {isAddNewSlot ? '+' : slot}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Map - Use ResultsView for tablet (sm-lg), custom for desktop lg+ */}
          <div className="flex-1 min-h-0 flex flex-col">
            {normalizeActivityType(activity.activityType) === 'resolve' ? (
              <>
                {/* Tab bar for sm-lg range */}
                <div className="lg:hidden flex-shrink-0 flex justify-center mb-3">
                  <div className="flex bg-[#111827] rounded-lg p-1 border border-white/10">
                    <button
                      onClick={() => setResolveTab('map')}
                      className={`px-4 py-2 rounded-md transition-colors ${resolveTab === 'map' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'}`}
                      style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                    >
                      Map View
                    </button>
                    <button
                      onClick={() => setResolveTab('comments')}
                      className={`px-4 py-2 rounded-md transition-colors ${resolveTab === 'comments' ? 'bg-[#C83B50] text-white' : 'text-[#A89F96] hover:text-white'}`}
                      style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}
                    >
                      Comments
                    </button>
                  </div>
                </div>
                {/* Map tab (always visible at lg+, conditional at sm-lg) */}
                <div className={`flex-1 min-h-0 ${resolveTab === 'comments' ? 'lg:flex hidden' : 'flex'} flex-col`}>
                  <ResultsViewSimple
                    activity={activity}
                    isVisible={true}
                    onToggle={() => {}}
                    currentUserId={userId || ''}
                  />
                </div>
                {/* Comments tab for sm-lg range */}
                {resolveTab === 'comments' && (
                  <div className="lg:hidden flex-1 flex flex-col overflow-hidden">
                    <p className="text-center text-white font-bold mb-3 px-2" style={{ fontFamily: 'var(--font-barlow), sans-serif', fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: '1.2' }}>
                      {activity.commentQuestion}
                    </p>
                    <div className="flex-1 overflow-hidden">
                      <CommentSection
                        activity={activity}
                        onCommentSubmit={() => {}}
                        onCommentVote={activity.status === 'completed' ? undefined : async (commentId) => {
                          try {
                            await ActivityService.voteComment(activityId, commentId, userId!);
                            const updated = await ActivityService.getActivity(activityId);
                            setActivity(updated);
                          } catch (err) {
                            console.error('Error voting:', err);
                          }
                        }}
                        showAllComments={true}
                        readOnly={true}
                        currentUserId={userId || ''}
                        sequenceId={sequenceId}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <ResultsView
                activity={activity}
                isVisible={true}
                onToggle={() => {}}
                onCommentVote={activity.status === 'completed' ? undefined : async (commentId) => {
                  try {
                    await ActivityService.voteComment(activityId, commentId, userId!);
                    const updated = await ActivityService.getActivity(activityId);
                    setActivity(updated);
                  } catch (err) {
                    console.error('Error voting:', err);
                  }
                }}
                currentUserId={userId || ''}
                hoveredSlotNumber={hoveredSlot}
                sequenceId={sequenceId}
                hideCommentsPanel={true}
              />
            )}
          </div>
        </div>

        {/* Right Column: Comments Panel - Only show on lg+ screens (1024px+) */}
        <div className="hidden lg:flex w-[400px] flex-shrink-0 bg-[#252120] border-l border-[rgba(215,205,195,0.12)] flex-col">
          {/* Comments Title */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-[rgba(215,205,195,0.12)]">
            <h3 className="text-xl font-semibold text-[#F5F0EB] text-center" style={{ fontFamily: 'var(--font-barlow), sans-serif', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              {activity.commentQuestion}
            </h3>
          </div>

          {/* Comments Content */}
          <div className="flex-1 overflow-hidden p-4">
            <CommentSection
              activity={activity}
              onCommentSubmit={() => {}}
              onCommentVote={activity.status === 'completed' ? undefined : async (commentId) => {
                try {
                  await ActivityService.voteComment(activityId, commentId, userId!);
                  const updated = await ActivityService.getActivity(activityId);
                  setActivity(updated);
                } catch (err) {
                  console.error('Error voting:', err);
                }
              }}
              showAllComments={true}
              readOnly={true}
              currentUserId={userId || ''}
              sequenceId={sequenceId}
            />
          </div>
        </div>
      </div>

      {/* Modals */}
      <PreambleModal
        activity={activity}
        isOpen={showPreamble}
        onClose={() => setShowPreamble(false)}
        onBegin={() => {
          setShowPreamble(false);
          setShowEntryModal(true);
        }}
      />

      <EntryModal
        activity={activity}
        isOpen={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        onSubmit={handleEntrySubmit}
        slotNumber={currentSlot}
        existingData={getSlotData(currentSlot)}
      />
    </div>
  );
}
