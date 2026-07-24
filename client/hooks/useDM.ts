import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@/lib/storage';
import { 
  fetchMessages, 
  getOrCreateConversation, 
  getUserProfile, 
  sendMessage, 
  editMessage,
  deleteMessage,
  reactToMessage
} from '../lib/firebaseHelpers/index';
import { 
  subscribeToMessages, 
  sendTypingIndicator, 
  stopTypingIndicator, 
  subscribeToTyping,
  initializeSocket
} from '../src/_services/socketService';
import { 
  normalizeMessage, 
  mergeMessages, 
  createTempId, 
  getMessageId 
} from '../src/_services/dmHelpers';
import { apiService } from '../src/_services/apiService';

import { useAppStore } from '@/store/useAppStore';

export function useDM(conversationIdParam: string | null, otherUserId: string | null, currentUserId: string | null, onMessageReceived?: (msg: any) => void) {
  const { messageCache, setCachedMessages, convoMap } = useAppStore();
  
  // Canonical & Pair Key Aliases
  const canonicalPairKey = useMemo(() => {
    if (currentUserId && otherUserId) {
      return [String(currentUserId), String(otherUserId)].sort().join('_');
    }
    return null;
  }, [currentUserId, otherUserId]);

  const directPairKey = useMemo(() => {
    if (currentUserId && otherUserId) return `${currentUserId}_${otherUserId}`;
    return null;
  }, [currentUserId, otherUserId]);

  const reversePairKey = useMemo(() => {
    if (currentUserId && otherUserId) return `${otherUserId}_${currentUserId}`;
    return null;
  }, [currentUserId, otherUserId]);

  // Resolve conversationId from param or global map
  const resolvedConvoId = conversationIdParam || (otherUserId ? convoMap[otherUserId] : null);
  
  const [conversationId, setConversationId] = useState<string | null>(resolvedConvoId);
  
  const conversationIdRef = useRef<string | null>(resolvedConvoId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Helper to get all valid cache key aliases
  const getAllCacheKeys = useCallback(() => {
    return Array.from(new Set([
      conversationIdRef.current,
      conversationId,
      resolvedConvoId,
      canonicalPairKey,
      directPairKey,
      reversePairKey,
      otherUserId ? convoMap[otherUserId] : null
    ].filter(Boolean) as string[]));
  }, [conversationId, resolvedConvoId, canonicalPairKey, directPairKey, reversePairKey, otherUserId, convoMap]);

  // Initialize from memory cache across ALL key aliases for 0ms instant UI
  const [messages, setMessagesRaw] = useState<any[]>(() => {
    const keysToTry = [
      conversationIdParam,
      resolvedConvoId,
      canonicalPairKey,
      directPairKey,
      reversePairKey,
      otherUserId ? convoMap[otherUserId] : null
    ].filter(Boolean) as string[];

    for (const k of keysToTry) {
      if (Array.isArray(messageCache[k]) && messageCache[k].length > 0) {
        return messageCache[k];
      }
    }
    return [];
  });

  const setMessages = useCallback((val: any[] | ((prev: any[]) => any[])) => {
    setMessagesRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (Array.isArray(next)) {
        const keys = getAllCacheKeys();
        keys.forEach((k) => {
          setCachedMessages(k, next.slice(0, 40));
          AsyncStorage.setItem(`messages_cache_${k}`, JSON.stringify(next.slice(0, 50))).catch(() => {});
        });
      }
      return next;
    });
  }, [getAllCacheKeys, setCachedMessages]);

  const [loading, setLoading] = useState(() => {
    const keysToTry = [resolvedConvoId, canonicalPairKey, directPairKey, reversePairKey].filter(Boolean) as string[];
    const hasAnyMemoryCache = keysToTry.some(k => messageCache[k] !== undefined);
    return !hasAnyMemoryCache;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [conversationMeta, setConversationMeta] = useState<any | null>(null);

  const LIMIT = 40;
  const isNearBottomRef = useRef(true);
  const preloadKeyRef = useRef<string>('');
  const hasPreloadedMessagesRef = useRef<boolean>(false);

  // Initialize/Resolve Conversation
  useEffect(() => {
    if (!currentUserId || !otherUserId || conversationId) return;
    
    const resolveTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    getOrCreateConversation(currentUserId, otherUserId)
      .then((res) => {
        clearTimeout(resolveTimeout);
        if (res?.success && res.conversationId) {
          setConversationId(res.conversationId);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        clearTimeout(resolveTimeout);
        setLoading(false);
      });

    return () => clearTimeout(resolveTimeout);
  }, [currentUserId, otherUserId, conversationId]);

  // Global Safety Timeout for Loading
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [loading]);

  // Warm Start Cache Loading from Disk Across All Key Aliases
  useEffect(() => {
    const keysToTry = getAllCacheKeys();
    if (keysToTry.length === 0) return;
    
    let mounted = true;

    const loadCache = async () => {
      try {
        for (const k of keysToTry) {
          const raw = await AsyncStorage.getItem(`messages_cache_${k}`);
          if (!mounted) return;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setMessages(prev => mergeMessages(prev, parsed));
              break;
            }
          }
        }
        hasPreloadedMessagesRef.current = true;
        setLoading(false);
      } catch (e) {
        hasPreloadedMessagesRef.current = true;
        setLoading(false);
      }
    };

    loadCache();
    return () => { mounted = false; };
  }, [conversationId, getAllCacheKeys, setMessages]);

  // Load Messages & Setup Socket — Parallel Multi-Strategy Fetching
  useEffect(() => {
    if (!conversationId && !otherUserId) return;
    if (!currentUserId) return;
    
    let cancelled = false;
    const extractMessages = (res: any): any[] => {
      if (!res) return [];
      const raw = res?.data || res?.messages || (Array.isArray(res) ? res : []);
      return Array.isArray(raw) ? raw : [];
    };
    
    const fetchAll = async () => {
      try {
        const keysToFetch = getAllCacheKeys();
        if (keysToFetch.length === 0) return;

        // PARALLEL FETCH: Fetch all possible ID aliases at once instead of sequential 300ms delays
        const results = await Promise.allSettled(
          keysToFetch.map(k => fetchMessages(k))
        );

        if (cancelled) return;

        let fetchedList: any[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const list = extractMessages(r.value);
            if (list.length > 0) {
              fetchedList = mergeMessages(fetchedList, list);
            }
          }
        }

        if (!cancelled && fetchedList.length > 0) {
          const normalized = fetchedList.map((m: any) => normalizeMessage(m));
          setMessages(prev => mergeMessages(prev, normalized));
        }
      } catch (error) {
        console.error('[DM] Fetch error:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
      
      if (conversationId) {
        apiService.get(`/conversations/${conversationId}`).then(res => {
          if (!cancelled && res?.success) setConversationMeta(res.data);
        }).catch(() => {});
      }
    };

    fetchAll();

    if (!conversationId) return;

    const unsub = subscribeToMessages(conversationId, (msg) => {
      const incoming = normalizeMessage(msg);
      setMessages(prev => mergeMessages(prev, [incoming]));
      if (onMessageReceived) onMessageReceived(incoming);
    });

    const unsubTyping = subscribeToTyping(conversationId, 
      (data) => { if (String(data.userId) === String(otherUserId)) setIsOtherTyping(true); },
      (data) => { if (String(data.userId) === String(otherUserId)) setIsOtherTyping(false); }
    );

    return () => {
      cancelled = true;
      unsub();
      unsubTyping();
    };
  }, [conversationId, currentUserId, otherUserId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !conversationId) return;
    setLoadingMore(true);
    try {
      const res = await fetchMessages(conversationId, { skip: skip + LIMIT, limit: LIMIT });
      const incoming = Array.isArray(res?.messages) ? res.messages : [];
      if (incoming.length > 0) {
        setMessages(prev => mergeMessages(prev, incoming));
        setSkip(prev => prev + LIMIT);
        setHasMore(res.pagination?.hasMore ?? incoming.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.warn('Load more error', e);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore, skip]);

  return {
    conversationId,
    messages,
    loading,
    loadingMore,
    hasMore,
    isOtherTyping,
    conversationMeta,
    loadMore,
    clearMessages: () => setMessages([]),
    setLoading,
    setMessages,
    isNearBottomRef
  };
}
