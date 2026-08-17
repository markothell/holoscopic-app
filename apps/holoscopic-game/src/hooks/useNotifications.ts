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

  // The socket push below is the live path; this poll is the backstop for a
  // dropped connection. Paused while the tab is hidden — otherwise a tab left
  // open in the background hits /notifications twice a minute forever, and
  // that cost scales with every logged-in user. Refetch on focus so a
  // returning tab is current without waiting out the interval.
  useEffect(() => {
    fetchAll();
    const soft = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    const interval = setInterval(soft, 30000);
    window.addEventListener('focus', soft);
    document.addEventListener('visibilitychange', soft);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', soft);
      document.removeEventListener('visibilitychange', soft);
    };
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

  return { notifications, unreadCount, markRead, markAllRead, refresh: fetchAll };
}
