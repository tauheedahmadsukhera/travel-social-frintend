import { useState, useEffect, useRef, useCallback } from 'react';
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
  
  // Resolve conversationId from param or global map (for instant profile-to-chat navigation)
  const resolvedConvoId = conversationIdParam || (otherUserId ? convoMap[otherUserId] : null);
  
  const [conversationId, setConversationId] = useState<string | null>(resolvedConvoId);
  
  const conversationIdRef = useRef<string | null>(resolvedConvoId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Initialize from memory cache for instant UI
  const [messages, setMessagesRaw] = useState<any[]>(() => {
    if (resolvedConvoId && messageCache[resolvedConvoId]) {
      return messageCache[resolvedConvoId];
    }
    return [];
  });

  const setMessages = useCallback((val: any[] | ((prev: any[]) => any[])) => {
    setMessagesRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (Array.isArray(next)) {
        const cid = conversationIdRef.current || resolvedConvoId;
        if (cid) {
          setCachedMessages(cid, next.slice(0, 40));
          AsyncStorage.setItem(`messages_cache_${cid}`, JSON.stringify(next.slice(0, 50))).catch(() => {});
        }
      }
      return next;
    });
  }, [resolvedConvoId, setCachedMessages]);

  const [loading, setLoading] = useState(() => {
    if (!resolvedConvoId) return true;
    return messageCache[resolvedConvoId] === undefined;
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

  // Warm Start Cache Loading
  useEffect(() => {
    if (!conversationId) return;
    
    let mounted = true;
    const cacheKey = `messages_cache_${conversationId}`;

    const loadCache = async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (!mounted) return;
        
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // If we already have messages from a faster fetch, don't overwrite with stale cache
            setMessages(prev => {
              if (prev.length > 0) return prev;
              return parsed.map(m => normalizeMessage(m));
            });
            // Update memory cache if not set
            if (messageCache[conversationId] === undefined) {
              setCachedMessages(conversationId, parsed.map(m => normalizeMessage(m)));
            }
          }
        }
        hasPreloadedMessagesRef.current = true;
        setLoading(false);
        if (__DEV__) console.log(`⚡ [useDM] Cache loading finished. rawExists: ${!!raw}`);
      } catch (e) {
        if (__DEV__) console.warn('[useDM] Cache load error:', e);
        hasPreloadedMessagesRef.current = true;
        setLoading(false);
      }
    };

    loadCache();
    return () => { mounted = false; };
  }, [conversationId]);

  // Load Messages & Setup Socket
  useEffect(() => {
    if (!conversationId || !currentUserId) return;
    
    let cancelled = false;
    const cid = conversationId;
    const cacheKey = `messages_cache_${conversationId}`;

    // If we have preloaded messages (either in memory or loaded from disk), don't show the initial spinner
    const hasCache = (messageCache[cid] !== undefined) || hasPreloadedMessagesRef.current;
    if (!hasCache) {
      setLoading(true);
    }
    
    const fetchAll = async () => {
      if (!conversationId && !otherUserId) return;
      
      const extractMessages = (res: any): any[] => {
        if (!res) return [];
        const raw = res?.data || res?.messages || (Array.isArray(res) ? res : []);
        return Array.isArray(raw) ? raw : [];
      };
      
      try {
        // Strategy 1: Fetch by conversationId (if valid)
        const validId = (conversationId && conversationId !== 'null' && conversationId !== 'undefined') ? conversationId : null;
        let msgRes = validId ? await fetchMessages(validId) : null;
        let msgList = extractMessages(msgRes);
        if (__DEV__) console.log(`[DM] Strategy 1 (${validId}): ${msgList.length} messages`);
        
        // Strategy 2: Try concatenated ID format (backend stores messages under "userId1_userId2")
        if (msgList.length === 0 && currentUserId && otherUserId) {
          const concatId1 = `${currentUserId}_${otherUserId}`;
          const concatId2 = `${otherUserId}_${currentUserId}`;
          try {
            const concatRes1 = await fetchMessages(concatId1);
            const concatList1 = extractMessages(concatRes1);
            if (concatList1.length > 0) {
              msgRes = concatRes1;
              msgList = concatList1;
            } else {
              const concatRes2 = await fetchMessages(concatId2);
              const concatList2 = extractMessages(concatRes2);
              if (concatList2.length > 0) {
                msgRes = concatRes2;
                msgList = concatList2;
              }
            }
          } catch {}
        }
        
        // Strategy 3: Participant-based fallback from conversation list
        if (msgList.length === 0 && otherUserId && currentUserId) {
           try {
             const convosRes = await apiService.get(`/conversations?userId=${currentUserId}`);
             const convos = convosRes?.data || convosRes?.conversations || (Array.isArray(convosRes) ? convosRes : []);
             if (Array.isArray(convos)) {
                const matchingConvos = convos.filter((c: any) => {
                 if (c.isGroup) return false;
                 const pRaw = c.participants ?? c.participantIds ?? c.members;
                 const mP = Array.isArray(pRaw) && pRaw.some((p: any) => String(p.id || p._id || p) === String(otherUserId));
                 const mO = (c.otherUser && String(c.otherUser.id || c.otherUser._id) === String(otherUserId)) || String(c.otherUserId) === String(otherUserId);
                 return mP || mO;
               });
               matchingConvos.sort((a: any, b: any) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
               for (const convo of matchingConvos) {
                 const tryId = convo?.id || convo?._id || convo?.conversationId;
                 if (!tryId || String(tryId) === String(conversationId)) continue;
                 const altRes = await fetchMessages(tryId);
                 const altList = extractMessages(altRes);
                 if (altList.length > 0) {
                   msgRes = altRes;
                   msgList = altList;
                   setConversationId(tryId);
                   break;
                 }
               }
             }
           } catch {}
        }

        if (!cancelled) {
          const normalized = msgList.map((m: any) => normalizeMessage(m));
          setMessages(normalized);
          // Update memory and disk cache
          if (normalized.length > 0) {
            setCachedMessages(cid, normalized.slice(0, 30));
            AsyncStorage.setItem(cacheKey, JSON.stringify(normalized.slice(0, 50))).catch(() => {});
          }
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

    const unsub = subscribeToMessages(conversationId, (msg) => {
      const incoming = normalizeMessage(msg);
      setMessages(prev => {
        const merged = mergeMessages(prev, [incoming]);
        setCachedMessages(cid, merged.slice(0, 30));
        AsyncStorage.setItem(cacheKey, JSON.stringify(merged.slice(0, 50))).catch(() => {});
        return merged;
      });
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
