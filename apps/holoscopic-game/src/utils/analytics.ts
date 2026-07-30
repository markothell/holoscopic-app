interface AnalyticsStats {
  participants: number;
  completedMappings: number;
  comments: number;
  votes: number;
  emails: number;
}

import { authFetch } from '@/lib/api';

// The /analytics routes require a signed-in caller and are scoped to the
// current instance — they used to be anonymous and platform-wide. authFetch
// (rather than bare fetch) attaches the identity token and the instance
// header; without it these all return 401.
class InternalAnalytics {
  private apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  async getStats(activityId?: string): Promise<AnalyticsStats> {
    try {
      const url = activityId
        ? `${this.apiUrl}/analytics/stats/${activityId}`
        : `${this.apiUrl}/analytics/stats`;

      const response = await authFetch(url, { method: 'GET' });
      if (!response.ok) throw new Error('Failed to fetch stats');

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics stats:', error);
      return { participants: 0, completedMappings: 0, comments: 0, votes: 0, emails: 0 };
    }
  }

  async getAllActivitiesStats(): Promise<{ [activityId: string]: AnalyticsStats }> {
    try {
      const response = await authFetch(`${this.apiUrl}/analytics/all-stats`, { method: 'GET' });
      if (!response.ok) throw new Error('Failed to fetch all stats');

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch all analytics stats:', error);
      return {};
    }
  }
}

export const analytics = new InternalAnalytics();
export type { AnalyticsStats };