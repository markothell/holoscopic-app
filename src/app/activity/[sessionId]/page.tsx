'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import ActivityPage from '@/components/ActivityPage';
import { OfflineStorage } from '@/hooks/useLocalStorage';

export default function ActivityPageRoute() {
  const params = useParams();
  const sessionId = params.sessionId as string;


  // Track this activity as recently visited
  useEffect(() => {
    if (sessionId) {
      OfflineStorage.addRecentActivity(sessionId);
    }
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Invalid Activity</h2>
          <p className="text-gray-600">No activity ID provided.</p>
        </div>
      </div>
    );
  }

  return <ActivityPage activityId={sessionId} />;
}