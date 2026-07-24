import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
// Firebase removed - using Backend API
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_AVATAR_URL, API_BASE_URL } from '../../lib/api';
import { resolveAvatarUrl } from '../../lib/utils/avatar';
import AsyncStorage from '@/lib/storage';
import { deleteStory } from '../../lib/firebaseHelpers/deleteStory';
import { addCommentReply, addStoryToHighlight } from '../../lib/firebaseHelpers/index';
import { getUserHighlights } from '../../lib/firebaseHelpers/core';
import { getKeyboardOffset } from '../../utils/responsive';
import { useUser } from './UserContext';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';
import { useStories } from '../../hooks/useStories';
import StoryProgressBars from './stories/StoryProgressBars';
import StoryCommentSection from './stories/StoryCommentSection';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import Animated, { useAnimatedStyle, withSpring, interpolate, Extrapolate, runOnJS } from 'react-native-reanimated';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { apiService } from '@/src/_services/apiService';
import { highlightManager } from '../../lib/highlightManager';
import { CommentSection } from './CommentSection';
import ShareModal from './ShareModal';
import HighlightSelectionModal from './HighlightSelectionModal';
import { storyForStoriesViewer, parseStoryTextOverlays } from '../../lib/storyViewer';

const { width, height } = Dimensions.get('window');

const FONT_STYLES: Record<string, { fontFamily?: string; letterSpacing?: number; textTransform?: 'uppercase' | 'none' }> = {
    classic: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
    modern: { fontFamily: undefined, letterSpacing: 1 },
    strong: { fontFamily: undefined, letterSpacing: 2, textTransform: 'uppercase' },
};

const STORY_MEDIA_H = width * 1.1;
const STORY_MEDIA_TOP = (height - STORY_MEDIA_H) / 2;

function StoryTextOverlays({ postMetadata, mediaLoaded }: { postMetadata?: any; mediaLoaded: boolean }) {
  const parsedOverlays = parseStoryTextOverlays(postMetadata);
  // Don't render overlays until the background media is ready — mirrors Instagram behaviour
  if (!parsedOverlays.length || !mediaLoaded) return null;

  // If the text is already baked into the image, don't render it again dynamically
  let isBaked = false;
  if (postMetadata) {
    let parsedMeta = postMetadata;
    if (typeof postMetadata === 'string') {
      try {
        parsedMeta = JSON.parse(postMetadata);
      } catch {}
    }
    const bakedVal = parsedMeta?.textBaked ?? parsedMeta?.metadata?.textBaked ?? parsedMeta?.story?.postMetadata?.textBaked;
    if (bakedVal === true || String(bakedVal).toLowerCase() === 'true' || bakedVal === 1) {
      isBaked = true;
    }
  }
  if (isBaked) return null;

  return (
    <Animated.View
      style={{
        ...StyleSheet.absoluteFillObject,
        zIndex: 15,
        elevation: 15,
        opacity: 1,
      }}
      pointerEvents="none"
    >
      <View
        style={{
          position: 'absolute',
          width,
          height: STORY_MEDIA_H,
          top: STORY_MEDIA_TOP,
          left: 0,
        }}
      >
      {parsedOverlays.map((o: any) => {
        const fs = FONT_STYLES[o.fontStyle] || FONT_STYLES.classic;
        return (
          <View
            key={o.id}
            style={{
              position: 'absolute',
              left: o.x * width,
              top: o.y * STORY_MEDIA_H,
              maxWidth: width - 60,
              zIndex: 20,
              elevation: 20,
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: '700',
                color: o.color,
                fontFamily: fs.fontFamily,
                letterSpacing: fs.letterSpacing,
                textTransform: fs.textTransform as any,
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 4,
                textAlign: 'center',
              }}
            >
              {o.text}
            </Text>
          </View>
        );
      })}
      </View>
    </Animated.View>
  );
}

interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  views?: string[];
  likes?: string[];
  comments?: StoryComment[];
  isPostShare?: boolean;
  location?: string;
  locationData?: {
    name?: string;
    address?: string;
    placeId?: string;
  };
  postMetadata?: {
    postId?: string;
    userName?: string;
    userAvatar?: string;
    caption?: string;
    imageUrl?: string;
    textOverlays?: string | any[];
  };
}

interface StoryComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
  replies?: StoryComment[];
  likes?: string[];
  likesCount?: number;
  editedAt?: any;
}

