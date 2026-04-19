import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { notificationService, Notification } from '@/lib/notificationService';

export const useNotifications = (userId: string, pollInterval = 15000) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const isFetchingRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const MIN_FETCH_GAP_MS = 8000;
  const appStateRef = useRef(AppState.currentState);

  const fetchNotifications = useCallback(async (options?: { force?: boolean }) => {
    if (!userId) return;

    const now = Date.now();
    const isRecent = now - lastFetchAtRef.current < MIN_FETCH_GAP_MS;
    if (!options?.force && isRecent) {
      return;
    }

    if (isFetchingRef.current) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const data = await notificationService.getNotifications(userId);
      setNotifications(data);
      
      // Count unread
      const unread = data.filter((n: Notification) => !n.read).length;
      setUnreadCount(unread);
      
      console.log('[useNotifications] Fetched', data.length, 'notifications, unread:', unread);
    } catch (err) {
      console.error('[useNotifications] Error:', err);
    } finally {
      lastFetchAtRef.current = Date.now();
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  const markAsRead = async (notificationId: string) => {
    const success = await notificationService.markAsRead(notificationId);
    if (success) {
      setNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    const success = await notificationService.markAllAsRead();
    if (success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  // Poll for notifications on interval (foreground only)
  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchNotifications({ force: true });

    let interval: any = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(fetchNotifications, pollInterval);
    };
    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    start();

    const sub = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [userId, pollInterval, fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead
  };
};
