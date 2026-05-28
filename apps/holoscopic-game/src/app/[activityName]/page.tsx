'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { HoloscopicActivity } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';
import ActivityPageModal from '@/components/ActivityPageModal';
import { OfflineStorage } from '@/hooks/useLocalStorage';
import Link from 'next/link';

export default function ActivityByNamePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const activityName = params.activityName as string;
  const sequenceId = searchParams.get('sequence');
  
  const [activity, setActivity] = useState<HoloscopicActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    const loadActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get activity by URL name
        const foundActivity = await ActivityService.getActivityByUrlName(activityName);
        
        if (foundActivity) {
          setActivity(foundActivity);
          // Track this activity as recently visited
          OfflineStorage.addRecentActivity(foundActivity.id);
        } else {
          setError('Activity not found');
        }
      } catch (err) {
        console.error('Error loading activity:', err);
        setError('Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    if (activityName) {
      loadActivity();
    }
  }, [activityName]);

  if (loading) {
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
          <p className="text-[#C83B50] mb-4">{error || `Activity "${activityName}" not found`}</p>
          <Link
            href="/"
            className="text-[#C83B50] hover:text-[#e04d63] transition-colors"
            style={{ fontFamily: 'var(--font-dm-mono), monospace', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return <ActivityPageModal activityId={activity.id} sequenceId={sequenceId || undefined} />;
}