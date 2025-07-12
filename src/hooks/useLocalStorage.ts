'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseLocalStorageResult<T> {
  value: T | null;
  setValue: (value: T | null) => void;
  removeValue: () => void;
  isLoading: boolean;
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T | null = null
): UseLocalStorageResult<T> {
  const [value, setValue] = useState<T | null>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  // Load value from localStorage on mount
  useEffect(() => {
    try {
      const storedValue = localStorage.getItem(key);
      if (storedValue !== null) {
        setValue(JSON.parse(storedValue));
      }
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
    } finally {
      setIsLoading(false);
    }
  }, [key]);

  // Update localStorage when value changes
  const updateValue = useCallback((newValue: T | null) => {
    try {
      if (newValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(newValue));
      }
      setValue(newValue);
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  }, [key]);

  // Remove value from localStorage
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setValue(null);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key]);

  return {
    value,
    setValue: updateValue,
    removeValue,
    isLoading,
  };
}

// Specific hooks for common use cases
export function useUserId(): UseLocalStorageResult<string> {
  return useLocalStorage<string>('userId');
}

export function useUsername(): UseLocalStorageResult<string> {
  return useLocalStorage<string>('username');
}

export function useActivityDraft(activityId: string): UseLocalStorageResult<{
  ratingPosition?: { x: number; y: number };
  commentText?: string;
}> {
  return useLocalStorage(`activity_draft_${activityId}`);
}

export function useRecentActivities(): UseLocalStorageResult<string[]> {
  return useLocalStorage<string[]>('recent_activities', []);
}

// Utility functions for managing user session
export class UserSession {
  static getUserId(): string | null {
    try {
      return localStorage.getItem('userId');
    } catch {
      return null;
    }
  }

  static getUsername(): string | null {
    try {
      return localStorage.getItem('username');
    } catch {
      return null;
    }
  }

  static setUserSession(userId: string, username: string): void {
    try {
      localStorage.setItem('userId', userId);
      localStorage.setItem('username', username);
    } catch (error) {
      console.error('Error setting user session:', error);
    }
  }

  static clearUserSession(): void {
    try {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
    } catch (error) {
      console.error('Error clearing user session:', error);
    }
  }

  static generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Utility functions for managing offline drafts
export class OfflineStorage {
  static saveDraft(activityId: string, draft: {
    ratingPosition?: { x: number; y: number };
    commentText?: string;
  }): void {
    try {
      localStorage.setItem(`activity_draft_${activityId}`, JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }

  static getDraft(activityId: string): {
    ratingPosition?: { x: number; y: number };
    commentText?: string;
  } | null {
    try {
      const draftData = localStorage.getItem(`activity_draft_${activityId}`);
      return draftData ? JSON.parse(draftData) : null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }

  static clearDraft(activityId: string): void {
    try {
      localStorage.removeItem(`activity_draft_${activityId}`);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  }

  static addRecentActivity(activityId: string): void {
    try {
      const recent = JSON.parse(localStorage.getItem('recent_activities') || '[]');
      const filtered = recent.filter((id: string) => id !== activityId);
      const updated = [activityId, ...filtered].slice(0, 10); // Keep only 10 most recent
      localStorage.setItem('recent_activities', JSON.stringify(updated));
    } catch (error) {
      console.error('Error adding recent activity:', error);
    }
  }

  static getRecentActivities(): string[] {
    try {
      return JSON.parse(localStorage.getItem('recent_activities') || '[]');
    } catch (error) {
      console.error('Error loading recent activities:', error);
      return [];
    }
  }
}