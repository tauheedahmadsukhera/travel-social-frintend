import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
    import * as MediaLibrary from 'expo-media-library';
    import * as ImagePicker from 'expo-image-picker';
    import * as VideoThumbnails from 'expo-video-thumbnails';
import { useUser } from '@/src/components/UserContext';
import { useAppDialog } from '@/src/components/AppDialogProvider';
import { apiService } from '@/src/services/apiService';
import { getAuthenticatedUserId } from '../lib/currentUser';
import { extractHashtags, trackHashtag } from '../lib/mentions';
import { createPost, updatePost, createStory, searchUsers, getCategories, DEFAULT_CATEGORIES, getPassportTickets } from '../lib/firebaseHelpers/index';
import { getPostById } from '../lib/firebaseHelpers/post';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { hapticLight, hapticMedium, hapticSuccess } from '../lib/haptics';
import { getCachedData, setCachedData } from '../hooks/useOffline';
import { startTrace } from '../lib/perf';
import { GOOGLE_MAPS_CONFIG } from '../config/environment';
import { mapService } from '@/src/services';

const { width } = Dimensions.get('window');

export type LocationType = {
  name: string;
  address: string;
  placeId?: string;
  lat: number;
  lon: number;
  verified?: boolean;
};

export type UserType = {
  uid: string;
  displayName?: string;
  userName?: string;
  photoURL?: string | null;
};

export type GalleryAsset = {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  duration?: number;
  width?: number;
  height?: number;
};

export const isVideoUri = (uri: string, galleryAssets?: GalleryAsset[]) => {
  if (!uri) return false;
  
  if (galleryAssets && Array.isArray(galleryAssets)) {
    const found = galleryAssets.find(a => a.uri === uri || a.id === uri);
    if (found) {
      return found.mediaType === 'video';
    }
  }

  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')) return false;
  return (
    lower.endsWith('.mp4') || 
    lower.endsWith('.mov') || 
    lower.endsWith('.m4v') ||
    lower.endsWith('.3gp') ||
    lower.endsWith('.mkv') ||
    lower.includes('video') ||
    lower.includes('imagepicker') ||
    lower.includes('ExponentExperienceData')
  );
};

