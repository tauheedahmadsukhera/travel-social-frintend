import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@/lib/storage';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
// Firebase removed - using Backend API
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, BACKEND_URL } from '../../lib/api';
import { useCurrentLocation } from '../../hooks/useCurrentLocation';
import { createStory, getUserHighlights, getUserSectionsSorted, getUserStories } from '../../lib/firebaseHelpers';
import { followUser, sendFollowRequest, unfollowUser } from '../../lib/firebaseHelpers/follow';
import { likePost, unlikePost } from '../../lib/firebaseHelpers/post';
import { getOptimizedImageUrl } from '../../lib/imageHelpers';
import { buildProfileDeepLink, buildProfileWebLink, sharePost, shareProfile } from '../../lib/postShare';

import { userService } from '../../lib/userService';
import { fetchBlockedUserIds, filterOutBlocked } from '../../services/moderation';
import HighlightCarousel from '@/src/_components/HighlightCarousel';
import StoriesViewer from '@/src/_components/StoriesViewer';
import * as Clipboard from 'expo-clipboard';
import { useHeaderVisibility, useHeaderHeight } from './_layout';

import { getTaggedPosts, getUserHighlights as getUserHighlightsAPI, getUserPosts as getUserPostsAPI, getUserProfile as getUserProfileAPI, getUserSections as getUserSectionsAPI } from '@/src/_services/firebaseService';
import { apiService } from '@/src/_services/apiService';
import { getKeyboardOffset, getModalHeight } from '@/utils/responsive';
import { getPassportData } from '../../lib/firebaseHelpers/passport';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { useAssetPreloader } from '@/hooks/useAssetPreloader';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ResizeMode, Video } from 'expo-av';
import { resolveCanonicalUserId } from '../../lib/currentUser';
import { hapticLight, hapticMedium } from '../../lib/haptics';
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../../hooks/useOffline';

// Shared Utilities & Components
import { normalizeMediaUrl, normalizeAvatarUrl, isVideoUrl } from '../../lib/utils/media';
import { toDate, getRelativeTime } from '../../lib/utils/date';
import ProfileGridItem from '@/src/_components/profile/ProfileGridItem';
import { ProfilePostMarker } from '@/src/_components/profile/ProfilePostMarker';

import ProfileHeader from '@/src/_components/profile/ProfileHeader';
import ProfileStats from '@/src/_components/profile/ProfileStats';

import ProfileSections from '@/src/_components/profile/ProfileSections';
import ProfileModals from '@/src/features/profile/components/ProfileModals';
import ProfileGrid from '@/src/features/profile/components/ProfileGrid';
import { useProfileActions } from '@/hooks/useProfileActions';
import { useProfileData } from '@/src/features/profile/hooks/useProfileData';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_HEIGHT < 700;

const responsiveValues = {
  imageHeight: isSmallDevice ? 240 : 340,
  titleSize: isSmallDevice ? 16 : 18,
  labelSize: isSmallDevice ? 13 : 14,
  inputSize: isSmallDevice ? 14 : 15,
  spacing: isSmallDevice ? 12 : 16,
  spacingLarge: isSmallDevice ? 16 : 20,
  inputHeight: isSmallDevice ? 44 : 48,
  modalPadding: isSmallDevice ? 20 : 20,
};

const MapView = Platform.OS === 'web' ? null : require('react-native-maps').default;
const Marker = Platform.OS === 'web' ? null : require('react-native-maps').Marker;

// Default avatar URL
import { DEFAULT_AVATAR_URL } from '@/lib/api';
const DEFAULT_IMAGE_URL = DEFAULT_AVATAR_URL;
const DEFAULT_AVATAR_SOURCE = { uri: DEFAULT_AVATAR_URL };

function getInitials(nameOrUsername: any): string {
  if (typeof nameOrUsername !== 'string') return 'U';
  const cleaned = nameOrUsername.trim();
  if (!cleaned) return 'U';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

function normalizeExternalUrl(input: any): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return raw;
  return `https://${raw}`;
}

function isObjectLike(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object';
}

type ProfileLinkPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'whatsapp'
  | 'youtube'
  | 'linkedin'
  | 'website'
  | 'unknown';

function splitProfileLinks(raw: any): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getUrlHost(url: string): string | null {
  try {
    const normalized = normalizeExternalUrl(url) || url;
    const withoutProto = normalized.replace(/^https?:\/\//i, '');
    const host = withoutProto.split('/')[0]?.trim();
    return host || null;
  } catch {
    return null;
  }
}

function detectProfileLinkPlatform(url: string): ProfileLinkPlatform {
  const host = (getUrlHost(url) || '').toLowerCase();
  if (!host) return 'unknown';
  if (host.includes('facebook.com') || host.includes('fb.com') || host.includes('fb.me')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('whatsapp.com') || host.includes('wa.me')) return 'whatsapp';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('linkedin.com')) return 'linkedin';
  return 'website';
}

function getFaviconUrl(url: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

// Utility to parse/sanitize coordinates
function parseCoord(val: any): number | null {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return isFinite(n) ? n : null;
  }
  return null;
}

// isVideoUrl is imported from ../../lib/utils/media

// Types
type Highlight = {
  id: string;
  title: string;
  coverImage: string;
  stories: { id: string; image: string }[];
};

type ProfileData = {
  id: string;
  uid: string;
  name?: string;
  displayName?: string;  // Backend returns displayName, not name
  username?: string;
  email: string;
  avatar?: string;
  photoURL?: string;  // Firebase field name
  bio?: string;
  website?: string;
  location?: string;
  phone?: string;
  interests?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  locationsCount?: number;
  followers?: string[];
  following?: string[];
  isPrivate?: boolean;
  approvedFollowers?: string[];
  isApprovedFollower?: boolean;
  followRequestPending?: boolean;
  firebaseUid?: string;  // Backend field
};

function getPostId(post: any): string {
  if (!post) return '';
  const id = post.id ?? post._id;
  return typeof id === 'string' ? id : String(id ?? '');
}

