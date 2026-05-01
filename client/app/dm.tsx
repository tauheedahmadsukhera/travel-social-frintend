
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
import {
  toTimestampMs,
  normalizeMessage,
  mergeMessages,
} from '../src/_services/dmHelpers';
import DMHeader from '../src/_components/dm/DMHeader';
import DMInput from '../src/_components/dm/DMInput';

import * as ImagePicker from 'expo-image-picker';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { useOfflineBanner } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';
import { 
  subscribeToMessages as socketSubscribeToMessages,
  initializeSocket
} from '../src/_services/socketService';

import MessageBubble from '../src/_components/MessageBubble';
import ShareModal from '../src/_components/ShareModal';
import StoriesViewer from '../src/_components/StoriesViewer';
import EmojiPicker from 'rn-emoji-keyboard';

const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

/** Simple hook to fetch peer profile */
function useUserProfile(uid: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    getUserProfile(uid).then(res => {
      if (res?.success) setProfile(res.data);
    }).finally(() => setLoading(false));
  }, [uid]);
  return { profile, loading };
}

// Missing exports from messaging helpers that were used in dm.tsx
import { 
  uploadMedia, 
  sendMediaMessage as sendMediaMessageApi,
  extensionFromFileUri 
} from '../lib/firebaseHelpers/messages';

