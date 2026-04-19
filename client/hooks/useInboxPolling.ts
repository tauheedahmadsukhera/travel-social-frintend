/**
 * useInboxPolling Hook
 * Replaces real-time listeners with efficient polling
 * 
 * Usage:
 * const { conversations, loading, error } = useInboxPolling(userId);
 */

import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { startConversationsPolling, startMessagesPolling, stopPolling } from '../lib/pollingService';
import { getCachedUserProfile, cacheUserProfile } from '../lib/redisCache';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UseInboxPollingOptions {
  pollingInterval?: number;
  autoStart?: boolean;
}

export function useInboxPolling(
  userId: string | null,
  options: UseInboxPollingOptions = {}
) {
  // Default to a calmer poll interval to reduce loading/spinner churn and battery usage.
  const { pollingInterval = 12000, autoStart = true } = options;

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True once we have a definitive result (data received or a real failure).
  // Prevents showing "empty inbox" during cold starts / first open jitter.
  const [ready, setReady] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>('active');

  const cacheKey = userId ? `inboxConversationsCache_v1_${userId}` : null;

  // If userId changes (common: null -> real id), reset readiness for the new session.
  useEffect(() => {
    if (!userId) {
      setReady(false);
      setLoading(false);
      return;
    }
    setReady(false);
    setLoading(true);
    setError(null);
  }, [userId]);

  // Warm start from cache to avoid blank/loading on every open
  useEffect(() => {
    if (!cacheKey) return;
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        const data = parsed?.data;
        if (!Array.isArray(data) || data.length === 0) return;
        // Cache is used for instant UI; allow it to be stale and refresh in background.
        // Instagram-style behavior: show last list immediately.
        // (We still refresh via polling once active.)
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (ts && Date.now() - ts > ONE_DAY_MS) {
          // Keep showing stale cache; polling will correct it.
        }
        if (!mounted) return;
        setConversations(data);
        setLoading(false);
        setReady(true);
      } catch { }
    })();
    return () => { mounted = false; };
  }, [cacheKey]);


  useEffect(() => {
    if (!userId || !autoStart) {
      setLoading(false);
      return;
    }

    // Subscribe to app state changes
    const subscription = AppState.addEventListener('change', setAppState);

    let unsubscribeFn: (() => void) | null = null;
    let isMounted = true;
    let loadingEnded = false;

    // Start polling when app is active
    if (appState === 'active') {
      startConversationsPolling(
        userId,
        (data) => {
          if (!isMounted) return;

          // Always update conversations on every poll so inbox stays fresh.
          setConversations(data);
          // Persist cache asynchronously
          if (cacheKey) {
            AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })).catch(() => {});
          }

          // Only use loadingEnded to stop the initial loading spinner.
          if (!loadingEnded) {
            loadingEnded = true;
            setLoading(false);
          }

          setError(null);
          setReady(true);
        },
        pollingInterval
      ).then(unsub => {
        if (isMounted) {
          unsubscribeFn = unsub;
        }
      }).catch((err) => {
        console.error('❌ Failed to start polling:', err);
        // Even if polling fails, stop showing loading
        if (isMounted && !loadingEnded) {
          loadingEnded = true;
          setLoading(false);
          setError(err.message || 'Failed to load conversations');
          setConversations([]); // Show empty state
          setReady(true);
        }
      });
    } else {
      // Stop polling when app goes to background
      stopPolling(`conversations-${userId}`);
    }

    // EMERGENCY TIMEOUT: Force loading off after 3 seconds NO MATTER WHAT
    const emergencyTimeout = setTimeout(() => {
      if (isMounted && !loadingEnded) {
        if (__DEV__) console.warn('🔴 EMERGENCY TIMEOUT: Force loading off after 3s');
        loadingEnded = true;
        setLoading(false);
        // Do NOT mark ready here; we haven't received data or a real failure yet.
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(emergencyTimeout);
      if (unsubscribeFn) {
        unsubscribeFn();
      }
      subscription.remove();
    };
  }, [userId, autoStart, pollingInterval, appState]);

  return { conversations, loading, error, ready };
}

/**
 * useMessagesPolling Hook
 * Polls for new messages in a conversation
 */
interface UseMessagesPollingOptions {
  pollingInterval?: number;
  enabled?: boolean;
}

export function useMessagesPolling(
  conversationId: string | null,
  options: UseMessagesPollingOptions = {}
) {
  const { pollingInterval = 8000, enabled = true } = options;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!conversationId || !enabled) return;

    let unsubscribeFn: (() => void) | null = null;
    let isMounted = true;

    startMessagesPolling(
      conversationId,
      (data) => {
        if (!isMounted) return;
        setMessages(data);
        setLoading(false);
        setError(null);
      },
      pollingInterval
    ).then(unsub => {
      unsubscribeFn = unsub;
    }).catch((err) => {
      if (isMounted) {
        setLoading(false);
        setError(err.message || 'Failed to load messages');
      }
    });

    // Timeout to prevent infinite loading - max 5 seconds
    const timeoutId = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('⏱️ Messages polling timeout - forcing loading off');
        setLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [conversationId, enabled, pollingInterval]);

  return { messages, loading, error };
}

/**
 * Optimized hook for fetching user profiles with cache
 */
export function useUserProfileOptimized(userId: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    (async () => {
      // Try cache first
      const cached = await getCachedUserProfile(userId);
      if (cached) {
        setProfile(cached);
        setLoading(false);
        return;
      }

      // Fall back to Firebase
      try {
        const { getUserProfile } = await import('../lib/firebaseHelpers/user');
        const result = await getUserProfile(userId);
        if (result && result.success && result.data) {
          // Cache the profile
          await cacheUserProfile(userId, result.data);
          setProfile(result.data);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return { profile, loading };
}
