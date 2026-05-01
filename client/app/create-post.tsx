import { DEFAULT_AVATAR_URL } from '../lib/api';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { compressVideoSafe, compressImageSafe } from '../lib/mediaUtils';
import * as VideoThumbnails from 'expo-video-thumbnails';

import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/src/_components/UserContext';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import CategoryModal from '@/src/_components/CreatePost/CategoryModal';
// import {} from '../lib/firebaseHelpers';
import { getAPIBaseURL, GOOGLE_MAPS_CONFIG } from '../config/environment';
import { createPost, createStory, DEFAULT_CATEGORIES, ensureDefaultCategories, getCategories, getPassportTickets, searchUsers } from '../lib/firebaseHelpers/index';
import { getCategoryImageSource } from '../lib/categoryImages';
import { compressImage } from '../lib/imageCompressor';
import { extractHashtags, trackHashtag } from '../lib/mentions';
import { startTrace } from '../lib/perf';
import { mapService } from '../services';
import { apiService } from '@/src/_services/apiService';
import { getKeyboardOffset, getModalHeight } from '../utils/responsive';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { getCachedData, setCachedData } from '../hooks/useOffline';

// Runtime import of ImagePicker with graceful fallback
let ImagePicker: any = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  console.warn('expo-image-picker not available');
}

const { width } = Dimensions.get('window');
const GRID_SIZE = width / 3;

const MIN_MEDIA_RATIO = 4 / 5;
const MAX_MEDIA_RATIO = 1.91;



type LocationType = {
  name: string;
  address: string;
  placeId?: string;
  lat: number;
  lon: number;
  verified?: boolean;
};

type UserType = {
  uid: string;
  displayName?: string;
  userName?: string;
  photoURL?: string | null;
};

type GalleryAsset = {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  duration?: number;
};

