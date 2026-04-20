
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import {
    addNotification,
    deleteMessage,
    editMessage,
    fetchMessages,
    getOrCreateConversation,
    getUserProfile,
    markConversationAsRead,
    reactToMessage,
    sendMessage,
    clearConversation,
} from '../lib/firebaseHelpers/index';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { apiService } from '@/src/_services/apiService';
import { extensionFromFileUri, uploadMedia, sendMediaMessage as sendMediaMessageApi } from '../lib/firebaseHelpers/messages';
import { getFormattedActiveStatus, subscribeToUserPresence, updateUserOffline, updateUserPresence, UserPresence } from '../lib/userPresence';
import MessageBubble from '@/src/_components/MessageBubble';
import ShareModal from '@/src/_components/ShareModal';
import StoriesViewer from '@/src/_components/StoriesViewer';
import EmojiPicker from 'rn-emoji-keyboard';
import { useUserProfile } from '@/src/_hooks/useUserProfile';
import * as ImagePicker from 'expo-image-picker';
import {
  initializeSocket,
  subscribeToMessages as socketSubscribeToMessages,
  subscribeToMessageSent,
  subscribeToMessageDelivered,
  subscribeToMessageRead,
  markMessageAsRead,
  sendTypingIndicator,
  stopTypingIndicator,
  subscribeToTyping,
} from '@/src/_services/socketService';

import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { useOfflineBanner } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

