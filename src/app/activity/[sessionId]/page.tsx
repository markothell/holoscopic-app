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
      <div className="min-h-screen bg-[#1A1714] flex items-center justify-center p-4">
        <div className="text-[#7A7068]" style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Invalid activity</div>
      </div>
    );
  }

  return <ActivityPage activityId={sessionId} />;
}