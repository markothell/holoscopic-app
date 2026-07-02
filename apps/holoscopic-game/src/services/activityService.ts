// Activity service for API calls and data management

import { HoloscopicActivity, ActivityFormData, ActivityEntry } from '@/models/Activity';
import { UrlUtils } from '@/utils/urlUtils';
import { authFetch } from '@/lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function parseOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('⏱️ Server is busy right now. Please wait a minute and try again.');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || fallbackMessage);
  }
  return response.json();
}

export class ActivityService {
  // Get all activities (public - excludes drafts)
  static async getActivities(): Promise<HoloscopicActivity[]> {
    const response = await authFetch(`${API_BASE_URL}/activities`);
    const data = await parseOrThrow<{ activities: HoloscopicActivity[] }>(response, 'Failed to fetch activities');
    return data.activities;
  }

  // Get all activities including drafts, optionally scoped to a creator
  static async getAdminActivities(userId?: string): Promise<HoloscopicActivity[]> {
    const url = userId
      ? `${API_BASE_URL}/activities/admin?createdBy=${encodeURIComponent(userId)}`
      : `${API_BASE_URL}/activities/admin`;
    const response = await authFetch(url);
    const data = await parseOrThrow<{ activities: HoloscopicActivity[] }>(response, 'Failed to fetch activities');
    return data.activities;
  }

  // Get single activity by ID (includes entries)
  static async getActivity(id: string): Promise<HoloscopicActivity> {
    const response = await authFetch(`${API_BASE_URL}/activities/${id}`);
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to fetch activity');
    return data.activity;
  }

  // Get single activity by URL name (includes entries)
  static async getActivityByUrlName(urlName: string): Promise<HoloscopicActivity | null> {
    const response = await authFetch(`${API_BASE_URL}/activities/by-url/${urlName}`);
    if (response.status === 404) return null;
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to fetch activity');
    return data.activity;
  }

