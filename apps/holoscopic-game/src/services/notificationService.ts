import { apiFetch } from '@/lib/api';
import type { AppNotification } from '@/hooks/useNotifications';

export type { AppNotification };

export const NotificationService = {
  list: (userId: string): Promise<{ notifications: AppNotification[]; unreadCount: number }> =>
    apiFetch('/notifications', { userId }),

  markRead: (userId: string, notificationId: string): Promise<void> =>
    apiFetch(`/notifications/${notificationId}/read`, { method: 'POST', userId }),

  markAllRead: (userId: string): Promise<void> =>
    apiFetch('/notifications/read-all', { method: 'POST', userId }),
};
