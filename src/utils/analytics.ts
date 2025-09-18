interface AnalyticsStats {
  participants: number;
  completedMappings: number;
  comments: number;
  votes: number;
  emails: number;
}

class InternalAnalytics {
  private apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

  async getStats(activityId?: string): Promise<AnalyticsStats> {
    try {
      const url = activityId 
        ? `${this.apiUrl}/api/analytics/stats/${activityId}`
        : `${this.apiUrl}/api/analytics/stats`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics stats:', error);
      return { participants: 0, completedMappings: 0, comments: 0, votes: 0, emails: 0 };
    }
  }

  async getAllActivitiesStats(): Promise<{ [activityId: string]: AnalyticsStats }> {
    try {
      const response = await fetch(`${this.apiUrl}/api/analytics/all-stats`);
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