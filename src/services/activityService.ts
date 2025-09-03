// Activity service for API calls and data management

import { WeAllExplainActivity, ActivityFormData, ApiResponse, ActivityListResponse, Rating, Comment } from '@/models/Activity';
import { UrlUtils } from '@/utils/urlUtils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ActivityService {
  // Get all activities (public - excludes drafts)
  static async getActivities(): Promise<WeAllExplainActivity[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities`);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('⏱️ Server is busy right now. Please wait a minute and try again.');
        }
        throw new Error('Failed to fetch activities');
      }
      const result = await response.json();
      return result.data.activities;
    } catch (error) {
      console.error('Error fetching activities:', error);
      throw error;
    }
  }

  // Get all activities including drafts (admin only)
  static async getAdminActivities(): Promise<WeAllExplainActivity[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/admin`);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('⏱️ Server is busy right now. Please wait a minute and try again.');
        }
        throw new Error('Failed to fetch admin activities');
      }
      const result = await response.json();
      return result.data.activities;
    } catch (error) {
      console.error('Error fetching admin activities:', error);
      throw error;
    }
  }

  // Get single activity by ID
  static async getActivity(id: string): Promise<WeAllExplainActivity> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${id}`);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('⏱️ Server is busy right now. Please wait a minute and try again.');
        }
        throw new Error('Failed to fetch activity');
      }
      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Activity not found');
      }
      return data.data;
    } catch (error) {
      console.error('Error fetching activity:', error);
      throw error;
    }
  }

  // Get single activity by URL name
  static async getActivityByUrlName(urlName: string): Promise<WeAllExplainActivity | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/by-url/${urlName}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        if (response.status === 429) {
          throw new Error('⏱️ Server is busy right now. Please wait a minute and try again.');
        }
        throw new Error('Failed to fetch activity');
      }
      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        return null;
      }
      return data.data;
    } catch (error) {
      console.error('Error fetching activity by URL name:', error);
      throw error;
    }
  }

  // Create new activity
  static async createActivity(formData: ActivityFormData): Promise<WeAllExplainActivity> {
    try {
      // Generate URL name if not provided
      let urlName = formData.urlName;
      if (!urlName) {
        // Get existing activities to check for conflicts
        const existingActivities = await this.getActivities();
        const existingUrlNames = existingActivities.map(a => a.urlName);
        urlName = UrlUtils.generateUniqueActivityName(formData.title, existingUrlNames);
      } else {
        // Validate provided URL name
        const cleanedUrlName = UrlUtils.cleanActivityName(urlName);
        if (!UrlUtils.isValidActivityName(cleanedUrlName)) {
          throw new Error('Invalid activity URL name');
        }
        if (UrlUtils.hasRouteConflict(cleanedUrlName)) {
          throw new Error('Activity URL name conflicts with system routes');
        }
        urlName = cleanedUrlName;
      }

      const activityData: Partial<WeAllExplainActivity> = {
        title: formData.title,
        urlName,
        mapQuestion: formData.mapQuestion,
        mapQuestion2: formData.mapQuestion2,
        objectNameQuestion: formData.objectNameQuestion,
        xAxis: {
          label: formData.xAxisLabel,
          min: formData.xAxisMin,
          max: formData.xAxisMax,
        },
        yAxis: {
          label: formData.yAxisLabel,
          min: formData.yAxisMin,
          max: formData.yAxisMax,
        },
        commentQuestion: formData.commentQuestion,
        starterData: formData.starterData,
        status: 'active',
        participants: [],
        ratings: [],
        comments: [],
      };

      const response = await fetch(`${API_BASE_URL}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityData),
      });

      if (!response.ok) {
        throw new Error('Failed to create activity');
      }

      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to create activity');
      }

      return data.data;
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  }

  // Update existing activity
  static async updateActivity(id: string, formData: ActivityFormData): Promise<WeAllExplainActivity> {
    try {
      // Handle URL name updates
      let urlName = formData.urlName;
      if (urlName) {
        const cleanedUrlName = UrlUtils.cleanActivityName(urlName);
        if (!UrlUtils.isValidActivityName(cleanedUrlName)) {
          throw new Error('Invalid activity URL name');
        }
        if (UrlUtils.hasRouteConflict(cleanedUrlName)) {
          throw new Error('Activity URL name conflicts with system routes');
        }
        
        // Check for duplicates (excluding current activity)
        const existingActivities = await this.getActivities();
        const existingUrlNames = existingActivities.filter(a => a.id !== id).map(a => a.urlName);
        
        if (existingUrlNames.includes(cleanedUrlName)) {
          throw new Error('Activity URL name already exists');
        }
        
        urlName = cleanedUrlName;
      }

      const activityData: any = {
        title: formData.title,
        mapQuestion: formData.mapQuestion,
        mapQuestion2: formData.mapQuestion2,
        objectNameQuestion: formData.objectNameQuestion,
        xAxis: {
          label: formData.xAxisLabel,
          min: formData.xAxisMin,
          max: formData.xAxisMax,
        },
        yAxis: {
          label: formData.yAxisLabel,
          min: formData.yAxisMin,
          max: formData.yAxisMax,
        },
        commentQuestion: formData.commentQuestion,
        starterData: formData.starterData,
      };

      // Only include urlName if it's provided
      if (urlName) {
        activityData.urlName = urlName;
      }

      const response = await fetch(`${API_BASE_URL}/api/activities/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityData),
      });

      if (!response.ok) {
        throw new Error('Failed to update activity');
      }

      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to update activity');
      }

      return data.data;
    } catch (error) {
      console.error('Error updating activity:', error);
      throw error;
    }
  }

  // Delete activity
  static async deleteActivity(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete activity');
      }
    } catch (error) {
      console.error('Error deleting activity:', error);
      throw error;
    }
  }

  // Toggle draft status (admin only)
  static async toggleDraftStatus(id: string, isDraft: boolean): Promise<WeAllExplainActivity> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${id}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isDraft,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle draft status');
      }

      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to toggle draft status');
      }

      return data.data;
    } catch (error) {
      console.error('Error toggling draft status:', error);
      throw error;
    }
  }

  // Submit rating for user
  static async submitRating(activityId: string, userId: string, position: { x: number; y: number }, objectName?: string): Promise<Rating> {
    // Add delay to prevent rapid successive calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          position,
          objectName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to submit rating: ${response.status} - ${errorText}`);
      }

      const data: ApiResponse<Rating> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to submit rating');
      }

      return data.data;
    } catch (error) {
      console.error('Error submitting rating:', error);
      throw error;
    }
  }

  // Submit comment for user
  static async submitComment(activityId: string, userId: string, text: string, objectName?: string): Promise<Comment> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          text,
          objectName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit comment');
      }

      const data: ApiResponse<Comment> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to submit comment');
      }

      return data.data;
    } catch (error) {
      console.error('Error submitting comment:', error);
      throw error;
    }
  }

  // Sync starter data to database
  static async syncStarterData(activityId: string): Promise<WeAllExplainActivity> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/sync-starter-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to sync starter data: ${response.status} - ${errorText}`);
      }

      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to sync starter data');
      }

      return data.data;
    } catch (error) {
      console.error('Error syncing starter data:', error);
      throw error;
    }
  }

  // Submit email for activity
  static async submitEmail(activityId: string, email: string, userId?: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit email');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to submit email');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Don't log duplicate email errors as they're handled gracefully
      if (!errorMessage.includes('Email already submitted')) {
        console.error('Error submitting email:', error);
      }
      throw error;
    }
  }

  // Join activity as participant
  static async joinActivity(activityId: string, userId: string, username: string): Promise<void> {
    // Add delay to prevent rapid successive calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          username,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to join activity: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error joining activity:', error);
      throw error;
    }
  }

  // Vote on comment
  static async voteComment(activityId: string, commentId: string, userId: string): Promise<Comment> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${activityId}/comment/${commentId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to vote on comment');
      }

      const data: ApiResponse<Comment> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to vote on comment');
      }

      return data.data;
    } catch (error) {
      console.error('Error voting on comment:', error);
      throw error;
    }
  }

  // Complete activity (admin only)
  static async completeActivity(id: string): Promise<WeAllExplainActivity> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/activities/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete activity');
      }

      const data: ApiResponse<WeAllExplainActivity> = await response.json();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Failed to complete activity');
      }

      return data.data;
    } catch (error) {
      console.error('Error completing activity:', error);
      throw error;
    }
  }
}