import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@/lib/storage';
import { apiService } from '@/src/_services/apiService';
import { getSocket, initializeSocket } from '@/src/_services/socketService';
import { useNetworkStatus } from './useOffline';
import { useAppStore } from '@/store/useAppStore';

function previewFromMessage(msg: any): string {
  const text = typeof msg?.text === 'string' ? msg.text.trim() : '';
  if (text) return text;
  if (msg?.sharedPost) return 'Shared a post';
  if (msg?.sharedStory) return 'Shared a story';
  const mediaType = String(msg?.mediaType || '').toLowerCase();
  if (mediaType === 'image') return '[IMAGE]';
  if (mediaType === 'video') return '[VIDEO]';
  if (mediaType === 'audio' || mediaType === 'voice') return '[AUDIO]';
  if (mediaType) return `[${mediaType.toUpperCase()}]`;
  return 'New message';
}

function convoIdsMatch(a: any, b: any): boolean {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Inbox: cache → socket local patch (instant) → rare reconcile fetch.
 * Avoids full /conversations hit on every newMessage (Instagram-style feel, lighter load).
 */
export function useInboxRealtime(userId: string | null) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { isOnline } = useNetworkStatus();
  const setConvoMapping = useAppStore((s) => s.setConvoMapping);

  const cacheKey = userId ? `inboxConversationsCache_v2_${userId}` : null;
  const conversationsRef = useRef<any[]>([]);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const applyConvoMap = useCallback((list: any[]) => {
    if (!Array.isArray(list)) return;
    list.forEach((c: any) => {
      if (!c?.isGroup && c?.otherUserId) {
        setConvoMapping(String(c.otherUserId), String(c.id || c._id || c.conversationId));
      }
    });
  }, [setConvoMapping]);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    if (fetchInFlightRef.current) {
      await fetchInFlightRef.current;
      return;
    }

    const run = (async () => {
      try {
        const response = await apiService.get(`/conversations?userId=${userId}`, { params: { _t: Date.now() }, bypassDedupe: true });
        let convos = response?.data;
        if (!response?.success) convos = [];
        if (!Array.isArray(convos)) convos = [];

        setConversations(convos);
        applyConvoMap(convos);
        setError(null);
        setReady(true);
        setLoading(false);

        if (cacheKey) {
          AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: convos })).catch(() => {});
        }
      } catch (err: any) {
        console.error('❌ Failed to fetch conversations:', err);
        setError(err.message || 'Failed to load conversations');
        setLoading(false);
        setReady(true);
      } finally {
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = run;
    await run;
  }, [userId, cacheKey, applyConvoMap]);

  const scheduleReconcile = useCallback((delayMs = 2500) => {
    if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null;
      fetchConversations();
    }, delayMs);
  }, [fetchConversations]);

  const patchFromMessage = useCallback((msg: any) => {
    if (!userId || !msg) return false;

    const conversationId = msg.conversationId || msg.conversation_id;
    if (!conversationId) return false;

    const preview = previewFromMessage(msg);
    const tsRaw = msg.timestamp || msg.createdAt || Date.now();
    const ts = typeof tsRaw === 'number'
      ? (tsRaw < 10_000_000_000 ? tsRaw * 1000 : tsRaw)
      : Date.parse(String(tsRaw)) || Date.now();

    const senderId = String(msg.senderId || msg.sender_id || '');
    const isOwn = !!senderId && (
      senderId === String(userId) ||
      String(userId).includes(senderId) ||
      senderId.includes(String(userId))
    );

    const prev = conversationsRef.current || [];
    const idx = prev.findIndex((c) =>
      convoIdsMatch(c?.id || c?._id || c?.conversationId, conversationId)
    );

    // New thread we don't have yet → need a real fetch
    if (idx < 0) return false;

    const existing = prev[idx];
    const nextUnread = isOwn
      ? Number(existing?.unreadCount || existing?.unread || 0)
      : Number(existing?.unreadCount || existing?.unread || 0) + 1;

    const updated = {
      ...existing,
      lastMessage: preview,
      lastMessageText: preview,
      lastMessageAt: ts,
      lastMessageTime: ts,
      updatedAt: ts,
      unreadCount: nextUnread,
      unread: nextUnread,
    };

    const next = [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    conversationsRef.current = next;
    setConversations(next);

    if (cacheKey) {
      AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: next })).catch(() => {});
    }

    return true;
  }, [userId, cacheKey]);

  // Warm start from cache
  useEffect(() => {
    if (!cacheKey) return;
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const data = parsed?.data;
        if (!Array.isArray(data) || data.length === 0) return;
        if (!mounted) return;
        setConversations(data);
        applyConvoMap(data);
        setLoading(false);
        setReady(true);
      } catch { }
    })();
    return () => { mounted = false; };
  }, [cacheKey, applyConvoMap]);

  // Refetch when network transitions from offline to online
  useEffect(() => {
    if (isOnline && userId && ready) {
      fetchConversations();
    }
  }, [isOnline, userId, ready, fetchConversations]);

  // Main Socket Connection & Fetch Logic
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setReady(false);
      return;
    }

    let isMounted = true;
    let activeSocket: any = null;

    const handleNewMessage = (msg?: any) => {
      if (!isMounted) return;
      const patched = patchFromMessage(msg);
      if (patched) {
        // Soft reconcile later so unread/peer fields stay accurate without spamming API
        scheduleReconcile(2500);
      } else {
        // Unknown conversation (new DM) — fetch soon, still coalesce bursts
        scheduleReconcile(400);
      }
    };

    const handleReadOrLightChange = () => {
      if (!isMounted) return;
      // Read receipts rarely need instant full list — coalesce
      scheduleReconcile(1500);
    };

    fetchConversations();

    initializeSocket(userId).then((socket) => {
      if (!isMounted) return;
      activeSocket = socket;
      socket.on('newMessage', handleNewMessage);
      socket.on('newMediaMessage', handleNewMessage);
      socket.on('messageRead', handleReadOrLightChange);
    });

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        fetchConversations();
        const socket = getSocket();
        if (socket && socket.disconnected) {
          socket.connect();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    const emergencyTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(emergencyTimeout);
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      subscription.remove();

      if (activeSocket) {
        activeSocket.off('newMessage', handleNewMessage);
        activeSocket.off('newMediaMessage', handleNewMessage);
        activeSocket.off('messageRead', handleReadOrLightChange);
      } else {
        const socket = getSocket();
        if (socket) {
          socket.off('newMessage', handleNewMessage);
          socket.off('newMediaMessage', handleNewMessage);
          socket.off('messageRead', handleReadOrLightChange);
        }
      }
    };
  }, [userId, fetchConversations, patchFromMessage, scheduleReconcile]);

  return { conversations, loading, error, ready, refresh: fetchConversations };
}
