import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'react-native';
// import { useAuthLoading, useUser } from '@/src/_components/UserContext';
// import {} from '../lib/firebaseHelpers';
// @ts-ignore
import { useInboxPolling } from '../hooks/useInboxPolling';
import { deleteConversation } from '../lib/firebaseHelpers/archive';
import { apiService } from '@/src/_services/apiService';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { hapticLight } from '@/lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';
import ConversationItem from '../src/_components/inbox/ConversationItem';


const INBOX_BUILD_TAG = 'inbox-group-fix-2026-03-28-2';


function Inbox() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [profilesById, setProfilesById] = useState<Record<string, any>>({});
  const profilesByIdRef = useRef<Record<string, any>>({});
  const requestedProfileIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    profilesByIdRef.current = profilesById || {};
  }, [profilesById]);
  // Bump cache version to avoid legacy cached placeholder "User" profiles.
  const profilesCacheKey = 'inboxProfilesCache_v2';

  const coerceToEpochMs = useCallback((value: any): number => {
    if (!value) return 0;

    // If it's a Date object
    if (value instanceof Date) return value.getTime();

    // If it's a number
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 0 && value < 10_000_000_000) return value * 1000;
      return value;
    }

    // If it's a string
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      if (/^\d+$/.test(trimmed)) {
        const asNum = Number(trimmed);
        if (asNum > 0 && asNum < 10_000_000_000) return asNum * 1000;
        return asNum;
      }
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    // Firestore/Mongoose Timestamp
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.getTime === 'function') return value.getTime();

    return 0;
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      safeRouterBack();
      return;
    }

    router.replace('/(tabs)/home');
  };

  // Get userId from AsyncStorage (token-based auth)
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [inFocus, setInFocus] = useState(false);
  const lastRefreshAtRef = useRef(0);
  const MIN_FOCUS_REFRESH_MS = 4000;

  useFocusEffect(
    useCallback(() => {
      setInFocus(true);
      return () => setInFocus(false);
    }, [])
  );

  useEffect(() => {
    const getUser = async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        setUserId(uid);
      } catch (error) {
        console.error('Error getting userId:', error);
      } finally {
        setUserLoading(false);
      }
    };
    getUser();
  }, []);

  // Use optimized polling instead of real-time listeners (saves 70-80% on costs)
  const { conversations: polledConversations, loading: polledLoading, ready: polledReady } = useInboxPolling(userId || null, {
    pollingInterval: 8000,
    // PERF: poll only while Inbox is focused.
    autoStart: inFocus
  });

  // Avoid noisy logs in hot render path (hurts perf on Android).

  const [conversations, setConversations] = useState<any[] | null>(null);
  const conversationsRef = useRef<any[] | null>(null);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Merge embedded peer profiles from conversation rows so DM names/avatars appear without waiting on /users/:id.
  useEffect(() => {
    if (!Array.isArray(conversations) || conversations.length === 0) return;

    const isPlaceholderName = (value: any) => {
      const s = String(value || '').trim();
      if (!s) return true;
      const lower = s.toLowerCase();
      const placeholderRegex = /^(user|unknown|guest|null|undefined|nan)(\s*[_-\d]*)?$/i;
      return placeholderRegex.test(lower);
    };

    const emailToNiceName = (emailLike: any) => {
      const s = typeof emailLike === 'string' ? emailLike.trim() : '';
      if (!s) return '';
      if (!s.includes('@')) return s;
      const local = s.split('@')[0] || '';
      return local.trim();
    };

    const needsEnrichment = (profileAny: any) => {
      if (!profileAny) return true;
      const dn = profileAny?.displayName;
      const n = profileAny?.name;
      const un = profileAny?.username;
      const emailFallback = emailToNiceName(profileAny?.email);
      const hasAnyGoodName =
        (!isPlaceholderName(dn) && String(dn || '').trim()) ||
        (!isPlaceholderName(n) && String(n || '').trim()) ||
        (!isPlaceholderName(un) && String(un || '').trim()) ||
        (!isPlaceholderName(emailFallback) && String(emailFallback || '').trim());
      return !hasAnyGoodName;
    };

    const patches: Record<string, any> = {};
    for (const c of conversations) {
      if (c?.isGroup) continue;
      const oid = c?.otherUserId;
      if (!oid) continue;
      const id = String(oid);
      const ou = c?.otherUser ?? c?.otherUserProfile;
      if (!ou || typeof ou !== 'object') continue;
      const cur = profilesByIdRef.current[id];
      if (!needsEnrichment(cur)) continue;
      patches[id] = {
        ...(cur || {}),
        ...ou,
        id: ou.id ?? ou._id ?? id,
        displayName: ou.displayName ?? ou.name ?? cur?.displayName,
        name: ou.name ?? ou.displayName ?? cur?.name,
        username: ou.username ?? cur?.username,
        email: ou.email ?? cur?.email,
        avatar: ou.avatar ?? ou.photoURL ?? cur?.avatar,
        photoURL: ou.photoURL ?? ou.avatar ?? cur?.photoURL,
      };
    }

    if (Object.keys(patches).length === 0) return;

    setProfilesById((prev) => {
      const next = { ...(prev || {}) };
      for (const [id, patch] of Object.entries(patches)) {
        next[id] = patch;
      }
      return next;
    });
  }, [conversations]);

  const [loading, setLoading] = useState(true);
  const [forceLoadTimeout, setForceLoadTimeout] = useState(false);
  const [optimisticReadByOtherId, setOptimisticReadByOtherId] = useState<Record<string, number>>({});

  const normalizeConversations = useCallback((raw: any[]) => {
    if (!Array.isArray(raw)) return [];

    const normalized = raw.map((convo: any) => {
      const participantsRaw = convo?.participants ?? convo?.participantIds ?? convo?.members;
      const participants = Array.isArray(participantsRaw) ? participantsRaw.map(String) : [];
      const isGroup = !!convo?.isGroup;
      const otherId = isGroup ? null : participants.find((p: string) => p !== String(userId));

      const baseId = convo?.conversationId || convo?.id || convo?._id;
      const stableId = typeof baseId === 'string' && baseId.trim()
        ? baseId
        : (participants.length >= 2 ? participants.slice().sort().join('_') : String(baseId || otherId || 'conversation'));

      const lastText = convo?.lastMessage ?? convo?.lastMessageText ?? convo?.last_message;

      // Prefer last-message timestamp fields over updatedAt
      const timeRaw = convo?.lastMessageAt ?? convo?.lastMessageTime ?? convo?.last_message_at ?? convo?.updatedAt ?? convo?.createdAt;
      const lastMessageAt = coerceToEpochMs(timeRaw);

      const optimisticTs = otherId ? optimisticReadByOtherId[String(otherId)] : undefined;
      const suppressUnread = typeof optimisticTs === 'number' && (Date.now() - optimisticTs) < 30000;

      const unreadCountRaw = convo?.unreadCount ?? convo?.unread ?? convo?.unread_count ?? convo?.unreadMessages ?? convo?.unread_messages;
      const unreadCount = suppressUnread ? 0 : (typeof unreadCountRaw === 'number' ? unreadCountRaw : Number(unreadCountRaw || 0));

      return {
        ...convo,
        id: stableId,
        conversationId: stableId,
        isGroup,
        groupName: convo?.groupName || convo?.group?.name || '',
        groupAvatar: convo?.groupAvatar || convo?.group?.avatar || '',
        participants,
        otherUserId: otherId || convo?.otherUserId || convo?.otherUser?.id,
        lastMessage: typeof lastText === 'string' ? lastText : (lastText ? String(lastText) : ''),
        lastMessageAt,
        unreadCount: Number.isFinite(unreadCount) ? unreadCount : 0,
      };
    });

    // Collapse duplicate DM threads for same user (legacy duplicate conversation docs).
    // Keep latest message thread and preserve highest unread count.
    const deduped = new Map<string, any>();
    for (const convo of normalized) {
      const isGroup = !!convo?.isGroup;
      const key = isGroup
        ? `group:${String(convo?.conversationId || convo?.id || '')}`
        : `dm:${String(convo?.otherUserId || '')}`;

      if (!key || key === 'dm:' || key === 'group:') {
        const fallbackKey = `${isGroup ? 'group' : 'dm'}:${String(convo?.conversationId || convo?.id || Math.random())}`;
        deduped.set(fallbackKey, convo);
        continue;
      }

      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, convo);
        continue;
      }

      const existingTs = Number(existing?.lastMessageAt || 0);
      const currentTs = Number(convo?.lastMessageAt || 0);
      const preferred = currentTs >= existingTs ? convo : existing;
      preferred.unreadCount = Math.max(Number(existing?.unreadCount || 0), Number(convo?.unreadCount || 0));
      deduped.set(key, preferred);
    }

    return Array.from(deduped.values()).sort((a, b) => Number(b?.lastMessageAt || 0) - Number(a?.lastMessageAt || 0));
  }, [coerceToEpochMs, optimisticReadByOtherId, userId]);

  // Global warm cache so Inbox can render instantly even before userId is loaded.
  useEffect(() => {
    let mounted = true;
    const raf = requestAnimationFrame(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('inboxConversationsCache_last_v1');
          if (!raw) return;
          const parsed = JSON.parse(raw);
          const data = parsed?.data;
          if (!Array.isArray(data) || data.length === 0) return;
          if (!mounted) return;
          const normalized = normalizeConversations(data);
          setConversations(normalized);
          setLoading(false);
        } catch { }
      })();
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [normalizeConversations]);
  
  const [actionsVisible, setActionsVisible] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [actionItem, setActionItem] = useState<any | null>(null);
  const [actionOtherUserId, setActionOtherUserId] = useState<string | null>(null);
  const [actionTitle, setActionTitle] = useState('');
  
  const [activeTab, setActiveTab] = useState<'primary' | 'unread' | 'groups'>('primary');
  const [inboxSearch, setInboxSearch] = useState('');

  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<any[]>([]);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<any[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);

  const refreshInbox = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiService.get(`/conversations?userId=${userId}`);
      let convos = response?.data;
      if (!response?.success) convos = [];
      if (!Array.isArray(convos)) convos = [];
      setConversations(normalizeConversations(convos));
    } catch (err: any) {
      console.error('❌ Inbox refresh failed:', err?.message || err);
    }
  }, [normalizeConversations, userId]);



  useEffect(() => {
    if (!Array.isArray(conversations) || conversations.length === 0) return;

    const ids = Array.from(new Set(
      conversations
        .map((c: any) => c?.otherUserId)
        .filter((x: any) => typeof x === 'string' && x.trim() !== '')
        .map(String)
    ));

    // Limit profile fetch fanout to keep inbox snappy.
    // IMPORTANT: avoid retriggering this effect for every profilesById update.
    const isPlaceholderName = (value: any) => {
      const s = String(value || '').trim();
      if (!s) return true;
      const lower = s.toLowerCase();
      return lower === 'user' || lower === 'unknown';
    };

    const emailToNiceName = (emailLike: any) => {
      const s = typeof emailLike === 'string' ? emailLike.trim() : '';
      if (!s) return '';
      if (!s.includes('@')) return s;
      const local = s.split('@')[0] || '';
      return local.trim();
    };

    const shouldRefetchProfile = (profileAny: any) => {
      if (!profileAny) return true;
      const dn = profileAny?.displayName;
      const n = profileAny?.name;
      const un = profileAny?.username;
      const emailFallback = emailToNiceName(profileAny?.email);
      const hasAnyGoodName =
        (!isPlaceholderName(dn) && String(dn || '').trim()) ||
        (!isPlaceholderName(n) && String(n || '').trim()) ||
        (!isPlaceholderName(un) && String(un || '').trim()) ||
        (!isPlaceholderName(emailFallback) && String(emailFallback || '').trim());
      return !hasAnyGoodName;
    };

    const missingAll = ids
      .filter((id) => shouldRefetchProfile(profilesByIdRef.current?.[id]))
      .filter((id) => !requestedProfileIdsRef.current.has(id));
    // Fetch a bit more aggressively so names appear quickly (still bounded).
    const missing = missingAll.slice(0, 48);
    if (missing.length === 0) return;

    // Mark as requested immediately to avoid duplicate fanout during rapid re-renders.
    missing.forEach((id) => requestedProfileIdsRef.current.add(String(id)));

    let mounted = true;
    const task = requestAnimationFrame(() => {
      (async () => {
        try {
          // 1) Try AsyncStorage cache first
          let cachedMap: Record<string, any> = {};
          try {
            const raw = await AsyncStorage.getItem(profilesCacheKey);
            cachedMap = raw ? (JSON.parse(raw) || {}) : {};
          } catch { }

          const fromCache: Array<readonly [string, any]> = [];
          const stillMissing: string[] = [];
          for (const id of missing) {
            const cached = cachedMap?.[String(id)];
            if (cached) fromCache.push([String(id), cached] as const);
            else stillMissing.push(String(id));
          }

          if (mounted && fromCache.length > 0) {
            setProfilesById((prev) => {
              const next = { ...(prev || {}) };
              for (const [id, profile] of fromCache) next[String(id)] = profile;
              return next;
            });
          }

          // 2) Fetch remaining (cap concurrency by chunking)
          const results: Array<readonly [string, any]> = [];
          const chunkSize = 12;
          for (let i = 0; i < stillMissing.length; i += chunkSize) {
            const chunk = stillMissing.slice(i, i + chunkSize);
            const settled = await Promise.allSettled(
              chunk.map(async (id) => {
                const res = await apiService.get(`/users/${id}`, userId ? { requesterUserId: String(userId) } : undefined);
                if (!res?.success) return null;
                const data = (res?.data && typeof res.data === 'object' && (res.data as any).data && typeof (res.data as any).data === 'object')
                  ? (res.data as any).data
                  : (res?.data && typeof res.data === 'object' && (res.data as any).user && typeof (res.data as any).user === 'object')
                    ? (res.data as any).user
                    : res?.data;
                if (!data) return null;
                const avatar = data?.avatar || data?.photoURL || DEFAULT_AVATAR_URL;
                return [id, { ...data, avatar }] as const;
              })
            );
            for (const r of settled) {
              if (r.status === 'fulfilled' && r.value) results.push(r.value);
            }
          }

          if (!mounted) return;
          if (results.length > 0) {
            setProfilesById((prev) => {
              const next = { ...(prev || {}) };
              for (const [id, profile] of results) next[String(id)] = profile;
              return next;
            });
          }

          // Persist merged cache
          try {
            const merged = { ...(cachedMap || {}) };
            for (const [id, profile] of fromCache) merged[String(id)] = profile;
            for (const [id, profile] of results) merged[String(id)] = profile;
            await AsyncStorage.setItem(profilesCacheKey, JSON.stringify(merged));
          } catch { }
        } catch { }
      })();
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(task);
    };
  }, [conversations]);

  const filteredSortedConversations = useMemo(() => {
    const safeConversations = Array.isArray(conversations) ? conversations : [];

    const filteredConvosRawStable = safeConversations.filter((c: any) => {
      const archived = typeof c?.isArchived === 'boolean' ? c.isArchived : c?.[`archived_${userId}`];
      return !archived;
    });

    const query = inboxSearch.trim().toLowerCase();
    const out: any[] = [];
    for (const c of filteredConvosRawStable) {
      // Apply text search first (across multiple fields for robustness)
      if (query) {
        const cName = String(c?.groupName || '').toLowerCase();
        const profile = profilesById?.[String(c?.otherUserId)];
        const pName = String(profile?.username || profile?.displayName || profile?.name || '').toLowerCase();
        const oId = String(c?.otherUserId || '').toLowerCase();
        if (!cName.includes(query) && !pName.includes(query) && !oId.includes(query)) continue;
      }

      if (activeTab === 'groups') {
        if (!c?.isGroup) continue;
      } else if (activeTab === 'unread') {
        if ((c?.unreadCount || 0) <= 0) continue;
      } else {
        if (c?.isGroup) continue;
      }

      out.push(c);
    }

    const getSortTime = (c: any) => {
      const ms = coerceToEpochMs(c?.lastMessageAt || c?.updatedAt || c?.lastMessageTime || c?.createdAt);
      return ms || 0;
    };

    out.sort((a: any, b: any) => getSortTime(b) - getSortTime(a));
    return out;
  }, [activeTab, conversations, coerceToEpochMs, inboxSearch, profilesById, userId]);



  const searchUsersForGroup = useCallback(async (query: string) => {
    if (!userId || !query || query.trim().length < 2) {
      setGroupSearchResults([]);
      return;
    }
    try {
      const res = await apiService.get('/users/search', { q: query.trim(), requesterUserId: userId, limit: 30 });
      const users = Array.isArray(res?.data) ? res.data : [];
      setGroupSearchResults(users);
    } catch {
      setGroupSearchResults([]);
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsersForGroup(groupSearch);
    }, 220);
    return () => clearTimeout(timer);
  }, [groupSearch, searchUsersForGroup]);

  const toggleGroupMember = useCallback((u: any) => {
    const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
    if (!id) return;

    setSelectedGroupMembers((prev) => {
      const exists = prev.some((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') === id);
      if (exists) return prev.filter((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') !== id);
      return [...prev, u];
    });
  }, []);

  const resetCreateGroup = useCallback(() => {
    setGroupName('');
    setGroupSearch('');
    setGroupSearchResults([]);
    setSelectedGroupMembers([]);
    setGroupSaving(false);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    console.log('[Inbox] build tag:', INBOX_BUILD_TAG);
    if (!userId || groupSaving) return;
    const trimmedName = groupName.trim();
    if (!trimmedName) return;
    const memberIds = selectedGroupMembers
      .map((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || ''))
      .filter(Boolean);
    if (memberIds.length < 2) return;

    setGroupSaving(true);
    try {
      const result: any = await apiService.post('/conversations/group', {
        name: trimmedName,
        memberIds,
      });
      const createdConversationId = String(result?.conversationId || result?.data?.conversationId || result?.data?._id || '');
      if (!result?.success || !createdConversationId) {
        throw new Error(result?.error || 'Failed to create group');
      }

      setCreateGroupVisible(false);
      resetCreateGroup();
      await refreshInbox();

      router.push({
        pathname: '/dm',
        params: {
          conversationId: createdConversationId,
          isGroup: '1',
          groupName: trimmedName,
          user: trimmedName,
        }
      });
    } catch (error: any) {
      console.error('[Inbox] create group failed:', error?.message || error);
    } finally {
      setGroupSaving(false);
    }
  }, [groupName, groupSaving, refreshInbox, resetCreateGroup, router, selectedGroupMembers, userId]);

  const openActions = useCallback((item: any, otherId: string | null, title: string) => {
    setActionItem(item);
    setActionOtherUserId(otherId);
    setActionTitle(typeof title === 'string' ? title : 'Conversation');
    setConfirmDeleteVisible(false);
    setActionsVisible(true);
  }, []);

  const closeActions = useCallback(() => {
    setActionsVisible(false);
    setConfirmDeleteVisible(false);
  }, []);



  const handleDelete = useCallback(async () => {
    const conversationId = actionItem?.conversationId || actionItem?.id || actionItem?._id;
    if (!conversationId || !userId) return;

    closeActions();
    try {
      setConversations((prev: any[] | null) => {
        if (!Array.isArray(prev)) return prev;
        return prev.filter((c: any) => {
          const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
          const otherId = participants.find((p: string) => p !== String(userId));
          const cid = c?.conversationId || c?.id || c?._id;
          if (actionOtherUserId && otherId && String(otherId) === String(actionOtherUserId)) return false;
          return String(cid) !== String(conversationId);
        });
      });

      const result = await deleteConversation(String(conversationId), String(userId));
      if (!result?.success) {
        await refreshInbox();
      }
    } catch {
      await refreshInbox();
    }
  }, [actionItem, actionOtherUserId, closeActions, refreshInbox, userId]);

  useEffect(() => {
    // Only set loading if actually loading
    if (!polledLoading) {
      setLoading(false);
      setForceLoadTimeout(false); // Reset timeout flag when data loads successfully
      return;
    }

    setLoading(true);

    // Force clear loading after 15 seconds max to prevent infinite spinner
    // Only if we haven't already forced a timeout
    if (!forceLoadTimeout) {
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Inbox loading timeout - forcing display after 15s');
        setLoading(false);
        setForceLoadTimeout(true);
      }, 15000);
      return () => clearTimeout(timeoutId);
    }
  }, [polledLoading]);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return;
    }

    if (__DEV__) {
      console.log('🔵 EFFECT TRIGGERED: polledConversations=', polledConversations?.length, 'userId=', userId);
    }

    // Don't force empty state until polling has produced a definitive result.
    if (!polledReady) return;

    if (!Array.isArray(polledConversations) || polledConversations.length === 0) {
      if (__DEV__) console.log('🟠 No conversations to process');
      setConversations([]);
      return;
    }

    // Normalize IDs and apply optimistic unread suppression.
    // If we already have something on screen, defer normalization to keep navigation instant.
    const shouldDefer = Array.isArray(conversationsRef.current) && (conversationsRef.current as any[]).length > 0;
    const apply = () => {
      const normalizedConvos = normalizeConversations(polledConversations);
      if (__DEV__) {
        console.log('🟢 SETTING CONVERSATIONS:', normalizedConvos?.length, 'convos');
        console.log('📋 First convo sample:', normalizedConvos?.[0]);
      }
      setConversations(normalizedConvos);
    };
    // Prefer a short defer over runAfterInteractions — the latter can wait on unrelated
    // animations and makes inbox / handoff to DM feel sluggish.
    if (shouldDefer) {
      requestAnimationFrame(() => apply());
    } else {
      apply();
    }
    // Persist a global warm cache for instant render next time (even before userId hydration).
    AsyncStorage.setItem('inboxConversationsCache_last_v1', JSON.stringify({ ts: Date.now(), data: polledConversations }))
      .catch(() => {});
  }, [polledConversations, userId, optimisticReadByOtherId, normalizeConversations, polledReady]);

  // Immediate refresh when returning to Inbox (do not wait for next polling tick)
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      const now = Date.now();
      if (now - lastRefreshAtRef.current < MIN_FOCUS_REFRESH_MS) {
        return;
      }
      lastRefreshAtRef.current = now;

      (async () => {
        await refreshInbox();
      })();

      return () => {
        return;
      };
    }, [refreshInbox, userId])
  );

  function formatTime(timestamp: any) {
    const ms = coerceToEpochMs(timestamp);
    if (!ms) return '';
    const date = new Date(ms);
    const now = new Date();
    const diff = Math.max(0, now.getTime() - date.getTime());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  }

  if (!userId) {
    // If we have cached conversations, allow UI to render; userId will hydrate in background.
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return (
        <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          {userLoading ? (
            <ActivityIndicator size="large" color="#007aff" />
          ) : (
            <Text style={{ color: '#999', fontSize: 18, marginTop: 40 }}>
              Please sign in to view your messages.
            </Text>
          )}
        </SafeAreaView>
      );
    }
  }

  // Show loading only if still loading AND no conversations yet.
  // We use `polledLoading` and `userLoading` as our source of truth.
  // Additionally, if the data hasn't synced from the hook yet, we wait.
  const hasAnyConversations = Array.isArray(conversations) && conversations.length > 0;
  // Block UI only when we have nothing to show yet.
  if (!hasAnyConversations && (polledLoading || !polledReady || (loading && conversations === null))) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#007aff" />
      </SafeAreaView>
    );
  }

  // Empty inbox UI removed by request: keep the normal inbox layout even when no chats exist.
  if (!loading && !polledLoading && polledReady && !userLoading && (conversations === null || conversations.length === 0)) {
    if (__DEV__) {
      console.log('🔴 NO CONVERSATIONS - Inbox: No conversations found for user', userId, 'conversations=', conversations);
    }
    // Fall through to normal UI; FlatList will just render empty.
  }
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            handleClose();
          }}
          style={[styles.backBtn, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 10 }]}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={[styles.title, { textAlign: 'center', flex: 1 }]}>Messages</Text>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            setCreateGroupVisible(true);
          }}
          style={[styles.backBtn, { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }]}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="edit" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Instagram-style search bar */}
      <View style={styles.igSearchBar}>
        <Feather name="search" size={16} color="#8e8e8e" style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.igSearchText, { flex: 1, padding: 0 }]}
          placeholder="Search"
          placeholderTextColor="#8e8e8e"
          value={inboxSearch}
          onChangeText={setInboxSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.tabsWrap}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'primary' && styles.tabBtnActive]}
          onPress={() => {
            hapticLight();
            setActiveTab('primary');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'primary' && styles.tabTextActive]}>Primary</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'unread' && styles.tabBtnActive]}
          onPress={() => {
            hapticLight();
            setActiveTab('unread');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>Unread</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'groups' && styles.tabBtnActive]}
          onPress={() => {
            hapticLight();
            setActiveTab('groups');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'groups' && styles.tabTextActive]}>Groups</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSortedConversations}
        keyExtractor={(item: any) => String(item.conversationId || item.id || item._id)}
        renderItem={({ item }: { item: any }) => (
          <ConversationItem
            item={item}
            userId={userId}
            formatTime={formatTime}
            profilesById={profilesById}
            onLongPress={(it) => openActions(it, it.otherUserId, it.displayName)}
            onPress={(it) => {
              setOptimisticReadByOtherId(it.otherUserId || it.id);
              router.push({
                pathname: '/dm',
                params: {
                  conversationId: it._id || it.id,
                  otherUserId: it.otherUserId || it.id,
                  user: it.displayName || 'User',
                  isGroup: it.isGroup ? '1' : '0'
                }
              });
            }}
          />
        )}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40 }}>
            <Feather name="message-circle" size={64} color="#ccc" />
            <Text style={{ color: '#999', marginTop: 16, fontSize: 16, fontWeight: '600' }}>No messages found</Text>
            <Text style={{ color: '#ccc', marginTop: 8, textAlign: 'center' }}>Start a conversation by visiting someone's profile</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={polledLoading && (!conversations || conversations.length === 0)}
            onRefresh={refreshInbox}
            tintColor="#007aff"
          />
        }
      />

      <Modal
        visible={createGroupVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateGroupVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          enabled={Platform.OS === 'ios'}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={styles.groupSheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setCreateGroupVisible(false)} />
            <Pressable style={[styles.groupSheet, { paddingBottom: Math.max(insets.bottom, 20) }]} onPress={() => {}}>
              <View style={styles.groupHandle} />
              <Text style={styles.groupTitle}>New Group</Text>
              <TextInput
                style={styles.groupNameInput}
                placeholder="Group name"
                placeholderTextColor="#9ca3af"
                value={groupName}
                onChangeText={setGroupName}
                maxLength={60}
              />
              <TextInput
                style={styles.groupSearchInput}
                placeholder="Search people to add..."
                placeholderTextColor="#9ca3af"
                value={groupSearch}
                onChangeText={setGroupSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <View style={styles.memberChipsWrap}>
                {selectedGroupMembers.map((m: any) => {
                  const id = String(m?._id || m?.id || m?.firebaseUid || m?.uid || '');
                  const label = m?.displayName || m?.username || m?.name || 'User';
                  return (
                    <TouchableOpacity key={`chip_${id}`} style={styles.memberChip} onPress={() => toggleGroupMember(m)}>
                      <Text style={styles.memberChipText} numberOfLines={1}>{label}</Text>
                      <Feather name="x" size={14} color="#1f2937" />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <FlatList
                data={groupSearchResults}
                keyExtractor={(u: any, index: number) => {
                  const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
                  return id ? `user_${id}` : `user_idx_${index}`;
                }}
                style={{ maxHeight: 230, flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item: u }: { item: any }) => {
                  const id = String(u?._id || u?.id || u?.firebaseUid || u?.uid || '');
                  const selected = selectedGroupMembers.some((m: any) => String(m?._id || m?.id || m?.firebaseUid || m?.uid || '') === id);
                  const name = u?.displayName || u?.username || u?.name || 'User';
                  const avatar = u?.avatar || u?.photoURL || DEFAULT_AVATAR_URL;
                  return (
                    <TouchableOpacity style={styles.memberRow} onPress={() => toggleGroupMember(u)} activeOpacity={0.8}>
                      <Image source={{ uri: avatar }} style={styles.memberAvatar} />
                      <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                      <Feather name={selected ? 'check-circle' : 'circle'} size={18} color={selected ? '#0095f6' : '#9ca3af'} />
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  groupSearch.trim().length >= 2
                    ? <Text style={styles.memberEmpty}>No users found</Text>
                    : <Text style={styles.memberEmpty}>Type to search users</Text>
                }
              />

              <TouchableOpacity
                style={[
                  styles.createGroupBtn,
                  (!groupName.trim() || selectedGroupMembers.length < 2 || groupSaving) && { opacity: 0.5 }
                ]}
                onPress={handleCreateGroup}
                disabled={!groupName.trim() || selectedGroupMembers.length < 2 || groupSaving}
                activeOpacity={0.85}
              >
                <Text style={styles.createGroupBtnText}>{groupSaving ? 'Creating...' : 'Create Group'}</Text>
              </TouchableOpacity>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={actionsVisible}
        transparent
        animationType="fade"
        onRequestClose={closeActions}
      >
        <Pressable style={styles.actionSheetBackdrop} onPress={closeActions}>
          <Pressable style={styles.actionSheetContainer} onPress={() => { }}>
            <Text style={styles.actionSheetTitle} numberOfLines={1}>{actionTitle || 'Conversation'}</Text>

            <TouchableOpacity
              style={[styles.actionSheetButton, styles.actionSheetDeleteButton]}
              activeOpacity={0.8}
              onPress={() => {
                setActionsVisible(false);
                setConfirmDeleteVisible(true);
              }}
            >
              <Feather name="trash-2" size={18} color="#ff3b30" />
              <Text style={[styles.actionSheetButtonText, styles.actionSheetDeleteText]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.actionSheetButton, styles.actionSheetCancelButton]} activeOpacity={0.8} onPress={closeActions}>
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmDeleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteVisible(false)}
      >
        <Pressable style={styles.actionSheetBackdrop} onPress={() => setConfirmDeleteVisible(false)}>
          <Pressable style={styles.confirmContainer} onPress={() => { }}>
            <Text style={styles.confirmTitle}>Delete conversation?</Text>
            <Text style={styles.confirmSubtitle}>This will remove the conversation from your inbox.</Text>
            <View style={styles.confirmRow}>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmCancelBtn]} onPress={() => setConfirmDeleteVisible(false)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, styles.confirmDeleteBtn]} onPress={handleDelete}>
                <Text style={styles.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default Inbox;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerRow: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbdbdb',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    color: '#000',
  },
  backBtn: { padding: 6 },
  iconBtn: { padding: 6 },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    gap: 12,
  },
  chatCard: {
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  chatAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eceff3',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarUnreadRing: {
    borderColor: '#3797f0',
    borderWidth: 3,
  },
  unreadDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3797f0',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 2,
  },
  chatContent: {
    flex: 1,
    minWidth: 0,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
    marginRight: 8,
    maxWidth: 160,
  },
  chatNameUnread: {
    color: '#111',
    fontWeight: 'bold',
  },
  groupMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  chatPreviewPill: {
    alignSelf: 'flex-start',
    maxWidth: '95%',
    backgroundColor: '#f1f4f8',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chatPreviewText: {
    color: '#6b7280',
    fontSize: 13,
  },
  chatMetaCol: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  chatTimeText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  chatUnreadBadge: {
    marginTop: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chatUnreadText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  tabsWrap: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  tabBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  tabBtnActive: {
    backgroundColor: '#262626',
    borderColor: '#262626',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#262626',
  },
  tabTextActive: {
    color: '#fff',
  },
  groupSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  groupHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  groupSearchInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  memberChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '70%',
  },
  memberChipText: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '400',
    maxWidth: 170,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    backgroundColor: '#e5e7eb',
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '400',
  },
  memberEmpty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    paddingVertical: 18,
  },
  createGroupBtn: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#0095f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  createGroupBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionText: {
    marginLeft: 6,
    color: '#007aff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#fff',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  actionSheetTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    marginBottom: 10,
  },
  actionSheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionSheetButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#111',
    fontWeight: '600',
  },
  actionSheetDeleteButton: {
    marginTop: 2,
  },
  actionSheetDeleteText: {
    color: '#ff3b30',
  },
  actionSheetCancelButton: {
    marginTop: 10,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  actionSheetCancelText: {
    fontSize: 16,
    color: '#111',
    fontWeight: '700',
  },
  confirmContainer: {
    marginHorizontal: 22,
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  confirmSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginLeft: 10,
  },
  confirmCancelBtn: {
    backgroundColor: '#f5f5f5',
  },
  confirmCancelText: {
    fontWeight: '700',
    color: '#111',
  },
  confirmDeleteBtn: {
    backgroundColor: '#ff3b30',
  },
  confirmDeleteText: {
    fontWeight: '800',
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  avatarRingUnread: {
    borderWidth: 2,
    borderColor: '#007aff'
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0'
  },
  content: {
    flex: 1,
    paddingRight: 8
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  user: {
    fontWeight: '600',
    fontSize: 15,
    color: '#000',
    flex: 1
  },
  userUnread: {
    fontWeight: '700',
    color: '#000'
  },
  at: {
    color: '#999',
    fontSize: 12,
    marginLeft: 8
  },
  last: {
    color: '#666',
    fontSize: 14,
    flex: 1
  },
  lastUnread: {
    color: '#000',
    fontWeight: '600'
  },
  unreadBadge: {
    backgroundColor: '#007aff',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  unreadText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11
  },
  archiveBtn: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
  },
  archiveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 60,
  },
  emptyIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  exploreBtn: {
    backgroundColor: '#FFB800',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 16,
  },
  exploreBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  groupSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  // ── Instagram DM-style conversation row ──
  igSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#efefef',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  igSearchText: {
    color: '#8e8e8e',
    fontSize: 15,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  igAvatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  igAvatarRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  igAvatarRingUnread: {
    borderColor: '#c13584',
  },
  igAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#efefef',
  },
  igUsername: {
    fontSize: 15,
    fontWeight: '500',
    color: '#262626',
    marginBottom: 2,
  },
  igUsernameBold: {
    fontWeight: '700',
  },
  igGroupMeta: {
    fontSize: 13,
    color: '#8e8e8e',
    marginBottom: 2,
  },
  igPreview: {
    fontSize: 13,
    color: '#8e8e8e',
    fontWeight: '400',
  },
  igPreviewBold: {
    color: '#262626',
    fontWeight: '600',
  },
  igChatRight: {
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
  },
  igBlueDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3797f0',
  },
});