const buildPostEndpointCandidates = (postId: string) => {
  const apiBase = String(getAPIBaseURL() || '').replace(/\/+$/, '');
  const stripped = apiBase.replace(/\/api$/, '');
  return Array.from(new Set([
    `${apiBase}/posts/${encodeURIComponent(postId)}`,
    `${stripped}/api/posts/${encodeURIComponent(postId)}`,
    `${stripped}/posts/${encodeURIComponent(postId)}`,
  ].filter((url) => /^https?:\/\//i.test(url) && !/\/api\/api\//i.test(url))));
};

const isVideoUri = (uri: string, galleryAssets?: GalleryAsset[]) => {
  if (!uri) return false;
  const lower = String(uri || '').toLowerCase();

  // If it has a clear image extension, it's NOT a video
  if (
    lower.endsWith('.jpg') || 
    lower.endsWith('.jpeg') || 
    lower.endsWith('.png') || 
    lower.endsWith('.heic') || 
    lower.endsWith('.heif') || 
    lower.endsWith('.webp') ||
    lower.endsWith('.gif')
  ) {
    return false;
  }

  if (galleryAssets) {
    const match = galleryAssets.find(a => 
      String(a.uri) === String(uri) || 
      String(a.id) === String(uri) || 
      (uri.startsWith('ph://') && a.uri.includes(uri.replace('ph://', '')))
    );
    if (match) {
      return match.mediaType === 'video' || typeof match.duration === 'number';
    }
  }

  // Improved check for common video patterns and extensions
  return (
    lower.endsWith('.mp4') || 
    lower.endsWith('.mov') || 
    lower.endsWith('.m4v') || 
    lower.endsWith('.webm') || 
    lower.endsWith('.quicktime') ||
    lower.startsWith('content://media/external/video/') ||
    // iOS/Android specific patterns for videos
    lower.includes('/video/') ||
    lower.includes('ext-video') ||
    // If it's a remote URL, check if it contains common video keywords but ONLY if it doesn't have an image extension (already checked above)
    (lower.startsWith('http') && (lower.includes('video') || lower.includes('.mp4') || lower.includes('.mov')))
  );
};


export default function CreatePostScreen() {
  const { 
    selectedImages: paramImages, 
    postType: paramPostType, 
    step: paramStep, 
    editPostId: paramEditPostId,
    initialData: paramInitialData
  } = useLocalSearchParams();



  const router = useRouter();
  const user = useUser();
  const { showSuccess } = useAppDialog();
  const [step, setStep] = useState<'picker' | 'preview' | 'details'>(paramEditPostId ? 'details' : 'picker');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
  /**
   * iOS Modal + KAV: avoid large `keyboardVerticalOffset` (e.g. status-bar inset) — it stacks with `padding`
   * and pushes bottom sheets too far up. Use 0 for modal sheets anchored with flex-end.
   */
  const iosSheetKeyboardOffset = 0;
  const { height, width: windowWidth } = useWindowDimensions();
  const PICKER_IMAGE_HEIGHT = Math.min(windowWidth, height * 0.45);
  const DETAILS_IMAGE_HEIGHT = Math.min(windowWidth * 0.7, height * 0.32);
  const GRID_ITEM_SIZE = windowWidth / 3;

  // Post Options State
  const [caption, setCaption] = useState<string>('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState<string>('');
  const [visibility, setVisibility] = useState('Everyone');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userGroups, setUserGroups] = useState<{ _id: string; name: string; type: string; members: string[] }[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationType | null>(null);
  const [verifiedLocation, setVerifiedLocation] = useState<LocationType | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<UserType[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewHeight, setPreviewHeight] = useState<number>(width);
  const [previewVideoRatio, setPreviewVideoRatio] = useState<number>(1);
  const previewRatioCacheRef = useRef<Map<string, number>>(new Map());
  const activePreviewUriRef = useRef<string | null>(null);
  const previewReqIdRef = useRef(0);
  const [networkError, setNetworkError] = useState<boolean>(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [postType, setPostType] = useState<'POST' | 'STORY'>('POST');


  // Edit mode
  const editPostId = useMemo(() => {
    const val = Array.isArray(paramEditPostId) ? paramEditPostId[0] : paramEditPostId;
    return typeof val === 'string' ? val : '';
  }, [paramEditPostId]);
  const isEditMode = !!editPostId;

  useEffect(() => {
    if (__DEV__) {
      console.log('[CreatePost] Mode check:', { isEditMode, editPostId, step });
    }
  }, [isEditMode, editPostId, step]);
  const [editLoading, setEditLoading] = useState(false);
  const [editAuthorId, setEditAuthorId] = useState('');
  
  // Gallery
  const [galleryAssets, setGalleryAssets] = useState<GalleryAsset[]>([]);
  const [galleryEndCursor, setGalleryEndCursor] = useState<string | undefined>(undefined);
  const [hasMoreGallery, setHasMoreGallery] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState<boolean>(false);
  const [loadingMoreGallery, setLoadingMoreGallery] = useState<boolean>(false);
  // Helper to get video thumbnail
  const getVideoThumbnail = async (uri: string): Promise<string | null> => {
    try {
      if (!VideoThumbnails || !VideoThumbnails.getThumbnailAsync) {
        console.warn("VideoThumbnails module is not available");
        return null;
      }
      const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(
        uri,
        { time: 1000 }
      );
      return thumbnailUri;
    } catch (e) {
      console.warn("Failed to get video thumbnail:", e);
      return null;
    }
  };


  useEffect(() => {
    if (paramImages) {
      try {
        const parsed = JSON.parse(paramImages as string);
        if (Array.isArray(parsed)) setSelectedImages(parsed);
        else if (typeof paramImages === 'string') setSelectedImages([paramImages]);
      } catch (e) {
        if (typeof paramImages === 'string') setSelectedImages([paramImages]);
      }
    }
    if (paramPostType) setPostType(paramPostType as any);
    if (paramStep) setStep(paramStep as any);
  }, [paramImages, paramPostType, paramStep]);

  // Instant pre-fill from params (avoid flash of empty state)
  useEffect(() => {
    if (!paramInitialData) return;
    try {
      const post = JSON.parse(String(paramInitialData));
      if (!post) return;

      const authorId =
        typeof post.userId === 'string'
          ? post.userId
          : String(post.userId?._id || post.userId?.id || post.userId?.uid || post.userId?.firebaseUid || '');
      if (authorId) setEditAuthorId(authorId);

      if (post.caption || post.content) setCaption(String(post.caption || post.content));
      
      // Pre-fill hashtags
      if (Array.isArray(post.hashtags)) {
        setHashtags(post.hashtags);
        setHashtagInput(post.hashtags.map((t: string) => `#${t}`).join(' '));
      }

      // Pre-fill location
      if (post.locationData && typeof post.locationData === 'object') {
        const loc = { ...post.locationData, verified: !!post.locationData.verified };
        setLocation(loc);
        if (loc.verified) setVerifiedLocation(loc);
      } else if (post.location && typeof post.location === 'object') {
        const loc = { ...post.location, verified: !!post.location.verified };
        setLocation(loc);
        if (loc.verified) setVerifiedLocation(loc);
      } else if (typeof post.location === 'string' && post.location.trim()) {
        setLocation({ name: post.location, address: '', lat: 0, lon: 0 });
      }

      // Pre-fill categories
      if (post.category) {
        const catName = typeof post.category === 'string' ? post.category : post.category?.name || '';
        if (catName) setSelectedCategories([{ name: catName, image: '' }]);
      }

      // Pre-fill visibility
      if (post.visibility) setVisibility(post.visibility);

    } catch (e) {
      if (__DEV__) console.warn('[CreatePost] Failed to parse initialData:', e);
    }
  }, [paramInitialData]);

  // Edit mode: fetch existing post data and pre-fill form
  useEffect(() => {
    if (!editPostId) return;
    let cancelled = false;
    setEditLoading(true);
    (async () => {
      try {
        const res = await apiService.get(`/posts/${editPostId}`);
        const raw = (res && typeof res === 'object' && (res as any).data) ? (res as any).data : null;
        const post = raw && typeof raw === 'object' && (raw as any).data ? (raw as any).data : raw;
        if (cancelled || !post) return;

        const authorId =
          typeof post.userId === 'string'
            ? post.userId
            : String(post.userId?._id || post.userId?.id || post.userId?.uid || post.userId?.firebaseUid || '');
        if (authorId) setEditAuthorId(authorId);

        // Pre-fill caption
        if (post.caption) setCaption(String(post.caption));

        // Pre-fill media
        const media: string[] = [];
        if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
          media.push(...post.mediaUrls.filter(Boolean));
        } else if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
          media.push(...post.imageUrls.filter(Boolean));
        } else if (post.imageUrl) {
          media.push(post.imageUrl);
        }
        if (post.videoUrl) media.push(post.videoUrl);
        if (Array.isArray(post.videoUrls)) media.push(...post.videoUrls.filter(Boolean));
        if (media.length > 0) setSelectedImages([...new Set(media)]);

        // Pre-fill hashtags
        if (Array.isArray(post.hashtags)) {
          setHashtags(post.hashtags);
          setHashtagInput(post.hashtags.map((t: string) => `#${t}`).join(' '));
        }

        // Pre-fill category
        if (post.category) {
          const catName = typeof post.category === 'string' ? post.category : post.category?.name || '';
          if (catName) setSelectedCategories([{ name: catName, image: '' }]);
        }

        // Pre-fill location
        if (post.locationData && typeof post.locationData === 'object') {
          const loc: LocationType = {
            name: post.locationData.name || '',
            address: post.locationData.address || '',
            placeId: post.locationData.placeId,
            lat: post.locationData.lat || 0,
            lon: post.locationData.lon || 0,
            verified: !!post.locationData.verified
          };
          setLocation(loc);
          if (loc.verified) setVerifiedLocation(loc);
        } else if (post.location && typeof post.location === 'object') {
          // Legacy support for when location was the object
          const loc: LocationType = {
            name: (post.location as any).name || '',
            address: (post.location as any).address || '',
            placeId: (post.location as any).placeId,
            lat: (post.location as any).lat || 0,
            lon: (post.location as any).lon || 0,
            verified: !!(post.location as any).verified
          };
          setLocation(loc);
          if (loc.verified) setVerifiedLocation(loc);
        } else if (typeof post.location === 'string' && post.location.trim()) {
          setLocation({ name: post.location, address: '', lat: 0, lon: 0 });
        }

        // Pre-fill visibility
        if (post.visibility) setVisibility(post.visibility);

        // Pre-fill tagged users
        if (Array.isArray(post.taggedUsers) && post.taggedUsers.length > 0) {
          setTaggedUsers(post.taggedUsers.map((u: any) => ({
            uid: typeof u === 'string' ? u : u.uid || u._id || '',
            displayName: u.displayName || u.name || '',
            userName: u.userName || u.username || '',
            photoURL: u.photoURL || u.avatar || null,
          })));
        }

        // Go to details step
        setStep('details');
      } catch (e) {
        console.error('[CreatePost] Failed to load post for edit:', e);
        Alert.alert('Error', 'Failed to load post data');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editPostId]);

  // Automatically generate thumbnails for selected videos to use as posters
  useEffect(() => {
    selectedImages.forEach(async (uri) => {
      if (isVideoUri(uri, galleryAssets) && !thumbnails[uri]) {
        const thumb = await getVideoThumbnail(uri);
        if (thumb) {
          setThumbnails(prev => ({ ...prev, [uri]: thumb }));
        }
      }
    });
  }, [selectedImages, galleryAssets]);

  const clampMediaRatio = (ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return 1;
    return Math.min(MAX_MEDIA_RATIO, Math.max(MIN_MEDIA_RATIO, ratio));
  };

  const setPreviewHeightFromRatio = (ratio: number) => {
    const clamped = clampMediaRatio(ratio);
    const nextHeight = width / clamped;
    setPreviewHeight(nextHeight);
  };

  useEffect(() => {
    if (!Array.isArray(selectedImages) || selectedImages.length === 0) {
      setPreviewIndex(0);
      setPreviewHeight(width);
      activePreviewUriRef.current = null;
      return;
    }

    if (previewIndex >= selectedImages.length) {
      setPreviewIndex(0);
      return;
    }

    const uri = selectedImages[previewIndex];
    if (!uri) {
      setPreviewHeightFromRatio(1);
      activePreviewUriRef.current = null;
      return;
    }

    activePreviewUriRef.current = uri;
    const reqId = ++previewReqIdRef.current;

    const cached = previewRatioCacheRef.current.get(uri);
    if (typeof cached === 'number') {
      setPreviewHeightFromRatio(cached);
      return;
    }

    const isVideo = uri.toLowerCase().endsWith('.mp4') || uri.toLowerCase().endsWith('.mov') || uri.toLowerCase().includes('video');
    if (isVideo) {
      setPreviewHeightFromRatio(1);
      return;
    }

    Image.getSize(
      uri,
      (w, h) => {
        if (h > 0) {
          const ratio = w / h;
          previewRatioCacheRef.current.set(uri, ratio);
          if (previewReqIdRef.current === reqId && activePreviewUriRef.current === uri) {
            setPreviewHeightFromRatio(ratio);
          }
        }
      },
      () => {
        if (previewReqIdRef.current === reqId && activePreviewUriRef.current === uri) {
          setPreviewHeightFromRatio(1);
        }
      }
    );
  }, [selectedImages, previewIndex]);

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [showVerifiedModal, setShowVerifiedModal] = useState<boolean>(false);
  const [showTagModal, setShowTagModal] = useState<boolean>(false);
  const [showVisibilityModal, setShowVisibilityModal] = useState<boolean>(false);
  const closeVerifiedModal = useCallback(() => {
    Keyboard.dismiss();
    setShowVerifiedModal(false);
  }, []);

  const createSwipeResponder = (onClose: () => void) => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.vy > 0.6 || g.dy > 90) onClose();
    },
  });

  const verifiedSheetPan = useRef(createSwipeResponder(closeVerifiedModal)).current;
  const categorySheetPan = useRef(createSwipeResponder(() => setShowCategoryModal(false))).current;
  const locationSheetPan = useRef(createSwipeResponder(() => setShowLocationModal(false))).current;
  const tagSheetPan = useRef(createSwipeResponder(() => setShowTagModal(false))).current;
  const visibilitySheetPan = useRef(createSwipeResponder(() => setShowVisibilityModal(false))).current;

  // Gallery

  // Category
  // Map DEFAULT_CATEGORIES to objects for UI
  const [categories, setCategories] = useState<{ name: string; image: string }[]>([
    { name: 'Travel', image: 'https://via.placeholder.com/80x80?text=Travel' },
    { name: 'Food', image: 'https://via.placeholder.com/80x80?text=Food' },
    { name: 'Adventure', image: 'https://via.placeholder.com/80x80?text=Adventure' },
    { name: 'Culture', image: 'https://via.placeholder.com/80x80?text=Culture' },
    { name: 'Nature', image: 'https://via.placeholder.com/80x80?text=Nature' },
    { name: 'Nightlife', image: 'https://via.placeholder.com/80x80?text=Nightlife' }
  ]);
  const [selectedCategories, setSelectedCategories] = useState<{ name: string; image: string }[]>([]);
  const [categorySearch, setCategorySearch] = useState<string>('');

  // Reset form when screen loses focus or on mount
  useFocusEffect(
    useCallback(() => {
      // Reset state when screen comes into focus
      return () => {
        // Optional: Clean up when leaving screen
        // You can optionally reset the form here too
      };
    }, [])
  );

  useEffect(() => {
    async function setupCategories() {
      try {
        const normalizeCategories = (raw: any): { name: string; image: string }[] => {
          const candidates = [
            raw,
            raw?.data,
            raw?.categories,
            raw?.data?.categories,
            raw?.data?.data,
            raw?.payload?.categories,
          ];
          const arr = candidates.find((entry) => Array.isArray(entry));
          if (!Array.isArray(arr)) return [];
          return arr
            .map((c: any) => {
              if (typeof c === 'string') return { name: c, image: '' };
              return {
                name: typeof c?.name === 'string' ? c.name : (typeof c?.title === 'string' ? c.title : ''),
                image: typeof c?.image === 'string' ? c.image : '',
              };
            })
            .filter((c: any) => typeof c?.name === 'string' && c.name.trim().length > 0);
        };

        const defaultList = (DEFAULT_CATEGORIES || [])
          .map((c: any) => {
            if (typeof c === 'string') return { name: c, image: '' };
            return {
              name: typeof c?.name === 'string' ? c.name : '',
              image: typeof c?.image === 'string' ? c.image : '',
            };
          })
          .filter((c: any) => c.name);

        const cats = await apiService.getCategories();
        let finalCats = normalizeCategories(cats);
        if (finalCats.length === 0) {
          const helperCats = await getCategories();
          finalCats = normalizeCategories(helperCats);
        }
        if (finalCats.length === 0) {
          finalCats = defaultList;
        }
        if (__DEV__) console.log('[CreatePost] Setting categories, count:', finalCats.length);
        setCategories(finalCats);
      } catch (error) {
        console.error('[CreatePost] Failed to load categories:', error);
        const defaultList = (DEFAULT_CATEGORIES || []).map((c: any) => typeof c === 'string' ? { name: c, image: '' } : c);
        setCategories(defaultList);
      }
    }
    setupCategories();
  }, []);

  // Load user groups for visibility options
  useEffect(() => {
    async function loadGroups() {
      try {
        let uid = user?.uid;
        if (!uid) {
          const AS = require('@react-native-async-storage/async-storage').default;
          uid = await AS.getItem('userId');
        }
        if (!uid) return;
        const res = await apiService.get(`/groups?userId=${uid}`);
        if (res?.success && Array.isArray(res.data)) setUserGroups(res.data);
      } catch { }
    }
    loadGroups();
  }, []);

  const renderCategoryItem = useCallback(({ item }: { item: { name: string; image: string } }) => {
    const isSelected = selectedCategories.some(c => c.name === item.name);
    return (
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
        onPress={() => {
          hapticLight();
          if (isSelected) {
            setSelectedCategories(selectedCategories.filter(c => c.name !== item.name));
          } else {
            setSelectedCategories([...selectedCategories, item]);
          }
        }}
      >
        <Image
          source={getCategoryImageSource(item.name, item.image)}
          style={{ width: 56, height: 56, borderRadius: 16, marginRight: 16, backgroundColor: '#f0f0f0' }}
        />
        <Text style={{ fontSize: 15, fontWeight: '400', color: '#111', flex: 1 }}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [selectedCategories]);

  // Location modal
  const [locationSearch, setLocationSearch] = useState<string>('');
  const [locationResults, setLocationResults] = useState<LocationType[]>([]);
  const [loadingLocationResults, setLoadingLocationResults] = useState<boolean>(false);

  // Verified location modal
  const [verifiedSearch, setVerifiedSearch] = useState<string>('');
  const [verifiedResults, setVerifiedResults] = useState<LocationType[]>([]);
  const [loadingVerifiedResults, setLoadingVerifiedResults] = useState<boolean>(false);
  const [verifiedCenter, setVerifiedCenter] = useState<{ lat: number; lon: number } | null>(null);
  const verifiedSearchTimerRef = useRef<any>(null);
  const verifiedReqIdRef = useRef(0);

  // Tag people modal
  const [userSearch, setUserSearch] = useState<string>('');
  const [userResults, setUserResults] = useState<UserType[]>([]);
  const [loadingUserResults, setLoadingUserResults] = useState<boolean>(false);

  const handleHashtagInputChange = (text: string) => {
    setHashtagInput(text);
    const parsed = extractHashtags(text);
    if (Array.isArray(parsed)) {
      const unique = Array.from(new Set(parsed.map(hashtag => hashtag.tag.toLowerCase())));
      setHashtags(unique);
    }
  };

  // Verified location options: current device location + passport tickets
  const [verifiedOptions, setVerifiedOptions] = useState<LocationType[]>([]);

  const getLocationKey = useCallback((loc: any): string => {
    const placeId = typeof loc?.placeId === 'string' ? loc.placeId.trim() : '';
    if (placeId) return `pid:${placeId}`;
    const name = String(loc?.name || '').trim().toLowerCase();
    const address = String(loc?.address || '').trim().toLowerCase();
    const lat = typeof loc?.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : null;
    const lon = typeof loc?.lon === 'number' && Number.isFinite(loc.lon) ? loc.lon : null;
    if (lat != null && lon != null) return `ll:${lat.toFixed(5)},${lon.toFixed(5)}|${name}`;
    return `na:${name}|${address}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!showVerifiedModal) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setVerifiedCenter(null);
          return;
        }

        let loc = await Location.getLastKnownPositionAsync();
        if (!loc) {
          loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
        if (cancelled) return;
        setVerifiedCenter({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      } catch {
        if (cancelled) return;
        setVerifiedCenter(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showVerifiedModal]);

  useEffect(() => {
    if (!showVerifiedModal) {
      if (verifiedSearchTimerRef.current) {
        clearTimeout(verifiedSearchTimerRef.current);
        verifiedSearchTimerRef.current = null;
      }
      setVerifiedSearch('');
      setVerifiedResults([]);
      setLoadingVerifiedResults(false);
      return;
    }

    if (!verifiedCenter) {
      setVerifiedResults([]);
      return;
    }

    if (verifiedSearchTimerRef.current) {
      clearTimeout(verifiedSearchTimerRef.current);
      verifiedSearchTimerRef.current = null;
    }

    const reqId = ++verifiedReqIdRef.current;
    setLoadingVerifiedResults(true);

    verifiedSearchTimerRef.current = setTimeout(async () => {
      try {
        const rawPlaces = await mapService.getNearbyPlaces(verifiedCenter.lat, verifiedCenter.lon, 100, verifiedSearch.trim() || undefined);
        if (verifiedReqIdRef.current !== reqId) return;

        const places = [];
        for (const p of rawPlaces || []) {
          const dist = await mapService.calculateDistance({ latitude: verifiedCenter.lat, longitude: verifiedCenter.lon } as any, p);
          if (dist <= 0.15) places.push(p);
        }

        const mapped: LocationType[] = Array.isArray(places)
          ? places
            .map((p: any) => ({
              name: String(p?.placeName || p?.name || p?.address || 'Location'),
              address: String(p?.address || ''),
              placeId: typeof p?.placeId === 'string' ? p.placeId : undefined,
              lat: typeof p?.latitude === 'number' ? p.latitude : 0,
              lon: typeof p?.longitude === 'number' ? p.longitude : 0,
              verified: true,
            }))
            .filter((p: any) => p.name)
          : [];

        setVerifiedResults(mapped);
      } catch {
        if (verifiedReqIdRef.current !== reqId) return;
        setVerifiedResults([]);
      } finally {
        if (verifiedReqIdRef.current !== reqId) return;
        setLoadingVerifiedResults(false);
      }
    }, 450);

    return () => {
      if (verifiedSearchTimerRef.current) {
        clearTimeout(verifiedSearchTimerRef.current);
        verifiedSearchTimerRef.current = null;
      }
    };
  }, [showVerifiedModal, verifiedCenter, verifiedSearch]);

  useEffect(() => {
    async function fetchVerifiedOptions() {
      // const user = getCurrentUser() as { uid?: string } | null;
      // if (!user) return;
      // TODO: Use user from context or props
      let resolvedUserId: string | null = null;
      try {
        resolvedUserId = typeof user?.uid === 'string' ? user.uid : null;
        if (!resolvedUserId) {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          resolvedUserId = await AsyncStorage.getItem('userId');
        }
      } catch {
        resolvedUserId = typeof user?.uid === 'string' ? user.uid : null;
      }

      let options: LocationType[] = [];
      // Get current device location
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let loc = await Location.getLastKnownPositionAsync();
          if (!loc) {
            loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          }

          // Reverse geocode to get actual location name
          let locationName = 'Current Location';
          let locationAddress = '';
          try {
            const reverseGeocode = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude
            });

            if (reverseGeocode && reverseGeocode.length > 0) {
              const place = reverseGeocode[0];
              // Build location name from available data
              const parts = [];
              if (place.name) parts.push(place.name);
              else if (place.street) parts.push(place.street);

              if (place.city) parts.push(place.city);
              else if (place.district) parts.push(place.district);

              if (parts.length > 0) {
                locationName = parts.join(', ');
              }

              // Build address
              const addressParts = [];
              if (place.street) addressParts.push(place.street);
              if (place.city) addressParts.push(place.city);
              if (place.region) addressParts.push(place.region);
              if (place.country) addressParts.push(place.country);
              locationAddress = addressParts.join(', ');
            }
          } catch {
            try {
              const google = await mapService.reverseGeocode(loc.coords.latitude, loc.coords.longitude);
              if (google) {
                if (typeof google.placeName === 'string' && google.placeName.trim()) {
                  locationName = google.placeName;
                } else if (typeof google.city === 'string' && google.city.trim()) {
                  locationName = google.city;
                }
                if (typeof google.address === 'string') {
                  locationAddress = google.address;
                }
              }
            } catch { }
          }

          options.push({
            name: locationName,
            address: locationAddress,
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            verified: true
          });
        }
      } catch { }
      // Get passport tickets
      try {
        const tickets = resolvedUserId ? await getPassportTickets(resolvedUserId) : [];
        // Debug: log ticket structure
        if (tickets && tickets.length > 0) {
          console.log('Sample passport ticket:', tickets[0]);
        }
        // Deduplicate by location name and lat/lon (update keys after log)
        const uniqueLocations: { [key: string]: LocationType } = {};
        tickets.forEach((ticketRaw: any) => {
          const ticket = ticketRaw as {
            city?: string;
            coordinates?: { latitude: number; longitude: number };
            countryName?: string;
          };
          if (ticket.city && ticket.coordinates && ticket.coordinates.latitude && ticket.coordinates.longitude) {
            const key = `${ticket.city}_${ticket.coordinates.latitude}_${ticket.coordinates.longitude}`;
            if (!uniqueLocations[key]) {
              uniqueLocations[key] = {
                name: ticket.city,
                address: ticket.countryName || '',
                lat: ticket.coordinates.latitude,
                lon: ticket.coordinates.longitude,
                verified: true
              };
            }
          }
        });
        options = [...options, ...Object.values(uniqueLocations)];
      } catch { }
      setVerifiedOptions(options);
    }
    fetchVerifiedOptions();
  }, []);

  useEffect(() => {
    loadGalleryAssets();
  }, []);

  const loadGalleryAssets = async (after?: string): Promise<void> => {
    if (!after) setLoadingGallery(true);
    if (after) setLoadingMoreGallery(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow full gallery access to create posts and stories.');
        setGalleryAssets([]);
        return;
      }

      const page = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 30,
        after,
      });

      const mapped: GalleryAsset[] = page.assets.map((a: any) => ({
        id: String(a.id),
        uri: String(a.uri),
        mediaType: a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
        duration: typeof a.duration === 'number' ? a.duration : undefined,
      }));

      if (after) {
        setGalleryAssets((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          mapped.forEach((m) => {
            if (!seen.has(m.id)) merged.push(m);
          });
          return merged;
        });
      } else {
        setGalleryAssets(mapped);
      }

      setGalleryEndCursor(page.endCursor);
      setHasMoreGallery(!!page.hasNextPage);
    } catch (err) {
      console.warn('Gallery load error', err);
      if (!after) setGalleryAssets([]);
    } finally {
      setLoadingGallery(false);
      setLoadingMoreGallery(false);
    }
  };

  const loadMoreGallery = async (): Promise<void> => {
    if (!hasMoreGallery || loadingMoreGallery) return;
    await loadGalleryAssets(galleryEndCursor);
  };

  const openCamera = async () => {
    hapticLight();
    try {
      if (!ImagePicker) {
        Alert.alert('Error', 'Camera not available');
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission denied', 'Camera permission is required to take photos or videos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.9,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const mediaType = asset.type === 'video' ? 'video' : 'photo';
        
        setGalleryAssets(prev => [{
          id: asset.assetId || Date.now().toString(),
          uri: asset.uri,
          mediaType,
          duration: asset.duration
        }, ...prev]);

        if (postType === 'STORY') {
          // For STORY, navigate directly to story-upload
          router.push({
            pathname: '/story-upload',
            params: {
              storyMediaUri: asset.uri,
              storyMediaType: mediaType,
              storyTextOverlays: '',
            },
          });
        } else {
          // For POST, add to selection
          setSelectedImages([asset.uri]);
          setPreviewIndex(0);
        }
      }
    } catch (e) {
      console.error('[CreatePost] Camera error:', e);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const handleShare = async (): Promise<void> => {
    if (selectedImages.length === 0) {
      Alert.alert('Select at least one image or video to post.');
      return;
    }
    hapticMedium();
    setLoading(true);
    try {
      const mediaType = selectedImages.length > 0 && isVideoUri(selectedImages[0], galleryAssets) ? 'video' : 'image';
      let locationData: LocationType | null = null;

      // Priority 1: If verifiedLocation exists (GPS or Passport), use it
      if (verifiedLocation) {
        if (verifiedLocation.placeId) {
          // Verified location with placeId (from search)
          const placeDetails = await getPlaceDetails(verifiedLocation.placeId);
          if (placeDetails) {
            locationData = {
              name: verifiedLocation.name,
              address: verifiedLocation.address || '',
              placeId: verifiedLocation.placeId,
              lat: placeDetails.lat ?? 0,
              lon: placeDetails.lon ?? 0,
              verified: true
            };
          }
        } else {
          // Verified location without placeId (GPS or Passport)
          locationData = {
            name: verifiedLocation.name,
            address: verifiedLocation.address || '',
            placeId: verifiedLocation.placeId,
            lat: verifiedLocation.lat ?? 0,
            lon: verifiedLocation.lon ?? 0,
            verified: true
          };
        }
      }
      // Priority 2: If only location exists (not verified)
      else if (location) {
        if (location.placeId) {
          const placeDetails = await getPlaceDetails(location.placeId);
          if (placeDetails) {
            locationData = {
              name: location.name,
              address: location.address || '',
              placeId: location.placeId,
              lat: placeDetails.lat ?? 0,
              lon: placeDetails.lon ?? 0,
              verified: false
            };
          } else {
            // If placeDetails fetch fails, still use location with default coords
            locationData = {
              name: location.name,
              address: location.address || '',
              placeId: location.placeId,
              lat: location.lat ?? 0,
              lon: location.lon ?? 0,
              verified: false
            };
          }
        } else {
          // No placeId: Use location directly
          locationData = {
            name: location.name,
            address: location.address || '',
            placeId: location.placeId,
            lat: location.lat ?? 0,
            lon: location.lon ?? 0,
            verified: false
          };
        }
      }
      // const user = getCurrentUser() as { uid?: string } | null;
      // if (!user) throw new Error('User not found');
      // TODO: Use user from context or props

      console.log('ðŸ“ Location Debug:', {
        location,
        verifiedLocation,
        locationData,
        finalLocation: locationData?.name || 'No location selected'
      });

      // Extract hashtags and mentions from caption + manual input
      const inlineMentions = extractHashtags(caption);
      const extractedHashtags = Array.from(new Set([
        ...inlineMentions.map(h => h.tag),
        ...hashtags,
      ]));
      const extractedMentions = caption.match(/@[\w]+/g) || [];

      // Save selected category with post
      const selectedCategory = selectedCategories.length > 0 ? selectedCategories[0] : null;

      const trace = await startTrace('create_post_flow');

      // Compress images before upload using optimized compression
      let uploadImages = selectedImages;
      if (mediaType === 'image') {
        const compressedImages: string[] = [];
        for (const imgUri of selectedImages) {
          try {
            // Use optimized compression with 75% quality & 1080px max width
            const compressed = await compressImage(imgUri, 0.75, 1080);
            compressedImages.push(compressed.uri);
            console.log(`✅ Image compressed: ${(compressed.size / 1024).toFixed(0)}KB`);
          } catch (error) {
            console.warn(`âš ï¸ Compression failed, using original: ${error}`);
            compressedImages.push(imgUri);
          }
        }
        uploadImages = compressedImages;
      } else if (mediaType === 'video') {
        const compressedVideos: string[] = [];
        for (const vidUri of selectedImages) {
          try {
            console.log('[CreatePost] Compressing video...');
            // Use safe utility that won't crash if native module is missing
            const compressed = await compressVideoSafe(vidUri);
            compressedVideos.push(compressed);
            console.log('✅ Video compressed or using original!');
          } catch (error) {
            console.warn('[CreatePost] Video compression failed, using original:', error);
            compressedVideos.push(vidUri);
          }
        }
        uploadImages = compressedVideos;
      }


      // Get userId from user context or AsyncStorage
      let userId = user?.uid;
      if (!userId) {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        userId = await AsyncStorage.getItem('userId');
      }

      console.log('ðŸ“„ createPost payload preview:', {
        userId,
        mediaCount: uploadImages.length,
        mediaType,
        caption: caption.substring(0, 50),
        hashtags: extractedHashtags,
        mentions: extractedMentions,
        location: locationData?.name,
        category: selectedCategory?.name,
        visibility: visibility,
        groupId: selectedGroupId,
      });

      // Resolve allowedFollowers from selected group
      let allowedFollowers: string[] = [];
      if (selectedGroupId) {
        const grp = userGroups.find(g => g._id === selectedGroupId);
        if (grp) allowedFollowers = grp.members;
      }

      let result: { success: boolean; postId?: string; storyId?: string; error?: string };

      if (postType === 'STORY') {
        console.log('[createPost] Creating story...');
        result = await createStory(
          typeof userId === 'string' ? userId : '',
          uploadImages[0], 
          mediaType as any,
          undefined, // userNameRaw
          locationData ? {
            name: locationData.name,
            address: locationData.address || '',
            placeId: locationData.placeId,
          } : undefined,
          undefined, // thumbnailUrlRaw
          visibility,
          allowedFollowers
        ) as any;

      } else {
        let thumbnailUrlRaw: string | undefined;
        if (mediaType === 'video' && uploadImages[0]) {
          thumbnailUrlRaw = await getVideoThumbnail(uploadImages[0]) || undefined;
        }
        
        result = await createPost(
          typeof userId === 'string' ? userId : '',
          Array.isArray(uploadImages) ? uploadImages : [uploadImages],
          caption,
          locationData?.name || '',
          mediaType,
          locationData ? {
            name: locationData.name,
            address: locationData.address,
            placeId: locationData.placeId,
            lat: locationData.lat,
            lon: locationData.lon,
            verified: locationData.verified
          } : undefined,
          taggedUsers.map(u => u.uid),
          selectedCategory?.name || '',
          extractedHashtags,
          extractedMentions,
          visibility,
          allowedFollowers,
          postType.toLowerCase(),
          thumbnailUrlRaw,
          selectedImages[0] ? previewRatioCacheRef.current.get(selectedImages[0]) : undefined
        ) as any;
      }

      trace?.end({
        success: result?.success ? 1 : 0,
        images: uploadImages.length,
        mediaType,
      });

      console.log('ðŸ“¥ Post creation result:', result);

      // Track hashtags if post created successfully
      if (result && result.success && extractedHashtags.length > 0) {
        for (const hashtag of extractedHashtags) {
          try {
            await trackHashtag(hashtag);
          } catch (error) {
            console.warn(`âš ï¸  Failed to track hashtag ${hashtag}:`, error);
          }
        }
      }

      if (result && result.success) {
        hapticSuccess();
        console.log('âœ… Post created successfully! ID:', result.postId);
        Alert.alert('Success', 'Post created successfully!');
        const createdPostId = String(result.postId || '');
        // Reset state before navigating back
        setSelectedImages([]);
        setCaption('');
        setHashtags([]);
        setMentions([]);
        setLocation(null);
        setVerifiedLocation(null);
        setTaggedUsers([]);
        setSelectedCategories([]);
        setStep('picker');
        if (createdPostId) {
          feedEventEmitter.emitPostCreated(createdPostId);
        }
        // Instagram-like: no success dialog, jump to feed immediately.
        router.replace('/(tabs)/home');
      } else {
        console.error('â Œ Post creation failed:', result.error);
        Alert.alert('Error', result.error || 'Failed to create post');
      }
    } catch (error: any) {
      console.error('â Œ Exception during post creation:', error);
      Alert.alert('Error', error.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  // Edit mode: save changes to existing post
  const handleEditSave = async (): Promise<void> => {
    if (!editPostId) return;

    // Guard: if pre-fill is still loading, block save to avoid sending empty
    // values that would destroy the existing post data on the server.
    if (editLoading) {
      Alert.alert('Please wait', 'Post is still loading, please try again in a moment.');
      return;
    }

    hapticMedium();
    setLoading(true);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const storedUserId = String((await AsyncStorage.getItem('userId')) || '');
      const storedUid = String((await AsyncStorage.getItem('uid')) || '');
      const storedFirebaseUid = String((await AsyncStorage.getItem('firebaseUid')) || '');
      const contextUid = String(user?.uid || '');
      const authorIdForEdit = String(editAuthorId || '').trim();
      const userId = authorIdForEdit || storedUid || storedFirebaseUid || contextUid || storedUserId;
      if (!userId) throw new Error('User not found');

      // Fetch the latest server post BEFORE building patchBody so we can
      // merge user-edited fields on top of the existing data. This guarantees
      // that fields the user didn't touch retain their existing values
      // (caption, category, location, hashtags, tagged users, visibility).
      let basePost: any = null;
      try {
        const baseRes = await apiService.get(`/posts/${editPostId}`);
        const baseData = (baseRes && typeof baseRes === 'object' && (baseRes as any).data) ? (baseRes as any).data : null;
        basePost = baseData && typeof baseData === 'object' && (baseData as any).data ? (baseData as any).data : baseData;
      } catch (e) {
        if (__DEV__) console.warn('[CreatePost] Failed to fetch base post for merge:', e);
      }

      // Build location data — prefer current screen state, fall back to server.
      let locationData: any = undefined;
      if (verifiedLocation) {
        locationData = {
          name: verifiedLocation.name,
          address: verifiedLocation.address || '',
          placeId: verifiedLocation.placeId,
          lat: verifiedLocation.lat || 0,
          lon: verifiedLocation.lon || 0,
          verified: true,
        };
      } else if (location) {
        locationData = {
          name: location.name,
          address: location.address || '',
          placeId: location.placeId,
          lat: location.lat || 0,
          lon: location.lon || 0,
          verified: false,
        };
      } else if (basePost?.locationData && typeof basePost.locationData === 'object' && basePost.locationData.name) {
        // User did not touch location — preserve existing.
        locationData = {
          name: basePost.locationData.name || '',
          address: basePost.locationData.address || '',
          placeId: basePost.locationData.placeId,
          lat: basePost.locationData.lat || 0,
          lon: basePost.locationData.lon || 0,
          verified: !!basePost.locationData.verified,
        };
      } else if (typeof basePost?.location === 'string' && basePost.location.trim()) {
        locationData = {
          name: basePost.location,
          address: '',
          placeId: undefined,
          lat: 0,
          lon: 0,
          verified: false,
        };
      }

      const inlineMentions = extractHashtags(caption);
      const userHashtags = Array.from(new Set([
        ...inlineMentions.map(h => h.tag),
        ...hashtags,
      ]));
      const baseHashtags = Array.isArray(basePost?.hashtags) ? basePost.hashtags : [];
      const extractedHashtags = userHashtags.length > 0 ? userHashtags : baseHashtags;

      const selectedCategory = selectedCategories.length > 0 ? selectedCategories[0] : null;
      const baseCategory = (() => {
        if (!basePost) return '';
        const c = basePost.category;
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') return String(c.name || c.title || '');
        return '';
      })();
      const finalCategoryName = selectedCategory?.name || baseCategory || '';

      // Caption: prefer user input. Only fall back to server if user input
      // is exactly empty (state never populated, e.g. pre-fill failed).
      const userCaption = caption.trim();
      const baseCaption = String(basePost?.caption ?? basePost?.content ?? '').trim();
      const finalCaption = userCaption !== '' ? caption : baseCaption;

      const userTaggedIds = taggedUsers.map(u => u.uid).filter(Boolean);
      const baseTaggedIds: string[] = (() => {
        const t = basePost?.taggedUsers || basePost?.taggedUserIds;
        if (!Array.isArray(t)) return [];
        return t.map((x: any) => typeof x === 'string' ? x : (x?.uid || x?._id || '')).filter(Boolean);
      })();
      const finalTaggedIds = userTaggedIds.length > 0 ? userTaggedIds : baseTaggedIds;

      const finalVisibility = visibility || basePost?.visibility || 'Everyone';

      const patchBody: any = {
        currentUserId: userId,
        userId,
        authorId: userId,
        requesterUserId: storedUserId || userId,
        firebaseUid: storedFirebaseUid || storedUid || contextUid || userId,
        caption: finalCaption || ' ',
        content: finalCaption || ' ',
        hashtags: extractedHashtags,
        category: finalCategoryName,
        visibility: finalVisibility,
        taggedUserIds: finalTaggedIds,
      };

      if (__DEV__) console.log('[CreatePost] Saving edit:', { editPostId, patchBody });
      if (locationData !== undefined) {
        patchBody.location = locationData.name || '';
        patchBody.locationData = locationData;
      }

      let res = await apiService.patch(`/posts/${editPostId}`, patchBody);
      if (__DEV__) console.log('[CreatePost] Patch response:', JSON.stringify(res, null, 2));

      if (!res?.success) {
        if (__DEV__) console.warn('[CreatePost] Patch failed, retrying with PUT:', res?.error || res?.data?.error);
        res = await apiService.put(`/posts/${editPostId}`, patchBody);
        if (__DEV__) console.log('[CreatePost] PUT response:', JSON.stringify(res, null, 2));
        if (!res?.success) {
          setUploading(false);
          const errMsg = res?.error || res?.data?.error || 'Server rejected the update';
          if (__DEV__) console.error('[CreatePost] Update failed:', errMsg);
          Alert.alert('Error', `Failed to update post: ${errMsg}`);
          return;
        }
      }

      // Patch cached feeds so UI updates even if the list is currently rendered from cache.
      const patchCachedList = async (cacheKey: string, idsToMatch: string[], fullPatch?: any) => {
        try {
          const cached = await getCachedData<any[]>(cacheKey);
          if (!Array.isArray(cached) || cached.length === 0) return;
          const desiredLocName = locationData?.name || '';
          const desiredCatName = finalCategoryName;
          const desiredCap = finalCaption || ' ';
          const next = cached.map((p) => {
            const ids = [String(p?.id || ''), String(p?._id || ''), String((p as any)?.postId || '')].filter(Boolean);
            if (!idsToMatch.some((id) => ids.includes(id))) return p;
            return {
              ...p,
              ...(fullPatch && typeof fullPatch === 'object' ? fullPatch : null),
              caption: desiredCap,
              content: desiredCap,
              text: desiredCap,
              category: desiredCatName,
              categoryName: desiredCatName,
              hashtags: extractedHashtags,
              taggedUsers: finalTaggedIds,
              taggedUserIds: finalTaggedIds,
              visibility: finalVisibility,
              location: desiredLocName,
              locationName: desiredLocName,
              locationData: locationData || null,
              updatedAt: new Date().toISOString(),
            };
          });
          await setCachedData(cacheKey, next, { ttl: 24 * 60 * 60 * 1000 });
        } catch { }
      };

      // Emit update so feed reflects changes immediately
      const payload = (res && typeof res === 'object' && (res as any).data) ? (res as any).data : null;
      const updatedPost = payload && typeof payload === 'object' && (payload as any).data ? (payload as any).data : payload;
      const responsePostId = String((updatedPost as any)?._id || (updatedPost as any)?.id || editPostId || '');

      let freshPost: any = null;
      const fetchFreshPost = async () => {
        try {
          const freshRes = await apiService.get(`/posts/${encodeURIComponent(responsePostId || editPostId)}`);
          const freshData = (freshRes && typeof freshRes === 'object' && (freshRes as any).data) ? (freshRes as any).data : null;
          const unwrapped = freshData && typeof freshData === 'object' && (freshData as any).data ? (freshData as any).data : freshData;
          return unwrapped;
        } catch (e) {
          if (__DEV__) console.warn('[CreatePost] fetchFreshPost failed:', e);
          return null;
        }
      };
      // Small delay to allow DB to fully commit the PATCH before verification.
      try { await new Promise(resolve => setTimeout(resolve, 300)); } catch { }
      freshPost = await fetchFreshPost();
      // Fallback: if fresh fetch failed, use PATCH response payload as the
      // verification source (still represents the updated post).
      if (!freshPost && updatedPost && typeof updatedPost === 'object') {
        if (__DEV__) console.warn('[CreatePost] Using PATCH response as freshPost fallback');
        freshPost = updatedPost;
      }

      const desiredCaption = finalCaption || ' ';
      const desiredCategory = finalCategoryName;
      const desiredLocationName = String(locationData?.name || '').trim();
      const getPostCaption = (p: any) => String(p?.caption || p?.content || p?.text || '').trim();
      const getPostCategory = (p: any) => {
        const cat = p?.category;
        if (typeof cat === 'string') return cat.trim();
        if (cat && typeof cat === 'object') return String(cat.name || cat.title || '').trim();
        return '';
      };
      const getPostLocationName = (p: any) => {
        if (!p) return '';
        const fromData = String(p?.locationData?.name || '').trim();
        if (fromData) return fromData;
        const fromName = String(p?.locationName || '').trim();
        if (fromName) return fromName;
        if (typeof p?.location === 'string') return p.location.trim();
        if (p?.location && typeof p.location === 'object') {
          return String(p.location.name || '').trim();
        }
        return '';
      };

      // Lenient verification: only used to log diagnostics. The PATCH already
      // succeeded, so we trust the server. We DO try one PUT retry if the
      // freshly-fetched post clearly missing fields the user just set, but we
      // never block the success path or show an error to the user. Optimistic
      // UI updates use the user's desired values directly.
      const matchesField = (saved: string, desired: string) => {
        const a = String(saved || '').trim();
        const b = String(desired || '').trim();
        if (!b) return true; // user didn't set, nothing to verify
        return a === b;
      };
      const verifySaved = (p: any) => {
        if (!p) return false;
        return (
          matchesField(getPostCaption(p), desiredCaption) &&
          matchesField(getPostCategory(p), desiredCategory) &&
          matchesField(getPostLocationName(p), desiredLocationName)
        );
      };

      if (!verifySaved(freshPost)) {
        const freshCaption = getPostCaption(freshPost);
        const freshCategory = getPostCategory(freshPost);
        const freshLocation = getPostLocationName(freshPost);
        if (__DEV__) {
          console.warn('[CreatePost] Fresh post did not match edit (will retry once with PUT):', {
            desiredCaption,
            freshCaption,
            desiredCategory,
            freshCategory,
            desiredLocationName,
            freshLocation,
          });
        }
        try {
          const retryBody = {
            ...patchBody,
            text: desiredCaption,
            categoryName: desiredCategory,
          };
          const retryRes = await apiService.put(`/posts/${editPostId}`, retryBody);
          if (__DEV__) console.log('[CreatePost] Verification retry response:', JSON.stringify(retryRes, null, 2));
          if (retryRes?.success) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const refetched = await fetchFreshPost();
            if (refetched) freshPost = refetched;
          }
        } catch (retryErr) {
          if (__DEV__) console.warn('[CreatePost] PUT retry failed (proceeding optimistically):', retryErr);
        }
      }

      // Proceed with optimistic UI update regardless of verification outcome.
      // The PATCH succeeded earlier, so the server has accepted the changes.
      // Even if a quick verify GET shows stale data, the UI uses the user's
      // desired values directly so the screen reflects the saved edit.
      if (!verifySaved(freshPost) && __DEV__) {
        console.warn('[CreatePost] Verification still mismatched but PATCH succeeded — proceeding with optimistic UI.');
      }

      const idsToMatch = Array.from(new Set([
        String(editPostId || ''),
        String((updatedPost as any)?._id || ''),
        String((updatedPost as any)?.id || ''),
        String((freshPost as any)?._id || ''),
        String((freshPost as any)?.id || ''),
      ].filter(Boolean)));

      const candidateOwnerIds = Array.from(new Set([
        String(userId || ''),
        String(user?.uid || ''),
        String((await AsyncStorage.getItem('uid')) || ''),
        String((await AsyncStorage.getItem('firebaseUid')) || ''),
      ].filter(Boolean)));

      // Patch all likely cache keys (canonical userId + firebase uid variants).
      for (const ownerId of candidateOwnerIds) {
        await patchCachedList(`home_feed_v1_${ownerId}`, idsToMatch, freshPost || updatedPost);
        try {
          const key = `profile_v2_${ownerId}_${ownerId}`;
          const cached = await getCachedData<any>(key);
          if (!cached || typeof cached !== 'object') continue;
          const cachedPosts = Array.isArray((cached as any).posts) ? (cached as any).posts : null;
          if (!cachedPosts) continue;
          const desiredLocName = locationData?.name || '';
          const desiredCatName = finalCategoryName;
          const desiredCap = finalCaption || ' ';
          const nextPosts = cachedPosts.map((p: any) => {
            const pids = [String(p?.id || ''), String(p?._id || ''), String(p?.postId || '')].filter(Boolean);
            if (!idsToMatch.some((id) => pids.includes(id))) return p;
            return {
              ...p,
              ...((freshPost || updatedPost) && typeof (freshPost || updatedPost) === 'object' ? (freshPost || updatedPost) : null),
              caption: desiredCap,
              content: desiredCap,
              text: desiredCap,
              category: desiredCatName,
              categoryName: desiredCatName,
              hashtags: extractedHashtags,
              taggedUsers: finalTaggedIds,
              taggedUserIds: finalTaggedIds,
              visibility: finalVisibility,
              location: desiredLocName,
              locationName: desiredLocName,
              locationData: locationData || null,
              updatedAt: new Date().toISOString(),
            };
          });
          await setCachedData(key, { ...(cached as any), posts: nextPosts }, { ttl: 24 * 60 * 60 * 1000 });
        } catch { }
      }

      idsToMatch.forEach((pid) => {
        const desiredLoc = locationData?.name || '';
        const desiredCap = finalCaption || ' ';
        const desiredCatName = finalCategoryName;
        // Build server-merged base (server values), then re-apply user's desired
        // values on top so optimistic UI never gets clobbered by stale fields.
        const mergedFromServer: any = {
          ...(freshPost && typeof freshPost === 'object' ? freshPost : {}),
          ...(updatedPost && typeof updatedPost === 'object' ? updatedPost : {}),
        };
        feedEventEmitter.emitPostUpdated(pid, {
          ...mergedFromServer,
          hashtags: extractedHashtags,
          taggedUsers: finalTaggedIds,
          taggedUserIds: finalTaggedIds,
          visibility: finalVisibility,
          caption: desiredCap,
          content: desiredCap,
          text: desiredCap,
          category: desiredCatName,
          categoryName: desiredCatName,
          location: desiredLoc,
          locationName: desiredLoc,
          locationData: locationData || null,
          updatedAt: new Date().toISOString(),
        });
      });

      if (__DEV__) console.log('[CreatePost] Edit saved. Emitting feedUpdated after 1500ms delay...');
      // Wait longer for DB consistency (especially if using clusters/replicas)
      setTimeout(() => {
        if (__DEV__) console.log('[CreatePost] Triggering global feed refresh now.');
        feedEventEmitter.emit('feedUpdated');
      }, 1500);

      hapticSuccess();
      Alert.alert('Success', 'Post updated successfully.');
      // Navigate to home with a refreshTs param so home forces a fresh fetch
      // and bypasses any stale cached/memoized post entries.
      const refreshTs = Date.now();
      try {
        router.replace({ pathname: '/(tabs)/home', params: { refreshTs: String(refreshTs) } } as any);
      } catch {
        safeRouterBack();
      }
    } catch (error: any) {
      console.error('[CreatePost] Edit save error:', error);
      Alert.alert('Error', error.message || 'Failed to update post');
    } finally {
      setLoading(false);
    }
  };

  // Fetch real place details from Google Places API
  const getPlaceDetails = async (placeId: string): Promise<{ lat: number; lon: number } | null> => {
    try {
      const apiKey = GOOGLE_MAPS_CONFIG.apiKey;
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.result && data.result.geometry && data.result.geometry.location) {
        return {
          lat: data.result.geometry.location.lat,
          lon: data.result.geometry.location.lng
        };
      }
      return null;
    } catch (err) {
      console.error('Google Places API error:', err);
      return null;
    }
  };


  // --- END OF COMPONENT ---
  const goNextFromPicker = () => {
    if (selectedImages.length === 0) return;
    const first = selectedImages[0];
    const isVideo = typeof first === 'string' && isVideoUri(first, galleryAssets);
    
    if (postType === 'STORY') {
      router.push({
        pathname: '/story-upload',
        params: {
          storyMediaUri: first,
          storyMediaType: isVideo ? 'video' : 'photo',
          storyTextOverlays: '',
        },
      });
      return;
    }
    
    setStep('details');
  };

  const goNextFromPreview = () => {
    if (selectedImages.length === 0) return;
    const first = selectedImages[0];
    if (postType === 'STORY') {
      router.push({
        pathname: '/story-upload',
        params: {
          storyMediaUri: first,
          storyMediaType: isVideoUri(first, galleryAssets) ? 'video' : 'photo',
          storyTextOverlays: '',
        },
      });
      return;
    }
    setStep('details');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={["top"]}>
        {step === 'picker' ? (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  safeRouterBack();
                }}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginTop: -4 }}
              >
                <Ionicons name="close" size={20} color="#333" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -4 }}>
                <Text style={{ fontWeight: '500', fontSize: 18, color: '#000' }}>New {postType === 'STORY' ? 'Story' : 'Post'}</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            <View style={{ flex: 1 }}>
                {/* Media Preview */}
                <View style={{ width: windowWidth, height: PICKER_IMAGE_HEIGHT, backgroundColor: '#000', overflow: 'hidden' }}>
                  {selectedImages.length > 0 ? (
                    isVideoUri(selectedImages[previewIndex] || selectedImages[0], galleryAssets) ? (
                      <View style={{ width: windowWidth, height: PICKER_IMAGE_HEIGHT, backgroundColor: '#000' }}>
                        <Video
                          source={{ uri: selectedImages[previewIndex] || selectedImages[0] }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode={previewHeight === windowWidth ? ResizeMode.COVER : ResizeMode.CONTAIN}
                          shouldPlay
                          isMuted
                          isLooping
                          useNativeControls={true}
                          posterSource={{ uri: thumbnails[selectedImages[previewIndex] || selectedImages[0]] }}
                          posterStyle={{ resizeMode: previewHeight === windowWidth ? 'cover' : 'contain' }}
                          usePoster={!!thumbnails[selectedImages[previewIndex] || selectedImages[0]]}
                        />
                      </View>
                    ) : (
                      <Image 
                        source={{ uri: selectedImages[previewIndex] || selectedImages[0] }} 
                        style={{ width: windowWidth, height: '100%' }} 
                        resizeMode={previewHeight === windowWidth ? "cover" : "contain"} 
                      />
                    )
                  ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <Feather name="image" size={48} color="#ccc" />
                    </View>
                  )}

                  {/* Crop Toggle Button (Square/Original) */}
                  {selectedImages.length > 0 && (
                    <TouchableOpacity 
                      onPress={() => {
                        hapticLight();
                        setPreviewHeight(previewHeight === windowWidth ? windowWidth / (4/5) : windowWidth);
                      }}
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}
                    >
                      <Feather name={previewHeight === windowWidth ? "maximize" : "minimize"} size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Gallery Grid */}
                <FlatList
                  data={galleryAssets}
                  keyExtractor={(item) => item.id}
                  numColumns={3}
                  onEndReached={loadMoreGallery}
                  onEndReachedThreshold={0.5}
                  ListHeaderComponent={() => (
                    <TouchableOpacity
                      onPress={openCamera}
                      style={{
                        width: GRID_ITEM_SIZE,
                        height: GRID_ITEM_SIZE,
                        padding: 1,
                        backgroundColor: '#f5f5f5',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="camera" size={32} color="#000" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#000', marginTop: 4 }}>
                        Camera
                      </Text>
                    </TouchableOpacity>
                  )}
                  renderItem={({ item }) => {
                    const isSelected = selectedImages.includes(item.uri);
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          hapticLight();
                          if (isSelected) {
                            setSelectedImages(selectedImages.filter((img) => img !== item.uri));
                          } else {
                            if (postType === 'STORY') {
                              setSelectedImages([item.uri]);
                            } else if (item.mediaType === 'video') {
                              setSelectedImages([item.uri]);
                            } else {
                              const hasVideoAlready = selectedImages.some((u) => isVideoUri(u, galleryAssets));
                              if (hasVideoAlready) {
                                setSelectedImages([item.uri]);
                              } else {
                                setSelectedImages([...selectedImages, item.uri]);
                              }
                            }
                          }
                        }}
                        style={{ width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, padding: 1 }}
                      >
                        <Image source={{ uri: item.uri }} style={{ flex: 1 }} />
                        {item.mediaType === 'video' && (
                          <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="video" size={10} color="#fff" />
                            {typeof item.duration === 'number' && (
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                                {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                              </Text>
                            )}
                          </View>
                        )}
                        {isSelected && (
                          <View style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: '#0095f6', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{selectedImages.indexOf(item.uri) + 1}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListFooterComponent={loadingMoreGallery ? <ActivityIndicator size="small" color="#999" style={{ marginVertical: 12 }} /> : null}
                  contentContainerStyle={{ paddingBottom: 120 }}
                />

                {/* Floating Post Type Selector */}
                {!paramPostType && (
                  <View style={{
                    position: 'absolute',
                    bottom: 8,
                    alignSelf: 'center',
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    borderRadius: 30,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                    elevation: 10
                  }}>
                    {['POST', 'STORY'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => {
                          hapticLight();
                          setPostType(type as any);
                          // Reset selection when switching types to avoid type mismatch
                          setSelectedImages([]);
                        }}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: postType === type ? 'rgba(255,255,255,0.15)' : 'transparent'
                        }}
                      >
                        <Text style={{
                          color: postType === type ? '#fff' : '#aaa',
                          fontWeight: '700',
                          fontSize: 13,
                          letterSpacing: 0.5
                        }}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

            {/* Bottom Navigation Bar */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fff',
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? insets.bottom : 16
            }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  setSelectedImages([]);
                }}
              >
                <Text style={{ color: '#000', fontWeight: '500', fontSize: 18 }}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  goNextFromPicker();
                }}
                disabled={selectedImages.length === 0}
                style={{
                  backgroundColor: selectedImages.length > 0 ? '#0095f6' : '#eee',
                  paddingHorizontal: 40,
                  paddingVertical: 8,
                  borderRadius: 12,
                  opacity: selectedImages.length > 0 ? 1 : 0.5
                }}
              >
                <Text style={{ color: selectedImages.length > 0 ? '#fff' : '#888', fontWeight: '700', fontSize: 18 }}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : step === 'preview' ? (
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Preview Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16, backgroundColor: '#000' }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  setStep('picker');
                }}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '600', fontSize: 16, color: '#fff' }}>Preview</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>

            {/* Video preview */}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Video
                source={{ uri: selectedImages[0] }}
                style={{
                  width: windowWidth,
                  height: Math.min(height * 0.75, Math.max(220, windowWidth / Math.max(0.5, Math.min(2.5, previewVideoRatio)))),
                }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay={false}
                isLooping
                onReadyForDisplay={(e: any) => {
                  const w = e?.naturalSize?.width;
                  const h = e?.naturalSize?.height;
                  if (typeof w === 'number' && typeof h === 'number' && h > 0) {
                    setPreviewVideoRatio(w / h);
                  }
                }}
              />
            </View>

            {/* Bottom bar */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? insets.bottom : 16, backgroundColor: '#000' }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  goNextFromPreview();
                }}
                style={{
                  backgroundColor: '#0095f6',
                  paddingHorizontal: 40,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {/* Details Header - Outside KeyboardAvoidingView to stay fixed */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  if (isEditMode) {
                    safeRouterBack();
                  } else {
                    paramPostType ? safeRouterBack() : setStep('picker');
                  }
                }}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#333" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '500', fontSize: 18, color: '#000' }}>{isEditMode ? 'Edit Post' : `New ${postType === 'STORY' ? 'Story' : 'Post'}`}</Text>
              </View>
              <TouchableOpacity
                onPress={isEditMode ? handleEditSave : handleShare}
                disabled={isEditMode && editLoading}
                style={{ paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center', opacity: (isEditMode && editLoading) ? 0.5 : 1 }}
              >
                <Text style={{ color: '#0095f6', fontWeight: '500', fontSize: 16 }}>{isEditMode ? (editLoading ? 'Loading...' : 'Save') : 'Share'}</Text>
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={getKeyboardOffset()}
              style={{ flex: 1 }}
            >
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Media Preview Area (top) */}
              <View style={{ width: windowWidth, height: DETAILS_IMAGE_HEIGHT, backgroundColor: isVideoUri(selectedImages[previewIndex] || selectedImages[0], galleryAssets) ? '#000' : '#f0f0f0', marginBottom: 10 }}>
                {selectedImages.length > 0 ? (
                  isVideoUri(selectedImages[previewIndex] || selectedImages[0], galleryAssets) ? (
                    <View style={{ width: windowWidth, height: DETAILS_IMAGE_HEIGHT, backgroundColor: '#000' }}>
                      <Video
                        source={{ uri: selectedImages[previewIndex] || selectedImages[0] }}
                        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay
                        isMuted
                        isLooping
                        useNativeControls={true}
                      />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: selectedImages[previewIndex] || selectedImages[0] }}
                      style={{ width: windowWidth, height: '100%' }}
                      resizeMode="cover"
                    />
                  )
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Feather name="image" size={48} color="#ccc" />
                  </View>
                )}
              </View>

              {/* Options List Layout */}
              <View style={{ backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 0 }}>

                {/* Option: Add a text */}
                <View style={{ paddingBottom: 4 }}>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }} onPress={() => { }}>
                    <Feather name="align-justify" size={18} color="#000" style={{ marginRight: 16 }} />
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add a text</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ fontSize: 14, color: '#111', marginLeft: 34, marginTop: -2, minHeight: 24, paddingVertical: 0 }}
                    placeholder="Write your caption here..."
                    placeholderTextColor="#888"
                    underlineColorAndroid="transparent"
                    value={caption}
                    onChangeText={setCaption}
                    multiline
                  />
                </View>

                {/* Option: Add tags */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 }}>
                  <Feather name="hash" size={20} color="#000" style={{ marginRight: 16, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add tags</Text>
                    
                    {/* Tag Input Field */}
                    <TextInput
                      style={{ fontSize: 14, color: '#111', marginTop: 4, paddingVertical: 4 }}
                      placeholder="Type and press space or comma..."
                      placeholderTextColor="#888"
                      underlineColorAndroid="transparent"
                      value={hashtagInput}
                      onChangeText={(text) => {
                        setHashtagInput(text);
                        // If space or comma is typed, "commit" the tag
                        if (text.endsWith(' ') || text.endsWith(',')) {
                          const tag = text.trim().replace(/[ ,#]/g, '').toLowerCase();
                          if (tag && !hashtags.includes(tag)) {
                            setHashtags([...hashtags, tag]);
                            setHashtagInput('');
                          } else if (!tag) {
                            setHashtagInput('');
                          }
                        }
                      }}
                      onSubmitEditing={() => {
                        const tag = hashtagInput.trim().replace(/[ #]/g, '').toLowerCase();
                        if (tag && !hashtags.includes(tag)) {
                          setHashtags([...hashtags, tag]);
                          setHashtagInput('');
                        }
                      }}
                    />

                    {/* Tag Pills (Chips) */}
                    {hashtags.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {hashtags.map(tag => (
                          <View key={tag} style={{ backgroundColor: '#0095f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }}>
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>#{tag}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                hapticLight();
                                setHashtags(hashtags.filter(t => t !== tag));
                              }}
                              style={{ marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 2 }}
                            >
                              <Feather name="x" size={12} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                {/* Option: Add a category */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => {
                    hapticLight();
                    setShowCategoryModal(true);
                  }}
                >
                  <Feather name="bookmark" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add a category for the home feed</Text>
                    {selectedCategories.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {selectedCategories.map(cat => (
                          <View key={cat.name} style={{ backgroundColor: '#f2f2f2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: '#111', fontWeight: '500', fontSize: 13 }}>{cat.name}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                hapticLight();
                                setSelectedCategories(selectedCategories.filter(c => c.name !== cat.name));
                              }}
                              style={{ marginLeft: 6 }}
                            >
                              <Feather name="x" size={14} color="#666" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color="#ccc" />
                </TouchableOpacity>

                {/* Option: Add a location */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => {
                    hapticLight();
                    setShowLocationModal(true);
                  }}
                >
                  <Feather name="map-pin" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add a location</Text>
                    {location && (
                      <Text style={{ color: '#0095f6', fontSize: 14, marginTop: 4 }}>{location.name}</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color="#ccc" />
                </TouchableOpacity>

                {/* Option: Add a verified location */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => {
                    hapticLight();
                    setShowVerifiedModal(true);
                  }}
                >
                  <Feather name="lock" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add a verified location</Text>
                    {verifiedLocation && (
                      <Text style={{ color: '#0095f6', fontSize: 14, marginTop: 4 }}>{verifiedLocation.name}</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color="#ccc" />
                </TouchableOpacity>

                {/* Option: Tag people */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => {
                    hapticLight();
                    setShowTagModal(true);
                  }}
                >
                  <Feather name="user-plus" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Tag people</Text>
                    {taggedUsers.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {taggedUsers.map(u => (
                          <View key={u.uid} style={{ backgroundColor: '#0095f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }}>
                            <Image source={{ uri: u.photoURL || DEFAULT_AVATAR_URL }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} />
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{u.displayName || u.userName || u.uid}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                hapticLight();
                                setTaggedUsers(taggedUsers.filter(tu => tu.uid !== u.uid));
                              }}
                              style={{ marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: 2 }}
                            >
                              <Feather name="x" size={12} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color="#ccc" />
                </TouchableOpacity>

                {/* Option: Post visibility */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}
                  onPress={() => {
                    hapticLight();
                    setShowVisibilityModal(true);
                  }}
                >
                  <Feather name="eye" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Post visibility</Text>
                    <Text style={{ color: '#0095f6', fontSize: 14, marginTop: 4 }}>{visibility}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#ccc" />
                </TouchableOpacity>


              </View>
            </ScrollView>
            {/* Fixed Bottom Bar */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fff',
              paddingHorizontal: 24,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? insets.bottom : 16
            }}>
              <TouchableOpacity
                onPress={() => {
                  hapticLight();
                  setSelectedImages([]);
                  setStep('picker');
                }}
              >
                <Text style={{ color: '#000', fontWeight: '500', fontSize: 18 }}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={isEditMode ? handleEditSave : handleShare}
                disabled={isEditMode && editLoading}
                style={{
                  backgroundColor: '#0095f6',
                  paddingHorizontal: 40,
                  paddingVertical: 8,
                  borderRadius: 12,
                  opacity: (isEditMode && editLoading) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '500', fontSize: 18 }}>{isEditMode ? (editLoading ? 'Loading...' : 'Save') : 'Share'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
        {/* Category Modal */}
        <Modal 
          visible={showCategoryModal} 
          animationType="slide" 
          transparent 
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={() => setShowCategoryModal(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            enabled={Platform.OS === 'ios'}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={iosSheetKeyboardOffset}
          >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowCategoryModal(false)} />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              maxHeight: getModalHeight(0.85),
              minHeight: 450,
              overflow: 'hidden'
            }}>
              {/* Header components stay fixed at the top */}
              <View 
                {...categorySheetPan.panHandlers}
                style={{ paddingHorizontal: 20, paddingTop: 16 }}
              >
                <View 
                  style={{ width: '100%', height: 32, justifyContent: 'center' }}
                >
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
                </View>
                <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 8, color: '#000', textAlign: 'center' }}>Add a category</Text>
                <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  This will help people find your post in the home feed.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                  <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#000' }}
                    placeholder="Search"
                    placeholderTextColor="#666"
                    value={categorySearch}
                    onChangeText={setCategorySearch}
                  />
                </View>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <FlatList
                  data={(categories.length > 0
                    ? categories
                    : (DEFAULT_CATEGORIES || []).map((c: any) => typeof c === 'string' ? { name: c, image: '' } : c)
                  ).filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))}
                  keyExtractor={item => item.name}
                  renderItem={renderCategoryItem}
                  showsVerticalScrollIndicator={false}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  ListEmptyComponent={
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#888' }}>No categories found</Text>
                      <TouchableOpacity 
                        onPress={() => setCategories((DEFAULT_CATEGORIES || []).map((c: any) => typeof c === 'string' ? { name: c, image: '' } : c))}
                        style={{ marginTop: 12 }}
                      >
                        <Text style={{ color: '#0095f6' }}>Reset to defaults</Text>
                      </TouchableOpacity>
                    </View>
                  }
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                  <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                    <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowCategoryModal(false)}
                    style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal 
          visible={showLocationModal} 
          animationType="slide" 
          transparent 
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={() => setShowLocationModal(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            enabled={Platform.OS === 'ios'}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={iosSheetKeyboardOffset}
          >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowLocationModal(false)} />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              maxHeight: getModalHeight(0.85),
              minHeight: 450,
              overflow: 'hidden'
            }}>
              <View 
                {...locationSheetPan.panHandlers}
                style={{ paddingHorizontal: 20, paddingTop: 16 }}
              >
                <View 
                  style={{ width: '100%', height: 32, justifyContent: 'center' }}
                >
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
                </View>
                <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 20, color: '#000', textAlign: 'center' }}>Choose a location to tag</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                  <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#000' }}
                    placeholder="Search"
                    placeholderTextColor="#666"
                    value={locationSearch}
                    onChangeText={async (text) => {
                      setLocationSearch(text);
                      if (text.length > 2) {
                        setLoadingLocationResults(true);
                        try {
                          const suggestions = await mapService.getAutocompleteSuggestions(text);
                          setLocationResults(suggestions.map((s: any) => ({
                            name: s.description.split(',')[0],
                            address: s.description,
                            placeId: s.placeId,
                            lat: 0,
                            lon: 0
                          })));
                        } catch (e) {
                          console.error('[CreatePost] Map autocomplete error:', e);
                          setLocationResults([]);
                        }
                        setLoadingLocationResults(false);
                      } else {
                        setLocationResults([]);
                      }
                    }}
                  />
                </View>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                {loadingLocationResults ? (
                  <ActivityIndicator size="small" color="#0095f6" style={{ marginTop: 20 }} />
                ) : (
                  <FlatList
                    data={locationResults}
                    keyExtractor={(item, idx) => getLocationKey(item) || String(idx)}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1 }}
                    renderItem={({ item }) => {
                      const isSelected = !!location && getLocationKey(location) === getLocationKey(item);
                      return (
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                          onPress={() => {
                            hapticLight();
                            if (isSelected) setLocation(null);
                            else setLocation(item);
                          }}
                        >
                          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                            <Feather name="map-pin" size={18} color="#000" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{item.name}</Text>
                            <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{item.address}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                  <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                    <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowLocationModal(false)}
                    style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal 
          visible={showVerifiedModal} 
          animationType="slide" 
          transparent 
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={closeVerifiedModal}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            enabled={Platform.OS === 'ios'}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={iosSheetKeyboardOffset}
          >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={closeVerifiedModal} />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              maxHeight: getModalHeight(0.85),
              minHeight: 450,
              overflow: 'hidden'
            }}>
              <View 
                {...verifiedSheetPan.panHandlers}
                style={{ paddingHorizontal: 20, paddingTop: 16 }}
              >
                <View 
                  style={{ width: '100%', height: 32, justifyContent: 'center' }}
                >
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <Feather name="lock" size={16} color="#000" style={{ marginRight: 8 }} />
                  <Text style={{ fontWeight: '500', fontSize: 16, color: '#000' }}>Add a verified location</Text>
                </View>
                <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20 }}>
                  To add a verified location you must be within 50 meters.
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                  <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#000' }}
                    placeholder="Search"
                    placeholderTextColor="#666"
                    value={verifiedSearch}
                    onChangeText={setVerifiedSearch}
                  />
                </View>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <FlatList
                  data={[
                    { type: 'header_nearby', label: 'Nearby (100m)' },
                    ...(verifiedCenter ? [] : [{ type: 'error_location' }]),
                    ...(loadingVerifiedResults ? [{ type: 'loading' }] : verifiedResults),
                    { type: 'header_passport', label: 'Passport / GPS' },
                    ...verifiedOptions
                  ]}
                  keyExtractor={(item, idx) => {
                    if ('type' in item) return `ui-${item.type}-${idx}`;
                    return getLocationKey(item) || String(idx);
                  }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  renderItem={({ item }) => {
                    if ('type' in item) {
                      if (item.type === 'header_nearby' || item.type === 'header_passport') {
                        return <Text style={{ fontWeight: '700', fontSize: 14, color: '#111', marginTop: (item.type === 'header_passport' ? 18 : 0), marginBottom: 8 }}>{item.label}</Text>;
                      }
                      if (item.type === 'error_location') {
                        return <Text style={{ color: '#888', marginBottom: 12, textAlign: 'center' }}>Enable location permission to see nearby verified places.</Text>;
                      }
                      if (item.type === 'loading') {
                        return <ActivityIndicator size="small" color="#0095f6" style={{ marginVertical: 10 }} />;
                      }
                      return null;
                    }

                    const isSelected = !!verifiedLocation && getLocationKey(verifiedLocation) === getLocationKey(item);
                    return (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                        onPress={() => {
                          hapticLight();
                          if (isSelected) setVerifiedLocation(null);
                          else setVerifiedLocation(item);
                        }}
                      >
                        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                          <Feather name="map-pin" size={18} color="#000" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{item.name}</Text>
                          <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{item.address}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={(!loadingVerifiedResults && verifiedResults.length === 0 && verifiedOptions.length === 0) ? <Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results found</Text> : null}
                />
                
                <View style={{ 
                  flexDirection: 'row', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  paddingVertical: 16, 
                  borderTopWidth: 1, 
                  borderTopColor: '#f0f0f0' 
                }}>
                  <TouchableOpacity onPress={closeVerifiedModal}>
                    <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      onPress={closeVerifiedModal}
                      style={{ backgroundColor: '#000', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={closeVerifiedModal}
                      style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
        {/* Tag People Modal */}
        <Modal 
          visible={showTagModal} 
          animationType="slide" 
          transparent 
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={() => setShowTagModal(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            enabled={Platform.OS === 'ios'}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={iosSheetKeyboardOffset}
          >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowTagModal(false)} />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              maxHeight: getModalHeight(0.85),
              minHeight: 450,
              overflow: 'hidden'
            }}>
              <View 
                {...tagSheetPan.panHandlers}
                style={{ paddingHorizontal: 20, paddingTop: 16 }}
              >
                <View 
                  style={{ width: '100%', height: 32, justifyContent: 'center' }}
                >
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
                </View>
                <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 20, color: '#000', textAlign: 'center' }}>Tag someone</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
                  <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 15, color: '#000' }}
                    placeholder="Search"
                    placeholderTextColor="#666"
                    value={userSearch}
                    onChangeText={async (text) => {
                      setUserSearch(text);
                      setLoadingUserResults(true);
                      const result = await searchUsers(text, 20);
                      if (result.success) {
                        setUserResults(result.data.map((u: any) => ({
                          uid: String(u?._id || u?.firebaseUid || u?.uid || u?.id || ''),
                          displayName: u?.displayName,
                          userName: u?.userName,
                          photoURL: u?.photoURL || u?.avatar || null,
                        })).filter((uu: any) => typeof uu?.uid === 'string' && uu.uid.trim().length > 0));
                      } else {
                        setUserResults([]);
                      }
                      setLoadingUserResults(false);
                    }}
                  />
                </View>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                {loadingUserResults ? (
                  <ActivityIndicator size="small" color="#0095f6" style={{ marginTop: 20 }} />
                ) : (
                  <FlatList
                    data={userResults}
                    keyExtractor={item => item.uid}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1 }}
                    renderItem={({ item }) => {
                      const isSelected = taggedUsers.some(u => u.uid === item.uid);
                      return (
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                          onPress={() => {
                            hapticLight();
                            if (!isSelected) setTaggedUsers([...taggedUsers, item]);
                            else setTaggedUsers(taggedUsers.filter(u => u.uid !== item.uid));
                          }}
                        >
                          <Image source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }} style={{ width: 44, height: 44, borderRadius: 16, marginRight: 16, backgroundColor: '#eee' }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, fontWeight: '400', color: '#111' }} numberOfLines={1}>{item.displayName || item.userName || item.uid}</Text>
                            {!!item.userName && <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={1}>@{item.userName}</Text>}
                          </View>
                          {isSelected && (
                            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' }}>
                              <Feather name="check" size={14} color="#fff" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                    contentContainerStyle={{ paddingBottom: 20 }}
                  />
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                  <TouchableOpacity onPress={() => setShowTagModal(false)}>
                    <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowTagModal(false)}
                    style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          </KeyboardAvoidingView>
        </Modal>
        {/* Visibility Modal */}
        <Modal 
          visible={showVisibilityModal} 
          animationType="slide" 
          transparent 
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={() => setShowVisibilityModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowVisibilityModal(false)} />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              minHeight: 300
            }}>
              <View 
                {...visibilitySheetPan.panHandlers}
                style={{ width: '100%', marginBottom: 8 }}
              >
                <View 
                  style={{ width: '100%', height: 32, justifyContent: 'center' }}
                >
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center' }} />
                </View>
                <Text style={{ fontWeight: '500', fontSize: 16, color: '#000', textAlign: 'center' }}>Post visibility</Text>
              </View>

              {/* Visibility options: Everyone + real groups */}
              {[
                { label: 'Everyone', type: 'everyone', groupId: null },
                ...userGroups.map(g => ({
                  label: g.name,
                  type: g.type,
                  groupId: g._id,
                })),
              ].map((option) => {
                const isSelected = option.groupId
                  ? selectedGroupId === option.groupId
                  : visibility === 'Everyone' && !selectedGroupId;
                const iconName =
                  option.type === 'everyone' ? 'globe'
                    : option.type === 'friends' ? 'users'
                      : option.type === 'family' ? 'home'
                        : 'layers';
                return (
                  <TouchableOpacity
                    key={option.groupId || 'everyone'}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                    onPress={() => {
                      hapticLight();
                      if (option.groupId) {
                        setVisibility(option.label);
                        setSelectedGroupId(option.groupId);
                      } else {
                        setVisibility('Everyone');
                        setSelectedGroupId(null);
                      }
                      setShowVisibilityModal(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: isSelected ? '#0095f6' : '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                        <Feather name={iconName as any} size={20} color={isSelected ? '#fff' : '#000'} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{option.label}</Text>
                        {option.groupId && (
                          <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            {userGroups.find(g => g._id === option.groupId)?.members?.length ?? 0} members
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0095f6', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="check" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Footer Buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                <TouchableOpacity
                  onPress={() => {
                    hapticLight();
                    setShowVisibilityModal(false);
                  }}
                >
                  <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowVisibilityModal(false)}
                  style={{ backgroundColor: '#0095f6', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 99 }}>
          <ActivityIndicator size="large" color="#FFB800" />
        </View>
      )}
    </SafeAreaView>
  );
}
