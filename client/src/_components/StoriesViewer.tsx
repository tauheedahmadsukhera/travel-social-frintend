import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
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
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_AVATAR_URL, API_BASE_URL } from '../../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteStory } from '../../lib/firebaseHelpers/deleteStory';
import { addCommentReply, addStoryToHighlight, getUserHighlights } from '../../lib/firebaseHelpers/index';
import { getKeyboardOffset } from '../../utils/responsive';
import { useUser } from './UserContext';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';
import ShareModal from './ShareModal';
import HighlightSelectionModal from './HighlightSelectionModal';
import CreateHighlightModal from './CreateHighlightModal';

const { width, height } = Dimensions.get('window');

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
  postMetadata?: {
    postId: string;
    userName: string;
    userAvatar: string;
    caption?: string;
    imageUrl?: string;
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

export default function StoriesViewer({ stories, onClose, initialIndex = 0 }: { stories: Story[]; onClose: () => void; initialIndex?: number }): React.ReactElement {
  const DEFAULT_AVATAR_SOURCE = require('../../assets/images/splash-icon.png');
  const normalizeRemoteUrl = (value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
    if (lower.startsWith('http://')) return `https://${trimmed.slice(7)}`;
    if (lower.startsWith('//')) return `https:${trimmed}`;
    if (!lower.startsWith('https://')) return '';
    return encodeURI(trimmed);
  };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'ios' ? Math.max(insets.top, 50) : Math.max(insets.top, 50);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [commentPanY, setCommentPanY] = useState(0);
  const commentPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
    onPanResponderMove: (_, gestureState) => {
      setCommentPanY(gestureState.dy);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > 40) {
        setShowComments(false);
      }
      setCommentPanY(0);
    },
  });
  const [commentText, setCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [localStories, setLocalStories] = useState(stories);
  const [videoDuration, setVideoDuration] = useState(5000); // ms
  const videoRef = useRef<Video>(null);
  const userContextUser = useUser();
  // Get current user from AsyncStorage (token-based auth) instead of UserContext
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [latestAvatar, setLatestAvatar] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [likedComments, setLikedComments] = useState<{ [key: string]: boolean }>({});
  const [commentLikesCount, setCommentLikesCount] = useState<{ [key: string]: number }>({});
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'success'>('idle');
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [showNewHighlightModal, setShowNewHighlightModal] = useState(false);
  const [newHighlightName, setNewHighlightName] = useState('');
  const [userHighlights, setUserHighlights] = useState<any[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState(false);

  // Robust date parsing for createdAt coming as number | string | Date | Firestore-like
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

  // Load current user from AsyncStorage on mount
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

  // Preload current + next story media to reduce visible loading spinners
  useEffect(() => {
    try {
      const cur = localStories?.[currentIndex];
      const next = localStories?.[currentIndex + 1];
      const urls = [cur, next]
        .map((s: any) => String(s?.imageUrl || s?.videoUrl || ''))
        .filter((u) => typeof u === 'string' && u.startsWith('http'));
      urls.forEach((u) => {
        Image.prefetch(u).catch(() => {});
      });
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

  const handleAddToHighlight = async (highlightId: string) => {
    try {
      const resolvedStoryId = String((currentStory as any)?.id || (currentStory as any)?._id || (currentStory as any)?.storyId || '');
      if (!resolvedStoryId) {
        Alert.alert('Error', 'Story id is missing');
        return;
      }
      const result = await addStoryToHighlight(highlightId, resolvedStoryId);
      if (result.success) {
        Alert.alert('Success', 'Story added to highlight!');
        setShowHighlightModal(false);
      } else {
        Alert.alert('Error', result.error || 'Failed to add story to highlight');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add story to highlight');
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
    if (!newHighlightName.trim()) {
      Alert.alert('Error', 'Please enter a highlight name');
      return;
    }
    try {
      const { apiService } = await import('@/src/_services/apiService');
      const resolvedStoryId = String((currentStory as any)?.id || (currentStory as any)?._id || (currentStory as any)?.storyId || '');
      if (!resolvedStoryId) {
        Alert.alert('Error', 'Story id is missing');
        return;
      }
      const res = await apiService.post('/highlights', {
        userId: currentUser.uid,
        title: newHighlightName.trim(),
        coverImage: currentStory.imageUrl || currentStory.videoUrl || '',
        // Backend expects `stories` (used by our helper). Keep `storyIds` too for compatibility.
        stories: [resolvedStoryId],
        storyIds: [resolvedStoryId],
      });
      if (res.success) {
        const created = (res?.data || res) as any;
        const highlightId = String(created?._id || created?.id || created?.highlightId || '');
        // Ensure story is actually attached even if backend ignores stories/storyIds on create.
        if (highlightId) {
          try {
            await addStoryToHighlight(highlightId, resolvedStoryId);
          } catch {}
        }
        Alert.alert('Success', 'Highlight created!');
        setShowNewHighlightModal(false);
        setShowHighlightModal(false);
        setNewHighlightName('');
        setIsPaused(false);
        // Refresh highlights list so the new one is selectable immediately
        loadUserHighlights();
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to create highlight');
    }
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

  // Sync localStories and currentIndex when stories or initialIndex change
  useEffect(() => {
    setLocalStories(stories);
    setCurrentIndex(initialIndex);
  }, [stories, initialIndex]);

  // Filter out stories from blocked users
  useEffect(() => {
    async function applyBlockedFilter() {
      try {
        if (!currentUser?.uid) return;
        // TODO: Implement backend API to fetch blocked users list
        // const response = await fetch(`/api/users/${currentUser.uid}/blocked`);
        // const data = await response.json();
        const blockedIds = new Set<string>();
        setLocalStories(prev => prev.filter(s => !blockedIds.has(s.userId)));
        // Adjust index if filtered list shrinks before currentIndex
        setCurrentIndex(idx => {
          const len = localStories.length;
          if (len === 0) return 0;
          return Math.min(idx, len - 1);
        });
      } catch (e) {
        // Fail open: if blocked list cannot be fetched, keep original stories
        console.warn('Failed to fetch blocked users for stories:', e);
      }
    }
    applyBlockedFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  // Initialize liked comments when current story changes
  useEffect(() => {
    if (currentStory.comments) {
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

  useEffect(() => {
    const isVideo = currentStory?.videoUrl || currentStory?.mediaType === 'video';
    const duration = isVideo ? videoDuration : 5000;
    if (isPaused || showComments || imageLoading) return;
    const increment = 100 / (duration / 50);
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + increment;
        if (newProgress >= 100) {
          if (currentIndex < localStories.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setImageLoading(true);
            setVideoDuration(5000);
            return 0;
          } else {
            // Don't call onClose here - use useEffect to watch for end condition
            return 100;
          }
        }
        return newProgress;
      });
    }, 50);
    return () => clearInterval(interval);
  }, [currentIndex, localStories.length, isPaused, showComments, imageLoading, videoDuration]);

  // Call onClose when story reaches end
  useEffect(() => {
    if (progress >= 100 && currentIndex >= localStories.length - 1) {
      onClose();
    }
  }, [progress, currentIndex, localStories.length, onClose]);

  const currentStory = localStories[currentIndex];
  const currentStoryAvatarUrl = normalizeRemoteUrl(currentStory?.userAvatar) || DEFAULT_AVATAR_URL;
  const currentStoryImageUrl = normalizeRemoteUrl(currentStory?.imageUrl);
  const currentStoryVideoUrl = normalizeRemoteUrl(currentStory?.videoUrl);
  const isOwnCurrentStory = String(currentStory?.userId || '') === String(currentUser?.uid || '');
  const isLiked = currentStory.likes?.includes(currentUser?.uid || '') || false;
  const likesCount = currentStory.likes?.length || 0;

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
    const likes = updatedStories[currentIndex].likes || [];

    if (isLiked) {
      updatedStories[currentIndex].likes = likes.filter(id => id !== userId);
    } else {
      updatedStories[currentIndex].likes = [...likes, userId];
    }
    setLocalStories(updatedStories);

    try {
      const { apiService } = await import('@/src/_services/apiService');
      const response = await apiService.post(`/stories/${storyId}/like`, { userId });
      if (!response.success) {
        setLocalStories([...localStories]);
      }
    } catch (error) {
      setLocalStories([...localStories]);
    }
  };

  const handleComment = async () => {
    if (!currentUser) return;
    let avatarToSave = DEFAULT_AVATAR_URL;
    if (currentUser.photoURL && currentUser.photoURL !== DEFAULT_AVATAR_URL && currentUser.photoURL !== '') {
      avatarToSave = currentUser.photoURL;
    }
    
    if (!commentText.trim()) return;

    const storyId = currentStory.id;
    const text = commentText.trim();

    const newComment: StoryComment = {
      id: Date.now().toString(),
      userId: currentUser.uid,
      userName: currentUser.displayName || 'User',
      userAvatar: avatarToSave,
      text,
      createdAt: new Date(),
    };
    const updatedStories = [...localStories];
    updatedStories[currentIndex].comments = [...(updatedStories[currentIndex].comments || []), newComment];
    setLocalStories(updatedStories);
    setCommentText('');

    try {
      const { apiService } = await import('@/src/_services/apiService');
      const response = await apiService.post(`/stories/${storyId}/comments`, {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'User',
        text
      });
      if (response.success && response.data) {
        const updatedWithRealId = [...localStories];
        const currentStory = updatedWithRealId[currentIndex];
        const commentIndex = currentStory?.comments?.findIndex(c => c.id === newComment.id);
        if (currentStory && commentIndex !== undefined && commentIndex >= 0 && currentStory.comments) {
          currentStory.comments[commentIndex] = {
            ...response.data,
            id: response.data._id || response.data.id
          };
          setLocalStories(updatedWithRealId);
        }
      }
    } catch (error) {
      console.error('[StoriesViewer] Comment error:', error);
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
    setLikedComments(prev => ({ ...prev, [commentId]: !isLiked }));
    setCommentLikesCount(prev => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] || 0) + (isLiked ? -1 : 1))
    }));
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setProgress(0);
      setImageLoading(true);
      setShowComments(false);
    }
  };

  const goToNext = () => {
    if (currentIndex < localStories.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setProgress(0);
      setImageLoading(true);
      setShowComments(false);
    } else {
      onClose();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={getKeyboardOffset()}
      >
        {/* Story Media with long-press to pause */}
        <Pressable
          onLongPress={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {imageLoading && <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -20, marginTop: -20, zIndex: 10 }} />}
            
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
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={!isPaused && !showComments}
                      isMuted={isMuted}
                      isLooping={false}
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
                        if (status.isLoaded && status.didJustFinish) {
                          goToNext();
                        }
                        if (!status.isLoaded || status.isBuffering) {
                          setImageLoading(true);
                        } else {
                          setImageLoading(false);
                        }
                      }}
                    />
                  ) : currentStoryImageUrl ? (
                    <Image
                      source={{ uri: currentStoryImageUrl }}
                      style={viewerStyles.fullScreenMedia}
                      resizeMode="cover"
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
          </View>
        </Pressable>

        {/* Absolute Top Overlay (Progress & Header) */}
        <View style={[viewerStyles.topOverlay, { paddingTop: paddingTop }]}>
          <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
          {/* Progress Bars */}
          <View style={viewerStyles.progressContainer}>
            {localStories.map((_, index) => (
              <View key={index} style={viewerStyles.progressBarBg}>
                <View
                  style={[
                    viewerStyles.progressBarFill,
                    { width: index === currentIndex ? `${progress}%` : index < currentIndex ? '100%' : '0%' }
                  ]}
                />
              </View>
            ))}
          </View>

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
                <Text style={viewerStyles.headerName}>{currentStory.userName}</Text>
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
             {isOwnCurrentStory && (
                <TouchableOpacity 
                   onPress={() => {
                      Alert.alert('Delete Story', 'Are you sure?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: async () => {
                          const res = await deleteStory(currentStory.id);
                          if (res.success) {
                            const updated = localStories.filter((_, idx) => idx !== currentIndex);
                            setLocalStories(updated);
                            if (updated.length === 0) onClose();
                            else if (currentIndex >= updated.length) setCurrentIndex(updated.length - 1);
                          }
                        }}
                      ]);
                   }}
                   style={viewerStyles.footerIconBtn}
                >
                   <Feather name="trash-2" size={24} color="#fff" />
                </TouchableOpacity>
             )}

             <TouchableOpacity onPress={() => setShowShareModal(true)} style={viewerStyles.footerIconBtn}>
                <Feather name="send" size={24} color="#fff" />
             </TouchableOpacity>

             {isOwnCurrentStory && (
                <TouchableOpacity onPress={handleOpenHighlightModal} style={viewerStyles.footerIconBtnRow}>
                   <Ionicons name="heart-circle-outline" size={28} color="#fff" />
                   <Text style={viewerStyles.footerIconText}>Highlight</Text>
                </TouchableOpacity>
             )}

             <TouchableOpacity onPress={handleLike} style={viewerStyles.footerIconBtnRow}>
                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={26} color={isLiked ? "#e74c3c" : "#fff"} />
                <Text style={viewerStyles.footerIconText}>{likesCount}</Text>
             </TouchableOpacity>

             <TouchableOpacity onPress={() => setShowComments(true)} style={viewerStyles.footerIconBtnRow}>
                <MaterialCommunityIcons name="comment-outline" size={24} color="#fff" />
                <Text style={viewerStyles.footerIconText}>{currentStory.comments?.length || 0}</Text>
             </TouchableOpacity>

             <View style={viewerStyles.footerIconBtnRow}>
                <Feather name="image" size={22} color="#fff" />
                <Text style={viewerStyles.footerIconText}>{`${currentIndex + 1}/${localStories.length}`}</Text>
             </View>

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
          </View>
        </View>

        {/* Comments Modal */}
        <Modal visible={showComments} animationType="slide" transparent={true} onRequestClose={() => setShowComments(false)}>
           <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                 <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowComments(false)} />
                 <View style={viewerStyles.commentsModal}>
                    <View style={viewerStyles.modalHandle} />
                    <Text style={viewerStyles.modalTitle}>Comments</Text>
                    <FlatList
                      data={currentStory.comments || []}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => (
                        <View style={viewerStyles.commentItem}>
                           <Image source={{ uri: item.userAvatar || DEFAULT_AVATAR_URL }} style={viewerStyles.commentAvatar} />
                           <View style={{ flex: 1 }}>
                              <Text style={viewerStyles.commentUser}>{item.userName}</Text>
                              <Text style={viewerStyles.commentText}>{item.text}</Text>
                              <Text style={viewerStyles.commentMeta}>{getTimeAgo(item.createdAt)}</Text>
                           </View>
                        </View>
                      )}
                      ListEmptyComponent={<Text style={viewerStyles.emptyText}>No comments yet</Text>}
                      style={{ padding: 16 }}
                    />
                    <View style={viewerStyles.inputArea}>
                       <TextInput
                         value={commentText}
                         onChangeText={setCommentText}
                         placeholder="Add a comment..."
                         placeholderTextColor="#999"
                         style={viewerStyles.textInput}
                       />
                       <TouchableOpacity onPress={handleComment} disabled={!commentText.trim()}>
                          <Feather name="send" size={22} color={commentText.trim() ? "#007aff" : "#999"} />
                       </TouchableOpacity>
                    </View>
                 </View>
              </View>
           </KeyboardAvoidingView>
        </Modal>

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
          }}
          loading={loadingHighlights}
        />

        {/* Create Highlight Modal */}
        <CreateHighlightModal
          visible={showNewHighlightModal}
          onClose={() => {
            setShowNewHighlightModal(false);
            setIsPaused(false);
          }}
          userId={currentUser?.uid}
          defaultCoverUri={currentStory?.imageUrl || currentStory?.videoUrl}
          onSuccess={() => {
            loadUserHighlights(); // Refresh list
          }}
        />

        <ShareModal 
          visible={showShareModal}
          currentUserId={currentUser?.uid || ''}
          onClose={() => { setShowShareModal(false); setIsPaused(false); }}
          onSend={async (userIds) => {
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
              Alert.alert('Success', `Story shared to ${successCount} user${successCount > 1 ? 's' : ''}`);
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
