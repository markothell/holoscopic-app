'use client';

import { useState, useEffect, useRef } from 'react';
import { WeAllExplainActivity, Rating, Comment } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import { webSocketService } from '@/services/websocketService';
import { ValidationService } from '@/utils/validation';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import CommentSection from './CommentSection';
import ResultsView from './ResultsView';
import SliderQuestions from './SliderQuestions';
import Image from 'next/image';

interface ActivityPageProps {
  activityId: string;
}

export default function ActivityPage({ activityId }: ActivityPageProps) {
  const [activity, setActivity] = useState<WeAllExplainActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setIsConnected] = useState(false);
  const [, setIsReconnecting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // User state
  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [userRating, setUserRating] = useState<Rating | null>(null);
  const [userComment, setUserComment] = useState<Comment | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [emailSubmitted, setEmailSubmitted] = useState<boolean>(false);
  // const [hasSubmitted, setHasSubmitted] = useState(false);

  
  // Ref for results section
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Current screen for mobile navigation
  const [currentScreen, setCurrentScreen] = useState(0);
  
  // Navigation functions
  const navigateToScreen = (screenIndex: number) => {
    const screens = ['', 'question1-screen', 'question2-screen', 'comment-screen', 'results-screen', 'as6-email-capture'];
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

  // Initialize user session
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');
    
    if (storedUserId && storedUsername) {
      setUserId(storedUserId);
      setUsername(storedUsername);
    } else {
      // Generate new user session
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newUsername = ValidationService.generateRandomUsername();
      
      localStorage.setItem('userId', newUserId);
      localStorage.setItem('username', newUsername);
      
      setUserId(newUserId);
      setUsername(newUsername);
    }
  }, []);

  // Load activity data
  useEffect(() => {
    const loadActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const activityData = await ActivityService.getActivity(activityId);
        setActivity(activityData);
        
        // Check if user has already submitted
        const existingRating = activityData.ratings.find(r => r.userId === userId);
        const existingComment = activityData.comments.find(c => c.userId === userId);
        
        if (existingRating) {
          setUserRating(existingRating);
        }
        if (existingComment) {
          setUserComment(existingComment);
        }
        
        // setHasSubmitted(!!existingRating || !!existingComment);
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
    webSocketService.on('rating_added', ({ rating }) => {
      setActivity(prev => {
        if (!prev) return null;
        
        const updatedRatings = prev.ratings.filter(r => r.userId !== rating.userId);
        updatedRatings.push(rating);
        
        return {
          ...prev,
          ratings: updatedRatings
        };
      });
      
      if (rating.userId === userId) {
        setUserRating(rating);
      }
    });

    // Comment events
    webSocketService.on('comment_added', ({ comment }) => {
      setActivity(prev => {
        if (!prev) return null;
        
        // Check if comment already exists (avoid duplicates)
        const existingCommentIndex = prev.comments.findIndex(c => 
          c.userId === comment.userId && c.text === comment.text
        );
        
        if (existingCommentIndex >= 0) {
          // Update existing comment
          const updatedComments = [...prev.comments];
          updatedComments[existingCommentIndex] = comment;
          return {
            ...prev,
            comments: updatedComments
          };
        } else {
          // Add new comment (replacing any old comment from same user)
          const updatedComments = prev.comments.filter(c => c.userId !== comment.userId);
          updatedComments.push(comment);
          return {
            ...prev,
            comments: updatedComments
          };
        }
      });
      
      if (comment.userId === userId) {
        setUserComment(comment);
      }
    });

    // Comment update events (when user changes position and comment quadrant changes)
    webSocketService.on('comment_updated', ({ comment }) => {
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
      
      if (comment.userId === userId) {
        setUserComment(comment);
      }
    });

    // Comment vote events
    webSocketService.on('comment_voted', ({ comment }) => {
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
    webSocketService.on('participant_joined', ({ participant }) => {
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

    webSocketService.on('participant_left', ({ participantId }) => {
      setActivity(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          participants: prev.participants.filter(p => p.id !== participantId)
        };
      });
    });

    return () => {
      webSocketService.off('rating_added');
      webSocketService.off('comment_added');
      webSocketService.off('comment_voted');
      webSocketService.off('participant_joined');
      webSocketService.off('participant_left');
    };
  }, [userId]);

  // Handle rating submission
  const handleRatingSubmit = async (position: { x: number; y: number }) => {
    if (!activity || !userId || !username) return;

    try {
      // Submit via API only - WebSocket will broadcast the result
      await ActivityService.submitRating(activity.id, userId, position);
      
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
      // Submit via API only - WebSocket will broadcast the result
      await ActivityService.submitComment(activity.id, userId, text);
      
      // Navigate to results screen after successful submission
      navigateToScreen(4);
      
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

  // Handle email submission
  const handleEmailSubmit = async (email: string) => {
    if (!activity || !email.trim()) return;
    
    try {
      await ActivityService.submitEmail(activity.id, email, userId);
      setUserEmail(email);
      setEmailSubmitted(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Handle duplicate email gracefully - user already submitted this email
      if (errorMessage.includes('Email already submitted')) {
        console.log('Email already submitted for this activity - showing thank you screen');
        setUserEmail(email);
        setEmailSubmitted(true);
      } else {
        // For other errors, log but still show thank you to avoid blocking UX
        console.error('Error submitting email:', err);
        setUserEmail(email);
        setEmailSubmitted(true);
      }
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

  // Loading state
  if (loading) {
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

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '-webkit-fill-available' }}>

      {/* Scroll Container with Swipe Support */}
      <div ref={swipeRef} className="relative touch-pan-y">
        {/* Screen 1: Activity Title */}
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white relative px-4">
          {/* Top Left Logo */}
          <div className="absolute top-4 sm:top-8 left-4 sm:left-8 z-10">
            <a href="/" className="hover:opacity-80 transition-opacity">
              <Image
                src="/wae-logo.svg"
                alt="We All Explain Logo"
                width={40}
                height={40}
                className="sm:w-12 sm:h-12"
              />
            </a>
          </div>
          
          <div className="text-center z-10 max-w-4xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8 text-white">
              We All Explain
            </h1>
            <div className="bg-rose-400 px-6 sm:px-8 lg:px-12 py-4 sm:py-6 rounded-full shadow-lg mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-white">
                {activity.title}
              </h2>
            </div>
            
            {/* Completed Activity Notice */}
            {activity.status === 'completed' && (
              <div className="bg-yellow-900 border border-yellow-700 rounded-lg px-4 py-3 mb-6 sm:mb-8">
                <p className="text-yellow-200 text-center">
                  This activity is closed.<br />Click below to view completed map.
                </p>
              </div>
            )}
            
            {/* Navigation Arrow */}
            <button 
              onClick={() => activity.status === 'completed' ? navigateToScreen(4) : navigateToScreen(1)}
              className="text-white hover:text-gray-300 transition-all duration-200 hover:-translate-y-2"
            >
              <img 
                src="/nextArrows.svg" 
                alt="Next" 
                className="w-24 h-24"
              />
            </button>
          </div>
        </div>

        {/* Screen 2: Question 1 */}
        <div id="question1-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          {/* Top Left Logo */}
          <div className="absolute top-4 sm:top-8 left-4 sm:left-8 z-10">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              <a href="/" className="hover:text-gray-300 transition-colors">
                We All Explain
              </a>
            </h1>
          </div>
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <SliderQuestions
              activity={activity}
              onRatingSubmit={handleRatingSubmit}
              userRating={userRating || undefined}
              showOnlyX={true}
              stepLabel="Step 1"
            />
          </div>
          
          {/* Navigation Arrow */}
          <button 
            onClick={() => navigateToScreen(2)}
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

        {/* Screen 3: Question 2 */}
        <div id="question2-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          {/* Top Left Logo */}
          <div className="absolute top-4 sm:top-8 left-4 sm:left-8 z-10">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              <a href="/" className="hover:text-gray-300 transition-colors">
                We All Explain
              </a>
            </h1>
          </div>
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <SliderQuestions
              activity={activity}
              onRatingSubmit={handleRatingSubmit}
              userRating={userRating || undefined}
              showOnlyY={true}
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

        {/* Screen 4: Comment */}
        <div id="comment-screen" className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 to-slate-800 text-white relative">
          {/* Top Left Logo */}
          <div className="absolute top-4 sm:top-8 left-4 sm:left-8 z-10">
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              <a href="/" className="hover:text-gray-300 transition-colors">
                We All Explain
              </a>
            </h1>
          </div>
          
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-4xl mx-auto px-4 pb-24">
            <div className="text-left mb-6 sm:mb-8 w-full max-w-[600px]">
              <p className="text-base sm:text-lg text-gray-300 mb-2">Step 3: Answer the question:</p>
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
              />
            </div>
          </div>
          
          {/* Navigation to Results */}
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

        {/* Screen 5: Results */}
        <div id="results-screen" className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 relative flex flex-col">
          {/* Top Left Logo */}
          <div className="absolute top-4 sm:top-6 left-4 sm:left-8 z-10">
            <h1 className="text-lg sm:text-xl font-bold text-white">
              <a href="/" className="hover:text-gray-300 transition-colors">
                We All Explain
              </a> <span className="text-pink-600 text-sm sm:text-lg">{activity?.title}</span>
            </h1>
          </div>
          
          <div className="flex-1 flex flex-col pt-16 sm:pt-20 pb-4">
            <div className="flex-shrink-0 px-4 mb-2 lg:mb-4">
              <div className="text-left max-w-4xl mx-auto">
                <p className="text-sm sm:text-base text-gray-300 mb-1">Step 4</p>
                <h2 className="text-xl sm:text-2xl lg:text-4xl xl:text-6xl font-bold text-white">
                  View map and vote
                </h2>
              </div>
            </div>
            <div className="flex-1 min-h-0 px-4" ref={resultsRef}>
              <ResultsView
                activity={activity}
                isVisible={true}
                onToggle={handleResultsToggle}
                onCommentVote={activity.status === 'completed' ? undefined : handleCommentVote}
                currentUserId={userId}
              />
            </div>
          </div>
        </div>

        {/* Screen 6: Email Capture (AS6) */}
        <div id="as6-email-capture" className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white relative px-4">
          <div className="text-center max-w-md mx-auto">
            {!emailSubmitted ? (
              <>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-8">
                  Receive the next invite:
                </h2>
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const email = formData.get('email') as string;
                    handleEmailSubmit(email);
                  }}
                  className="space-y-6"
                >
                  <input
                    type="email"
                    name="email"
                    placeholder="Enter your email"
                    required
                    className="w-full px-6 py-4 rounded-full bg-slate-300 text-black placeholder-gray-600 text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent border border-slate-400"
                  />
                  
                  <button
                    type="submit"
                    className="inline-block px-8 py-4 bg-rose-400 hover:bg-rose-500 text-white font-semibold rounded-full transition-colors duration-200 text-lg"
                  >
                    Let's Explain
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <a href="/" className="inline-block hover:opacity-80 transition-opacity">
                    <Image
                      src="/wae-logo.svg"
                      alt="We All Explain Logo"
                      width={64}
                      height={64}
                      className="mx-auto mb-4"
                    />
                  </a>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                  Thank you!
                </h2>
                <p className="text-gray-300 text-lg">
                  We'll let you know when the next activity is ready.
                </p>
              </>
            )}
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