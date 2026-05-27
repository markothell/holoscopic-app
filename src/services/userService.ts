// User service for API calls
import { UserSettings, UpdateUserSettingsData } from '@/models/User';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export class UserService {
  /**
   * Get user settings
   */
  static async getUserSettings(userId: string): Promise<UserSettings> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/settings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user settings');
    }

    return response.json();
  }

  /**
   * Update user settings
   */
  static async updateUserSettings(
    userId: string,
    updates: UpdateUserSettingsData
  ): Promise<UserSettings> {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update user settings');
    }

    return response.json();
  }
}