export const useCreatePost = (params: any = {}) => {
  const router = useRouter();
  const user = useUser();
  
  // --- CORE STATE ---
  const [step, setStep] = useState<'picker' | 'preview' | 'details'>(params.editPostId ? 'details' : (params.step || 'picker'));
  const [loading, setLoading] = useState(false);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [visibility, setVisibility] = useState('Everyone');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userGroups, setUserGroups] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [cameraAssetDimensions, setCameraAssetDimensions] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [location, setLocation] = useState<LocationType | null>(null);
  const [verifiedLocation, setVerifiedLocation] = useState<LocationType | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<UserType[]>([]);
  const [postType, setPostType] = useState(params.postType || 'POST');
  const [selectedCategories, setSelectedCategories] = useState<any[]>([]);
  
  // --- MODAL & SEARCH STATES ---
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<LocationType[]>([]);
  const [loadingLocationResults, setLoadingLocationResults] = useState(false);
  
  const [verifiedSearch, setVerifiedSearch] = useState('');
  const [verifiedResults, setVerifiedResults] = useState<LocationType[]>([]);
  const [loadingVerifiedResults, setLoadingVerifiedResults] = useState(false);
  const [verifiedOptions, setVerifiedOptions] = useState<LocationType[]>([]);
  const [verifiedCenter, setVerifiedCenter] = useState<any>(null);
  
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<UserType[]>([]);
  const [loadingUserResults, setLoadingUserResults] = useState(false);
  
  const [categorySearch, setCategorySearch] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  
  // --- GALLERY ---
  const [galleryAssets, setGalleryAssets] = useState<GalleryAsset[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [galleryEndCursor, setGalleryEndCursor] = useState<string>();
  const [hasMoreGallery, setHasMoreGallery] = useState(true);

  // --- REFS ---
  const locationTimer = useRef<any>();
  const verifiedTimer = useRef<any>();
  const userTimer = useRef<any>();

  // --- LOGIC ---
  const loadGalleryAssets = async (after?: string) => {
    if (after) setLoadingGallery(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' && (status as any) !== 'limited') return;
      const page = await MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: 30,
        after
      });
      const mapped: GalleryAsset[] = page.assets.map((a: any) => ({
        id: String(a.id),
        uri: String(a.uri),
        mediaType: (a.mediaType === 'video' ? 'video' : 'photo') as "photo" | "video",
        duration: a.duration,
        width: a.width,
        height: a.height
      }));
      setGalleryAssets(prev => after ? [...prev, ...mapped] : mapped);
      setGalleryEndCursor(page.endCursor);
      setHasMoreGallery(page.hasNextPage);
    } catch {} finally { setLoadingGallery(false); }
  };

  const handleLocationSearch = (text: string) => {
    setLocationSearch(text);
    if (locationTimer.current) clearTimeout(locationTimer.current);
    locationTimer.current = setTimeout(async () => {
      if (text.length < 2) return setLocationResults([]);
      setLoadingLocationResults(true);
      try {
        const suggestions = await mapService.getAutocompleteSuggestions(text);
        setLocationResults(suggestions.map((s: any) => ({
          name: s.description.split(',')[0],
          address: s.description,
          placeId: s.placeId,
          lat: 0, lon: 0
        })));
      } catch { setLocationResults([]); } finally { setLoadingLocationResults(false); }
    }, 400);
  };

  const handleVerifiedSearch = (text: string) => {
    setVerifiedSearch(text);
    if (verifiedTimer.current) clearTimeout(verifiedTimer.current);
    verifiedTimer.current = setTimeout(async () => {
      if (text.length < 2) return setVerifiedResults([]);
      setLoadingVerifiedResults(true);
      try {
        const suggestions = await mapService.getAutocompleteSuggestions(text);
        setVerifiedResults(suggestions.map((s: any) => ({
          name: s.description.split(',')[0],
          address: s.description,
          placeId: s.placeId,
          lat: 0, lon: 0,
          verified: true
        })));
      } catch { setVerifiedResults([]); } finally { setLoadingVerifiedResults(false); }
    }, 400);
  };



  const fetchNearbyVerifiedLocations = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const center = { lat: currentLoc.coords.latitude, lon: currentLoc.coords.longitude };
      setVerifiedCenter(center);

      // Fetch address for current location
      let currentAddress = `GPS: ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`;
      let locationName = 'Current Location';
      
      try {
        const addressRes = await mapService.reverseGeocode(center.lat, center.lon);
        if (addressRes) {
          if (addressRes.address) {
            currentAddress = addressRes.address;
            // Extract a clean name (exclude plus codes and use first part of address)
            const parts = addressRes.address.split(',');
            const firstPart = parts[0].trim();
            // Simple check to skip plus codes (usually contain '+')
            if (!firstPart.includes('+')) {
              locationName = firstPart;
            } else if (addressRes.city) {
              locationName = addressRes.city;
            } else if (parts.length > 1) {
              locationName = parts[1].trim();
            }
          }
          if (addressRes.placeName) {
            locationName = addressRes.placeName;
          }
        }
      } catch {}

      // 1. Fetch nearby from map service (Nearby 100m)
      setLoadingVerifiedResults(true);
      const nearby = await mapService.getNearbyPlaces(center.lat, center.lon, 100);
      
      // Map results, replacing Plus Codes with actual area/street names
      const validNearby = nearby.map((p: any) => {
        let displayName = p.name;
        
        // If the name is a Plus Code (contains '+')
        if (displayName && displayName.includes('+')) {
          const fallbackStr = p.address || p.vicinity || '';
          const parts = fallbackStr.split(',');
          
          // Try to get a clean part of the address that isn't a Plus Code
          const cleanPart = parts.find((part: string) => part.trim() !== '' && !part.includes('+'));
          
          if (cleanPart) {
            displayName = cleanPart.trim();
          } else {
            displayName = 'Nearby Location';
          }
        }

        return {
          name: displayName,
          address: p.address || p.vicinity,
          lat: p.latitude || p.lat || p.geometry?.location?.lat,
          lon: p.longitude || p.lon || p.geometry?.location?.lng,
          placeId: p.placeId || p.place_id,
          verified: true
        };
      });
        
      setVerifiedResults(validNearby);

      // 2. Prepare verified options (GPS + Passport)
      const options: LocationType[] = [];
      
      // Always add current GPS as an option
      options.push({
        name: locationName,
        address: currentAddress,
        lat: center.lat,
        lon: center.lon,
        verified: true
      });

      // Fetch passport tickets / verified options from backend
      const authUserId = await getAuthenticatedUserId();
      if (authUserId) {
        const tickets = await getPassportTickets(authUserId);
        if (Array.isArray(tickets)) {
          tickets.forEach((t: any) => {
            options.push({
              name: t.name,
              address: t.address,
              lat: t.lat,
              lon: t.lon,
              verified: true
            });
          });
        }
      }
      
      setVerifiedOptions(options);
    } catch (e) {
      console.error('[fetchNearbyVerifiedLocations] Error:', e);
    } finally {
      setLoadingVerifiedResults(false);
    }
  };

  const handleUserSearch = (text: string) => {
    setUserSearch(text);
    if (userTimer.current) clearTimeout(userTimer.current);
    userTimer.current = setTimeout(async () => {
      setLoadingUserResults(true);
      try {
        const result = await searchUsers(text, 20);
        if (result.success) setUserResults(result.data);
      } catch { setUserResults([]); } finally { setLoadingUserResults(false); }
    }, 400);
  };

  const handleCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 2520, // 42 minutes in seconds
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const firstAsset = result.assets[0];
        
        // Append newly captured asset to galleryAssets state so isVideoUri resolves it cleanly
        const newAsset: GalleryAsset = {
          id: firstAsset.uri,
          uri: firstAsset.uri,
          mediaType: firstAsset.type === 'video' ? 'video' : 'photo',
          width: firstAsset.width,
          height: firstAsset.height,
          duration: firstAsset.duration || undefined
        };
        setGalleryAssets(prev => [newAsset, ...prev]);

        setSelectedImages([firstAsset.uri]);
        if (firstAsset.width && firstAsset.height) {
          setCameraAssetDimensions({
            uri: firstAsset.uri,
            width: firstAsset.width,
            height: firstAsset.height
          });
        }
        setStep('preview');
      }
    } catch (e) {
      console.error('[handleCamera] Error:', e);
    }
  };

  const handleHashtagCommit = () => {
    if (!hashtagInput.trim()) return;
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (!hashtags.includes(tag)) {
      setHashtags(prev => [...prev, tag]);
    }
    setHashtagInput('');
    hapticLight();
  };

  const handleShare = async () => {
    if (!selectedImages || selectedImages.length === 0) {
      Alert.alert('No media', 'Please select at least one image or video.');
      return;
    }

    setLoading(true);
    try {
      hapticMedium();
      const authUserId = await getAuthenticatedUserId();
      if (!authUserId) throw new Error('User not authenticated');

      const isVideo = isVideoUri(selectedImages[0], galleryAssets);
      
      const firstUri = selectedImages[0];
      let finalAspectRatio: number | undefined = undefined;
      if (cameraAssetDimensions && cameraAssetDimensions.uri === firstUri) {
        finalAspectRatio = cameraAssetDimensions.width / cameraAssetDimensions.height;
      } else {
        const matchedAsset = galleryAssets.find(a => a.uri === firstUri);
        if (matchedAsset && matchedAsset.width && matchedAsset.height) {
          finalAspectRatio = matchedAsset.width / matchedAsset.height;
        }
      }
      
      // Automatically commit any typed hashtag that wasn't submitted via keyboard enter
      let finalHashtags = [...hashtags];
      if (hashtagInput.trim()) {
        const tag = hashtagInput.trim().replace(/^#/, '');
        if (tag && !finalHashtags.includes(tag)) {
          finalHashtags.push(tag);
        }
      }

      let res;
      if (params.editPostId) {
        res = await updatePost(
          params.editPostId as string,
          authUserId,
          selectedImages,
          caption,
          verifiedLocation?.name || location?.name || '',
          isVideo ? 'video' : 'image',
          verifiedLocation || location || undefined,
          taggedUsers.map(u => u.uid),
          selectedCategories.length > 0 ? selectedCategories[0].name : undefined,
          finalHashtags,
          [], // mentions
          visibility,
          selectedGroupId ? [selectedGroupId] : [],
          postType === 'STORY' ? 'story' : 'post',
          undefined, // thumbnailUrlRaw
          finalAspectRatio
        );
      } else {
        res = await createPost(
          authUserId,
          selectedImages,
          caption,
          verifiedLocation?.name || location?.name || '',
          isVideo ? 'video' : 'image',
          verifiedLocation || location || undefined,
          taggedUsers.map(u => u.uid),
          selectedCategories.length > 0 ? selectedCategories[0].name : undefined,
          finalHashtags,
          [], // mentions
          visibility,
          selectedGroupId ? [selectedGroupId] : [],
          postType === 'STORY' ? 'story' : 'post',
          undefined, // thumbnailUrlRaw
          finalAspectRatio
        );
      }

      if (res && res.success) {
        hapticSuccess();
        if (params.editPostId) {
          feedEventEmitter.emitFeedUpdate({
            type: 'POST_UPDATED',
            postId: params.editPostId as string,
            data: {
              caption: caption,
              text: caption,
              category: selectedCategories.length > 0 ? selectedCategories[0].name : undefined,
              hashtags: finalHashtags
            }
          });
        } else {
          feedEventEmitter.emitFeedUpdate({ type: 'POST_CREATED', postId: res.postId });
        }
        router.replace('/(tabs)/home');
      } else {
        throw new Error(res?.error || 'Failed to create post');
      }
    } catch (e: any) {
      console.error('[handleShare] ❌ Error:', e);
      // Log response error if available
      if (e.response) {
        console.error('[handleShare] Response status:', e.response.status);
        console.error('[handleShare] Response data:', JSON.stringify(e.response.data, null, 2));
      }
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const loadPostForEditing = async (postId: string) => {
    setLoading(true);
    try {
      const res = await getPostById(postId);
      const post = res?.data || res;
      if (post && (res?.success !== false)) {
        setCaption(post.caption || post.content || '');
        setSelectedImages(post.mediaUrls || post.images || []);
        if (post.hashtags && Array.isArray(post.hashtags)) setHashtags(post.hashtags);
        if (post.locationData) {
          setLocation({
            name: post.locationData.name || post.location || '',
            address: post.locationData.address || '',
            lat: post.locationData.lat || 0,
            lon: post.locationData.lon || 0,
            placeId: post.locationData.placeId,
            verified: post.locationData.verified,
          });
          if (post.locationData.verified) {
            setVerifiedLocation({
              name: post.locationData.name || post.location || '',
              address: post.locationData.address || '',
              lat: post.locationData.lat || 0,
              lon: post.locationData.lon || 0,
              placeId: post.locationData.placeId,
              verified: true,
            });
          }
        } else if (post.location) {
          setLocation({ name: post.location, address: '', lat: 0, lon: 0 });
        }
        if (post.visibility) setVisibility(post.visibility);
        if (post.category) {
          // If category is a string, we might need to match it with our category list
          setSelectedCategories([{ name: post.category }]);
        }
        if (post.type) {
          setPostType(post.type.toUpperCase());
        }
        if (Array.isArray(post.taggedUserIds) && post.taggedUserIds.length > 0) {
          // Map simple IDs to UserType objects (minimal info until fully fetched)
          const basicTagged = post.taggedUserIds.map((id: string) => ({
            uid: id,
            displayName: 'User', // Fallback
          }));
          setTaggedUsers(basicTagged);
        }
      }
    } catch (e) {
      console.error('[loadPostForEditing] Error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    // Initial load for creating a new post: we need the gallery
    if (!params.editPostId && step === 'picker') {
      loadGalleryAssets();
    }
    
    // Initial load for editing: just fetch the post data
    if (params.editPostId) {
      loadPostForEditing(params.editPostId as string);
    }

    // Fetch user groups for visibility selection
    (async () => {
      try {
        console.log('[useCreatePost] Starting group fetch...');
        const uid = await getAuthenticatedUserId();
        console.log('[useCreatePost] Got UID:', uid);
        
        if (uid) {
          // Pass a unique timestamp to bypass apiService GET deduplication
          const res = await apiService.get(`/groups?userId=${uid}&_t=${Date.now()}`, { bypassDedupe: true });
          console.log('[useCreatePost] Raw API Response:', JSON.stringify(res));
          
          if (res?.success && Array.isArray(res.data)) {
            console.log('[useCreatePost] Setting user groups:', res.data.length);
            setUserGroups(res.data);
          } else if (Array.isArray(res)) {
            console.log('[useCreatePost] Setting user groups (fallback):', res.length);
            setUserGroups(res);
          } else {
            console.warn('[useCreatePost] API returned unexpected format for groups');
          }
        }
      } catch (err) {
        console.error('[useCreatePost] Failed to fetch groups:', err);
      }
    })();
    // Fetch categories from database
    (async () => {
      try {
        const cats = await getCategories();
        if (Array.isArray(cats)) {
          const mapped = cats.map(c => typeof c === 'string' ? { name: c, image: '' } : c);
          setCategories(mapped);
        }
      } catch (err) {
        console.error('[useCreatePost] Failed to fetch categories:', err);
      }
    })();
  }, [params.editPostId, step]);

  return {
    step, setStep, loading, caption, setCaption, hashtags, setHashtags,
    hashtagInput, setHashtagInput, visibility, setVisibility,
    selectedGroupId, setSelectedGroupId, userGroups,
    selectedImages, setSelectedImages, location, setLocation,
    verifiedLocation, setVerifiedLocation, taggedUsers, setTaggedUsers,
    postType, setPostType, selectedCategories, setSelectedCategories,
    locationSearch, locationResults, loadingLocationResults, handleLocationSearch,
    verifiedSearch, setVerifiedSearch, verifiedResults, loadingVerifiedResults, verifiedOptions, verifiedCenter,
    userSearch, userResults, loadingUserResults, handleUserSearch,
    categorySearch, setCategorySearch, categories, setCategories,
    galleryAssets, loadingGallery, hasMoreGallery, galleryEndCursor, loadGalleryAssets,
    handleShare, handleHashtagCommit, handleCamera, handleVerifiedSearch, isEditMode: !!params.editPostId,
    fetchNearbyVerifiedLocations
  };
};