export default function Profile({ userIdProp }: any) {
  // Constants
  const insets = useSafeAreaInsets();
  const POSTS_PER_PAGE = 12;

  // State and context
  const [storiesViewerVisible, setStoriesViewerVisible] = useState(false);
  /** Instagram-style: tap profile photo to view full-screen (when not opening stories). */
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [highlightViewerVisible, setHighlightViewerVisible] = useState(false);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserUidAlias, setCurrentUserUidAlias] = useState<string | null>(null);
  const [currentUserFirebaseAlias, setCurrentUserFirebaseAlias] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const router = useRouter();
  const { showSuccess } = useAppDialog();
  const params = useLocalSearchParams();

  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await resolveCanonicalUserId();
        setCurrentUserId(userId);
      } catch (error) {}
    };
    getUserId();
  }, []);

  // Extract viewedUserId - handle both cases
  let viewedUserId: string | undefined;
  if (userIdProp) {
    viewedUserId = userIdProp;
  } else if (params.user) {
    // params.user could be an array or string
    viewedUserId = Array.isArray(params.user) ? params.user[0] : params.user;
  } else {
    viewedUserId = currentUserId || undefined;
  }

  // Avoid noisy logs on a hot screen

  // Determine if viewing own profile - compare IDs or check if no explicit user passed
  const selfIds = new Set(
    [currentUserId, currentUserUidAlias, currentUserFirebaseAlias]
      .filter(Boolean)
      .map((v) => String(v))
  );
  const isOwnProfile = (viewedUserId && selfIds.has(String(viewedUserId))) || (!userIdProp && !params.user && selfIds.size > 0);

  if (viewedUserId && selfIds.has(String(viewedUserId)) && currentUserId && viewedUserId !== currentUserId) {
    viewedUserId = currentUserId;
  }

  // Avoid noisy logs on a hot screen

  // ── Centralized Data Hook ──
  const {
    profile,
    posts,
    sections,
    userStories,
    savedSectionPosts,
    taggedPosts,
    highlights,
    isLoading: profileLoading,
    refetchAll
  } = useProfileData({
    viewedUserId: viewedUserId as string,
    currentUserId,
    enabled: !!viewedUserId,
  });

  useAssetPreloader(posts, (item: any) => [
    item.imageUrl, 
    item.thumbnailUrl, 
    item.media?.[0]?.url,
    item.userAvatar
  ].filter(Boolean));

  const loading = profileLoading;
  const passportLocationsCount = Number(profile?.passportCount ?? profile?.locationsCount ?? 0);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [postViewerVisible, setPostViewerVisible] = useState<boolean>(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState<number>(0);
  const [segmentTab, setSegmentTab] = useState<'grid' | 'map' | 'tagged' | 'saved'>('grid');
  const { location: currentLocation } = useCurrentLocation();
  const [editSectionsModal, setEditSectionsModal] = useState<boolean>(false);
  const [viewCollectionsModal, setViewCollectionsModal] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<{ [key: string]: boolean }>({});
  const [savedPosts, setSavedPosts] = useState<{ [key: string]: boolean }>({});

  // ── Local optimistic follow state ──────────────────────────────────────
  // These update INSTANTLY on tap so there's zero visible delay, regardless
  // of when React Query propagates the cache update.
  const [localIsFollowing, setLocalIsFollowing] = useState<boolean | null>(null);
  const [localFollowersCount, setLocalFollowersCount] = useState<number | null>(null);
  const [localFollowRequestPending, setLocalFollowRequestPending] = useState<boolean | null>(null);
  // Sync from server whenever profile data changes
  useEffect(() => {
    if (profile) {
      setLocalIsFollowing(!!profile.isFollowing);
      setLocalFollowersCount(
        typeof profile.followersCount === 'number'
          ? profile.followersCount
          : Array.isArray(profile.followers) ? profile.followers.length
          : Number(profile.followersCount) || 0
      );
      setLocalFollowRequestPending(!!profile.followRequestPending);
    }
  }, [profile?.isFollowing, profile?.followersCount, profile?.followRequestPending]);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState<string>('');
  const [commentModalAvatar, setCommentModalAvatar] = useState<string>('');
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();
  const PROFILE_CACHE_KEY = useMemo(
    () => `profile_v3_${String(viewedUserId || 'unknown')}_${String(currentUserId || 'anon')}`,
    [viewedUserId, currentUserId]
  );

  const { hideHeader, showHeader } = useHeaderVisibility();
  const [refreshing, setRefreshing] = useState(false);

  // Story Upload State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchAll();
    setRefreshing(false);
  }, [refetchAll]);

  // Throttled focus-refetch: only refresh once per 60 s to avoid 429 spam
  const lastFocusRefetchRef = useRef<number>(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusRefetchRef.current > 60_000) {
        lastFocusRefetchRef.current = now;
        refetchAll().catch(() => {});
      }
    }, [refetchAll])
  );

  // Header padding is handled by Tabs sceneStyle (see (tabs)/_layout.tsx)
  const headerHeight = 0;

  // Always show the TopMenu when this tab gains focus
  // (fixes: header stays hidden if Home screen hid it before user switches to Profile)
  useFocusEffect(
    useCallback(() => {
      showHeader();
      headerHiddenRef.current = false;
    }, [showHeader])
  );

  const lastScrollYRef = useRef(0);
  const lastEmitTsRef = useRef(0);
  const headerHiddenRef = useRef(false);

  // Handle return from story-creator
  useEffect(() => {
    const uri = params?.storyMediaUri != null ? String(params.storyMediaUri) : '';
    const type = params?.storyMediaType != null ? String(params.storyMediaType) : 'photo';
    if (!uri) return;
    setSelectedMedia({ uri, type });
    setShowUploadModal(true);
  }, [params?.storyMediaUri]);

  // Location suggestions for stories
  useEffect(() => {
    if (locationQuery.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    setLoadingLocations(true);
    const timer = setTimeout(async () => {
      try {
        const { mapService } = require('../../services');
        const suggestions = await mapService.getAutocompleteSuggestions(locationQuery);
        const predictions = suggestions.map((s: any) => ({
          placeId: s.placeId,
          name: s.mainText || s.description || 'Location',
          address: s.description || '',
        }));
        setLocationSuggestions(predictions);
      } catch (err) {
        setLocationSuggestions([]);
      } finally {
        setLoadingLocations(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  const handleAddStory = () => {
    if (!currentUserId) {
      Alert.alert('Login required', 'Please login to create a story');
      return;
    }
    hapticLight();
    router.push('/story-creator' as any);
  };

  const sectionSourcePosts = useMemo(() => {
    const merged = [...posts, ...savedSectionPosts];
    const byId = new Map<string, any>();
    for (const p of merged) {
      const id = getPostId(p);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, p);
    }
    return Array.from(byId.values());
  }, [posts, savedSectionPosts]);

  const visiblePosts = selectedSection
    ? sectionSourcePosts.filter((p: any) => (sections.find((s: any) => s.name === selectedSection)?.postIds || []).includes(getPostId(p)))
    : posts;

  const PROFILE_MAP_ENABLED = false;

  useEffect(() => {
    if (!PROFILE_MAP_ENABLED && segmentTab === 'map') {
      setSegmentTab('grid');
    }
  }, [PROFILE_MAP_ENABLED, segmentTab]);

  // Hook for actions
  // NOTE: setIsFollowing / setProfile / setApprovedFollower / setFollowRequestPending are
  // now no-ops here because useProfileActions handles optimistic cache updates internally
  // via queryClient.setQueryData and then syncs with the server in the background.
  const {
    followLoading: actionFollowLoading,
    handleFollowToggle,
    handleMessage: hookHandleMessage,
    handleLikePost,
    handleBlockUser
  } = useProfileActions({
    currentUserId,
    viewedUserId: viewedUserId ?? null,
    isOwnProfile,
    isPrivate: !!profile?.isPrivate,
    isFollowing: !!profile?.isFollowing,
    setIsFollowing: () => {}, // Optimistic update handled inside the hook
    setProfile: () => {},     // Optimistic update handled inside the hook
    setApprovedFollower: () => {},
    setFollowRequestPending: () => {},
    likedPosts,
    setLikedPosts,
    savedPosts,
    setSavedPosts,
    router
  });

  // Sync loading state
  useEffect(() => {
    setFollowLoading(actionFollowLoading);
  }, [actionFollowLoading]);

  // Wrapper that updates local state INSTANTLY on tap, then delegates to the hook
  const handleFollowToggleLocal = useCallback(() => {
    if (!currentUserId || !viewedUserId || followLoading || isOwnProfile) return;
    const wasFollowing = localIsFollowing ?? !!profile?.isFollowing;
    const wasPending = localFollowRequestPending ?? !!profile?.followRequestPending;
    const currentCount = localFollowersCount ?? (typeof profile?.followersCount === 'number' ? profile.followersCount : 0);

    if (!!profile?.isPrivate && !wasFollowing) {
      // Private: will become pending
      setLocalFollowRequestPending(true);
    } else if (wasFollowing) {
      // Unfollow: instantly decrement
      setLocalIsFollowing(false);
      setLocalFollowersCount(Math.max(0, currentCount - 1));
    } else {
      // Follow: instantly increment
      setLocalIsFollowing(true);
      setLocalFollowersCount(currentCount + 1);
    }
    handleFollowToggle();
  }, [currentUserId, viewedUserId, followLoading, isOwnProfile, localIsFollowing, localFollowersCount, localFollowRequestPending, profile, handleFollowToggle]);

  const handleMessage = () => {
    hookHandleMessage(profile, !!profile?.isApprovedFollower);
  };

  const handleSavePost = async (post: any) => {
    if (!currentUserId || !post?.id) return;
    const isSaved = savedPosts[post.id];
    setSavedPosts((prev: any) => ({ ...prev, [post.id]: !isSaved }));
  };

  const handleSharePost = async (post: any) => {
    try {
      await sharePost(post);
    } catch (e) {
      if (__DEV__) console.log('Share error:', e);
    }
  };

  // Report user handler
  const handleReportUser = () => {
    setUserMenuVisible(false);
    Alert.alert(
      'Report User',
      'What would you like to report?',
      [
        { text: 'Spam', onPress: () => submitReport('spam') },
        { text: 'Inappropriate Content', onPress: () => submitReport('inappropriate') },
        { text: 'Harassment', onPress: () => submitReport('harassment') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    if (!currentUserId || !viewedUserId) return;

    try {
      // Report user via backend API
      const success = await userService.reportUser(
        viewedUserId,
        currentUserId,
        reason
      );

      if (success) {
        Alert.alert('Report Submitted', 'Thank you for your report. We will review it shortly.');
      } else {
        throw new Error('Report request failed');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  // Add missing highlight handler
  const handlePressHighlight = (highlight: any) => {
    const hid = String(highlight?.id || highlight?._id || '').trim();
    if (!hid) {
      const keys = Object.keys(highlight || {}).join(', ');
      Alert.alert('Debug: No ID', `Highlight keys: ${keys}\nJSON: ${JSON.stringify(highlight)}`);
    }
    if (__DEV__) {
      console.log('[profile.tsx] 👆 Pressed highlight:', highlight?.title, 'resolved ID:', hid);
    }
    setSelectedHighlightId(hid || null);
    setHighlightViewerVisible(true);
  };

  // Effects handled by useProfileData hook

  const handleAvatarPick = async () => {
    try {
      // Pick image
      const picker = require('expo-image-picker');
      const result = await picker.launchImageLibraryAsync({
        mediaTypes: picker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false
      });

      if (!result.canceled && result.assets && result.assets[0]?.uri && currentUserId) {
        try {
          const { uploadImage: uploadImageFn, updateUserProfile } = require('../../lib/firebaseHelpers');
          const imageUri = result.assets[0].uri;

          if (!imageUri) {
            Alert.alert('Error', 'Image URI is invalid');
            return;
          }

          const uploadRes = await uploadImageFn(imageUri, `avatars/${currentUserId}`);

          if (uploadRes.success && uploadRes.url) {
            // Update backend profile
            const updateRes = await updateUserProfile(currentUserId, { avatar: uploadRes.url });
            if (updateRes.success) {
              // 4. Manual Refetch (Pull to Refresh)
              await refetchAll(); // Refresh data to show new avatar
              await AsyncStorage.setItem('userAvatar', String(uploadRes.url));
              showSuccess('Profile picture updated!');
            } else {
              Alert.alert('Error', 'Failed to update profile avatar: ' + (updateRes.error || 'Unknown error'));
            }
          } else {
            Alert.alert('Error', 'Image upload failed: ' + (uploadRes.error || 'Unknown error'));
          }
        } catch (uploadError: any) {
          console.error('Avatar upload error:', uploadError);
          Alert.alert('Error', 'Error uploading image: ' + uploadError.message);
        }
      }
    } catch (error: any) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Error picking image: ' + error.message);
    }
  };

  // Listen for feed updates (refetch if something changed)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      refetchAll();
      if (event && event.type === 'POST_DELETED') {
        setPostViewerVisible(false);
      }
    });
    const sub = feedEventEmitter.addListener('feedUpdated', () => {
      refetchAll();
    });
    return () => {
      unsub();
      sub.remove();
    };
  }, [refetchAll]);
  // IMPORTANT: This must be a function (useCallback), NOT a pre-rendered element (useMemo).
  // FlashList caches ReactElement headers and won't update them when state changes.
  // A function reference ensures FlashList calls it on each render, so localFollowersCount
  // and localIsFollowing changes are reflected immediately without reload.
  const renderProfileHeader = useCallback(() => (
    <View style={styles.content}>
      {(!profile?.isPrivate || isOwnProfile || !!profile?.isApprovedFollower) && highlights && highlights.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <View style={{ paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#888', letterSpacing: 0.5 }}>HIGHLIGHTS</Text>
            {isOwnProfile && (
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}
                onPress={handleAddStory}
              >
                <Feather name="plus" size={12} color="#000" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#000' }}>Add a story</Text>
              </TouchableOpacity>
            )}
          </View>
          <HighlightCarousel 
            highlights={highlights} 
            onPressHighlight={handlePressHighlight} 
            isOwnProfile={isOwnProfile} 
          />
        </View>
      )}

      {/* Edit Button Bubble & Profile Header */}
      <View style={{ position: 'relative' }}>
        <ProfileHeader 
          profile={profile}
          userStories={userStories}
          isOwnProfile={isOwnProfile}
          isPrivate={!!profile?.isPrivate}
          approvedFollower={!!profile?.isApprovedFollower}
          onPressAvatar={() => {
            hapticLight();
            if (userStories.length > 0) {
              setStoriesViewerVisible(true);
            } else if (isOwnProfile) {
              handleAvatarPick();
            }
          }}
          onAddStory={handleAddStory}
          onPressPassport={() => {
            hapticLight();
            router.push({ pathname: '/passport', params: { user: viewedUserId } } as any);
          }}
          onEditProfile={() => {
            hapticLight();
            router.push({ pathname: '/edit-profile', params: { userId: viewedUserId } } as any);
          }}
          isFollowing={localIsFollowing ?? !!profile?.isFollowing}
          followRequestPending={localFollowRequestPending ?? !!profile?.followRequestPending}
          followLoading={followLoading}
          onFollowToggle={handleFollowToggleLocal}
          onMessage={handleMessage}
          followersCount={localFollowersCount ?? (
            typeof profile?.followersCount === 'number'
              ? profile.followersCount
              : Array.isArray(profile?.followers)
                ? profile.followers.length
                : typeof profile?.followers === 'string' && !isNaN(Number(profile.followers))
                  ? Number(profile.followers)
                  : Number(profile?.followersCount) || 0
          )}
          followingCount={
            typeof profile?.followingCount === 'number'
              ? profile.followingCount
              : Array.isArray(profile?.following)
                ? profile.following.length
                : typeof profile?.following === 'string' && !isNaN(Number(profile.following))
                  ? Number(profile.following)
                  : Number(profile?.followingCount) || 0
          }
          onPressFollowers={() => {
            router.push(`/friends?userId=${viewedUserId}&tab=followers` as any);
          }}
          onPressFollowing={() => {
            router.push(`/friends?userId=${viewedUserId}&tab=following` as any);
          }}
        />
      </View>

      <ProfileStats 
        locationsCount={passportLocationsCount}
        postsCount={Number(profile?.postsCount ?? posts.length)}
        taggedCount={taggedPosts?.length ?? 0}
        collectionsCount={savedSectionPosts?.length ?? 0}
        onPressLocations={() => {
          if (!viewedUserId) return;
          router.push({
            pathname: '/user/[userId]/locations',
            params: { userId: String(viewedUserId) }
          } as any);
        }}
        onPressPosts={() => {
          setSegmentTab('grid');
          setSelectedSection(null);
        }}
        onPressTags={() => {
          setSegmentTab('tagged');
          setSelectedSection(null);
        }}
        onPressCollections={
          (!profile?.isPrivate || isOwnProfile || !!profile?.isApprovedFollower)
            ? () => {
                hapticLight();
                if (isOwnProfile) {
                  router.push('/(tabs)/saved' as any);
                } else {
                  setViewCollectionsModal(true);
                }
              }
            : undefined
        }
        isPrivate={!!profile?.isPrivate}
        isOwnProfile={isOwnProfile}
        approvedFollower={!!profile?.isApprovedFollower}
      />

      {(!profile?.isPrivate || isOwnProfile || !!profile?.isApprovedFollower) && segmentTab === 'grid' && sections && sections.length > 0 && (
        <View>
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#888', marginBottom: 10, letterSpacing: 0.5 }}>COLLECTIONS</Text>
          </View>
          <ProfileSections
            sections={sections}
            selectedSection={selectedSection}
            onSelectSection={setSelectedSection}
            sectionSourcePosts={sectionSourcePosts}
            getPostId={getPostId}
            isOwnProfile={isOwnProfile}
            currentUserId={currentUserId}
          />
        </View>
      )}
    </View>
  ), [profile, userStories, isOwnProfile, profileLoading, passportLocationsCount, posts.length, highlights, highlightViewerVisible, selectedHighlightId, segmentTab, sections, selectedSection, followLoading, viewedUserId, localIsFollowing, localFollowersCount, localFollowRequestPending, handleFollowToggleLocal]);

  const currentPostsArray = useMemo(() => {
    if (segmentTab === 'grid') {
      return selectedSection ? visiblePosts : posts;
    }
    if (segmentTab === 'saved') return savedSectionPosts;
    if (segmentTab === 'tagged') return taggedPosts;
    return posts;
  }, [segmentTab, selectedSection, visiblePosts, posts, savedSectionPosts, taggedPosts]);


  // UI
  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#FF8D00" />
          <Text style={{ marginTop: 10, color: '#999' }}>Loading auth...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error if not logged in on own profile tab
  if (!currentUserId && isOwnProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: '#999', marginBottom: 20 }}>Please log in to view your profile</Text>
          <TouchableOpacity
            style={{ backgroundColor: '#FF8D00', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => {
              hapticLight();
              router.push('/login' as any);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show "Account Deleted" if the profile is not found (and we are not looking at our own profile)
  if (!loading && !profile && !isOwnProfile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header to allow going back */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#e0e0e0',
          backgroundColor: '#fff',
        }}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
            style={{ padding: 4 }}
          >
            <Feather name="arrow-left" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: '700', marginLeft: 16 }}>User Not Found</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' }}>
          <Ionicons name="person-remove-outline" size={64} color="#ccc" />
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#222', marginTop: 16 }}>Account Deleted</Text>
          <Text style={{ fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8, paddingHorizontal: 20 }}>
            This account has been permanently deleted and is no longer available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {showBanner && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>You’re offline — showing cached profile</Text>
        </View>
      )}

      {/* Header for other users' profiles */}
      {!isOwnProfile && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          backgroundColor: '#fff',
          minHeight: 48,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8 }}>
            <TouchableOpacity
              onPress={() => {
                hapticLight();
                safeRouterBack();
              }}
              style={[styles.headerBackBtn, { marginRight: 8 }]}
            >
              <Feather name="arrow-left" size={20} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              {profile?.username || profile?.name || (profile as any)?.displayName || 'Profile'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity 
              onPress={() => {
                hapticLight();
                router.push({ pathname: '/passport', params: { user: viewedUserId } } as any);
              }} 
              style={{
                borderRadius: 16,
                overflow: 'hidden',
              }} 
            >
              <LinearGradient
                colors={['#FBBC04', '#FF8D00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  gap: 6,
                  height: 36,
                }}
              >
                <Feather name="briefcase" size={15} color="#fff" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Passport</Text>
              </LinearGradient>
            </TouchableOpacity>
            {(!profile?.isPrivate || !!profile?.isApprovedFollower) && (
              <TouchableOpacity 
                onPress={() => {
                  hapticLight();
                  handleMessage();
                }} 
                style={styles.headerMenuBtn}
              >
                <Feather name="message-circle" size={20} color="#000" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { hapticLight(); setUserMenuVisible(true); }} style={styles.headerMenuBtn}>
              <Feather name="more-vertical" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && !profile && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#FF8D00" />
        </View>
      )}

      {(!profile?.isPrivate || isOwnProfile || !!profile?.isApprovedFollower) ? (
        <ProfileGrid
          posts={currentPostsArray}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderHeader={renderProfileHeader}
          onPressPost={(item, idx) => {
            const modalIndex = currentPostsArray.findIndex((p: any) => (p.id || p._id) === (item.id || item._id));
            setSelectedPostIndex(modalIndex >= 0 ? modalIndex : idx);
            setPostViewerVisible(true);
          }}
          normalizeMediaUrl={normalizeMediaUrl}
          isVideoUrl={isVideoUrl}
          DEFAULT_IMAGE_URL={DEFAULT_IMAGE_URL}
          insetsBottom={insets.bottom}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {renderProfileHeader()}
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="lock-closed" size={48} color="#ccc" />
            <Text style={{ marginTop: 10, color: '#999' }}>This account is private</Text>
            <Text style={{ textAlign: 'center', color: '#999', marginTop: 4 }}>Follow to see their posts and photos.</Text>
          </View>
        </ScrollView>
      )}

      {storiesViewerVisible && userStories.length > 0 && (
        <Modal
          visible={storiesViewerVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setStoriesViewerVisible(false)}
        >
          <StoriesViewer
            stories={userStories}
            onClose={() => setStoriesViewerVisible(false)}
          />
        </Modal>
      )}

      <ProfileModals
        {...{
          viewCollectionsModal, setViewCollectionsModal, sections, selectedSection, setSelectedSection,
          postViewerVisible, setPostViewerVisible, currentPostsArray, selectedPostIndex, profile, currentUserId,
          likedPosts, savedPosts, handleLikePost, handleSavePost, handleSharePost, setCommentModalPostId, setCommentModalAvatar, setCommentModalVisible,
          avatarPreviewUri, setAvatarPreviewUri, isOwnProfile, handleAvatarPick,
          commentModalVisible, commentModalPostId, commentModalAvatar, posts, getKeyboardOffset, getModalHeight,
          viewedUserId: viewedUserId || null, editSectionsModal, setEditSectionsModal, refetchAll,
          userMenuVisible, setUserMenuVisible, handleBlockUser, handleReportUser, shareProfile,
          showUploadModal, setShowUploadModal, selectedMedia, setSelectedMedia, locationQuery, setLocationQuery, locationSuggestions, setLocationSuggestions,
          uploading, setUploading, uploadProgress, setUploadProgress, showSuccess,
          highlightViewerVisible, setHighlightViewerVisible, selectedHighlightId,
          userStories
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    opacity: 0.92,
  },
  offlineBannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  headerBackBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', maxWidth: 200, textAlign: 'left' },
  headerMenuBtn: { padding: 4 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  menuSheetContent: { paddingBottom: 20 },
  handleContainer: { width: '100%', alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  menuHandle: { width: 40, height: 4, backgroundColor: '#ddd', borderRadius: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  menuIconContainer: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  menuItemText: { fontSize: 16, color: '#222', fontWeight: '500' },
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', justifyContent: 'space-between' },
  topIcon: { padding: 4 },
  topTitle: { fontSize: 16, fontWeight: '600', color: '#000' },
  content: { paddingHorizontal: 0, paddingBottom: 0 },
  avatarContainer: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#eee', borderWidth: 2, borderColor: '#FF8D00' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' },
  avatarInitials: { fontSize: 26, fontWeight: '800', color: '#667085' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, gap: 24 },
  statItem: { alignItems: 'center', minWidth: 60, gap: 4 },
  statNum: { fontWeight: '700', fontSize: 18, color: '#000' },
  statLbl: { fontSize: 12, color: '#444', marginTop: 4, fontWeight: '600' },
  infoBlock: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  displayName: { fontSize: 16, fontWeight: '700', color: '#000' },
  username: { fontSize: 13, color: '#667eea', marginTop: 2, fontWeight: '500' },
  bio: { fontSize: 13, color: '#555', marginTop: 4, textAlign: 'center', lineHeight: 18 },
  linksBlock: { marginTop: 6, width: '100%' },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  linkIconWrap: { width: 22, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  linkFavicon: { width: 16, height: 16, borderRadius: 4 },
  linkText: { flex: 1, fontSize: 12, color: '#FF8D00' },
  location: { fontSize: 12, color: '#666', marginTop: 3 },
  phone: { fontSize: 12, color: '#666', marginTop: 3 },
  interests: { fontSize: 12, color: '#666', marginTop: 3, fontStyle: 'italic' },
  passportBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    minWidth: 140,
  },
  passportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, paddingHorizontal: 16, marginBottom: 0 },
  pillBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  pillText: { fontSize: 12, fontWeight: '500', color: '#333' },
  followBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF8D00', paddingVertical: 8, borderRadius: 6 },
  followingBtn: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  followText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  followingText: { color: '#333' },
});
