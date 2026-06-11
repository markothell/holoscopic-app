import { apiFetch } from '@/lib/api';
import type { UserSettings, UpdateUserSettingsData } from '@/models/User';

export type { UserSettings, UpdateUserSettingsData };

export const UserService = {
  getSettings: (userId: string): Promise<UserSettings> =>
    apiFetch(`/users/${userId}/settings`),

  updateSettings: (userId: string, updates: UpdateUserSettingsData): Promise<UserSettings> =>
    apiFetch(`/users/${userId}/settings`, { method: 'PUT', body: JSON.stringify(updates) }),
};
