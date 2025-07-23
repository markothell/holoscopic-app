'use client';

import { useState, useEffect } from 'react';
import { analytics, type AnalyticsStats } from '@/utils/analytics';

export function useAnalytics(activityId?: string) {
  const [stats, setStats] = useState<AnalyticsStats>({
    participants: 0,
    completedMappings: 0,
    comments: 0,
    votes: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await analytics.getStats(activityId);
        setStats(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [activityId]);

  const refetch = async () => {
    try {
      setError(null);
      const result = await analytics.getStats(activityId);
      setStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    }
  };

  return { stats, loading, error, refetch };
}

export function useAllAnalytics() {
  const [allStats, setAllStats] = useState<{ [activityId: string]: AnalyticsStats }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAllStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await analytics.getAllActivitiesStats();
        setAllStats(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch all stats');
      } finally {
        setLoading(false);
      }
    };

    fetchAllStats();
  }, []);

  const refetch = async () => {
    try {
      setError(null);
      const result = await analytics.getAllActivitiesStats();
      setAllStats(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch all stats');
    }
  };

  return { allStats, loading, error, refetch };
}

export { analytics };