'use client';

import { useState, useEffect, useCallback } from 'react';
import { WeAllExplainActivity, Rating, Comment } from '@/models/Activity';
import { ActivityService } from '@/services/activityService';

interface UseActivityResult {
  activity: WeAllExplainActivity | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateActivity: (updates: Partial<WeAllExplainActivity>) => void;
  addRating: (rating: Rating) => void;
  addComment: (comment: Comment) => void;
  updateRating: (rating: Rating) => void;
  updateComment: (comment: Comment) => void;
}

export function useActivity(activityId: string): UseActivityResult {
  const [activity, setActivity] = useState<WeAllExplainActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch activity data
  const fetchActivity = useCallback(async () => {
    if (!activityId) return;

    try {
      setLoading(true);
      setError(null);
      
      const activityData = await ActivityService.getActivity(activityId);
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity');
      console.error('Error fetching activity:', err);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  // Initial load
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Update activity state
  const updateActivity = useCallback((updates: Partial<WeAllExplainActivity>) => {
    setActivity(prev => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  }, []);

  // Add new rating
  const addRating = useCallback((rating: Rating) => {
    setActivity(prev => {
      if (!prev) return null;
      
      // Remove existing rating from same user
      const filteredRatings = prev.ratings.filter(r => r.userId !== rating.userId);
      
      return {
        ...prev,
        ratings: [...filteredRatings, rating]
      };
    });
  }, []);

  // Add new comment
  const addComment = useCallback((comment: Comment) => {
    setActivity(prev => {
      if (!prev) return null;
      
      // Remove existing comment from same user
      const filteredComments = prev.comments.filter(c => c.userId !== comment.userId);
      
      return {
        ...prev,
        comments: [...filteredComments, comment]
      };
    });
  }, []);

  // Update existing rating
  const updateRating = useCallback((rating: Rating) => {
    setActivity(prev => {
      if (!prev) return null;
      
      const updatedRatings = prev.ratings.map(r => 
        r.userId === rating.userId ? rating : r
      );
      
      return {
        ...prev,
        ratings: updatedRatings
      };
    });
  }, []);

  // Update existing comment
  const updateComment = useCallback((comment: Comment) => {
    setActivity(prev => {
      if (!prev) return null;
      
      const updatedComments = prev.comments.map(c => 
        c.userId === comment.userId ? comment : c
      );
      
      return {
        ...prev,
        comments: updatedComments
      };
    });
  }, []);

  return {
    activity,
    loading,
    error,
    refetch: fetchActivity,
    updateActivity,
    addRating,
    addComment,
    updateRating,
    updateComment,
  };
}