export default function DM() {
  const insets = useSafeAreaInsets();
  const { showSuccess } = useAppDialog();
  const { showBanner } = useOfflineBanner();
  const params = useLocalSearchParams();
  const router = useRouter();
  const rawParamConversationId = params.conversationId as unknown;
  const paramConversationId: string | null = Array.isArray(rawParamConversationId)
    ? (rawParamConversationId[0] as string) || null
    : (typeof rawParamConversationId === 'string' ? rawParamConversationId : null);
  const isGroupParam = String((params as any)?.isGroup || '') === '1';
  
  const otherUserId: string | null = (() => {
    const raw = (params.otherUserId ?? params.id) as unknown;
    if (Array.isArray(raw)) return (raw[0] as string) || null;
    return typeof raw === 'string' ? raw : null;
  })();

  // If DM opened by selecting a user (search/profile), never trust a carried-over
  // conversationId from previous screen state.
  const shouldResolveConversationFromUser = !!otherUserId && !isGroupParam;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    shouldResolveConversationFromUser ? null : paramConversationId
  );
  const [conversationMeta, setConversationMeta] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);

  const toTimestampMs = useCallback((raw: any): number => {
    if (!raw) return Date.now();
    if (raw instanceof Date) return raw.getTime();

    // Firestore Timestamp-like: { seconds, nanoseconds } or { _seconds, _nanoseconds }
    if (typeof raw === 'object') {
      const anyRaw: any = raw;
      if (typeof anyRaw?.toDate === 'function') {
        try {
          const d = anyRaw.toDate();
          if (d instanceof Date) return d.getTime();
        } catch { }
      }
      const s = anyRaw?.seconds ?? anyRaw?._seconds;
      const ns = anyRaw?.nanoseconds ?? anyRaw?._nanoseconds ?? 0;
      if (typeof s === 'number' && Number.isFinite(s)) {
        const extra = typeof ns === 'number' && Number.isFinite(ns) ? Math.floor(ns / 1_000_000) : 0;
        return s * 1000 + extra;
      }
    }

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // seconds vs ms
      if (raw > 0 && raw < 10_000_000_000) return raw * 1000;
      return raw;
    }

    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, []);

  const messagesWithSeparators = useMemo(() => {
    const list: any[] = [];
    let lastDate: string | null = null;
    
    const parseTime = (msg: any) => {
      // Fast-path: most messages will have cached timestamp
      const cached = msg && (msg.__ts ?? msg.__timestampMs);
      if (typeof cached === 'number' && Number.isFinite(cached)) return cached;

      // CRITICAL: Only use the ROOT-level createdAt/timestamp.
      // Never fall through to nested sharedStory.createdAt or sharedPost.createdAt
      // which represent when the story/post was originally posted, NOT when the
      // message was sent.

      // Pending / optimistic messages: use a STABLE time from the message only.
      // (Old code used Date.now() every render, which reshuffled the whole thread.)
      if (!msg || String(msg.id).startsWith('local_') || msg.tempOrigin) {
        const t = toTimestampMs(msg?.createdAt ?? msg?.timestamp);
        return Number.isFinite(t) && t > 0 ? t : 0;
      }

      // Extract only own-property timestamp - avoid nested object timestamps
      let t = undefined;
      if (msg.hasOwnProperty('createdAt') && msg.createdAt !== undefined && msg.createdAt !== null) {
        t = msg.createdAt;
      }
      if (t === undefined && msg.hasOwnProperty('timestamp') && msg.timestamp !== undefined && msg.timestamp !== null) {
        t = msg.timestamp;
      }
      
      if (!t) return Date.now();
      return toTimestampMs(t);
    };

    // Sort chronologically (oldest first)
    // Sort reverse-chronologically (newest first) for inverted list
    const sorted = [...messages].sort((a, b) => {
      const ta = parseTime(a);
      const tb = parseTime(b);
      
      // Secondary sort to ensure stability
      if (ta !== tb) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });

    sorted.forEach((msg) => {
      const ms = parseTime(msg);
      const dateObj = new Date(ms > Date.now() ? Date.now() : ms);
      const dateLabel = dateObj.toLocaleDateString();
      
      if (dateLabel !== lastDate) {
        // In an inverted list, newest is at the top (index 0).
        // If we list newest-to-oldest, we want the date separator 
        // to appear ABOVE the first message of that day.
        list.push({ type: 'date', date: dateLabel, id: `date_${dateLabel}` });
        lastDate = dateLabel;
      }
      list.push(msg);
    });
    return list;
  }, [messages, toTimestampMs]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const LIMIT = 40;
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [input, setInput] = useState("");
  const [canMessage, setCanMessage] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  
  // States for features
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const [replyingTo, setReplyingTo] = useState<{ id: string; text: string; senderId: string } | null>(null);
  const [showPostSelector, setShowPostSelector] = useState(false);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserPresence, setOtherUserPresence] = useState<UserPresence | null>(null);
  const [shareSearchQuery, setShareSearchQuery] = useState("");
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [sharePostItem, setSharePostItem] = useState<any>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [storyViewerData, setStoryViewerData] = useState<{ stories: any[]; visible: boolean }>({ stories: [], visible: false });
  const recordingObjRef = useRef<Audio.Recording | null>(null);
  const isStoppingRecordingRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const pendingStopAfterStartRef = useRef(false);
  const recordingStartedAtRef = useRef<number>(0);
  const routeChatKeyRef = useRef<string>('');
  const preloadKeyRef = useRef<string>('');
  const hasPreloadedMessagesRef = useRef<boolean>(false);

  const createTempId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const getMessageId = (m: any): string => {
    const raw = m?.id || m?._id || m?.messageId;
    return raw ? String(raw) : '';
  };

  const getMessageFallbackKey = (m: any): string => {
    const created = String(m?.createdAt || m?.timestamp || '');
    const sender = String(m?.senderId || '');
    const kind = String(m?.mediaType || 'text');
    const body = String(m?.text || m?.mediaUrl || m?.audioUrl || '').slice(0, 80);
    return `${sender}|${created}|${kind}|${body}`;
  };

  const dedupeById = (list: any[]): any[] => {
    const map = new Map<string, any>();
    for (const item of list) {
      const n = normalizeMessage(item);
      // Keep last occurrence (newer/merged tends to come later)
      map.set(String(n.id), n);
    }
    return Array.from(map.values());
  };

  const normalizeMessage = (m: any): any => {
    const rawText = typeof m?.text === 'string' ? m.text : '';
    const trimmedText = rawText.trim();
    const legacyStoryMatch = rawText.match(/story[:;]\/\/([A-Za-z0-9_-]+)|Shared a story:\s*([A-Za-z0-9_-]+)/i);
    const legacyStoryId = legacyStoryMatch?.[1] || legacyStoryMatch?.[2] || '';

    const normalizedMediaType = m?.mediaType || m?.type || m?.messageType
      || (m?.audioUrl ? 'audio' : undefined)
      || ((m?.audioDuration || m?.duration) && !trimmedText ? 'audio' : undefined)
      || (m?.sharedStory ? 'story' : undefined)
      || (legacyStoryId ? 'story' : undefined)
      || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(m4a|aac|mp3|wav|ogg)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'audio' : undefined)
      || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(mp4|mov|webm)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'video' : undefined)
      || (typeof (m?.mediaUrl || m?.url || m?.fileUrl) === 'string' && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(String(m?.mediaUrl || m?.url || m?.fileUrl)) ? 'image' : undefined)
      || (m?.imageUrl ? 'image' : undefined)
      || (m?.sharedPost ? 'post' : undefined)
      || (m?.sharedStory ? 'story' : undefined);

    const normalizedMediaUrl = m?.mediaUrl || m?.url || m?.fileUrl || m?.attachmentUrl || m?.media?.url || m?.imageUrl;
    const normalizedAudioUrl = m?.audioUrl || (normalizedMediaType === 'audio' ? normalizedMediaUrl : undefined);
    const normalizedAudioDuration = m?.audioDuration || m?.duration;

    const id = getMessageId(m);
    
    // IMPORTANT: Preserve root-level createdAt/timestamp.
    // When spreading ...m, nested sharedStory.createdAt or sharedPost.createdAt
    // could overwrite the root message timestamp. Extract and preserve them.
    const rootCreatedAt = m?.createdAt;
    const rootTimestamp = m?.timestamp;
    
    const base = {
      ...m,
      // Re-apply root timestamps AFTER spread to prevent nested object leakage
      createdAt: rootCreatedAt,
      timestamp: rootTimestamp,
      mediaType: normalizedMediaType,
      ...(legacyStoryId && !m?.sharedStory
        ? {
            sharedStory: {
              storyId: legacyStoryId,
              id: legacyStoryId,
              userId: m?.senderId,
              userName: 'Story',
              userAvatar: DEFAULT_AVATAR_URL,
            }
          }
        : {}),
      ...(normalizedMediaUrl ? { mediaUrl: normalizedMediaUrl } : {}),
      ...(normalizedAudioUrl ? { audioUrl: normalizedAudioUrl } : {}),
      ...(normalizedAudioDuration ? { audioDuration: normalizedAudioDuration } : {}),
    };

    const withId = id ? { ...base, id } : { ...base, id: `local_${getMessageFallbackKey(base)}` };

    // Cache a stable message timestamp (ms) to avoid repeated deep parsing/sorting work.
    const t = (() => {
      const createdAt = withId?.createdAt;
      const timestamp = withId?.timestamp;
      const raw = (createdAt ?? timestamp);
      return toTimestampMs(raw);
    })();

    return { ...withId, __ts: t };
  };

  const mergeMessages = (existing: any[], incoming: any[]): any[] => {
    const map = new Map<string, any>();

    // Index existing messages by ID
    existing.forEach((m) => {
      const id = getMessageId(m) || String(m?.id || '');
      const key = id || `local_${getMessageFallbackKey(m)}`;
      // Avoid re-normalizing existing messages; just ensure they have __ts for fast sorting.
      const hasTs = typeof m?.__ts === 'number' && Number.isFinite(m.__ts);
      const withTs = hasTs ? m : { ...m, __ts: normalizeMessage(m).__ts };
      map.set(String(key), withTs);
    });

    // Merge incoming messages
    incoming.forEach((m) => {
      const n = normalizeMessage(m);
      const prev = map.get(n.id) || {};
      
      // CRITICAL: If we have local optimistic updates (reactions or edits), 
      // and the incoming message is older than our last update, preserve local state.
      // This prevents the "revert" effect when polling or sockets return slightly stale data.
      
      const isDowngrade = n.mediaType === 'text' && 
                        (prev.mediaType === 'audio' || prev.mediaType === 'video' || prev.mediaType === 'image' || prev.mediaType === 'post' || prev.mediaType === 'story');

      // Check for reaction sync
      const prevReactions = prev.reactions || {};
      const incomingReactions = n.reactions || {};
      
      // Heuristic: If local has reactions and incoming doesn't, or local has more, 
      // it might be an optimistic update that hasn't reached server yet.
      // But for now, let's just merge them to be safe.
      const mergedReactions = { ...incomingReactions };
      Object.keys(prevReactions).forEach(emoji => {
        if (!mergedReactions[emoji]) mergedReactions[emoji] = prevReactions[emoji];
        else {
          // Merge user lists for each emoji
          mergedReactions[emoji] = Array.from(new Set([...mergedReactions[emoji], ...prevReactions[emoji]]));
        }
      });

      map.set(n.id, {
        ...prev,
        ...n,
        __ts: typeof n?.__ts === 'number' ? n.__ts : prev.__ts,
        reactions: mergedReactions,
        mediaType: isDowngrade ? prev.mediaType : (n.mediaType || prev.mediaType),
        mediaUrl: n.mediaUrl || prev.mediaUrl,
        audioUrl: n.audioUrl || prev.audioUrl,
        audioDuration: n.audioDuration || prev.audioDuration,
        sharedStory: n.sharedStory || prev.sharedStory,
        sharedPost: n.sharedPost || prev.sharedPost,
        // Preserve local edit if incoming is older
        text: (prev.editedAt && (!n.editedAt || new Date(prev.editedAt) > new Date(n.editedAt))) ? prev.text : n.text,
        editedAt: (prev.editedAt && (!n.editedAt || new Date(prev.editedAt) > new Date(n.editedAt))) ? prev.editedAt : n.editedAt,
      });

      // If the incoming message specifies which tempId it replaces
      if (m?.tempId) map.delete(String(m.tempId));
    });

    // Preserve only pending local temp messages until backend echo arrives.
    const twoMinutesAgo = Date.now() - 120000;
    existing.forEach((m) => {
      const isTempPending = String(m.id || '').startsWith('temp_') || m.sent === false;
      const createdAtMs = toTimestampMs(m?.createdAt ?? m?.timestamp);
      if (isTempPending && createdAtMs > twoMinutesAgo && !map.has(m.id)) {
        map.set(m.id, m);
      }
    });

    return Array.from(map.values());
  };

  const { profile: otherUserProfile } = useUserProfile(otherUserId);
  const isGroupConversation = isGroupParam || !!conversationMeta?.isGroup;
  const displayName = isGroupConversation ? (conversationMeta?.groupName || 'Group') : (otherUserProfile?.displayName || otherUserProfile?.username || 'User');
  const avatarUri = isGroupConversation ? (conversationMeta?.groupAvatar || DEFAULT_AVATAR_URL) : (otherUserProfile?.avatar || DEFAULT_AVATAR_URL);

  useEffect(() => {
    AsyncStorage.getItem('userId').then(id => { if (id) setCurrentUserId(id); });
  }, []);

  useEffect(() => {
    const routeChatKey = `${paramConversationId || ''}|${otherUserId || ''}|${isGroupParam ? '1' : '0'}`;
    if (routeChatKeyRef.current === routeChatKey) return;
    routeChatKeyRef.current = routeChatKey;
    hasPreloadedMessagesRef.current = false;

    // Critical: reset old thread state when navigating to a different DM target.
    // Instagram-like UX: warm start messages from local cache immediately (if we have a conversationId).
    // This avoids a blank full-screen loader flash.
    const preloadKey = typeof paramConversationId === 'string' && paramConversationId
      ? `messages_cache_${paramConversationId}`
      : '';
    preloadKeyRef.current = preloadKey;

    // Don't force a blocking loader; we'll only show it if we truly have no cached messages.
    setLoading(false);
    setReplyingTo(null);
    setSelectedMessage(null);
    setShowMessageMenu(false);
    setOtherUserPresence(null);
    setActiveSoundId(null);
    setConversationMeta(null);
    setConversationId(shouldResolveConversationFromUser ? null : (paramConversationId || null));

    if (!preloadKey) {
      // No conversationId to preload from; clear immediately.
      setMessages([]);
      setLoading(true);
      return;
    }

    // Preload cached messages for this convo ASAP.
    AsyncStorage.getItem(preloadKey).then((cached) => {
      // Ignore if user navigated away quickly.
      if (preloadKeyRef.current !== preloadKey) return;
      if (!cached) {
        setMessages([]);
        setLoading(true);
        return;
      }
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          hasPreloadedMessagesRef.current = true;
          setMessages(parsed);
          // If we have cache, avoid a blocking full-screen loader.
          setLoading(false);
          return;
        }
      } catch { }
      setMessages([]);
      setLoading(true);
    }).catch(() => {
      if (preloadKeyRef.current === preloadKey) setMessages([]);
    });
    setReplyingTo(null);
    setSelectedMessage(null);
    setShowMessageMenu(false);
    setOtherUserPresence(null);
    setActiveSoundId(null);
    setConversationMeta(null);
    setConversationId(shouldResolveConversationFromUser ? null : (paramConversationId || null));
  }, [paramConversationId, otherUserId, isGroupParam]);

  useEffect(() => {
    if (!conversationId || !currentUserId || isGroupConversation) return;
    const unsub = subscribeToUserPresence(otherUserId!, (p) => setOtherUserPresence(p));
    return () => unsub();
  }, [conversationId, currentUserId, otherUserId]);

  useEffect(() => {
    if (!currentUserId || isGroupConversation || conversationId) return;
    
    // 1. Check cache for conversationId first
    const cacheKey = `convo_id_${currentUserId}_${otherUserId}`;
    AsyncStorage.getItem(cacheKey).then(cachedId => {
      if (cachedId && !conversationId) {
        console.log('[DM] Using cached conversationId:', cachedId);
        setConversationId(cachedId);
      }
    });

    getOrCreateConversation(currentUserId, otherUserId || '')
      .then((res) => {
        if (res?.success && res?.conversationId) {
          setConversationId(res.conversationId);
          AsyncStorage.setItem(cacheKey, res.conversationId).catch(() => {});
        } else {
          console.warn('[DM] getOrCreateConversation failed:', res?.error);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.warn('[DM] getOrCreateConversation error:', e);
        setLoading(false);
      });
  }, [currentUserId, otherUserId]);

  // Track pending temp IDs to prevent socket echos from creating duplicates
  const pendingTempIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const cid = conversationId;

    // If we already preloaded cached messages for this convo, don't block UI.
    if (!hasPreloadedMessagesRef.current && messages.length === 0) {
      setLoading(true);
    }
    setSkip(0);
    setHasMore(true);

    const safetyTimer = setTimeout(() => {
      if (!cancelled && cid === conversationId) {
        setLoading(false);
      }
    }, 20000);

    // 1. Warm start from cache if available
    const cacheKey = `messages_cache_${conversationId}`;
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cancelled || cid !== conversationId) return;
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            setLoading(false); // Hide loader early if we have cache
          }
        } catch (e) {}
      }
    });

    // 2. Parallel fetching: Messages + Conversation Metadata
    const fetchAll = async () => {
      try {
        const [msgRes, metaRes] = await Promise.all([
          fetchMessages(conversationId),
          isGroupConversation ? apiService.get(`/conversations/${conversationId}`) : Promise.resolve(null),
        ]);

        if (cancelled || cid !== conversationId) return;

        if (metaRes?.success && metaRes?.data) {
          setConversationMeta(metaRes.data);
        }

        const incoming = Array.isArray(msgRes?.messages) ? msgRes.messages : [];
        setMessages((prev) => {
          if (cid !== conversationId) return prev;
          const merged = mergeMessages(prev, incoming);
          AsyncStorage.setItem(cacheKey, JSON.stringify(merged.slice(0, 50))).catch(() => {});
          return merged;
        });
        setHasMore(msgRes.pagination?.hasMore ?? incoming.length === LIMIT);
      } catch (err) {
        console.error('[DM] Parallel fetch error:', err);
      } finally {
        if (!cancelled && cid === conversationId) {
          setLoading(false);
        }
      }
    };

    fetchAll();

    // Socket.IO for real-time
    const unsub = socketSubscribeToMessages(conversationId, (msg) => {
      setMessages(prev => {
        // If server echoes back a media message without tempId, heuristically
        // replace the most recent pending temp media message to avoid duplicates.
        const incoming = normalizeMessage(msg);
        const isSelfEcho = incoming?.senderId && incoming.senderId === currentUserId;
        const isAudio = String(incoming?.mediaType || '').toLowerCase() === 'audio';
        const hasUrl = !!(incoming?.audioUrl || incoming?.mediaUrl);

        if (isSelfEcho && isAudio && hasUrl) {
          const url = String(incoming.audioUrl || incoming.mediaUrl || '');
          const filtered = prev.filter((m) => {
            if (!String(m?.id || '').startsWith('temp_audio')) return true;
            const tempUrl = String(m?.audioUrl || m?.mediaUrl || '');
            // Same uploaded URL (or very recent temp) => drop temp
            if (tempUrl && url && tempUrl === url) return false;
            const createdMs = Date.parse(String(m?.createdAt || m?.timestamp || '')) || 0;
            if (Date.now() - createdMs < 15_000) return false;
            return true;
          });
          return mergeMessages(filtered, [incoming]);
        }

        return mergeMessages(prev, [incoming]);
      });
    });

    // Fallback polling - significantly reduced frequency to let Socket.IO handle real-time.
    // We only poll every 60 seconds as a safety net, instead of 45s.
    const pollInterval = setInterval(async () => {
      try {
        // Only poll if we are near the bottom (viewing latest messages)
        if (isNearBottomRef.current) {
          const res = await fetchMessages(conversationId);
          const incoming = Array.isArray(res?.messages) ? res.messages : [];
          if (incoming.length > 0) {
            setMessages(prev => mergeMessages(prev, incoming));
          }
        }
      } catch {}
    }, 60000);

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsub();
      clearInterval(pollInterval);
    };
  }, [conversationId, currentUserId, isGroupConversation]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !conversationId) return;
    setLoadingMore(true);
    const nextSkip = skip + LIMIT;
    try {
      const res = await fetchMessages(conversationId);
      const incoming = Array.isArray(res?.messages) ? res.messages : [];
      if (incoming.length > 0) {
        setMessages(prev => mergeMessages(prev, incoming));
        setSkip(nextSkip);
        setHasMore(res.pagination?.hasMore ?? incoming.length === LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.warn('Load more error', e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    recordingObjRef.current = recordingObj;
  }, [recordingObj]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount only to avoid "already unloaded" errors during lifecycle
      const activeRecording = recordingObjRef.current;
      if (activeRecording && !isStoppingRecordingRef.current) {
        activeRecording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []); // Empty dependency array means this only runs once on unmount

  const requestAutoScroll = (force: boolean, animated: boolean) => {
    if (force || isNearBottomRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 100);
    }
  };

  const [editingMessage, setEditingMessage] = useState<any>(null);

  const handleSend = async () => {
    if (!input.trim() || !conversationId || !currentUserId || sending) return;
    const msgText = input.trim();
    
    if (editingMessage) {
      const targetId = getMessageId(editingMessage);
      setSending(true);
      try {
        const res = await editMessage(conversationId, targetId, currentUserId, msgText);
        if (res?.success) {
          setMessages(prev => prev.map(m => getMessageId(m) === targetId ? { ...m, text: msgText, editedAt: new Date().toISOString() } : m));
          setEditingMessage(null);
          setInput("");
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to edit message');
      } finally {
        setSending(false);
      }
      return;
    }

    const replyData = replyingTo;
    setInput("");
    setReplyingTo(null);
    setSending(true);

    const tempId = createTempId('temp_text');
    const sentAtMs = Date.now();
    const tempMsg = {
      id: tempId,
      senderId: currentUserId,
      text: msgText,
      createdAt: new Date(sentAtMs).toISOString(),
      __ts: sentAtMs,
      sent: false,
      tempOrigin: true,
      replyTo: replyData
    };

    pendingTempIdsRef.current.add(tempId);
    setMessages(prev => [...prev, tempMsg]);
    requestAutoScroll(true, true);

    try {
      const res = await sendMessage(conversationId, currentUserId, msgText, otherUserId || undefined, replyData, tempId);
      if (res?.success && res.message) {
        setMessages(prev => {
          const finalized = normalizeMessage({ ...res.message, sent: true });
          const mapped = prev.map(m => m.id === tempId ? finalized : m);
          return dedupeById(mapped);
        });
      } else if (res && !res.success) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        Alert.alert('Error', (res as any)?.error || 'Failed to send message');
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Error', 'Failed to send message');
    } finally {
      pendingTempIdsRef.current.delete(tempId);
      setSending(false);
    }
  };

  const handlePickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.All, 
      quality: 0.8,
      allowsMultipleSelection: false 
    });
    if (!res.canceled && res.assets && res.assets.length > 0) {
      const asset = res.assets[0];
      const mType = (asset.type === 'video' || (asset as any).mediaType === 'video') ? 'video' : 'image';
      await sendMediaMessage(mType, asset.uri);
    }
  };

   const handleLaunchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Error', 'Camera permission required');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) await sendMediaMessage('image', res.assets[0].uri);
  };

  const handleStartRecording = async () => {
    if (recordingObjRef.current || isStoppingRecordingRef.current || isStartingRecordingRef.current) return;
    isStartingRecordingRef.current = true;
    pendingStopAfterStartRef.current = false;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingStartedAtRef.current = Date.now();

      // Premium feel: Short vibration on start
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      recordingObjRef.current = rec;
      setRecordingObj(rec);
      setRecording(true);
      setRecordingDuration(0);

      // Start duration counter + pulse animation
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1);
      }, 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(micPulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();

      if (pendingStopAfterStartRef.current) {
        pendingStopAfterStartRef.current = false;
        setTimeout(() => {
          handleStopRecording().catch(() => {});
        }, 0);
      }
    } catch (err) { console.error('Failed to start recording', err); }
    finally {
      isStartingRecordingRef.current = false;
    }
  };

  const handleStopRecording = async () => {
    const activeRecording = recordingObjRef.current || recordingObj;
    if (!activeRecording || isStoppingRecordingRef.current) return;

    isStoppingRecordingRef.current = true;
    setRecording(false);
    setRecordingDuration(0);

    // Stop timer & animation
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    micPulseAnim.stopAnimation();
    micPulseAnim.setValue(1);

    try {
      const status: any = await activeRecording.stopAndUnloadAsync();
      
      // Premium feel: Light vibration on stop
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      
      // CRITICAL: Reset audio mode to playback IMMEDIATELY after stopping recording.
      // This prevents the race condition where MessageBubble tries to pre-load
      // audio while recording mode is still active, causing silent playback.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
      
      const uri = activeRecording.getURI();
      const durationMs = typeof status?.durationMillis === 'number'
        ? status.durationMillis
        : Math.max(0, Date.now() - (recordingStartedAtRef.current || Date.now()));

      // Ignore accidental taps/very short recordings.
      if (!uri || durationMs < 700) {
        return;
      }

      const duration = Math.max(1, Math.ceil(durationMs / 1000));
      if (uri) {
        const stableUri = await persistAudioUriIfNeeded(uri);
        await sendMediaMessage('audio', stableUri, { audioDuration: duration });
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const lower = msg.toLowerCase();
      const isUnloadRace =
        lower.includes('already been unloaded') ||
        lower.includes('cannot unload a recording');

      if (!isUnloadRace) {
        console.error('Failed to stop recording', err);
      }
    } finally {
      setRecordingObj(null);
      recordingObjRef.current = null;
      isStoppingRecordingRef.current = false;
      isStartingRecordingRef.current = false;
      recordingStartedAtRef.current = 0;
    }
  };

  const handleToggleRecording = async () => {
    if (isStartingRecordingRef.current) {
      pendingStopAfterStartRef.current = true;
      return;
    }
    if (recording || recordingObjRef.current) {
      await handleStopRecording();
      return;
    }
    await handleStartRecording();
  };

  const persistAudioUriIfNeeded = async (uri: string): Promise<string> => {
    if (!uri) return uri;

    const inputUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    try {
      const info = await FileSystem.getInfoAsync(inputUri);
      if (!info.exists) return uri;

      const ext = extensionFromFileUri(inputUri) || '.m4a';
      const fileName = `voice_${Date.now()}${ext}`;
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!baseDir) return inputUri;
      const targetUri = `${baseDir}${fileName}`;

      await FileSystem.copyAsync({ from: inputUri, to: targetUri });
      return targetUri;
    } catch {
      return inputUri;
    }
  };

  const handleSharePost = async (post: any): Promise<boolean> => {
    if (!conversationId || !currentUserId) return false;
    const tempId = createTempId('temp_post');
    const sentAtMs = Date.now();
    const tempMsg = {
      id: tempId,
      senderId: currentUserId,
      mediaType: 'post',
      sharedPost: post,
      createdAt: new Date(sentAtMs).toISOString(),
      __ts: sentAtMs,
      sent: false,
      tempOrigin: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    setShowPostSelector(false);
    try {
      const { sendPostMessage } = await import('../lib/firebaseHelpers/messages');
      const res = await sendPostMessage(conversationId, currentUserId, post, { recipientId: otherUserId || undefined, tempId } as any);
      if (res?.success) {
        const normalized = normalizeMessage(res.data || res.message);
        setMessages(prev => prev.map(m => m.id === tempId ? { ...normalized, sent: true, tempOrigin: false } : m));
        return true;
      }
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    return false;
  };

  const handleReaction = async (itemOrEmoji: any, emojiStr?: string) => {
    const targetMsg = emojiStr ? itemOrEmoji : selectedMessage;
    const emoji = (emojiStr || itemOrEmoji) as string;
    if (!conversationId || !targetMsg || !currentUserId) return;

    // Optimistic UI for reaction
    setMessages(prev => {
      const updated = prev.map(m => {
        if (getMessageId(m) === getMessageId(targetMsg)) {
          const currentReactions = { ...(m.reactions || {}) };
          const userList = [...(currentReactions[emoji] || [])];
          if (userList.includes(currentUserId)) {
            currentReactions[emoji] = userList.filter(id => id !== currentUserId);
            if (currentReactions[emoji].length === 0) delete currentReactions[emoji];
          } else {
            currentReactions[emoji] = [...userList, currentUserId];
          }
          return { ...m, reactions: currentReactions };
        }
        return m;
      });
      
      // Update cache immediately to prevent revert on next poll
      const cacheKey = `messages_cache_${conversationId}`;
      AsyncStorage.setItem(cacheKey, JSON.stringify(updated.slice(0, 50))).catch(() => {});
      
      return updated;
    });

    await reactToMessage(conversationId, getMessageId(targetMsg), currentUserId, emoji);
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  const handleClearChat = async () => {
    if (!conversationId) return;
    Alert.alert(
      "Clear Chat?",
      "Wipe message history for you? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (!conversationId) return;
              const res = await clearConversation(conversationId);
              if (res?.success) {
                // Wipe local messages
                setMessages([]);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                Alert.alert('Error', res?.error || 'Failed to clear chat');
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'An unknown error occurred');
            }
          }
        }
      ]
    );
  };

  async function sendMediaMessage(mediaType: string, uri: string, options?: any) {
    if (!conversationId || !currentUserId) return;
    const tempId = createTempId(`temp_${mediaType}`);
    const sentAtMs = Date.now();
    const tempMsg = {
      id: tempId,
      senderId: currentUserId,
      mediaType,
      mediaUrl: uri,
      createdAt: new Date(sentAtMs).toISOString(),
      __ts: sentAtMs,
      sent: false,
      tempOrigin: true,
      ...(mediaType === 'audio' && options?.audioDuration
        ? { audioDuration: options.audioDuration, audioUrl: uri }
        : {}),
    };
    
    // Track this temp ID so socket echo handler knows to skip duplicates
    pendingTempIdsRef.current.add(tempId);
    
    setMessages(prev => [...prev, tempMsg]);
    requestAutoScroll(true, true);

    try {
      let uploadRes: any;

      // For local files (especially voice notes), prefer direct URI upload path.
      if (typeof uri === 'string' && uri.startsWith('file://')) {
        uploadRes = await uploadMedia(uri, mediaType as any);
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const mime = mediaType === 'audio' ? 'audio/x-m4a' : (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
        uploadRes = await uploadMedia(`data:${mime};base64,${base64}`, mediaType as any);
      }
      
      if (uploadRes?.success) {
        const uploadedUrl = uploadRes?.url || uploadRes?.data?.url || uploadRes?.secureUrl;
        if (!uploadedUrl) {
          throw new Error('Upload succeeded but no media URL returned');
        }
        const res = await sendMediaMessageApi(
          conversationId,
          currentUserId,
          uploadedUrl,
          mediaType as any,
          { recipientId: otherUserId || undefined, ...options, tempId }
        );
        if (res?.success) {
          const finalMsg = res.data || res.message;
          if (finalMsg) {
            setMessages(prev => {
              const withoutTemp = prev.filter(m => m.id !== tempId);
              const merged = mergeMessages(withoutTemp, [{ ...finalMsg, tempId }]);
              return dedupeById(merged);
            });
            // Remove from pending set after finalization
            pendingTempIdsRef.current.delete(tempId);
            return;
          }
        }
      }
      // If we reach here, something specifically failed in API/Upload
      if (mediaType === 'audio') {
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true, sent: false } : m)));
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (e) {
      console.error('Media send error:', e);
      if (mediaType === 'audio') {
        try {
          const fallbackRes = await sendMessage(
            conversationId,
            currentUserId,
            '[VOICE MESSAGE]',
            otherUserId || undefined
          );
          if (fallbackRes?.success && fallbackRes?.message) {
            setMessages(prev => {
              const mapped = prev.map(m => m.id === tempId ? { ...fallbackRes.message, sent: true } : m);
              return dedupeById(mapped);
            });
          } else {
            setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true, sent: false } : m)));
          }
        } catch {
          setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, failed: true, sent: false } : m)));
        }
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    }
  }

  const formatTimeForBubble = useCallback((t: any) => {
    const date = new Date(t);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  const renderChatItem = useCallback(({ item }: { item: any }) => {
    if (item.type === 'date') return <View style={styles.dateWrap}><Text style={styles.dateText}>{item.date}</Text></View>;
    return (
      <MessageBubble
        {...item}
        id={getMessageId(item) || item.id}
        isSelf={item.senderId === currentUserId}
        formatTime={formatTimeForBubble}
        username={displayName}
        currentUserId={currentUserId!}
        avatarUrl={avatarUri}
        onReaction={(emoji: string) => handleReaction(item, emoji)}
        reactions={item.reactions}
        onLongPress={() => {
          setSelectedMessage(item);
          setShowMessageMenu(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }}
        onPressPost={(post: any) => {
          const resolved = post?.sharedPost || post;
          const pid = resolved?.id || resolved?._id || resolved?.postId;
          if (pid) router.push({ pathname: '/post-detail', params: { id: String(pid) } } as any);
        }}
        onPressStory={(story: any) => {
           const sid = story?.id || story?._id || story?.storyId;
           if (!sid) return;
           const mediaUrl = story?.mediaUrl || story?.imageUrl || story?.videoUrl || story?.image || story?.video;
           if (mediaUrl) {
             const viewerStory = {
               id: sid,
               userId: story.userId,
               userName: story.userName || 'Story',
               userAvatar: story.userAvatar || DEFAULT_AVATAR_URL,
               imageUrl: story.imageUrl || story.image || (story.mediaType !== 'video' ? mediaUrl : null),
               videoUrl: story.videoUrl || story.video || (story.mediaType === 'video' ? mediaUrl : null),
               mediaType: story.mediaType || (story.videoUrl || story.video ? 'video' : 'image'),
               caption: story.caption || '',
               createdAt: story.createdAt,
               comments: story.comments || [],
               likes: story.likes || [],
             };
             setStoryViewerData({ stories: [viewerStory], visible: true });
           } else {
             Alert.alert('Story unavailable', 'This story is no longer available.');
           }
        }}
        onPressImage={(url: string) => {
           setViewerImage(url);
        }}
        onPressShare={() => {
          const kind = String(item?.mediaType || '').toLowerCase();
          if (kind === 'post' && item?.sharedPost) {
            setSharePostItem({ shareType: 'post', data: item.sharedPost });
            setShowShareModal(true);
            return;
          }
          if (kind === 'story' && item?.sharedStory) {
            setSharePostItem({ shareType: 'story', data: item.sharedStory });
            setShowShareModal(true);
            return;
          }
        }}
        activeSoundId={activeSoundId}
        onPlayStart={(id: string) => setActiveSoundId(id)}
        sent={item.sent !== false}
        delivered={item.delivered || !!item.readAt}
        read={!!item.readAt}
      />
    );
  }, [currentUserId, displayName, avatarUri, activeSoundId, formatTimeForBubble]);

  if (loading && !messages.length) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#3797f0" /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {showBanner && (
          <OfflineBanner text="You’re offline — showing cached messages" style={{ marginHorizontal: 12 }} />
        )}
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backBtn}>
            <Feather name="arrow-left" size={26} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerUser} onPress={() => !isGroupConversation && otherUserId && router.push(`/user-profile?id=${otherUserId}` as any)}>
            <ExpoImage 
              source={{ uri: avatarUri }} 
              style={styles.avatar} 
              cachePolicy="memory-disk"
              transition={0}
              contentFit="cover"
            />
            <View>
              <Text style={styles.title}>{displayName}</Text>
              {!isGroupConversation && (
                <Text style={styles.activeText}>
                  {otherUserPresence ? getFormattedActiveStatus(otherUserPresence) : 'Active'}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setShowOptionsModal(true)} style={styles.headerIcon}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        <FlatList
          ref={flatListRef}
          data={messagesWithSeparators}
          renderItem={renderChatItem}
          inverted
          style={{ backgroundColor: '#fff' }}
          keyExtractor={(m) => {
            if (m?.type === 'date') return String(m.id || `date_${m.date || ''}`);
            return String(getMessageId(m) || m?.id || `msg_${m?.createdAt || ''}`);
          }}
          contentContainerStyle={{ padding: 12, paddingBottom: 24, backgroundColor: '#fff' }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="#A4A4A4" />
              </View>
            ) : null
          }
          windowSize={10}
          maxToRenderPerBatch={15}
          initialNumToRender={20}
          removeClippedSubviews={Platform.OS !== 'web'}
          updateCellsBatchingPeriod={50}
        />

        {/* Reply or Edit Preview */}
        {(replyingTo || editingMessage) && (
          <View style={styles.replyPreview}>
            <View style={styles.replyInner}>
              <View style={styles.replyBar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.replyUser}>
                  {editingMessage ? 'Editing message' : `Replying to ${replyingTo?.senderId === currentUserId ? 'yourself' : 'them'}`}
                </Text>
                <Text style={styles.replyTxt} numberOfLines={1}>
                  {editingMessage ? editingMessage.text : replyingTo?.text}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setReplyingTo(null); setEditingMessage(null); if (editingMessage) setInput(""); }}>
                <Ionicons name="close" size={20} color="#8e8e8e" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity style={styles.mainCameraBtn} onPress={handleLaunchCamera}>
            <View style={styles.mainCameraCircle}>
               <Ionicons name="camera" size={24} color="#fff" />
            </View>
          </TouchableOpacity>
          
          {recording ? (
            /* ===== Instagram-style Recording UI ===== */
            <View style={styles.recordingContainer}>
              <TouchableOpacity onPress={() => { handleStopRecording(); setMessages(prev => prev.filter(m => !String(m.id).startsWith('temp_audio'))); }} style={styles.cancelRecordBtn}>
                <Ionicons name="trash-outline" size={22} color="#ff3b30" />
              </TouchableOpacity>
              <View style={styles.recordingInfo}>
                <Animated.View style={[styles.recordingDot, { transform: [{ scale: micPulseAnim }] }]} />
                <Text style={styles.recordingDurationText}>
                  {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleStopRecording} style={styles.sendRecordBtn}>
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
          <View style={styles.pillInputContainer}>
            <TextInput
              style={styles.pillInput}
              value={input}
              onChangeText={setInput}
              placeholder="Message..."
              placeholderTextColor="#999"
              multiline
            />
            {!input.trim() && (
              <View style={styles.trayIcons}>
                <Pressable 
                  onPressIn={handleStartRecording}
                  delayLongPress={0}
                  style={styles.trayIcon}
                >
                  <Ionicons name="mic-outline" size={24} color={'#000'} />
                </Pressable>
                <TouchableOpacity style={styles.trayIcon} onPress={handlePickImage}>
                  <Ionicons name="image-outline" size={24} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.trayIcon} onPress={() => setShowEmojiPicker(true)}>
                  <Ionicons name="happy-outline" size={24} color="#000" />
                </TouchableOpacity>
              </View>
            )}
            {input.trim() && (
              <TouchableOpacity onPress={handleSend} style={styles.pillSendBtn}>
                <Text style={styles.pillSendText}>Send</Text>
              </TouchableOpacity>
            )}
          </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Share Modal Integration */}
      <ShareModal 
        visible={showShareModal}
        currentUserId={currentUserId}
        modalVariant="chat"
        sharePayload={sharePostItem}
        onClose={() => setShowShareModal(false)}
        onSend={async (userIds: string[]) => {
          if (!currentUserId || userIds.length === 0) return;
          setShowShareModal(false);
          const { sendPostMessage, sendStoryMessage } = await import('../lib/firebaseHelpers/messages');
          const { getOrCreateConversation } = await import('../lib/firebaseHelpers/conversation');
          const shareType = sharePostItem?.shareType || 'post';
          const shareData = sharePostItem?.data || sharePostItem;
          
          for (const targetUid of userIds) {
            try {
              const convRes = await getOrCreateConversation(currentUserId, targetUid);
              if (convRes?.success && convRes.conversationId) {
                // If we are currently in this conversation, we can show optimistic updates
                if (convRes.conversationId === conversationId && shareType === 'post') {
                   handleSharePost(shareData);
                } else {
                   if (shareType === 'story') {
                     await sendStoryMessage(convRes.conversationId, currentUserId, shareData, { recipientId: targetUid });
                   } else {
                     await sendPostMessage(convRes.conversationId, currentUserId, shareData, { recipientId: targetUid });
                   }
                }
              }
            } catch (err) {
              console.error('Failed to share to user:', targetUid, err);
            }
          }
          // No success toast — Instagram-like silent share.
        }}
      />

      <EmojiPicker 
        onEmojiSelected={(emoji) => {
          setInput(prev => prev + emoji.emoji);
        }}
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
      />

      {/* Chat Options Modal (Three Dots Menu) */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowOptionsModal(false)}
        >
          <View style={styles.optionsContainer}>
            <View style={styles.optionsHandle} />
            <Text style={styles.optionsTitle}>Chat Settings</Text>
            
            <TouchableOpacity 
              style={styles.optionsItem}
              onPress={() => {
                setShowOptionsModal(false);
                handleClearChat();
              }}
            >
              <Ionicons name="brush-outline" size={22} color="#ff3b30" />
              <Text style={[styles.optionsLabel, { color: '#ff3b30' }]}>Clear Chat history</Text>
            </TouchableOpacity>

            <View style={styles.optionsSeparator} />

            <TouchableOpacity 
              style={styles.optionsItem}
              onPress={() => setShowOptionsModal(false)}
            >
              <Ionicons name="close-outline" size={22} color="#000" />
              <Text style={styles.optionsLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Message Menu */}
      <Modal visible={showMessageMenu} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowMessageMenu(false)}>
          <View style={styles.instaMenuContainer}>
            <View style={styles.instaReactionRow}>
              {REACTIONS.map((r: string) => (
                <TouchableOpacity 
                  key={r} 
                  onPress={() => handleReaction(r)}
                  style={styles.instaReactionBtn}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 24 }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.instaMenuOptions}>
              <TouchableOpacity 
                style={styles.instaMenuItem} 
                onPress={() => { setReplyingTo(selectedMessage); setShowMessageMenu(false); }}
              >
                <Text style={styles.instaMenuLabel}>Reply</Text>
                <Ionicons name="arrow-undo-outline" size={22} color="#000" />
              </TouchableOpacity>

              <View style={styles.instaMenuSeparator} />

              {selectedMessage?.senderId === currentUserId && selectedMessage?.mediaType === 'text' && (
                <>
                  <TouchableOpacity 
                    style={styles.instaMenuItem} 
                    onPress={() => { 
                      setEditingMessage(selectedMessage); 
                      setInput(selectedMessage.text); 
                      setShowMessageMenu(false); 
                    }}
                  >
                    <Text style={styles.instaMenuLabel}>Edit</Text>
                    <Ionicons name="create-outline" size={22} color="#000" />
                  </TouchableOpacity>
                  <View style={styles.instaMenuSeparator} />
                </>
              )}

              <TouchableOpacity 
                style={styles.instaMenuItem} 
                onPress={() => {
                  // Copy to clipboard logic could go here
                  setShowMessageMenu(false);
                }}
              >
                <Text style={styles.instaMenuLabel}>Copy</Text>
                <Ionicons name="copy-outline" size={22} color="#000" />
              </TouchableOpacity>

              {selectedMessage?.senderId === currentUserId && (
                <>
                  <View style={styles.instaMenuSeparator} />
                  <TouchableOpacity 
                    style={styles.instaMenuItem} 
                    onPress={async () => {
                      if (!conversationId || !selectedMessage || !currentUserId) return;
                      const targetId = getMessageId(selectedMessage);
                      setShowMessageMenu(false);
                      setMessages(prev => {
                        const updated = prev.filter(m => getMessageId(m) !== targetId);
                        // Update cache immediately
                        const cacheKey = `messages_cache_${conversationId}`;
                        AsyncStorage.setItem(cacheKey, JSON.stringify(updated.slice(0, 50))).catch(() => {});
                        return updated;
                      });
                      try {
                        await deleteMessage(conversationId, targetId, currentUserId);
                      } catch (e) {
                        console.error('Delete message error', e);
                      }
                    }}
                  >
                    <Text style={[styles.instaMenuLabel, { color: '#ff3b30' }]}>Unsend</Text>
                    <Ionicons name="trash-outline" size={22} color="#ff3b30" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Full Screen Image Viewer */}
      <Modal visible={!!viewerImage} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity 
            style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}
            onPress={() => setViewerImage(null)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {viewerImage && (
            <Image 
              source={{ uri: viewerImage }} 
              style={{ width: '100%', height: '80%', resizeMode: 'contain' }} 
            />
          )}
        </View>
      </Modal>

      {/* Story Viewer Modal */}
      {storyViewerData.visible && storyViewerData.stories.length > 0 && (
        <Modal visible={true} transparent={false} animationType="slide">
          <StoriesViewer
            stories={storyViewerData.stories}
            onClose={() => setStoryViewerData({ stories: [], visible: false })}
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#dbdbdb', backgroundColor: '#fff' },
  backBtn: { marginRight: 12 },
  headerUser: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#eee' },
  title: { fontSize: 16, fontWeight: '700' },
  activeText: { fontSize: 11, color: '#8e8e8e' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { marginLeft: 16 },
  inputBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 8, 
    paddingVertical: 10, 
    backgroundColor: '#fff',
    borderTopWidth: 0,
  },
  mainCameraBtn: { 
    marginRight: 8,
  },
  mainCameraCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3797f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 25,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  pillInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 8,
  },
  trayIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trayIcon: {
    marginLeft: 10,
  },
  pillSendBtn: {
    paddingHorizontal: 12,
  },
  pillSendText: {
    color: '#3797f0',
    fontWeight: '700',
    fontSize: 16,
  },
  dateWrap: { alignSelf: 'center', backgroundColor: '#efefef', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 15 },
  dateText: { fontSize: 12, color: '#8e8e8e', fontWeight: '600' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 0.5, borderBottomColor: '#dbdbdb' },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  postItem: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  postThumb: { width: 50, height: 50, borderRadius: 4, marginRight: 12 },
  postText: { fontSize: 14, flex: 1 },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end',
  },
  shareSheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    paddingTop: 12,
  },
  shareSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#dbdbdb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  shareSheetHeader: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  shareSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  shareSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  shareSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#efefef',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
  },
  shareSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#000',
  },
  shareGroupBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareContactItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 20,
  },
  shareAvatar: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    marginBottom: 6,
    backgroundColor: '#eee',
  },
  shareContactName: {
    fontSize: 12,
    color: '#262626',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  shareActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  shareActionItem: {
    alignItems: 'center',
    width: '19%',
  },
  shareActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  shareActionLabel: {
    fontSize: 11,
    color: '#262626',
    textAlign: 'center',
  },
  replyPreview: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#eee',
  },
  replyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 8,
  },
  replyBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#3797f0',
    marginRight: 10,
    borderRadius: 2,
  },
  replyUser: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3797f0',
  },
  replyTxt: {
    fontSize: 12,
    color: '#666',
  },
  menuContainer: { backgroundColor: '#fff', borderRadius: 12, width: '80%', padding: 10, alignSelf: 'center' },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  menuLabel: { marginLeft: 12, fontSize: 16, fontWeight: '500' },
  // ===== Instagram-style Message Menu =====
  instaMenuContainer: {
    width: '85%',
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
  },
  instaReactionRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  instaReactionBtn: {
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instaMenuOptions: {
    backgroundColor: '#fff',
    borderRadius: 15,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  instaMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  instaMenuLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  instaMenuSeparator: {
    height: 0.5,
    backgroundColor: '#eee',
    marginHorizontal: 16,
  },
  // ===== Instagram-style Recording UI =====
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 25,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'space-between',
  },
  cancelRecordBtn: {
    padding: 8,
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff3b30',
  },
  recordingDurationText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff3b30',
    fontVariant: ['tabular-nums'],
  },
  sendRecordBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3797f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ===== Options Menu Style =====
  optionsContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  optionsHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#dbdbdb',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#000',
  },
  optionsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },
  optionsLabel: {
    marginLeft: 15,
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  optionsSeparator: {
    height: 1,
    backgroundColor: '#efefef',
    width: '100%',
  },
});
