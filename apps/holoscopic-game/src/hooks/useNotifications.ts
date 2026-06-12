import { useState, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { NotificationService } from '@/services/notificationService';

export interface AppNotification {
  id: string;
  type: 'topic_confirmed' | 'inquiry_linked' | 'algorithm_session_ready' | 'frame_nominated' | 'activity_closed';
  message: string;
  refType: string | null;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

export function useNotifications(userId: string | null, socket: Socket | null = null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await NotificationService.list(userId);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch { /* silent */ }
  }, [userId]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Live push: prepend new notification when server emits one
  useEffect(() => {
    if (!socket) return;
    const handler = (n: AppNotification) => {
      setNotifications(prev => [n, ...prev]);
      setUnreadCount(prev => prev + 1);
    };
    socket.on('notification_new', handler);
    return () => { socket.off('notification_new', handler); };
  }, [socket]);

  async function markRead(notificationId: string) {
    if (!userId) return;
    await NotificationService.markRead(userId, notificationId);
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    if (!userId) return;
    await NotificationService.markAllRead(userId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetch };
}