// Placeholder for missing presence helpers if they are not found elsewhere
const subscribeToUserPresence = (uid: string, callback: (presence: any) => void) => {
  // Mock presence subscribe
  return () => {};
};

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

  /** Inbox / search pass `user` so the DM header matches before /users/:id returns. */
  const seedPeerDisplayName = useMemo(() => {
    const raw = (params as any)?.user as unknown;
    const s = Array.isArray(raw) ? String(raw[0] ?? '') : typeof raw === 'string' ? raw : '';
    return s.trim();
  }, [(params as any)?.user]);

  // If DM opened by selecting a user (search/profile), never trust a carried-over
  // conversationId from previous screen state.
  const shouldResolveConversationFromUser = !!otherUserId && !isGroupParam;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    shouldResolveConversationFromUser ? null : paramConversationId
  );
  const [conversationMeta, setConversationMeta] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);


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
  const [otherUserPresence, setOtherUserPresence] = useState<any | null>(null);
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

  const messagesWithSeparators = useMemo(() => {
    const list: any[] = [];
    let lastDate: string | null = null;
    
    // Sort reverse-chronologically (newest first) for inverted list
    const sorted = [...messages].sort((a, b) => (b.__ts || 0) - (a.__ts || 0));

    sorted.forEach((msg) => {
      const ms = msg.__ts || Date.now();
      const dateObj = new Date(ms > Date.now() ? Date.now() : ms);
      const dateLabel = dateObj.toLocaleDateString();
      
      if (dateLabel !== lastDate) {
        list.push({ type: 'date', date: dateLabel, id: `date_${dateLabel}` });
        lastDate = dateLabel;
      }
      list.push(msg);
    });
    return list;
  }, [messages]);

  const { profile: otherUserProfile } = useUserProfile(otherUserId);

  const isGroupConversation = isGroupParam || !!conversationMeta?.isGroup;

  const isWeakDmLabel = useCallback((v: string) => {
    const s = String(v || '').trim();
    if (!s) return true;
    const lower = s.toLowerCase();
    return lower === 'user' || lower === 'unknown' || lower === 'new user';
  }, []);

  const displayName = useMemo(() => {
    if (isGroupConversation) {
      return conversationMeta?.groupName || seedPeerDisplayName || 'Group';
    }
    const fromApi =
      (otherUserProfile?.displayName && String(otherUserProfile.displayName).trim()) ||
      (otherUserProfile?.name && String(otherUserProfile.name).trim()) ||
      (otherUserProfile?.username && String(otherUserProfile.username).trim()) ||
      '';
    if (fromApi && !isWeakDmLabel(fromApi)) return fromApi;
    if (seedPeerDisplayName && !isWeakDmLabel(seedPeerDisplayName)) return seedPeerDisplayName;
    return fromApi || seedPeerDisplayName || 'User';
  }, [
    conversationMeta?.groupName,
    isGroupConversation,
    isWeakDmLabel,
    otherUserProfile?.displayName,
    otherUserProfile?.name,
    otherUserProfile?.username,
    seedPeerDisplayName,
  ]);

  const avatarUri = isGroupConversation
    ? (conversationMeta?.groupAvatar || DEFAULT_AVATAR_URL)
    : (otherUserProfile?.avatar || otherUserProfile?.photoURL || DEFAULT_AVATAR_URL);

  useEffect(() => {
    AsyncStorage.getItem('userId').then(id => { 
      if (id) {
        setCurrentUserId(id);
        initializeSocket(id).catch(err => console.error('[Socket] Init error:', err));
      }
    });
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

    // 2. Messages first (show thread ASAP), group meta in background (meta must not block first paint).
    const fetchAll = async () => {
      try {
        const msgRes = await fetchMessages(conversationId);

        if (cancelled || cid !== conversationId) return;

        const incoming = Array.isArray(msgRes?.messages) ? msgRes.messages : [];
        setMessages((prev) => {
          if (cid !== conversationId) return prev;
          const merged = mergeMessages(prev, incoming);
          AsyncStorage.setItem(cacheKey, JSON.stringify(merged.slice(0, 50))).catch(() => {});
          return merged;
        });
        setHasMore(msgRes.pagination?.hasMore ?? incoming.length === LIMIT);
        if (!cancelled && cid === conversationId) {
          setLoading(false);
        }

        if (isGroupConversation) {
          apiService.get(`/conversations/${conversationId}`).then((metaRes) => {
            if (cancelled || cid !== conversationId) return;
            if (metaRes?.success && metaRes?.data) {
              setConversationMeta(metaRes.data);
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[DM] Fetch messages error:', err);
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <DMHeader
          displayName={displayName}
          avatarUri={avatarUri}
          isGroup={isGroupConversation}
          statusText={!isGroupConversation ? (otherUserPresence?.online ? 'Online' : 'Offline') : ''}
          onBack={() => safeRouterBack()}
          onInfo={() => setShowOptionsModal(true)}
        />

        <FlatList
          ref={flatListRef}
          data={messagesWithSeparators}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderChatItem}
          inverted
          contentContainerStyle={{ paddingVertical: 20 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />

        <DMInput
          input={input}
          setInput={setInput}
          onSend={handleSend}
          onMediaPress={handlePickImage}
          onCameraPress={handleLaunchCamera}
          onMicPressIn={handleStartRecording}
          onMicPressOut={handleStopRecording}
          recording={recording}
          recordingDuration={recordingDuration}
          micPulseAnim={micPulseAnim}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          sending={sending}
        />
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
      <Modal visible={showOptionsModal} transparent animationType="slide" onRequestClose={() => setShowOptionsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowOptionsModal(false)}>
          <View style={styles.optionsContainer}>
            <View style={styles.optionsHandle} />
            <Text style={styles.optionsTitle}>Chat Settings</Text>
            <TouchableOpacity style={styles.optionsItem} onPress={handleClearChat}>
              <Ionicons name="trash-outline" size={24} color="#ff3b30" />
              <Text style={[styles.optionsLabel, { color: '#ff3b30' }]}>Clear Chat</Text>
            </TouchableOpacity>
            <View style={styles.optionsSeparator} />
            <TouchableOpacity style={styles.optionsItem} onPress={() => setShowOptionsModal(false)}>
              <Ionicons name="close-outline" size={24} color="#000" />
              <Text style={styles.optionsLabel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Full Screen Image Viewer */}
      <Modal visible={!!viewerImage} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }} onPress={() => setViewerImage(null)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {viewerImage && <Image source={{ uri: viewerImage }} style={{ width: '100%', height: '80%', resizeMode: 'contain' }} />}
        </View>
      </Modal>

      {storyViewerData.visible && storyViewerData.stories.length > 0 && (
        <Modal visible={true} transparent={false} animationType="slide">
          <StoriesViewer
            stories={storyViewerData.stories}
            onClose={() => setStoryViewerData({ stories: [], visible: false })}
          />
        </Modal>
      )}

      {/* Message Options Modal */}
      <Modal visible={showMessageMenu} transparent animationType="fade">
         <Pressable style={styles.modalOverlay} onPress={() => setShowMessageMenu(false)}>
           <View style={styles.instaMenuOptions}>
             <TouchableOpacity style={styles.instaMenuItem} onPress={() => { setReplyingTo(selectedMessage); setShowMessageMenu(false); }}>
               <Text style={styles.instaMenuLabel}>Reply</Text>
               <Ionicons name="arrow-undo-outline" size={22} color="#000" />
             </TouchableOpacity>
             <View style={styles.instaMenuSeparator} />
             {selectedMessage?.senderId === currentUserId && (
               <TouchableOpacity style={styles.instaMenuItem} onPress={() => { setEditingMessage(selectedMessage); setInput(selectedMessage.text); setShowMessageMenu(false); }}>
                 <Text style={styles.instaMenuLabel}>Edit</Text>
                 <Ionicons name="create-outline" size={22} color="#000" />
               </TouchableOpacity>
             )}
           </View>
         </Pressable>
      </Modal>
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
  dateWrap: { alignSelf: 'center', backgroundColor: '#efefef', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 15 },
  dateText: { fontSize: 12, color: '#8e8e8e', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  optionsContainer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 40, paddingHorizontal: 20 },
  optionsHandle: { width: 40, height: 4, backgroundColor: '#dbdbdb', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  optionsTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 20, color: '#000' },
  optionsItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  optionsLabel: { marginLeft: 15, fontSize: 16, fontWeight: '500', color: '#000' },
  optionsSeparator: { height: 1, backgroundColor: '#efefef', width: '100%' },
  instaMenuOptions: { backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden', marginHorizontal: 20, marginBottom: 20 },
  instaMenuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  instaMenuLabel: { fontSize: 16, fontWeight: '500', color: '#000' },
  instaMenuSeparator: { height: 0.5, backgroundColor: '#eee', marginHorizontal: 16 },
  replyPreview: { backgroundColor: '#f8f8f8', padding: 10, borderTopWidth: 0.5, borderTopColor: '#eee' },
  replyInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 8 },
  replyBar: { width: 4, height: '100%', backgroundColor: '#3797f0', borderRadius: 2, marginRight: 10 },
  replyUser: { fontSize: 12, fontWeight: '700', color: '#3797f0', marginBottom: 2 },
  replyTxt: { fontSize: 13, color: '#666' },
});