  // Create new activity
  static async createActivity(formData: ActivityFormData): Promise<HoloscopicActivity> {
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

    const activityData: Record<string, unknown> = {
      title: formData.title,
      urlName,
      activityType: formData.activityType,
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
      preamble: formData.preamble,
      wikiLink: formData.wikiLink,
      starterData: formData.starterData,
      votesPerUser: formData.votesPerUser,
      maxEntries: formData.maxEntries,
      isPublic: formData.isPublic,
      showProfileLinks: formData.showProfileLinks,
      showAxisLabels: formData.showAxisLabels,
    };

    // Include author if provided (for solo tracker mode especially)
    if ((formData as ActivityFormData & { author?: { userId: string; name: string } }).author) {
      activityData.author = (formData as ActivityFormData & { author?: { userId: string; name: string } }).author;
    }

    // Include snapshot-specific fields
    if (formData.activityType === 'snapshot') {
      activityData.snapshotQuestions = formData.snapshotQuestions || [];
      activityData.xAxisPoints = formData.xAxisPoints || 2;
      activityData.yAxisPoints = formData.yAxisPoints || 2;
      activityData.xAxisLabels = formData.xAxisLabels || [];
      activityData.yAxisLabels = formData.yAxisLabels || [];
    }

    const response = await authFetch(`${API_BASE_URL}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activityData),
    });
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to create activity');
    return data.activity;
  }

  // Update existing activity
  static async updateActivity(id: string, formData: ActivityFormData): Promise<HoloscopicActivity> {
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

    const activityData: Record<string, unknown> = {};

    // Only include fields that are actually provided
    if (formData.title !== undefined) activityData.title = formData.title;
    if (formData.mapQuestion !== undefined) activityData.mapQuestion = formData.mapQuestion;
    if (formData.mapQuestion2 !== undefined) activityData.mapQuestion2 = formData.mapQuestion2;
    if (formData.objectNameQuestion !== undefined) activityData.objectNameQuestion = formData.objectNameQuestion;
    if (formData.commentQuestion !== undefined) activityData.commentQuestion = formData.commentQuestion;
    if (formData.preamble !== undefined) activityData.preamble = formData.preamble;
    if (formData.wikiLink !== undefined) activityData.wikiLink = formData.wikiLink;
    if (formData.starterData !== undefined) activityData.starterData = formData.starterData;
    if (formData.votesPerUser !== undefined) activityData.votesPerUser = formData.votesPerUser;
    if (formData.maxEntries !== undefined) activityData.maxEntries = formData.maxEntries;
    if (formData.isPublic !== undefined) activityData.isPublic = formData.isPublic;
    if (formData.showProfileLinks !== undefined) activityData.showProfileLinks = formData.showProfileLinks;
    if (formData.showAxisLabels !== undefined) activityData.showAxisLabels = formData.showAxisLabels;
    if (urlName) activityData.urlName = urlName;

    // Only include author if provided (for the special case of setting author after creation)
    if ((formData as ActivityFormData & { author?: unknown }).author !== undefined) {
      activityData.author = (formData as ActivityFormData & { author?: unknown }).author;
    }

    // Only include axis data if axis labels are provided (means we're actually updating axes)
    if (formData.xAxisLabel !== undefined && formData.xAxisMin !== undefined && formData.xAxisMax !== undefined) {
      activityData.xAxis = {
        label: formData.xAxisLabel,
        min: formData.xAxisMin,
        max: formData.xAxisMax,
      };
    }

    if (formData.yAxisLabel !== undefined && formData.yAxisMin !== undefined && formData.yAxisMax !== undefined) {
      activityData.yAxis = {
        label: formData.yAxisLabel,
        min: formData.yAxisMin,
        max: formData.yAxisMax,
      };
    }

    // Include snapshot-specific fields when updating a snapshot activity
    if (formData.activityType === 'snapshot') {
      if (formData.snapshotQuestions !== undefined) activityData.snapshotQuestions = formData.snapshotQuestions;
      if (formData.xAxisPoints !== undefined) activityData.xAxisPoints = formData.xAxisPoints;
      if (formData.yAxisPoints !== undefined) activityData.yAxisPoints = formData.yAxisPoints;
      if (formData.xAxisLabels !== undefined) activityData.xAxisLabels = formData.xAxisLabels;
      if (formData.yAxisLabels !== undefined) activityData.yAxisLabels = formData.yAxisLabels;
    }

    const response = await authFetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(activityData),
    });
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to update activity');
    return data.activity;
  }

  // Delete activity
  static async deleteActivity(id: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'DELETE',
    });
    await parseOrThrow<{ ok: boolean }>(response, 'Failed to delete activity');
  }

  // Toggle draft status (admin only)
  static async toggleDraftStatus(id: string, isDraft: boolean): Promise<HoloscopicActivity> {
    const response = await authFetch(`${API_BASE_URL}/activities/${id}/draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDraft }),
    });
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to toggle draft status');
    return data.activity;
  }

  // Submit or update an entry — position and/or text for a (slot, question)
  static async submitEntry(
    activityId: string,
    userId: string,
    entry: {
      slotNumber?: number;
      questionId?: string | null;
      position?: { x: number; y: number };
      objectName?: string;
      text?: string;
    }
  ): Promise<ActivityEntry> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        slotNumber: entry.slotNumber ?? 1,
        ...(entry.questionId != null && { questionId: entry.questionId }),
        ...(entry.position && { position: entry.position }),
        ...(entry.objectName !== undefined && { objectName: entry.objectName }),
        ...(entry.text !== undefined && { text: entry.text }),
      }),
    });
    const data = await parseOrThrow<{ entry: ActivityEntry }>(response, 'Failed to submit entry');
    return data.entry;
  }

  // Re-materialize seed entries from starterData
  static async syncStarterData(activityId: string): Promise<HoloscopicActivity> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/sync-starter-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to sync starter data');
    return data.activity;
  }

  // Submit email for activity
  static async submitEmail(activityId: string, email: string, userId?: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, userId }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error || 'Failed to submit email';
      // Don't log duplicate email errors as they're handled gracefully
      if (!message.includes('Email already submitted')) {
        console.error('Error submitting email:', message);
      }
      throw new Error(message);
    }
  }

  // Join activity as participant
  static async joinActivity(activityId: string, userId: string, username: string, sequenceId?: string): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username, sequenceId }),
    });
    await parseOrThrow<{ ok: boolean }>(response, 'Failed to join activity');
  }

  // Vote on an entry (toggle)
  static async voteEntry(activityId: string, entryId: string, userId: string): Promise<ActivityEntry> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/entries/${entryId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await parseOrThrow<{ entry: ActivityEntry }>(response, 'Failed to vote');
    return data.entry;
  }

  // Complete activity (admin only)
  static async completeActivity(id: string): Promise<HoloscopicActivity> {
    const response = await authFetch(`${API_BASE_URL}/activities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const data = await parseOrThrow<{ activity: HoloscopicActivity }>(response, 'Failed to complete activity');
    return data.activity;
  }

  // Clear a specific slot (delete the entry for userId + slotNumber)
  static async clearSlot(activityId: string, userId: string, slotNumber: number): Promise<void> {
    const response = await authFetch(`${API_BASE_URL}/activities/${activityId}/slot?userId=${userId}&slotNumber=${slotNumber}`, {
      method: 'DELETE',
    });
    await parseOrThrow<{ ok: boolean }>(response, 'Failed to clear slot');
  }

  // Get activities a user has participated in
  static async getUserActivities(userId: string): Promise<HoloscopicActivity[]> {
    const response = await authFetch(`${API_BASE_URL}/activities/user/${userId}`);
    const data = await parseOrThrow<{ activities: HoloscopicActivity[] }>(response, 'Failed to fetch user activities');
    return data.activities;
  }
}
