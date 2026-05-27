import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export interface AppNotification {
  id: string;
  type: 'topic_confirmed' | 'inquiry_linked' | 'algorithm_session_ready' | 'frame_nominated';
  message: string;
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetch = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await apiFetch('/notifications', { userId });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch { /* silent */ }
  }, [userId]);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [fetch]);

  async function markRead(notificationId: string) {
    if (!userId) return;
    await apiFetch(`/notifications/${notificationId}/read`, { method: 'POST', userId });
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    if (!userId) return;
    await apiFetch('/notifications/read-all', { method: 'POST', userId });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetch };
}
