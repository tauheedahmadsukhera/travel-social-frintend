import { DEFAULT_AVATAR_URL } from '../lib/api';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { compressVideoSafe, compressImageSafe } from '../lib/mediaUtils';

import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@/src/_components/UserContext';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
// import {} from '../lib/firebaseHelpers';
import { GOOGLE_MAPS_CONFIG } from '../config/environment';
import { createPost, createStory, DEFAULT_CATEGORIES, ensureDefaultCategories, getCategories, getPassportTickets, searchUsers } from '../lib/firebaseHelpers/index';
import { getCategoryImageSource } from '../lib/categoryImages';
import { compressImage } from '../lib/imageCompressor';
import { extractHashtags, trackHashtag } from '../lib/mentions';
import { startTrace } from '../lib/perf';
import { mapService } from '../services';
import { apiService } from '@/src/_services/apiService';
import { getKeyboardOffset, getModalHeight } from '../utils/responsive';

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

const isVideoUri = (uri: string) => {
  const lower = String(uri || '').toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.includes('video');
};

export default function CreatePostScreen() {
  const router = useRouter();
  const user = useUser();
  const [step, setStep] = useState<'picker' | 'details'>('picker');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const insets = useSafeAreaInsets();
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
  const previewRatioCacheRef = useRef<Map<string, number>>(new Map());
  const activePreviewUriRef = useRef<string | null>(null);
  const previewReqIdRef = useRef(0);
  const [networkError, setNetworkError] = useState<boolean>(false);
  const [postType, setPostType] = useState<'POST' | 'STORY'>('POST');
  const { selectedImages: paramImages, postType: paramPostType, step: paramStep } = useLocalSearchParams();

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

  // Gallery
  const [galleryAssets, setGalleryAssets] = useState<GalleryAsset[]>([]);
  const [galleryEndCursor, setGalleryEndCursor] = useState<string | undefined>(undefined);
  const [hasMoreGallery, setHasMoreGallery] = useState(true);
  const [loadingGallery, setLoadingGallery] = useState<boolean>(false);
  const [loadingMoreGallery, setLoadingMoreGallery] = useState<boolean>(false);

  // Category
  // Map DEFAULT_CATEGORIES to objects for UI
  const defaultCategoryObjects = Array.isArray(DEFAULT_CATEGORIES)
    ? DEFAULT_CATEGORIES.map((cat: any) => {
      if (typeof cat === 'string') {
        return { name: cat, image: 'https://via.placeholder.com/80x80/FFB800/ffffff?text=' + encodeURIComponent(cat) };
      }
      let image = cat.image || 'https://via.placeholder.com/80x80/FFB800/ffffff?text=' + encodeURIComponent(cat.name);
      if (!image.includes('?')) {
        image += '?w=80&h=80&fit=crop';
      }
      return { name: cat.name, image };
    })
    : [];
  const [categories, setCategories] = useState<{ name: string; image: string }[]>(defaultCategoryObjects);
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
        const cats = await apiService.getCategories();
        const mappedCats = Array.isArray(cats?.data)
          ? cats.data.map((c: any) => {
            if (typeof c === 'string') return { name: c, image: '' };
            return {
              name: typeof c.name === 'string' ? c.name : '',
              image: typeof c.image === 'string' ? c.image : ''
            };
          }).filter((c: any) => c.name)
          : [];
        setCategories(mappedCats.length > 0 ? mappedCats : defaultCategoryObjects);
      } catch (error) {
        console.error('[CreatePost] Failed to load categories:', error);
        setCategories(defaultCategoryObjects);
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
    setLoading(true);
    try {
      const mediaType = selectedImages.length > 0 && isVideoUri(selectedImages[0]) ? 'video' : 'image';
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
            console.warn(`âš ï¸ Failed to track hashtag ${hashtag}:`, error);
          }
        }
      }

      if (result && result.success) {
        console.log('âœ… Post created successfully! ID:', result.postId);
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
        Alert.alert('Success', 'Post created successfully!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        console.error('âŒ Post creation failed:', result.error);
        Alert.alert('Error', result.error || 'Failed to create post');
      }
    } catch (error: any) {
      console.error('âŒ Exception during post creation:', error);
      Alert.alert('Error', error.message || 'Failed to create post');
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

  // Helper to get video thumbnail
  const getVideoThumbnail = async (uri: string): Promise<string | null> => {
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(uri);
      return assetInfo?.filename ? uri : null;
    } catch {
      return null;
    }
  };

  // --- END OF COMPONENT ---
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={["top"]}>
        {step === 'picker' ? (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 16 }}>
              <TouchableOpacity
                onPress={() => router.back()}
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
                <View style={{ width: windowWidth, height: PICKER_IMAGE_HEIGHT, backgroundColor: '#f0f0f0' }}>
                  {selectedImages.length > 0 ? (
                    <Image source={{ uri: selectedImages[previewIndex] || selectedImages[0] }} style={{ width: windowWidth, height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <Feather name="image" size={48} color="#ccc" />
                    </View>
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
                          if (isSelected) {
                            setSelectedImages(selectedImages.filter((img) => img !== item.uri));
                          } else {
                            if (postType === 'STORY') {
                              setSelectedImages([item.uri]);
                            } else if (item.mediaType === 'video') {
                              setSelectedImages([item.uri]);
                            } else {
                              const hasVideoAlready = selectedImages.some((u) => isVideoUri(u));
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
              <TouchableOpacity onPress={() => setSelectedImages([])}>
                <Text style={{ color: '#000', fontWeight: '500', fontSize: 18 }}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (postType === 'STORY' && selectedImages.length > 0) {
                    // Navigate directly to story-upload for STORY
                    router.push({
                      pathname: '/story-upload',
                      params: {
                        storyMediaUri: selectedImages[0],
                        storyMediaType: isVideoUri(selectedImages[0]) ? 'video' : 'photo',
                        storyTextOverlays: '',
                      },
                    });
                  } else {
                    // Go to details form for POST
                    setStep('details');
                  }
                }}
                disabled={selectedImages.length === 0}
                style={{
                  backgroundColor: selectedImages.length > 0 ? '#0A3D62' : '#eee',
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
        ) : (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {/* Details Header - Outside KeyboardAvoidingView to stay fixed */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 }}>
              <TouchableOpacity
                onPress={() => paramPostType ? router.back() : setStep('picker')}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={20} color="#333" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontWeight: '500', fontSize: 18, color: '#000' }}>New {postType === 'STORY' ? 'Story' : 'Post'}</Text>
              </View>
              <TouchableOpacity onPress={handleShare} style={{ paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
                <Text style={{ color: '#0095f6', fontWeight: '500', fontSize: 16 }}>Share</Text>
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={getKeyboardOffset()}
              style={{ flex: 1 }}
            >
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Media Preview Area (top) */}
              <View style={{ width: windowWidth, height: DETAILS_IMAGE_HEIGHT, backgroundColor: '#f0f0f0', marginBottom: 10 }}>
                {selectedImages.length > 0 ? (
                  <Image
                    source={{ uri: selectedImages[previewIndex] || selectedImages[0] }}
                    style={{ width: windowWidth, height: '100%' }}
                    resizeMode="cover"
                  />
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
                          <View key={tag} style={{ backgroundColor: '#0A3D62', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }}>
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>#{tag}</Text>
                            <TouchableOpacity 
                              onPress={() => setHashtags(hashtags.filter(t => t !== tag))} 
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
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowCategoryModal(true)}>
                  <Feather name="bookmark" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Add a category for the home feed</Text>
                    {selectedCategories.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {selectedCategories.map(cat => (
                          <View key={cat.name} style={{ backgroundColor: '#f2f2f2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ color: '#111', fontWeight: '500', fontSize: 13 }}>{cat.name}</Text>
                            <TouchableOpacity
                              onPress={() => setSelectedCategories(selectedCategories.filter(c => c.name !== cat.name))}
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
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowLocationModal(true)}>
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
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowVerifiedModal(true)}>
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
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowTagModal(true)}>
                  <Feather name="user-plus" size={20} color="#000" style={{ marginRight: 16 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#111', fontSize: 16, fontWeight: '500' }}>Tag people</Text>
                    {taggedUsers.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {taggedUsers.map(u => (
                          <View key={u.uid} style={{ backgroundColor: '#0A3D62', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }}>
                            <Image source={{ uri: u.photoURL || DEFAULT_AVATAR_URL }} style={{ width: 20, height: 20, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} />
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{u.displayName || u.userName || u.uid}</Text>
                            <TouchableOpacity 
                              onPress={() => setTaggedUsers(taggedUsers.filter(tu => tu.uid !== u.uid))} 
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
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }} onPress={() => setShowVisibilityModal(true)}>
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
              <TouchableOpacity onPress={() => { setSelectedImages([]); setStep('picker'); }}>
                <Text style={{ color: '#000', fontWeight: '500', fontSize: 18 }}>Clear all</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                style={{
                  backgroundColor: '#0095f6',
                  paddingHorizontal: 40,
                  paddingVertical: 8,
                  borderRadius: 12
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '500', fontSize: 18 }}>Share</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
        {/* Modals would go here, omitted for brevity */}
        {/* Category Modal */}
        <Modal visible={showCategoryModal} animationType="slide" transparent onRequestClose={() => setShowCategoryModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              height: getModalHeight(0.70)
            }}>
              {/* Handle bar */}
              <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

              {/* Header */}
              <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 8, color: '#000', textAlign: 'center' }}>Add a category</Text>
              <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 }}>
                This will help people find your post in the home feed.
              </Text>

              {/* Search Bar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' }}>
                <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: '#000' }}
                  placeholder="Search"
                  placeholderTextColor="#666"
                  value={categorySearch}
                  onChangeText={setCategorySearch}
                />
              </View>

              {/* List */}
              <FlatList
                data={categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()))}
                keyExtractor={item => item.name}
                renderItem={renderCategoryItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 10 }}
              />

              {/* Footer Buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                  <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={{ backgroundColor: '#0A3D62', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        {/* Location Modal */}
        <Modal visible={showLocationModal} animationType="slide" transparent onRequestClose={() => setShowLocationModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              height: getModalHeight(0.70)
            }}>
                  {/* Handle bar */}
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

                  <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 20, color: '#000', textAlign: 'center' }}>Choose a location to tag</Text>

                  {/* Search Bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' }}>
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

                  {loadingLocationResults ? (
                    <ActivityIndicator size="small" color="#0A3D62" />
                  ) : (
                    <FlatList
                      data={locationResults}
                      keyExtractor={(item, idx) => String(item.placeId || item.name || idx)}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => {
                        const isSelected = location?.placeId === item.placeId || location?.name === item.name;
                        return (
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                            onPress={() => {
                              if (isSelected) {
                                setLocation(null);
                              } else {
                                setLocation(item);
                              }
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
                    />
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                    <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                      <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowLocationModal(false)} style={{ backgroundColor: '#0A3D62', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
        {/* Verified Location Modal */}
        <Modal visible={showVerifiedModal} animationType="slide" transparent onRequestClose={() => setShowVerifiedModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              height: getModalHeight(0.70)
            }}>
                  {/* Handle bar */}
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <Feather name="lock" size={16} color="#000" style={{ marginRight: 8 }} />
                    <Text style={{ fontWeight: '500', fontSize: 16, color: '#000' }}>Add a verified location</Text>
                  </View>
                  <Text style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 }}>
                    To add a verified location you must be within 50 meters.
                  </Text>

                  {/* Search Bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' }}>
                    <Feather name="search" size={18} color="#000" style={{ marginRight: 10 }} />
                    <TextInput
                      style={{ flex: 1, fontSize: 15, color: '#000' }}
                      placeholder="Search"
                      placeholderTextColor="#666"
                      value={verifiedSearch}
                      onChangeText={setVerifiedSearch}
                    />
                  </View>

                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: '#111', marginBottom: 8 }}>Nearby (100m)</Text>
                    {verifiedCenter ? null : (
                      <Text style={{ color: '#888', marginBottom: 12, textAlign: 'center' }}>Enable location permission to see nearby verified places.</Text>
                    )}

                    {loadingVerifiedResults ? (
                      <ActivityIndicator size="small" color="#0A3D62" style={{ marginVertical: 10 }} />
                    ) : (
                      <FlatList
                        data={verifiedResults}
                        scrollEnabled={false}
                        keyExtractor={(item, idx) => String(item.placeId || (item.name + item.lat + item.lon) || idx)}
                        renderItem={({ item }) => {
                          const isSelected = verifiedLocation?.name === item.name;
                          return (
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                              onPress={() => {
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
                        ListEmptyComponent={<Text style={{ color: '#888', marginTop: 6, textAlign: 'center' }}>No nearby locations found</Text>}
                      />
                    )}

                    <Text style={{ fontWeight: '700', fontSize: 14, color: '#111', marginTop: 18, marginBottom: 8 }}>Passport / GPS</Text>
                    <FlatList
                      data={verifiedOptions}
                      scrollEnabled={false}
                      keyExtractor={(item, idx) => String((item.name + item.lat + item.lon) || idx)}
                      renderItem={({ item }) => {
                        const isSelected = verifiedLocation?.name === item.name;
                        return (
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                            onPress={() => {
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
                      ListEmptyComponent={<Text style={{ color: '#888', marginTop: 6, textAlign: 'center' }}>No verified locations found</Text>}
                    />
                  </ScrollView>

                  {/* Footer Buttons */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                    <TouchableOpacity onPress={() => setShowVerifiedModal(false)}>
                      <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => setShowVerifiedModal(false)} style={{ backgroundColor: '#000', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 }}>
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowVerifiedModal(false)} style={{ backgroundColor: '#0A3D62', borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 }}>
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </Modal>
        {/* Tag People Modal */}
        <Modal visible={showTagModal} animationType="slide" transparent onRequestClose={() => setShowTagModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              height: getModalHeight(0.70)
            }}>
                  {/* Handle bar */}
                  <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                  <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 20, color: '#000', textAlign: 'center' }}>Tag someone</Text>

                  {/* Search Bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' }}>
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
                  {loadingUserResults ? (
                    <ActivityIndicator size="small" color="#0A3D62" />
                  ) : (
                    <FlatList
                      data={userResults}
                      keyExtractor={item => item.uid}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => {
                        const isSelected = taggedUsers.some(u => u.uid === item.uid);
                        return (
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, backgroundColor: isSelected ? '#f2f2f2' : 'transparent', borderRadius: 12, marginBottom: 4 }}
                            onPress={() => {
                              if (!isSelected) {
                                setTaggedUsers([...taggedUsers, item]);
                              } else {
                                setTaggedUsers(taggedUsers.filter(u => u.uid !== item.uid));
                              }
                            }}
                          >
                            <Image
                              source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }}
                              style={{ width: 44, height: 44, borderRadius: 16, marginRight: 16, backgroundColor: '#eee' }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '400', color: '#111' }} numberOfLines={1}>
                                {item.displayName || item.userName || item.uid}
                              </Text>
                              {!!item.userName && (
                                <Text style={{ fontSize: 13, color: '#666', marginTop: 2 }} numberOfLines={1}>
                                  @{item.userName}
                                </Text>
                              )}
                            </View>
                            {isSelected && (
                              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A3D62', alignItems: 'center', justifyContent: 'center' }}>
                                <Feather name="check" size={14} color="#fff" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }}
                      ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                    />
                  )}
                  {/* Footer Buttons */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                    <TouchableOpacity onPress={() => setShowTagModal(false)}>
                      <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowTagModal(false)} style={{ backgroundColor: '#0A3D62', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
        {/* Visibility Modal */}
        <Modal visible={showVisibilityModal} animationType="slide" transparent onRequestClose={() => setShowVisibilityModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 32,
              minHeight: 300
            }}>
              {/* Handle bar */}
              <View style={{ width: 40, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
              <Text style={{ fontWeight: '500', fontSize: 16, marginBottom: 24, color: '#000', textAlign: 'center' }}>Post visibility</Text>

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
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: isSelected ? '#0A3D62' : '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
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
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A3D62', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="check" size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* Footer Buttons */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, paddingHorizontal: 4 }}>
                <TouchableOpacity onPress={() => setShowVisibilityModal(false)}>
                  <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowVisibilityModal(false)} style={{ backgroundColor: '#0A3D62', borderRadius: 6, paddingHorizontal: 24, paddingVertical: 10 }}>
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

