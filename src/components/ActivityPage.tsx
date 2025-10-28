'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HoloscopicActivity, Rating, Comment } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { webSocketService } from '@/services/websocketService';
import { ValidationService } from '@/utils/validation';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useAuth } from '@/contexts/AuthContext';
import CommentSection from './CommentSection';
import ResultsView from './ResultsView';
import SliderQuestions from './SliderQuestions';
import MappingGrid from './MappingGrid';
import Image from 'next/image';

interface ActivityPageProps {
  activityId: string;
  sequenceId?: string;
}

export default function ActivityPage({ activityId, sequenceId }: ActivityPageProps) {
  const { userId, isLoading: authLoading, isAuthenticated } = useAuth();
  const [activity, setActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setIsConnected] = useState(false);
  const [, setIsReconnecting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User state
  const [username, setUsername] = useState<string>('');
  const [userRating, setUserRating] = useState<Rating | null>(null);
  const [userComment, setUserComment] = useState<Comment | null>(null);
  const [userObjectName, setUserObjectName] = useState<string>('');
  const [currentSlot, setCurrentSlot] = useState<number>(1);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  // const [hasSubmitted, setHasSubmitted] = useState(false);

  // Results view interaction state
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [visibleCommentIds, setVisibleCommentIds] = useState<string[]>([]);


  // Ref for results section
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Current screen for mobile navigation
  const [currentScreen, setCurrentScreen] = useState(0);

  // Navigation functions
  const navigateToScreen = (screenIndex: number) => {
    const screens = ['', 'object-name-screen', 'question1-screen', 'question2-screen', 'comment-screen', 'results-screen'];
    const targetId = screens[screenIndex];

    if (targetId) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCurrentScreen(screenIndex);
  };
  
  // Swipe gesture setup
  const swipeRef = useSwipeGesture({
    onSwipeUp: () => {
      if (currentScreen < 5) {
        navigateToScreen(currentScreen + 1);
      }
    },
    onSwipeDown: () => {
      if (currentScreen > 0) {
        navigateToScreen(currentScreen - 1);
      }
    },
    minDistance: 50,
    maxTime: 300
  });

  // Initialize username
  useEffect(() => {
    const storedUsername = localStorage.getItem('username');

    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      // Generate new username
      const newUsername = ValidationService.generateRandomUsername();
      localStorage.setItem('username', newUsername);
      setUsername(newUsername);
    }
  }, []);

  // Load object name for current slot (from database or localStorage)
  useEffect(() => {
    if (!activity || !userId) return;

    // First check if there's data in the database for this slot
    const rating = activity.ratings.find(r =>
      r.userId === userId && (r.slotNumber || 1) === currentSlot
    );
    const comment = activity.comments.find(c =>
      c.userId === userId && (c.slotNumber || 1) === currentSlot
    );

    const dbObjectName = rating?.objectName || comment?.objectName;

    if (dbObjectName) {
      // Use object name from database
      setUserObjectName(dbObjectName);
      // Also update localStorage to keep in sync
      localStorage.setItem(`objectName_${activityId}_slot${currentSlot}`, dbObjectName);
    } else {
      // Fall back to localStorage
      const storedObjectName = localStorage.getItem(`objectName_${activityId}_slot${currentSlot}`);
      if (storedObjectName) {
        setUserObjectName(storedObjectName);
      } else {
        setUserObjectName('');
      }
    }
  }, [activityId, currentSlot, activity, userId]);

  // Update userRating and userComment when slot changes
  useEffect(() => {
    if (!activity || !userId) return;

    // Find rating for current user and slot
    const slotRating = activity.ratings.find(r =>
      r.userId === userId && (r.slotNumber || 1) === currentSlot
    );
    setUserRating(slotRating || null);

    // Find comment for current user and slot
    const slotComment = activity.comments.find(c =>
      c.userId === userId && (c.slotNumber || 1) === currentSlot
    );
    setUserComment(slotComment || null);
  }, [activity, userId, currentSlot]);

  // Helper function to get slot data
  const getSlotData = (slotNum: number) => {
    if (!activity || !userId) return { hasData: false, objectName: '' };

    const rating = activity.ratings.find(r =>
      r.userId === userId && (r.slotNumber || 1) === slotNum
    );
    const comment = activity.comments.find(c =>
      c.userId === userId && (c.slotNumber || 1) === slotNum
    );

    return {
      hasData: !!(rating || comment),
      objectName: rating?.objectName || comment?.objectName || ''
    };
  };

  // Load activity data
  useEffect(() => {
    const loadActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const activityData = await ActivityService.getActivity(activityId);
        setActivity(activityData);

        // Note: userRating and userComment are set by the slot-aware useEffect below
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

  // Initialize WebSocket connection
  useEffect(() => {
    const initializeWebSocket = async () => {
      if (!activityId || !userId || !username) return;

      try {
        setIsReconnecting(true);
        await webSocketService.connect(activityId, userId, username);
        setIsConnected(true);
        
        // Join activity as participant
        await ActivityService.joinActivity(activityId, userId, username);
      } catch (err) {
        console.error('WebSocket connection failed:', err);
        setIsConnected(false);
      } finally {
        setIsReconnecting(false);
      }
    };

    initializeWebSocket();

    return () => {
      webSocketService.disconnect();
    };
  }, [activityId, userId, username]);

  // Set up WebSocket event listeners
  useEffect(() => {
    // Rating events
    const unsubRatingAdded = webSocketService.on('rating_added', ({ rating }) => {
      setActivity(prev => {
        if (!prev) return null;

        // Remove old rating for same user and slot
        const updatedRatings = prev.ratings.filter(r =>
          !(r.userId === rating.userId && (r.slotNumber || 1) === (rating.slotNumber || 1))
        );
        updatedRatings.push(rating);

        return {
          ...prev,
          ratings: updatedRatings
        };
      });

      // Only update userRating if it's for the current slot
      if (rating.userId === userId && (rating.slotNumber || 1) === currentSlot) {
        setUserRating(rating);
      }
    });

    // Comment events
    const unsubCommentAdded = webSocketService.on('comment_added', ({ comment }) => {
      setActivity(prev => {
        if (!prev) return null;

        // Remove old comment for same user and slot
        const updatedComments = prev.comments.filter(c =>
          !(c.userId === comment.userId && (c.slotNumber || 1) === (comment.slotNumber || 1))
        );
        updatedComments.push(comment);

        return {
          ...prev,
          comments: updatedComments
        };
      });

      // Only update userComment if it's for the current slot
      if (comment.userId === userId && (comment.slotNumber || 1) === currentSlot) {
        setUserComment(comment);
      }
    });

    // Comment update events (when user changes position and comment quadrant changes)
    const unsubCommentUpdated = webSocketService.on('comment_updated', ({ comment }) => {
      setActivity(prev => {
        if (!prev) return prev;

        // Update the comment with new quadrant information
        const updatedComments = prev.comments.map(c =>
          c.id === comment.id ? comment : c
        );

        return {
          ...prev,
          comments: updatedComments
        };
      });

      // Only update userComment if it's for the current slot
      if (comment.userId === userId && (comment.slotNumber || 1) === currentSlot) {
        setUserComment(comment);
      }
    });

    // Comment vote events
    const unsubCommentVoted = webSocketService.on('comment_voted', ({ comment }) => {
      setActivity(prev => {
        if (!prev) return prev;

        // Update the comment with new vote count
        const updatedComments = prev.comments.map(c =>
          c.id === comment.id ? comment : c
        );

        return {
          ...prev,
          comments: updatedComments
        };
      });
    });

    // Participant events
    const unsubParticipantJoined = webSocketService.on('participant_joined', ({ participant }) => {
      setActivity(prev => {
        if (!prev) return null;

        const updatedParticipants = prev.participants.filter(p => p.id !== participant.id);
        updatedParticipants.push(participant);

        return {
          ...prev,
          participants: updatedParticipants
        };
      });
    });

    const unsubParticipantLeft = webSocketService.on('participant_left', ({ participantId }) => {
      setActivity(prev => {
        if (!prev) return null;

        return {
          ...prev,
          participants: prev.participants.filter(p => p.id !== participantId)
        };
      });
    });

    return () => {
      unsubRatingAdded();
      unsubCommentAdded();
      unsubCommentUpdated();
      unsubCommentVoted();
      unsubParticipantJoined();
      unsubParticipantLeft();
    };
  }, [userId, currentSlot]);

  // Handle rating submission
  const handleRatingSubmit = async (position: { x: number; y: number }) => {
    if (!activity || !userId || !username) return;

    try {
      // Submit via API only - WebSocket will broadcast the result
      await ActivityService.submitRating(activity.id, userId, position, userObjectName, currentSlot);

    } catch (err) {
      console.error('Error submitting rating:', err);
      // Continue - WebSocket might still work
    }
  };

  // Handle comment submission
  const handleCommentSubmit = async (text: string) => {
    if (!activity || !userId || !username || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // If no rating exists for this slot yet, create one at current slider position (center by default)
      if (!userRating) {
        const defaultPosition = { x: 0.5, y: 0.5 };
        await ActivityService.submitRating(activity.id, userId, defaultPosition, userObjectName, currentSlot);
      }

      // Submit comment via API only - WebSocket will broadcast the result
      await ActivityService.submitComment(activity.id, userId, text, userObjectName, currentSlot);

      // Navigate to results screen after successful submission (with small delay for WebSocket update)
      setTimeout(() => navigateToScreen(5), 100);

      // setHasSubmitted(true);
    } catch (err) {
      console.error('Error submitting comment:', err);
      // Handle error - could show toast notification
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle comment voting
  const handleCommentVote = async (commentId: string) => {
    if (!activity || !userId) return;

    try {
      await ActivityService.voteComment(activity.id, commentId, userId);
    } catch (err) {
      console.error('Error voting on comment:', err);
    }
  };

  // Handle clearing a slot
  const handleClearSlot = async (slotNumber: number) => {
    if (!activity || !userId) return;

    try {
      // Clear localStorage for this slot
      localStorage.removeItem(`objectName_${activityId}_slot${slotNumber}`);

      // Call API to delete rating and comment for this slot
      await ActivityService.clearSlot(activity.id, userId, slotNumber);

      // Clear local state if we're clearing the current slot
      if (slotNumber === currentSlot) {
        setUserObjectName('');
        setUserRating(null);
        setUserComment(null);
      }

      // Reload activity to get updated data
      const updatedActivity = await ActivityService.getActivity(activity.id);
      setActivity(updatedActivity);
    } catch (err) {
      console.error('Error clearing slot:', err);
      alert('Failed to clear entry. Please try again.');
    }
  };


  // Handle results toggle
  const handleResultsToggle = () => {
    setShowResults(!showResults);

    // Scroll to results section if showing results
    if (!showResults && resultsRef.current) {
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    }
  };

  // Results view interaction handlers
  const handleCommentHover = useCallback((commentId: string | null) => {
    setHoveredCommentId(commentId);
  }, []);

  const handleMapDotClick = useCallback((commentId: string) => {
    setVisibleCommentIds(current => {
      if (current.includes(commentId)) {
        setSelectedCommentId(commentId);
      }
      return current;
    });
  }, []);

  const handleVisibleCommentsChange = useCallback((commentIds: string[]) => {
    setVisibleCommentIds(commentIds);
  }, []);

  // Loading state (check auth + activity together)
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

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '-webkit-fill-available' }}>
      {/* Fixed Logo - No Text */}
      <div className="fixed top-4 sm:top-8 left-4 sm:left-8 z-50">
        <a href="http://holoscopic.io" className="hover:opacity-80 transition-opacity">
          <Image
            src="/holoLogo_dark.svg"
            alt="Holoscopic Logo"
            width={40}
            height={40}
            className="sm:w-12 sm:h-12"
          />
        </a>
      </div>

      {/* Scroll Container with Swipe Support */}
      <div ref={swipeRef} className="relative touch-pan-y">
        {/* Screen 1: Activity Entry with Visual Summary */}
        <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-900 to-slate-800 text-white relative px-4 py-8 overflow-y-auto">

          <div className="z-10 max-w-4xl w-full my-auto">
            {/* Activity Title - Underlined */}
            <h1 className="text-4xl sm:text-6xl font-bold mb-6 text-white text-center">
              {activity.title}
            </h1>

            {/* Author Attribution */}
            {activity.author && (
              <p className="text-center text-sm text-gray-300 mb-4">
                Proposed by: {activity.author.name}
              </p>
            )}

            {/* Description and Link Box */}
            {(activity.preamble || activity.wikiLink) && (
              <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm mt-8 mx-auto w-full max-w-[532px] sm:w-[532px]">
                {activity.preamble && (
                  <p className="text-white/90 text-center mb-4">
                    {activity.preamble}
                  </p>
                )}
                {activity.wikiLink && (
                  <p className="text-center">
                    <a href={activity.wikiLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                      Source and discussion on wiki →
                    </a>
                  </p>
                )}
              </div>
            )}

            {/* Visual Summary Section */}
            <div className="flex flex-col sm:flex-row gap-8 justify-center items-start mt-8">
              {/* Entries Box */}
              <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm w-full max-w-[532px] sm:w-[250px]">
                <h2 className="text-xl font-semibold mb-4 text-center">
                  {activity.maxEntries || 1} {activity.maxEntries === 1 ? 'Entry' : 'Entries'}
                </h2>
                <button
                  onClick={() => activity.status === 'completed' ? navigateToScreen(5) : navigateToScreen(1)}
                  className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
                >
                  Answer Questions
                </button>
              </div>

              {/* Simplified Grid Preview */}
              <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm w-full max-w-[532px] sm:w-[250px]">
                <h2 className="text-xl font-semibold mb-4 text-center">Map Axes</h2>
                <div className="relative w-[200px] h-[200px] mx-auto">
                  {/* Professional Axes using arrowAx.svg */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src="/arrowAx.svg"
                      alt="Axis arrows"
                      className="w-full h-full opacity-90"
                      style={{ filter: 'brightness(1.1)' }}
                    />
                  </div>

                  {/* X-axis label */}
                  <div className="absolute transform -translate-y-1/2" style={{ top: '50%', left: '55%' }}>
                    <span className="text-white/90 text-xs font-semibold bg-slate-800 bg-opacity-95 px-2 py-1 rounded shadow-sm">
                      {activity.xAxis.label}
                    </span>
                  </div>

                  {/* Y-axis label */}
                  <div
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 -rotate-90"
                    style={{ left: '50%', top: '25%', transformOrigin: 'center' }}
                  >
                    <span className="text-white/90 text-xs font-semibold bg-slate-800 bg-opacity-95 px-2 py-1 rounded whitespace-nowrap shadow-sm">
                      {activity.yAxis.label}
                    </span>
                  </div>

                </div>
                <button
                  onClick={() => navigateToScreen(5)}
                  className="mt-4 w-full px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
                >
                  View Map
                </button>
              </div>
            </div>

            {/* Completed Activity Notice */}
            {activity.status === 'completed' && (
              <div className="bg-yellow-900 border border-yellow-700 rounded-lg px-4 py-3 mt-8 max-w-2xl mx-auto">
                <p className="text-yellow-200 text-center">
                  This activity is closed. View the completed map.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Screen 2: Object Name Input */}
        <div id="object-name-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">

          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-2xl mx-auto px-4 pb-24">
            <div className="w-full max-w-3xl mx-auto">
              <p className="text-base sm:text-lg text-gray-300 mb-2 text-left">Step 1</p>
              <h2 className="text-white text-4xl sm:text-6xl font-bold text-left leading-tight mb-4">
                {activity.objectNameQuestion || "Name something that represents your perspective"}
              </h2>
              <p className="text-gray-300 text-lg mb-6 text-left">
                Choose a name that will appear with your responses (max 25 characters)
              </p>

              {/* Slot Selector - Only show if maxEntries > 1 */}
              {activity.maxEntries && activity.maxEntries > 1 && (
                <div className="mb-6">
                  <p className="text-sm text-gray-400 mb-2">Select Entry Slot:</p>
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: activity.maxEntries }, (_, i) => i + 1).map((slot) => {
                      const slotData = getSlotData(slot);
                      const truncatedName = slotData.objectName.length > 12
                        ? slotData.objectName.substring(0, 12) + '...'
                        : slotData.objectName;

                      return (
                        <button
                          key={slot}
                          onClick={() => setCurrentSlot(slot)}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            currentSlot === slot
                              ? 'bg-white text-slate-900'
                              : slotData.hasData
                                ? 'bg-white/10 text-white hover:bg-white/20 ring-2 ring-white/40'
                                : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-xs opacity-70">Entry {slot}</span>
                            {slotData.objectName && (
                              <span className="text-sm font-semibold">{truncatedName}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="relative">
                <input
                  type="text"
                  value={userObjectName}
                  onChange={(e) => {
                    const newObjectName = e.target.value.slice(0, 25);
                    setUserObjectName(newObjectName);
                    localStorage.setItem(`objectName_${activityId}_slot${currentSlot}`, newObjectName);
                  }}
                  className="w-full px-6 py-4 text-xl bg-white/10 border-2 border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/60 transition-colors pr-16"
                  placeholder="Enter your object name..."
                  maxLength={25}
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                  {userObjectName.length}/25
                </div>
              </div>

              {/* Update and Clear buttons - Show if current slot has data */}
              {getSlotData(currentSlot).hasData && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={async () => {
                      if (!userRating || !userId) return;
                      try {
                        await ActivityService.submitRating(
                          activity.id,
                          userId,
                          { x: userRating.position.x, y: userRating.position.y },
                          userObjectName,
                          currentSlot
                        );
                        // Show success feedback
                        const btn = event?.currentTarget as HTMLButtonElement;
                        if (btn) {
                          const originalText = btn.textContent;
                          btn.textContent = '✓ Updated!';
                          setTimeout(() => {
                            btn.textContent = originalText;
                          }, 2000);
                        }
                      } catch (err) {
                        console.error('Error updating object name:', err);
                        alert('Failed to update object name');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded-lg transition-colors text-sm font-medium border border-blue-500/40"
                  >
                    Update Name
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm(`Clear all data for Entry ${currentSlot}?`)) {
                        await handleClearSlot(currentSlot);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-colors text-sm font-medium border border-red-500/40"
                  >
                    Clear Entry {currentSlot}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Navigation Arrow */}
          <button 
            onClick={() => navigateToScreen(2)}
            className="absolute bottom-4 sm:bottom-8 left-1/2 transform -translate-x-1/2 text-white hover:text-gray-300 transition-all duration-200 hover:-translate-y-2 safe-area-inset-bottom"
            disabled={!userObjectName.trim()}
          >
            <div className="flex flex-col items-center">
              <img 
                src="/nextArrowsUp.svg" 
                alt="Next" 
                className={`w-16 h-16 sm:w-24 sm:h-24 ${!userObjectName.trim() ? 'opacity-30' : ''}`}
              />
            </div>
          </button>
        </div>

        {/* Screen 3: Question 1 */}
        <div id="question1-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <SliderQuestions
              activity={activity}
              onRatingSubmit={handleRatingSubmit}
              userRating={userRating || undefined}
              showOnlyX={true}
              stepLabel="Step 2"
            />
          </div>
          
          {/* Navigation Arrow */}
          <button 
            onClick={() => navigateToScreen(3)}
            className="absolute bottom-4 sm:bottom-8 left-1/2 transform -translate-x-1/2 text-white hover:text-gray-300 transition-all duration-200 hover:-translate-y-2 safe-area-inset-bottom"
          >
            <div className="flex flex-col items-center">
              <img 
                src="/nextArrowsUp.svg" 
                alt="Next" 
                className="w-16 h-16 sm:w-24 sm:h-24"
              />
            </div>
          </button>
        </div>

        {/* Screen 4: Question 2 */}
        <div id="question2-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <SliderQuestions
              activity={activity}
              onRatingSubmit={handleRatingSubmit}
              userRating={userRating || undefined}
              showOnlyY={true}
              stepLabel="Step 3"
            />
          </div>
          
          {/* Navigation Arrow */}
          <button 
            onClick={() => navigateToScreen(4)}
            className="absolute bottom-4 sm:bottom-8 left-1/2 transform -translate-x-1/2 text-white hover:text-gray-300 transition-all duration-200 hover:-translate-y-2 safe-area-inset-bottom"
          >
            <div className="flex flex-col items-center">
              <img 
                src="/nextArrowsUp.svg" 
                alt="Next" 
                className="w-16 h-16 sm:w-24 sm:h-24"
              />
            </div>
          </button>
        </div>

        {/* Screen 5: Comment */}
        <div id="comment-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <div className="text-left mb-6 sm:mb-8 w-full max-w-[600px]">
              <p className="text-base sm:text-lg text-gray-300 mb-2">Step 4: Answer the question:</p>
              <h2 className="text-4xl sm:text-6xl font-bold text-white mb-6 sm:mb-8">
                {activity.commentQuestion}
              </h2>
            </div>
            
            <div className="bg-slate-600 rounded-lg shadow-lg p-4 sm:p-6 lg:p-8 w-full max-w-[600px]">
              <CommentSection
                activity={activity}
                onCommentSubmit={activity.status === 'completed' ? () => {} : handleCommentSubmit}
                userComment={userComment || undefined}
                showAllComments={false}
                readOnly={activity.status === 'completed'}
                sequenceId={sequenceId}
              />
            </div>

            {/* View Map Button */}
            <div className="mt-6 text-center">
              <button
                onClick={() => navigateToScreen(5)}
                className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
              >
                View Map
              </button>
            </div>
          </div>
        </div>

        {/* Screen 6: Results (Map) */}
        <div id="results-screen" className="min-h-screen lg:h-screen bg-gradient-to-br from-slate-900 to-slate-800">

          {/* Mobile Header */}
          <div className="sm:hidden flex-1 flex flex-col pt-4 pb-4">
            <div className="flex-shrink-0 px-4 mb-4">
              {/* Title - aligned with logo */}
              <div className="ml-16">
                <p className="text-sm text-gray-300 mb-1">Step 5</p>
                <h2 className="text-2xl font-bold text-white">
                  View map and vote
                </h2>
              </div>

              {/* Slot Navigation Buttons - Only show if maxEntries > 1 */}
              {activity.maxEntries && activity.maxEntries > 1 && (
                <div className="flex flex-col items-start ml-16 mt-3">
                  <span className="text-xs text-gray-400 mb-2">Your entries:</span>
                  <div className="flex gap-2">
                    {Array.from({ length: activity.maxEntries }, (_, i) => i + 1).map((slot) => {
                      const slotData = getSlotData(slot);

                      return (
                        <button
                          key={slot}
                          onClick={() => {
                            setCurrentSlot(slot);
                            navigateToScreen(1);
                          }}
                          onMouseEnter={() => setHoveredSlot(slot)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            slotData.hasData
                              ? 'bg-white border-white hover:bg-white/90'
                              : 'bg-transparent border-white/40 hover:border-white/60'
                          }`}
                          aria-label={`Edit entry ${slot}`}
                        >
                          <span className={`text-xs font-semibold ${
                            slotData.hasData ? 'text-slate-900' : 'text-white/70'
                          }`}>
                            {slot}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-0 px-4" ref={resultsRef}>
              <ResultsView
                activity={activity}
                isVisible={true}
                onToggle={handleResultsToggle}
                onCommentVote={activity.status === 'completed' ? undefined : handleCommentVote}
                currentUserId={userId || ''}
                hoveredSlotNumber={hoveredSlot}
                sequenceId={sequenceId}
              />
            </div>
          </div>

          {/* Desktop Full-height Layout - Split into columns */}
          <div className="hidden sm:flex sm:h-full lg:h-full" ref={resultsRef}>
            {/* Left Column: Title + Entries + Map */}
            <div className="flex-1 flex flex-col px-8 py-6">
              {/* Title and Slot Navigation - Vertical layout in all cases */}
              <div className="flex-shrink-0 mb-6 ml-24 xl:ml-32">
                {/* Title */}
                <div className="mb-3">
                  <p className="text-sm text-gray-300 mb-1">Step 5</p>
                  <h2 className="text-3xl font-bold text-white">View map and vote</h2>
                </div>

                {/* Slot Navigation */}
                {activity.maxEntries && activity.maxEntries > 1 && (
                  <div className="flex flex-col items-start">
                    <span className="text-sm text-gray-400 mb-2">Your entries:</span>
                    <div className="flex gap-3">
                      {Array.from({ length: activity.maxEntries }, (_, i) => i + 1).map((slot) => {
                        const slotData = getSlotData(slot);

                        return (
                          <button
                            key={slot}
                            onClick={() => {
                              setCurrentSlot(slot);
                              navigateToScreen(1);
                            }}
                            onMouseEnter={() => setHoveredSlot(slot)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            className={`w-10 h-10 rounded-full border-2 transition-all ${
                              slotData.hasData
                                ? 'bg-white border-white hover:bg-white/90'
                                : 'bg-transparent border-white/40 hover:border-white/60'
                            }`}
                            aria-label={`Edit entry ${slot}`}
                          >
                            <span className={`text-sm font-semibold ${
                              slotData.hasData ? 'text-slate-900' : 'text-white/70'
                            }`}>
                              {slot}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Map - centered in remaining space on lg+, full content with tabs below lg */}
              <div className="flex-1 flex items-center justify-center lg:block">
                {/* Desktop lg+: Just the map */}
                <div className="hidden lg:flex flex-col items-center">
                  {/* Map Title */}
                  <div className="mb-4">
                    <div className="bg-slate-600 px-6 py-3 rounded-lg border border-slate-500">
                      <h3 className="text-xl font-semibold text-white text-center">
                        {activity.xAxis.label} vs {activity.yAxis.label}
                      </h3>
                    </div>
                  </div>

                  {activity.ratings.length > 0 ? (
                    <MappingGrid
                      activity={activity}
                      onRatingSubmit={() => {}}
                      showAllRatings={true}
                      hoveredCommentId={hoveredCommentId}
                      onDotClick={handleMapDotClick}
                      visibleCommentIds={visibleCommentIds}
                      hoveredSlotNumber={hoveredSlot}
                      currentUserId={userId || ''}
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-300">
                      <p>No ratings submitted yet</p>
                    </div>
                  )}
                </div>

                {/* Tablet sm-md: Use ResultsView with tabs */}
                <div className="lg:hidden w-full h-full">
                  <ResultsView
                    activity={activity}
                    isVisible={true}
                    onToggle={handleResultsToggle}
                    onCommentVote={activity.status === 'completed' ? undefined : handleCommentVote}
                    currentUserId={userId || ''}
                    hoveredSlotNumber={hoveredSlot}
                    sequenceId={sequenceId}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Comments Panel - Only show on lg+ screens (1024px+) */}
            <div className="hidden lg:flex w-[400px] flex-shrink-0 bg-slate-700 flex-col">
              {/* Comments Title */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-600">
                <h3 className="text-xl font-semibold text-white text-center">
                  {activity.commentQuestion}
                </h3>
              </div>

              {/* Comments Content */}
              <div className="flex-1 overflow-hidden p-4">
                <CommentSection
                  activity={activity}
                  onCommentSubmit={() => {}}
                  onCommentVote={activity.status === 'completed' ? undefined : handleCommentVote}
                  showAllComments={true}
                  readOnly={true}
                  currentUserId={userId || ''}
                  onCommentHover={handleCommentHover}
                  selectedCommentId={selectedCommentId}
                  onSelectedCommentChange={setSelectedCommentId}
                  onVisibleCommentsChange={handleVisibleCommentsChange}
                  sequenceId={sequenceId}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3b82f6;
          border: 2px solid white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider:focus {
          outline: none;
        }

        .slider:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
        }

        /* Mobile keyboard handling */
        @supports (-webkit-touch-callout: none) {
          /* iOS Safari */
          #comment-screen {
            min-height: -webkit-fill-available;
          }
        }
      `}</style>
    </div>
  );
}