// TypeScript interfaces for User model

export interface NotificationSettings {
  newActivities: boolean;
  enrolledActivities: boolean;
}

export interface UserSettings {
  id: string;
  name: string;
  email: string;
  notifications: NotificationSettings;
}

export interface UpdateUserSettingsData {
  name?: string;
  email?: string;
  notifications?: Partial<NotificationSettings>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  bio?: string;
  role: 'user' | 'admin';
  profileVisibility: 'public' | 'sequence_only' | 'private';
  notifications: NotificationSettings;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}