export default function StoriesViewer({ stories, onClose, initialIndex = 0, isHighlight = false, highlightId }: { stories: Story[]; onClose: () => void; initialIndex?: number; isHighlight?: boolean; highlightId?: string }): React.ReactElement {
  const DEFAULT_AVATAR_SOURCE = { uri: DEFAULT_AVATAR_URL } as const;
  const normalizeRemoteUrl = (value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
    let u = trimmed;
    if (lower.startsWith('http://')) u = `https://${trimmed.slice(7)}`;
    else if (lower.startsWith('//')) u = `https:${trimmed}`;
    const ul = u.toLowerCase();
    if (!ul.startsWith('https://')) return '';
    // Do not encodeURI() full signed URLs (Firebase etc.) — it can break tokens.
    return u;
  };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSuccess } = useAppDialog();
  const paddingTop = Platform.OS === 'ios' ? Math.max(insets.top, 50) : Math.max(insets.top, 50);
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [showNewHighlightModal, setShowNewHighlightModal] = useState(false);
  const [showViewersModal, setShowViewersModal] = useState(false);
  const [viewersList, setViewersList] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  const {
    currentIndex,
    setCurrentIndex,
    isPaused,
    setIsPaused,
    imageLoading,
    setImageLoading,
    videoDuration,
    setVideoDuration,
    progressSv,
    goToNext,
    goToPrevious
  } = useStories(
    stories,
    initialIndex,
    onClose,
    showComments || showHighlightModal || showNewHighlightModal || showShareModal || showViewersModal
  );

  const [isMuted, setIsMuted] = useState(true);
  const [localStories, setLocalStories] = useState(stories);
  const currentStory = localStories[currentIndex];
  const videoRef = useRef<Video>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [latestAvatar, setLatestAvatar] = useState<string | null>(null);
  const [likedComments, setLikedComments] = useState<{ [key: string]: boolean }>({});
  const [commentLikesCount, setCommentLikesCount] = useState<{ [key: string]: number }>({});
  const [newHighlightName, setNewHighlightName] = useState('');
  const [newHighlightVisibility, setNewHighlightVisibility] = useState<'Public' | 'Private'>('Public');
  const [creatingHighlight, setCreatingHighlight] = useState(false);
  const isCreatingHighlightRef = useRef(false);
  const [userHighlights, setUserHighlights] = useState<any[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  const handleOpenViewersModal = async () => {
    setIsPaused(true);
    setShowViewersModal(true);
    const viewIds = currentStory?.views || [];
    if (viewIds.length === 0) {
      setViewersList([]);
      return;
    }
    setLoadingViewers(true);
    try {
      const res = await apiService.getBulkProfiles(viewIds);
      if (res?.success && Array.isArray(res.data)) {
        setViewersList(res.data);
      } else if (Array.isArray(res)) {
        setViewersList(res);
      }
    } catch (err) {
      console.warn('[StoriesViewer] Failed to load viewers:', err);
    } finally {
      setLoadingViewers(false);
    }
  };  // Robust date parsing for createdAt coming as number | string | Date | Firestore-like
  const toDate = (input: any): Date | null => {
    try {
      if (!input) return null;
      if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
      if (typeof input === 'number') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
      }
      if (typeof input === 'string') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? null : d;
      }
      if (input?.toDate && typeof input.toDate === 'function') {
        const d = input.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      }
      if (input?._seconds != null) {
        const ms = Number(input._seconds) * 1000 + Math.floor(Number(input._nanoseconds || 0) / 1e6);
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      if (input?.$date != null) {
        const d = new Date(input.$date);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const relativeTime = useMemo(() => {
    const d = toDate(localStories[currentIndex]?.createdAt);
    return d ? formatDistanceToNow(d, { addSuffix: true }) : 'Just now';
  }, [localStories, currentIndex]);

  // Keep localStories in sync with props and ensure index stays in-bounds.
  useEffect(() => {
    const arr = Array.isArray(stories) ? stories : [];
    setLocalStories(arr.map((s, i) => storyForStoriesViewer(s, i)));
    setCurrentIndex(initialIndex);
  }, [stories, initialIndex]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        const cachedAvatar = await AsyncStorage.getItem('userAvatar');
        if (userId) {
          // Fast path: set user from storage immediately (no blocking network call)
          setCurrentUser({
            uid: userId,
            displayName: 'User',
            photoURL: normalizeRemoteUrl(cachedAvatar) || null,
          });

          // Background hydrate displayName/avatar (do not block story rendering)
          (async () => {
            try {
              const { apiService } = await import('@/src/_services/apiService');
              const response = await apiService.get(`/users/${userId}`);
              if (response?.success && response?.data) {
                const next = {
                  uid: userId,
                  displayName: response.data.displayName || response.data.name || 'User',
                  photoURL: response.data.avatar || response.data.photoURL || normalizeRemoteUrl(cachedAvatar) || null,
                };
                setCurrentUser(next);
                if (next.photoURL) {
                  AsyncStorage.setItem('userAvatar', String(next.photoURL)).catch(() => {});
                }
              }
            } catch { }
          })();
        }
      } catch (error) {
        console.error('[StoriesViewer] Failed to load userId from storage:', error);
      }
    };
    loadCurrentUser();
  }, []);

  // Prefetch posters & background video preloading for next 3 stories (0ms transition)
  useEffect(() => {
    try {
      const upcoming = localStories.slice(currentIndex, currentIndex + 3);
      const imageUrls = upcoming
        .flatMap((s: any) => [
          String(s?.thumbnailUrl || s?.thumbnail || ''),
          String(s?.imageUrl || s?.image || ''),
        ])
        .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));
      ExpoImage.prefetch([...new Set(imageUrls)]).catch(() => {});

      const videoUrls = upcoming
        .map((s: any) => String(s?.videoUrl || s?.video || ''))
        .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));

      if (videoUrls.length > 0) {
        const { preloadVideos } = require('../../lib/videoCache');
        preloadVideos(videoUrls).catch(() => {});
      }
    } catch { }
  }, [localStories, currentIndex]);

  const loadUserHighlights = async () => {
    if (!currentUser?.uid) return;
    setLoadingHighlights(true);
    try {
      const result = await getUserHighlights(currentUser.uid);
      if (result.success && result.highlights) {
        const normalized = (Array.isArray(result.highlights) ? result.highlights : [])
          .map((h: any) => ({
            ...h,
            id: String(h?._id || h?.id || ''),
            title: h?.title || h?.name || 'Highlight',
            coverImage: h?.coverImage || h?.cover || h?.imageUrl || '',
          }))
          .filter((h: any) => !!h.id);
        setUserHighlights(normalized);
      }
    } catch (error) {
      console.error('Error loading highlights:', error);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const [isAddingToHighlight, setIsAddingToHighlight] = useState(false);

  const handleAddToHighlight = async (highlightId: string) => {
    if (isAddingToHighlight) return;
    setIsAddingToHighlight(true);
    try {
      const result = await highlightManager.addStoryToHighlight({ highlightId, story: currentStory });
      if (result.success) {
        if (Platform.OS === 'android') {
          ToastAndroid.show('Added to highlight', ToastAndroid.SHORT);
        } else {
          Alert.alert('Success', 'Story added to highlight');
        }
        setShowHighlightModal(false);
        setIsPaused(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to add story to highlight');
        setIsPaused(false);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add story to highlight');
      setIsPaused(false);
    } finally {
      setIsAddingToHighlight(false);
    }
  };

  const handleOpenHighlightModal = () => {
    const storyOwnerId = String(currentStory?.userId || '');
    const viewerId = String(currentUser?.uid || '');
    if (!storyOwnerId || !viewerId || storyOwnerId !== viewerId) {
      return;
    }
    setIsPaused(true);
    setShowHighlightModal(true);
    loadUserHighlights();
  };

  const handleCreateNewHighlight = async () => {
    if (isCreatingHighlightRef.current || creatingHighlight) return;
    if (!newHighlightName.trim()) {
      Alert.alert('Error', 'Please enter a highlight name');
      return;
    }
    isCreatingHighlightRef.current = true;
    setCreatingHighlight(true);
    try {
      const res = await highlightManager.createAndAddStory({
        userId: String(currentUser?.uid || ''),
        title: newHighlightName.trim(),
        story: currentStory,
      });
      if (res.success) {
        if (Platform.OS === 'android') {
          ToastAndroid.show('Highlight created', ToastAndroid.SHORT);
        } else {
          Alert.alert('Success', 'Highlight created');
        }
        setShowNewHighlightModal(false);
        setShowHighlightModal(false);
        setNewHighlightName('');
        setNewHighlightVisibility('Public');
        setIsPaused(false);
        // Refresh highlights list so the new one is selectable immediately
        loadUserHighlights();
        return; // Exit directly to keep disabled while closing
      } else {
        Alert.alert('Error', res.error || 'Failed to create highlight');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to create highlight');
    }
    isCreatingHighlightRef.current = false;
    setCreatingHighlight(false);
  };

  useEffect(() => {
    async function fetchLatestAvatar() {
      if (currentUser?.uid) {
        // TODO: Backend API to fetch user avatar
        // const response = await fetch(`/api/users/${currentUser.uid}`);
        // const data = await response.json();
        // setLatestAvatar(data.avatar || data.photoURL || null);
        setLatestAvatar(currentUser.photoURL || null);
      }
    }
    fetchLatestAvatar();
  }, [currentUser?.uid, currentUser?.photoURL]);

  useEffect(() => {
    if (__DEV__) console.log('[StoriesViewer] 🚀 Component MOUNTED! stories count:', stories?.length, 'initialIndex:', initialIndex);
    return () => {
      if (__DEV__) console.log('[StoriesViewer] 💀 Component UNMOUNTED!');
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(localStories) || localStories.length === 0) return;
    if (currentIndex < 0) setCurrentIndex(0);
    else if (currentIndex >= localStories.length) setCurrentIndex(localStories.length - 1);
  }, [localStories, localStories.length, currentIndex]);


  // Filter out stories from blocked users
  useEffect(() => {
    async function applyBlockedFilter() {
      try {
        if (!currentUser?.uid) return;
        
        const { apiService } = await import('@/src/_services/apiService');
        const response = await apiService.getBlockedUsers(currentUser.uid);
        
        if (response?.success && Array.isArray(response.data)) {
          const blockedIds = new Set<string>(response.data.map((u: any) => String(u._id || u.id || '')));
          
          if (blockedIds.size > 0) {
            setLocalStories(prev => {
              const filtered = prev.filter(s => !blockedIds.has(String(s.userId)));
              if (filtered.length !== prev.length) {
                // If the current story is now blocked, the hook will handle index adjustment
                return filtered;
              }
              return prev;
            });
          }
        }
      } catch (e) {
        console.warn('[StoriesViewer] Failed to fetch blocked users for stories:', e);
      }
    }
    applyBlockedFilter();
  }, [currentUser?.uid]);

  // Initialize liked comments when current story changes
  useEffect(() => {
    if (currentStory?.comments) {
      const likedMap: { [key: string]: boolean } = {};
      const likesCountMap: { [key: string]: number } = {};

      currentStory.comments.forEach(comment => {
        likedMap[comment.id] = Array.isArray(comment.likes) ? comment.likes.includes(currentUser?.uid || '') : false;
        likesCountMap[comment.id] = comment.likesCount || 0;

        if (comment.replies) {
          comment.replies.forEach(reply => {
            likedMap[reply.id] = Array.isArray(reply.likes) ? reply.likes.includes(currentUser?.uid || '') : false;
            likesCountMap[reply.id] = reply.likesCount || 0;
          });
        }
      });

      setLikedComments(likedMap);
      setCommentLikesCount(likesCountMap);
    }
  }, [currentIndex, localStories, currentUser?.uid]);

  // Navigation and progress are handled by useStories hook

  const currentStoryAvatarUrl = resolveAvatarUrl(normalizeRemoteUrl(currentStory?.userAvatar));
  const currentStoryImageUrl = normalizeRemoteUrl(currentStory?.imageUrl);
  const currentStoryThumbUrl = normalizeRemoteUrl((currentStory as any)?.thumbnailUrl || (currentStory as any)?.thumbnail);
  const currentStoryVideoUrl = normalizeRemoteUrl(currentStory?.videoUrl);
  const currentStoryPosterUrl = currentStoryThumbUrl || currentStoryImageUrl || currentStoryAvatarUrl;
  const isOwnCurrentStory = String(currentStory?.userId || '') === String(currentUser?.uid || '');
  const isLiked = (currentStory?.likes || [])?.includes(currentUser?.uid || '') || false;
  const likesCount = currentStory?.likes?.length || 0;
  const locationName = currentStory?.locationData?.name || currentStory?.location || (typeof currentStory?.locationData === 'string' ? currentStory.locationData : '');

  if (!currentStory) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </SafeAreaView>
    );
  }

  const handleLike = async () => {
    if (!currentUser) {
      Alert.alert('Please Login', 'You need to be logged in to like stories.');
      return;
    }

    const storyId = currentStory.id;
    const userId = currentUser.uid;

    const updatedStories = [...localStories];
    if (!updatedStories[currentIndex]) return;
    const likes = (updatedStories[currentIndex] as any).likes || [];

    if (isLiked) {
      updatedStories[currentIndex].likes = likes.filter((id: any) => id !== userId);
    } else {
      updatedStories[currentIndex].likes = [...likes, userId];
    }
    setLocalStories(updatedStories);

    try {
      const { apiService } = await import('@/src/_services/apiService');
      const response = await apiService.post(`/stories/${storyId}/like`, { userId });
      if (response?.success) {
        // Fetch fresh story data to sync likes and count
        const fresh = await apiService.get(`/stories/${storyId}`);
        if (fresh?.success && fresh?.data) {
          const freshStories = [...localStories];
          freshStories[currentIndex] = fresh.data;
          setLocalStories(freshStories);
        }
      } else {
        // Revert UI on failure
        setLocalStories([...localStories]);
      }
    } catch (error) {
      setLocalStories([...localStories]);
    }
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return '';
    const now = new Date();
    const time = toDate(timestamp) || now;
    const diff = now.getTime() - time.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const handleLikeComment = async (commentId: string) => {
    if (!currentUser?.uid) return;
    const isLiked = likedComments[commentId];
    // Optimistic UI update
    setLikedComments(prev => ({ ...prev, [commentId]: !isLiked }));
    setCommentLikesCount(prev => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (isLiked ? -1 : 1))
    }));

    try {
      const { apiService } = await import('@/src/_services/apiService');
      const endpoint = `/stories/${currentStory.id}/comments/${commentId}/like`;
      if (isLiked) {
        await apiService.delete(endpoint, { userId: currentUser.uid });
      } else {
        await apiService.post(endpoint, { userId: currentUser.uid });
      }
      // Refresh story to get up‑to‑date likes/comments
      const fresh = await apiService.get(`/stories/${currentStory.id}`);
      if (fresh?.success && fresh?.data) {
        const freshStories = [...localStories];
        freshStories[currentIndex] = fresh.data;
        setLocalStories(freshStories);
      }
    } catch (e) {
      console.error(e);
      // Rollback on error
      setLikedComments(prev => ({ ...prev, [commentId]: isLiked }));
      setCommentLikesCount(prev => ({
        ...prev,
        [commentId]: Math.max(0, (prev[commentId] || 0) + (isLiked ? 1 : -1))
      }));
    }
  };

  // Navigation is handled by useStories hook

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={getKeyboardOffset()}
      >
        {/* Story Media with long-press to pause */}
        <Pressable
          disabled={showComments || showHighlightModal || showNewHighlightModal || showShareModal || showViewersModal}
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => {
            if (!showComments && !showHighlightModal && !showNewHighlightModal && !showShareModal && !showViewersModal) {
              setIsPaused(false);
            }
          }}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
            {/* Instagram-like: never show a spinner/skeleton in viewer.
                Show an instant blurred placeholder while media decodes. */}
            {imageLoading && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Image
                  source={{
                    uri:
                      (currentStory as any)?.thumbnailUrl ||
                      currentStory?.imageUrl ||
                      currentStory?.postMetadata?.imageUrl ||
                      currentStory?.userAvatar ||
                      currentStory?.postMetadata?.userAvatar ||
                      DEFAULT_AVATAR_URL,
                  }}
                  style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: 1.05 }] }]}
                  blurRadius={Platform.OS === 'ios' ? 22 : 14}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
              </View>
            )}
            
            {/* Background for Card Mode (Blurred) */}
            {currentStory.isPostShare && (
              <View style={StyleSheet.absoluteFill}>
                <Image
                  source={{ uri: currentStoryImageUrl }}
                  style={StyleSheet.absoluteFill}
                  blurRadius={Platform.OS === 'ios' ? 25 : 15}
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
              </View>
            )}

            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {currentStory.isPostShare ? (
                /* Premium Card UI for Shared Posts */
                <TouchableOpacity 
                   activeOpacity={0.9}
                   onPress={() => {
                     onClose();
                     router.push({
                        pathname: '/post-detail',
                        params: { postId: currentStory.postMetadata?.postId }
                     } as any);
                   }}
                   style={viewerStyles.postCard}
                >
                   <View style={viewerStyles.postCardHeader}>
                      <Image 
                        source={{ uri: currentStory.postMetadata?.userAvatar || DEFAULT_AVATAR_URL }} 
                        style={viewerStyles.postCardAvatar} 
                      />
                      <Text style={viewerStyles.postCardUsername} numberOfLines={1}>{currentStory.postMetadata?.userName || 'User'}</Text>
                      <Feather name="more-horizontal" size={16} color="#333" style={{ marginLeft: 'auto' }} />
                   </View>
                   <Image 
                      source={{ uri: currentStoryImageUrl }} 
                      style={viewerStyles.postCardImage}
                      resizeMode="cover"
                   />
                   {currentStory.postMetadata?.caption ? (
                     <View style={viewerStyles.postCardFooter}>
                        <Text style={viewerStyles.postCardCaption} numberOfLines={2}>
                           <Text style={{ fontWeight: '700', color: '#111' }}>{currentStory.postMetadata?.userName} </Text>
                           {currentStory.postMetadata?.caption}
                        </Text>
                     </View>
                   ) : (
                     <View style={{ padding: 10 }}>
                        <Text style={{ fontSize: 12, color: '#666' }}>View post</Text>
                     </View>
                   )}
                </TouchableOpacity>
              ) : (
                /* Full Screen UI for Gallery Uploads */
                <View style={StyleSheet.absoluteFill}>
                  {(currentStoryVideoUrl || currentStory.mediaType === 'video') ? (
                    <Video
                      ref={videoRef}
                      source={{ uri: currentStoryVideoUrl || currentStoryImageUrl }}
                      style={viewerStyles.fullScreenMedia}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={!isPaused && !showComments}
                      isMuted={isMuted}
                      isLooping={false}
                      usePoster={true}
                      posterSource={currentStoryPosterUrl ? { uri: currentStoryPosterUrl } : undefined}
                      posterStyle={{ resizeMode: 'contain' }}
                      onLoadStart={() => setImageLoading(true)}
                      onLoad={status => {
                        setImageLoading(false);
                        const isStatusObject = status !== null && typeof status === 'object';
                        if (isStatusObject && status.isLoaded && 'durationMillis' in status && typeof status.durationMillis === 'number') {
                          setVideoDuration(status.durationMillis);
                        }
                      }}
                      onError={() => setImageLoading(false)}
                      onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                        if (status.isLoaded) {
                          const isOverlayOpen = showComments || showHighlightModal || showNewHighlightModal || showShareModal;
                          if (status.didJustFinish && !isPaused && !isOverlayOpen) {
                            const playedTime = status.positionMillis || 0;
                            console.log('[StoriesViewer] 🎬 Video didJustFinish. playedTime:', playedTime);
                            if (playedTime > 500) {
                              console.log('[StoriesViewer] 🎬 playedTime is valid (>500ms). Going to next story.');
                              goToNext();
                            } else {
                              console.log('[StoriesViewer] ⚠️ Played time too short (<500ms), ignoring premature didJustFinish.');
                            }
                          }
                          if (status.isBuffering) {
                            setImageLoading(true);
                          } else {
                            setImageLoading(false);
                          }
                        } else {
                          setImageLoading(true);
                        }
                      }}
                    />
                  ) : currentStoryImageUrl ? (
                    <ExpoImage
                      source={{ uri: currentStoryImageUrl }}
                      style={viewerStyles.fullScreenMedia}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                      transition={120}
                      onLoadStart={() => setImageLoading(true)}
                      onLoad={() => setImageLoading(false)}
                      onError={() => setImageLoading(false)}
                    />
                  ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>Story media unavailable</Text>
                    </View>
                  )}
                </View>
              )}

            </View>
            <StoryTextOverlays postMetadata={currentStory?.postMetadata} mediaLoaded={!imageLoading} />
          </View>
        </Pressable>

        {/* Absolute Top Overlay (Progress & Header) */}
        <View style={[viewerStyles.topOverlay, { paddingTop: paddingTop }]}>
          <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
          
          <StoryProgressBars 
            storiesCount={localStories.length}
            currentIndex={currentIndex}
            progressSv={progressSv}
          />

          {/* Header */}
          <View style={viewerStyles.header}>
            <TouchableOpacity
              style={viewerStyles.userInfo}
              onPress={() => {
                onClose();
                if (currentStory.userId === currentUser?.uid) {
                  router.push('/(tabs)/profile');
                } else {
                  router.push({
                    pathname: '/user-profile',
                    params: { uid: currentStory.userId }
                  });
                }
              }}
            >
              <Image
                source={currentStoryAvatarUrl ? { uri: currentStoryAvatarUrl } : DEFAULT_AVATAR_SOURCE}
                style={viewerStyles.headerAvatar}
              />
              <View>
                <Text style={viewerStyles.headerName} numberOfLines={1} ellipsizeMode="tail">
                  {currentStory.userName}
                </Text>
                <Text style={viewerStyles.headerTime}>{relativeTime}</Text>
              </View>
            </TouchableOpacity>
            
            <View style={viewerStyles.headerActions}>
              {(currentStory.videoUrl || currentStory.mediaType === 'video') && (
                <TouchableOpacity onPress={() => setIsMuted(m => !m)} style={viewerStyles.headerIcon}>
                  <Feather name={isMuted ? 'volume-x' : 'volume-2'} size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setIsPaused(!isPaused)} style={viewerStyles.headerIcon}>
                <Feather name={isPaused ? "play" : "pause"} size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={viewerStyles.headerIcon}>
                <Feather name="x" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Navigation Areas */}
        {!showComments && (
           <View style={viewerStyles.navOverlay}>
             <TouchableOpacity onPress={goToPrevious} style={viewerStyles.navSide} activeOpacity={1} />
             <TouchableOpacity onPress={goToNext} style={viewerStyles.navSide} activeOpacity={1} />
           </View>
        )}
        {/* Footer Actions */}
        <View style={[viewerStyles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
          
          <View style={viewerStyles.footerIconsRow}>
             {currentStory?.mediaType === 'video' && (
               <View style={viewerStyles.footerIconBtnRow}>
                  <Feather name="film" size={22} color="#fff" />
                  <Text style={viewerStyles.footerIconText}>
                    {(() => {
                      const durationMilli = videoDuration || 5000;
                      const mins = Math.floor(durationMilli / 60000);
                      const secs = Math.floor((durationMilli % 60000) / 1000);
                      return `${mins}:${secs.toString().padStart(2, '0')}`;
                    })()}
                  </Text>
               </View>
             )}

             {isOwnCurrentStory && (
                <TouchableOpacity 
                   onPress={() => {
                      Alert.alert('Delete Story', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          if (isHighlight && highlightId) {
                            const mediaHint = String((currentStory as any)?.videoUrl || (currentStory as any)?.imageUrl || (currentStory as any)?.mediaUrl || '');
                            const res = await highlightManager.removeStoryFromHighlight({
                              highlightId,
                              storyId: currentStory.id,
                              mediaUrlHint: mediaHint || undefined,
                              autoDeleteHighlightIfEmpty: true,
                              userId: currentUser?.uid || '',
                            });
                            if (!res.error) {
                              const updated = localStories.filter((_, idx) => idx !== currentIndex);
                              setLocalStories(updated);
                              try {
                                const { feedEventEmitter } = require('../../lib/feedEventEmitter');
                                feedEventEmitter.emit('feedUpdated');
                              } catch (err) {
                                console.warn('[StoriesViewer] Failed to emit feedUpdated on highlight remove:', err);
                              }
                              if (updated.length === 0) onClose();
                              else if (currentIndex >= updated.length) setCurrentIndex(updated.length - 1);
                            } else {
                              Alert.alert('Error', res.error);
                            }
                          } else {
                            const res = await deleteStory(currentStory.id);
                            if (res.success) {
                              const updated = localStories.filter((_, idx) => idx !== currentIndex);
                              setLocalStories(updated);
                              try {
                                const { feedEventEmitter } = require('../../lib/feedEventEmitter');
                                feedEventEmitter.emit('feedUpdated');
                              } catch (err) {
                                console.warn('[StoriesViewer] Failed to emit feedUpdated on story delete:', err);
                              }
                              if (updated.length === 0) onClose();
                              else if (currentIndex >= updated.length) setCurrentIndex(updated.length - 1);
                            }
                          }
                        }}
                      ]);
                   }}
                   style={viewerStyles.footerIconBtn}
                >
                   <Feather name="trash-2" size={24} color="#fff" />
                </TouchableOpacity>
             )}

             {isOwnCurrentStory && !isHighlight && (
                <TouchableOpacity onPress={handleOpenHighlightModal} style={viewerStyles.footerIconBtn} accessibilityLabel="Add to highlight">
                   <Feather name="chevrons-up" size={24} color="#fff" />
                </TouchableOpacity>
             )}

             <View style={viewerStyles.footerIconBtnRow}>
                <Feather name="image" size={22} color="#fff" />
                <Text style={viewerStyles.footerIconText}>{`${currentIndex + 1}/${localStories.length}`}</Text>
             </View>

             <TouchableOpacity onPress={() => { setIsPaused(true); setShowComments(true); }} style={viewerStyles.footerIconBtnRow}>
                <MaterialCommunityIcons name="comment-outline" size={24} color="#fff" />
                <Text style={viewerStyles.footerIconText}>{Number((currentStory as any).commentsCount ?? currentStory.comments?.length ?? 0)}</Text>
             </TouchableOpacity>

             <TouchableOpacity onPress={handleLike} style={viewerStyles.footerIconBtnRow}>
                {isLiked ? (
                  <Ionicons name="heart" size={24} color="#e74c3c" />
                ) : (
                  <Feather name="heart" size={24} color="#fff" strokeWidth={2.5} />
                )}
                <Text style={viewerStyles.footerIconText}>{likesCount}</Text>
             </TouchableOpacity>

             <TouchableOpacity onPress={() => setShowShareModal(true)} style={viewerStyles.footerIconBtn}>
                <Feather name="send" size={24} color="#fff" />
             </TouchableOpacity>
          </View>
        </View>

        {showComments && (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]}>
            <TouchableOpacity 
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' }} 
              activeOpacity={1} 
              onPress={() => { setShowComments(false); setIsPaused(false); }}
            />
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ width: '100%', height: '70%', backgroundColor: '#fff' }}
              >
                <View style={{ flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
                  <View style={{ height: 50, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: '#eee' }}>
                    <View style={{ width: 40, height: 5, backgroundColor: '#ddd', borderRadius: 2.5 }} />
                    <TouchableOpacity 
                      style={{ position: 'absolute', right: 15, top: 10 }}
                      onPress={() => { setShowComments(false); setIsPaused(false); }}
                    >
                      <Ionicons name="close" size={24} color="#000" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <CommentSection
                      postId={currentStory.id}
                      postOwnerId={currentStory.userId || ''}
                      currentAvatar={currentUser?.photoURL || currentUser?.avatar || ''}
                      currentUser={currentUser}
                      isStory={true}
                    />
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          </View>
        )}

        {/* Highlight Selection Modal */}
        <HighlightSelectionModal
          visible={showHighlightModal}
          onClose={() => {
            setShowHighlightModal(false);
            setIsPaused(false);
          }}
          highlights={userHighlights}
          onSelectHighlight={handleAddToHighlight}
          onCreateNew={() => {
            setShowHighlightModal(false);
            setShowNewHighlightModal(true);
            isCreatingHighlightRef.current = false;
            setCreatingHighlight(false);
          }}
          loading={loadingHighlights || isAddingToHighlight}
        />

        {/* Create Highlight (IG-like bottom sheet) */}
        {showNewHighlightModal && (
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 110 }]}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => { setShowNewHighlightModal(false); setIsPaused(false); }} />
              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
                enabled={Platform.OS === 'ios'}
                style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}
              >
                <SafeAreaView style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: height * 0.9, minHeight: 420, overflow: 'hidden' }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 10, marginBottom: 2 }} />

                  <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' }}>
                    <TouchableOpacity
                      onPress={() => { setShowNewHighlightModal(false); setIsPaused(false); }}
                      disabled={creatingHighlight}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ minWidth: 80, alignItems: 'flex-start' }}
                    >
                      <Text style={{ fontSize: 15, color: '#111', fontWeight: '500' }}>Cancel</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>New highlight</Text>
                    </View>

                    <TouchableOpacity
                      onPress={handleCreateNewHighlight}
                      disabled={!newHighlightName.trim() || creatingHighlight}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ minWidth: 80, alignItems: 'flex-end' }}
                    >
                      {creatingHighlight ? (
                        <ActivityIndicator size="small" color="#007aff" />
                      ) : (
                        <Text style={{ fontSize: 15, color: newHighlightName.trim() ? '#007aff' : '#bbb', fontWeight: '700' }}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}>
                    <View style={{ width: 140, height: 140, borderRadius: 16, alignSelf: 'center', marginTop: 22, marginBottom: 16, backgroundColor: '#f4f4f4', overflow: 'hidden' }}>
                      <Image
                        source={{ uri: String(currentStory?.imageUrl || currentStory?.videoUrl || '') }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>

                    <View style={{ marginHorizontal: 16, borderWidth: 1, borderColor: '#e9ecef', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff' }}>
                      <TextInput
                        value={newHighlightName}
                        onChangeText={setNewHighlightName}
                        placeholder="Highlight name"
                        placeholderTextColor="#999"
                        autoCapitalize="words"
                        returnKeyType="done"
                        style={{ height: 44, color: '#111', fontSize: 16 }}
                      />
                    </View>

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 18, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0f0f0', marginTop: 14 }}
                      onPress={() => {
                        Alert.alert('Visibility', 'Who can see this highlight?', [
                          { text: 'Public', onPress: () => setNewHighlightVisibility('Public') },
                          { text: 'Private', onPress: () => setNewHighlightVisibility('Private') },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }}
                    >
                      <Ionicons name="eye-outline" size={20} color="#444" />
                      <Text style={{ flex: 1, fontSize: 15, color: '#000', fontWeight: '500' }}>Visibility</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 13, color: '#888' }}>{newHighlightVisibility}</Text>
                        <Feather name="chevron-right" size={18} color="#aaa" />
                      </View>
                    </TouchableOpacity>
                  </ScrollView>
                </SafeAreaView>
                {/* White filler below the sheet to cover keyboard corners/bottom safe area */}
                <View style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1000,
                    height: 1000,
                    backgroundColor: '#fff',
                    zIndex: -1,
                }} />
              </KeyboardAvoidingView>
            </View>
          </View>
        )}

        <ShareModal 
          visible={showShareModal}
          useViewOverlay={true}
          currentUserId={currentUser?.uid || (typeof currentUser === 'string' ? currentUser : '') || currentUser?._id || currentUser?.id || ''}
          onClose={() => { setShowShareModal(false); setIsPaused(false); }}
          modalVariant="home"
          sharePayload={{ ...currentStory, isStory: true }}
          onSend={async (userIds: string[]) => {
            const uid = currentUser?.uid || currentUser?.id;
            if (!uid || userIds.length === 0) return;
            setShowShareModal(false);
            setIsPaused(false);
            let successCount = 0;
            
            for (const targetUid of userIds) {
              try {
                const { getOrCreateConversation } = await import('../../lib/firebaseHelpers/conversation');
                const { sendStoryMessage } = await import('../../lib/firebaseHelpers/messages');
                const convRes = await getOrCreateConversation(uid, targetUid);
                if (convRes?.success && convRes.conversationId) {
                  await sendStoryMessage(convRes.conversationId, uid, currentStory, { recipientId: targetUid });
                  successCount += 1;
                }
              } catch (err) {
                 console.error('Failed to share story to user:', targetUid, err);
              }
            }
            if (successCount > 0) {
              showSuccess(`Story shared to ${successCount} user${successCount > 1 ? 's' : ''}`);
            } else {
              Alert.alert('Failed', 'Story share failed. Please try again.');
            }
          }}
        />

      </KeyboardAvoidingView>
    </View>
  );
}

const viewerStyles = StyleSheet.create({
  fullScreenMedia: {
    width: width,
    height: '100%',
  },
  postCard: {
    width: width * 0.85,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 20,
  },
  postCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  postCardAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  postCardUsername: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  postCardImage: {
    width: '100%',
    aspectRatio: 1,
  },
  postCardFooter: {
    padding: 12,
  },
  postCardCaption: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingBottom: 25,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    gap: 4,
    marginBottom: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  headerLocation: {
    color: '#FF8D00',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    marginBottom: 2,
  },
  headerName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 3,
  },
  headerTime: {
    color: '#eee',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginLeft: 15,
  },
  navOverlay: {
    position: 'absolute',
    top: 100,
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  navSide: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
    paddingTop: 35,
  },
  footerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerIconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerIconBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 12,
  },
  footerIconText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  commentsModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    height: height * 0.7,
    paddingTop: 10,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 15,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  commentUser: {
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 18,
  },
  commentMeta: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 12,
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 30,
  },
  centeredModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
