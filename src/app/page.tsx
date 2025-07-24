'use client';

import { useState, useEffect } from 'react';
import { WeAllExplainActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  const [activities, setActivities] = useState<WeAllExplainActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);


  // Load activities
  useEffect(() => {
    const loadActivities = async () => {
      try {
        setLoading(true);
        setError(null);
        setIsRateLimited(false);
        
        const activitiesData = await ActivityService.getActivities();
        setActivities(activitiesData);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to load activities';
        
        // Check if it's a rate limit error
        if (errorMessage.includes('Server is busy')) {
          setIsRateLimited(true);
          setError(errorMessage);
          
          // Start countdown and auto-retry after 60 seconds
          let countdown = 60;
          setRetryCountdown(countdown);
          
          const countdownInterval = setInterval(() => {
            countdown -= 1;
            setRetryCountdown(countdown);
            
            if (countdown <= 0) {
              clearInterval(countdownInterval);
              // Auto-retry loading activities
              loadActivities();
            }
          }, 1000);
        } else {
          setError(errorMessage);
        }
        
        console.error('Error loading activities:', err);
      } finally {
        if (!isRateLimited) {
          setLoading(false);
        }
      }
    };

    loadActivities();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading activities...</p>
        </div>
      </div>
    );
  }

  // Color palette inspired by sunset colors - muted/desaturated
  const colors = [
    'bg-rose-400', 'bg-fuchsia-400', 'bg-purple-400', 'bg-indigo-400', 
    'bg-blue-400', 'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400',
    'bg-lime-400', 'bg-yellow-400', 'bg-amber-400', 'bg-orange-400',
    'bg-red-400', 'bg-pink-400', 'bg-violet-400'
  ];

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Image
            src="/wae-logo.svg"
            alt="We All Explain Logo"
            width={75}
            height={75}
            className="mx-auto mb-4"
          />
          <h1 className="text-4xl font-bold text-white mb-8">
            We All Explain
          </h1>
        </div>

        {/* Error State */}
        {error && (
          <div className="max-w-md mx-auto mb-8">
            <div className={`border rounded-lg p-4 ${
              isRateLimited 
                ? 'bg-yellow-900 border-yellow-700' 
                : 'bg-red-900 border-red-700'
            }`}>
              <div className="flex items-center">
                {isRateLimited ? (
                  <svg className="w-5 h-5 text-yellow-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="flex-1">
                  <p className={`text-sm ${
                    isRateLimited ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {error}
                  </p>
                  {isRateLimited && retryCountdown > 0 && (
                    <p className="text-yellow-300 text-xs mt-1">
                      Retrying automatically in {retryCountdown} seconds...
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Activities */}
        <div className="max-w-3xl mx-auto">
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-400 mb-2">No activities available</h3>
              <p className="text-gray-500">Check back later for new collaborative mapping activities.</p>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {activities.map((activity, index) => (
                <Link
                  key={activity.id}
                  href={`/${activity.urlName || activity.id}`}
                  className="block"
                >
                  <div className={`${colors[index % colors.length]} rounded-full px-4 py-2 hover:opacity-80 transition-opacity duration-200`}>
                    <div className="flex items-center space-x-2">
                      <div 
                        className={`w-3 h-3 rounded-full ${activity.status === 'active' ? 'bg-teal-300' : 'bg-gray-700'}`}
                        title={activity.status === 'active' ? 'Active' : 'Completed'}
                      />
                      <span className="text-white font-medium whitespace-nowrap">
                        {activity.title}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
