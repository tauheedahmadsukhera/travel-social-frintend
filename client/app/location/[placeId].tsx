import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCard from '@/src/_components/PostCard';
import NotificationsModal from '@/src/_components/NotificationsModal';
import StoriesViewer from '@/src/_components/StoriesViewer';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
import { apiService } from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { hapticLight } from '../../lib/haptics';
import {
  extractStoryListFromResponseBody,
  hydrateStoryDocumentsIfNeeded,
  storyForStoriesViewer,
} from '../../lib/storyViewer';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { mapService } from '../../services/implementations/GoogleMapsService';


const { width } = Dimensions.get('window');


type Post = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  caption: string;
  locationName?: string;
  location?: string | { name?: string };
  locationData?: {
    name?: string;
    address?: string;
    lat?: number;
    lon?: number;
    verified?: boolean;
    city?: string;
    country?: string;
    countryCode?: string;
    placeId?: string;
    neighborhood?: string;
    sublocality?: string;
  };
  likes: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: any;
};

type Story = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  location?: string | { name?: string };
  locationData?: {
    name?: string;
    address?: string;
  };
  views?: string[];
  likes?: string[];
  comments?: any[];
};

type SubLocation = {
  name: string;
  count: number;
  thumbnail: string;
  posts: Post[];
  spots?: {
    name: string;
    thumbnail: string;
    posts: Post[];
  }[];
};

export default function LocationDetailsScreen() {
  const { placeId, locationName, locationAddress, scope, regionId, regionKey } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [placeDetails, setPlaceDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [selectedSubLocation, setSelectedSubLocation] = useState<string | null>(null);
  const [selectedSpecificSpot, setSelectedSpecificSpot] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [verifiedVisits, setVerifiedVisits] = useState(0);
  const [mostLikedPostImage, setMostLikedPostImage] = useState<string>('');
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Story[]>([]);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);

  // --- NEW: PAGINATION & SKELETON STATES ---
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 12;

  // Load current user
  useEffect(() => {
    const loadUser = async () => {
      const uid = await AsyncStorage.getItem('userId');
      if (uid) {
        setViewerId(uid);
        setCurrentUser({ uid, id: uid });
      }
    };
    loadUser();
  }, []);

  // Optimized Image Helper
  const getOptimizedUrl = (url: string, width = 800) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
  };

  // Premium Skeleton Component
  const LocationSkeleton = () => (
    <View style={{ padding: 20, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <View style={{ width: 80, height: 80, backgroundColor: '#f2f2f2', borderRadius: 28 }} />
        <View style={{ marginLeft: 15, flex: 1 }}>
          <View style={{ height: 20, width: '70%', backgroundColor: '#f2f2f2', borderRadius: 4, marginBottom: 8 }} />
          <View style={{ height: 15, width: '40%', backgroundColor: '#f2f2f2', borderRadius: 4 }} />
        </View>
      </View>
      <View style={{ height: 300, backgroundColor: '#f2f2f2', borderRadius: 16, width: '100%' }} />
    </View>
  );

  // Scroll animation state
  const safeTop = Math.max(insets.top, 12);
  const totalHeaderHeight = safeTop + 48; // Approx back button row height

  const headerHeightRef = React.useRef<number>(totalHeaderHeight);
  const animatedHeaderHeight = React.useRef(new Animated.Value(totalHeaderHeight)).current;
  const animatedHeaderTranslateY = React.useRef(new Animated.Value(0)).current;

  // Sync on mount or safe area change
  useEffect(() => {
    headerHeightRef.current = totalHeaderHeight;
    animatedHeaderHeight.setValue(totalHeaderHeight);
  }, [totalHeaderHeight, animatedHeaderHeight]);

  // Tracks last *applied* animation target (not initial UI state), so applyHeaderState(false) can run after a hide.
  const headerVisibilityAppliedRef = React.useRef<boolean | null>(null);

  const applyHeaderState = React.useCallback((hidden: boolean) => {
    if (headerVisibilityAppliedRef.current === hidden) return;
    headerVisibilityAppliedRef.current = hidden;
    const h = headerHeightRef.current;
    if (!h) return;
    // Same easing both ways avoids a “flash” when show/hide toggles near scroll top (bounce).
    const duration = 160;

    Animated.parallel([
      Animated.timing(animatedHeaderHeight, {
        toValue: hidden ? 0 : h,
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(animatedHeaderTranslateY, {
        toValue: hidden ? -h : 0,
        duration,
        useNativeDriver: false,
      }),
    ]).start();
  }, [animatedHeaderHeight, animatedHeaderTranslateY]);

  const lastScrollYRef = React.useRef(0);
  const lastEmitTsRef = React.useRef(0);

  const onStoryPress = (stories: Story[], initialIndex: number) => {
    setSelectedStories(stories);
    setShowStoriesViewer(true);
  };

  const regionIdStr = String(regionId || placeId || '').toLowerCase();
  const isRegionScope = String(scope || '').toLowerCase() === 'region';

  // Dynamic Geo-Scope detection
  const getGeoScope = React.useCallback((): 'CONTINENT' | 'COUNTRY' | 'CITY' | 'NEIGHBORHOOD' => {
    const name = String(locationName || '').toLowerCase().trim();
    const sc = String(scope || '').toLowerCase().trim();

    // Continent Detection
    const continents = ['europe', 'asia', 'africa', 'americas', 'oceania', 'america', 'antarctica'];
    if (sc === 'continent' || sc === 'region' || continents.includes(name)) {
      return 'CONTINENT';
    }

    // Country Detection
    if (sc === 'country') {
      return 'COUNTRY';
    }
    const countries = [
      'united kingdom', 'japan', 'pakistan', 'france', 'spain', 'italy', 'germany', 
      'united states', 'usa', 'canada', 'australia', 'brazil', 'india', 'china'
    ];
    if (countries.includes(name)) {
      return 'COUNTRY';
    }

    return 'CITY';
  }, [locationName, scope]);

  const extractCountryIntelligently = React.useCallback((post: any): string => {
    if (post?.locationData?.country && typeof post.locationData.country === 'string' && post.locationData.country.trim().length > 0) {
      return post.locationData.country.trim();
    }
    const fields = [
      post?.locationData?.address,
      post?.locationName,
      post?.location,
      post?.locationData?.name
    ];
    for (const f of fields) {
      if (f && typeof f === 'string') {
        const parts = f.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length > 0) {
          const lastPart = parts[parts.length - 1];
          if (isNaN(Number(lastPart)) && lastPart.toLowerCase() !== 'europe' && lastPart.toLowerCase() !== 'asia') {
            return lastPart;
          }
          if (parts.length > 1) {
            return parts[parts.length - 2];
          }
        }
      }
    }
    return 'General';
  }, []);

  const extractCityIntelligently = React.useCallback((post: any): string => {
    if (post?.locationData?.city && typeof post.locationData.city === 'string' && post.locationData.city.trim().length > 0) {
      return post.locationData.city.trim();
    }
    const fields = [
      post?.locationData?.address,
      post?.locationName,
      post?.location,
      post?.locationData?.name
    ];
    for (const f of fields) {
      if (f && typeof f === 'string') {
        const parts = f.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          if (parts.length === 2) {
            return parts[0];
          }
          const cityIndex = parts.length - 2;
          return parts[cityIndex];
        } else if (parts.length === 1) {
          return parts[0];
        }
      }
    }
    return 'General';
  }, []);

  const inferRegionKey = React.useCallback((rid: string, rname: string) => {
    const rawId = String(rid || '').trim().toLowerCase();
    const rawName = String(rname || '').trim().toLowerCase();
    if (rawId === 'americas' || rawName === 'americas') return 'americas';
    if (rawId === 'america' || rawName === 'america') return 'americas';
    if (rawId === 'europe' || rawName === 'europe') return 'europe';
    if (rawId === 'asia' || rawName === 'asia') return 'asia';
    if (rawId === 'africa' || rawName === 'africa') return 'africa';
    if (rawId === 'oceania' || rawName === 'oceania') return 'oceania';
    return '';
  }, []);

  const getCountriesForRegion = React.useCallback(
    async (rid: string, rname: string): Promise<string[]> => {
      const cacheKey = `region_countries_v1_${String(rid || rname || 'unknown').toLowerCase()}`;
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const ts = Number(cached?.ts || 0);
          const data = cached?.data;
          if (Array.isArray(data) && data.length > 0 && Date.now() - ts < ONE_WEEK_MS) {
            return data.map(String);
          }
        }
      } catch { }

      const explicitKey = String(regionKey || '').trim().toLowerCase();
      const region = explicitKey || inferRegionKey(rid, rname);
      // If no explicit regionKey was provided, we can't safely expand automatically.
      if (!region) {
        // Special-case: Japan behaves like a single country region for our UI convenience.
        const nm = String(rname || '').trim();
        if (String(rid || '').toLowerCase() === 'japan' || nm.toLowerCase() === 'japan') return ['Japan'];
        return [];
      }

      try {
        const res = await fetch(`https://restcountries.com/v3.1/region/${encodeURIComponent(region)}`);
        const json: any = await res.json();
        const names = Array.isArray(json)
          ? json
            .map((c: any) => c?.name?.common || c?.name?.official)
            .filter((x: any) => typeof x === 'string' && x.trim().length > 0)
          : [];

        const uniq: string[] = [];
        const seen = new Set<string>();
        for (const n of names) {
          const key = String(n).trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          uniq.push(String(n).trim());
        }

        // Cache for later opens
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: uniq }));
        } catch { }

        return uniq;
      } catch {
        return [];
      }
    },
    [inferRegionKey, regionKey]
  );



  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[Location] Post deleted event received:', event.postId);
        setAllPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
        setFilteredPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });
    return unsub;
  }, []);


  useEffect(() => {
    async function fetchDetails() {
      if (!locationName) return;
      setLoading(true);
      try {
        const placeDetailsData = {
          name: locationName as string,
          formatted_address: (locationAddress as string) || (locationName as string),
        };
        setPlaceDetails(placeDetailsData);

        // 1. Parallel Fetching for faster initial load
        await Promise.all([
          isRegionScope 
            ? fetchRegionPosts(regionIdStr, locationName as string) 
            : fetchLocationPosts(locationName as string),
          fetchLocationStories(locationName as string),
          (async () => {
             try {
               const metaRes = await apiService.getLocationMeta(locationName as string, viewerId || undefined);
               if (metaRes?.success && metaRes?.data) {
                 setTotalVisits(metaRes.data.visits || 0);
                 setVerifiedVisits(metaRes.data.verifiedVisits || 0);
               }
             } catch {}
          })()
        ]);

      } catch (e) {
        console.error('Error fetching location details:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [placeId, locationName, locationAddress, isRegionScope, regionIdStr, viewerId]);

  const extractSubLocationName = (post: any): string => {
    // Priority 0: Google Maps enriched data
    if (post?.locationData?.neighborhood) return post.locationData.neighborhood;
    if (post?.locationData?.sublocality) return post.locationData.sublocality;

    // Priority 1: Use a city/area part of the address if available
    const addr = post?.locationData?.address || '';
    if (addr) {
      const parts = addr.split(',').map((p: string) => p.trim());
      // Usually city or district is 2nd or 3rd part in reverse if full address
      // For simple addresses, it's the first part.
      if (parts.length > 2) return parts[parts.length - 3] || parts[0];
      return parts[0];
    }
    
    // Priority 2: Use locationName if it looks like an area
    const name = post?.locationData?.name || post?.locationName || post?.location || '';
    if (typeof name === 'string' && name.includes(',')) {
      return name.split(',')[0].trim();
    }

    return name || 'Unknown';
  };

  const fetchLocationPosts = async (searchLocationName: string, isLoadMore = false) => {
    if (!searchLocationName) return;

    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const skip = isLoadMore ? (page + 1) * LIMIT : 0;
      const response = await apiService.getPostsByLocation(searchLocationName, skip, LIMIT, viewerId || undefined);
      let locationPosts = response?.success && Array.isArray(response?.data) ? response.data : [];

      if (locationPosts.length < LIMIT) setHasMore(false);

      const normalized = locationPosts.map((p: any) => ({ ...p, id: p.id || p._id }));
      
      let finalPosts = normalized;
      if (isLoadMore) {
        finalPosts = [...allPosts, ...normalized];
        setAllPosts(finalPosts);
        setFilteredPosts(finalPosts);
        setPage(p => p + 1);
      } else {
        setAllPosts(normalized);
        setFilteredPosts(normalized);
        setPage(0);
        setHasMore(locationPosts.length === LIMIT);

        // --- NEW: Set Most Liked Image for Region Header ---
        if (normalized.length > 0) {
          const mostLiked = normalized.reduce((prev: any, curr: any) =>
            (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
          );
          if (mostLiked?.imageUrl) setMostLikedPostImage(mostLiked.imageUrl);
        }
      }

        // --- Meta Logic ---
        if (normalized.length > 0) {
          // Trigger enrichment in background
          enrichDataInBackground(finalPosts, normalized);
        }
    } catch (err) {
      console.error('[fetchLocationPosts] Error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchRegionPosts = async (rid: string, regionName: string, isLoadMore = false) => {
    const searchLocationName = regionName || rid;
    if (!searchLocationName) return;

    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const skip = isLoadMore ? (page + 1) * LIMIT : 0;
      const response = await apiService.getPostsByLocation(searchLocationName, skip, LIMIT, viewerId || undefined);
      let locationPosts = response?.success && Array.isArray(response?.data) ? response.data : [];

      if (locationPosts.length < LIMIT) setHasMore(false);

      const normalized = locationPosts.map((p: any) => ({ ...p, id: p.id || p._id }));

      let finalPosts = normalized;
      if (isLoadMore) {
        finalPosts = [...allPosts, ...normalized];
        setAllPosts(finalPosts);
        setFilteredPosts(finalPosts);
        setPage(p => p + 1);
      } else {
        setAllPosts(normalized);
        setFilteredPosts(normalized);
        setPage(0);
        setHasMore(locationPosts.length === LIMIT);

        // --- NEW: Set Most Liked Image for Header ---
        if (normalized.length > 0) {
          const mostLiked = normalized.reduce((prev: any, curr: any) =>
            (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
          );
          if (mostLiked?.imageUrl) setMostLikedPostImage(mostLiked.imageUrl);
        }
      }

      if (normalized.length > 0) {
        enrichDataInBackground(finalPosts, normalized);
      }
    } catch (err) {
      console.error('[fetchRegionPosts] Error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchLocationStories = async (searchLocationName: string) => {
    try {
      const pid = typeof placeId === 'string' ? placeId : Array.isArray(placeId) ? placeId[0] : '';
      const addr = typeof locationAddress === 'string' ? locationAddress : Array.isArray(locationAddress) ? locationAddress[0] : '';

      const mergeUnique = (a: any[], b: any[]) => {
        const seen = new Set<string>();
        const out: any[] = [];
        for (const x of [...a, ...b]) {
          const k = String((x as any)?.id || (x as any)?._id || '').trim();
          if (!k) continue;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(x);
        }
        return out;
      };

      const [feedRes, activeRes] = await Promise.all([
        apiService.get('/stories?skip=0&limit=100').catch(() => null),
        apiService.get('/stories/active').catch(() => null),
      ]);

      let rawList = extractStoryListFromResponseBody(feedRes);
      if (rawList.length === 0) rawList = extractStoryListFromResponseBody(feedRes?.data ?? feedRes);
      const activeList = extractStoryListFromResponseBody(activeRes);
      rawList = mergeUnique(rawList, activeList);

      rawList = await hydrateStoryDocumentsIfNeeded(rawList);

      const normalizedStories = rawList.map((story: any, idx: number) => storyForStoriesViewer(story, idx));

      const needle = String(searchLocationName || '').toLowerCase().trim();
      const needleAddr = String(addr || '').toLowerCase().trim();
      const pidLower = String(pid || '').toLowerCase().trim();

      const locationStories = normalizedStories.filter((story: any) => {
        const name = String(story?.locationData?.name || story?.location || '').toLowerCase();
        const storyAddr = String(story?.locationData?.address || '').toLowerCase();
        const storyPid = String(story?.locationData?.placeId || '').toLowerCase();
        if (pidLower && storyPid && storyPid === pidLower) return true;
        if (needle && name.includes(needle)) return true;
        if (needleAddr && (name.includes(needleAddr) || storyAddr.includes(needleAddr))) return true;
        if (needleAddr && needle && storyAddr.includes(needle)) return true;
        return false;
      });

      console.log(`[Location] Found ${locationStories.length} stories for "${searchLocationName}"`);
      setStories(locationStories);
    } catch (error) {
      console.log('Stories endpoint not available or no stories:', error);
      setStories([]);
    }
  };

  const enrichDataInBackground = async (fullList: any[], newItems: any[]) => {
    try {
      // Only enrich placeIds that haven't been enriched yet
      const uniquePlaceIds = Array.from(new Set(
        newItems
          .map((p: any) => p.locationData?.placeId)
          .filter(pid => pid && !fullList.find(fp => fp.locationData?.placeId === pid && fp.locationData?.neighborhood))
      ));

      if (uniquePlaceIds.length === 0) return;

      // Batch: max 5 concurrent Google API calls to avoid rate-limits
      const BATCH_SIZE = 5;
      const detailsMap = new Map();
      
      for (let i = 0; i < uniquePlaceIds.length; i += BATCH_SIZE) {
        const batch = uniquePlaceIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (pid) => {
          try {
            const details = await mapService.getPlaceDetails(pid as string);
            if (details) detailsMap.set(pid, details);
          } catch {}
        }));
      }

      if (detailsMap.size === 0) return;

      // Use functional updater to avoid stale closure over allPosts
      setAllPosts(prev => prev.map((p: any) => {
        const details = detailsMap.get(p.locationData?.placeId);
        if (details) {
          return {
            ...p,
            locationData: {
              ...p.locationData,
              neighborhood: details.neighborhood || details.sublocality,
              sublocality: details.sublocality,
            }
          };
        }
        return p;
      }));
    } catch (err) {
      console.error('[enrichDataInBackground] Error:', err);
    }
  };

  // --- NEW: Hierarchical Grouping & Filtering Logic (Adaptive Geo-Scope Aware) ---
  useEffect(() => {
    if (allPosts.length === 0) {
      setSubLocations([]);
      return;
    }

    const currentScope = getGeoScope();
    const areaMap = new Map<string, SubLocation>();
    
    allPosts.forEach((post: any) => {
      let areaName = 'General';
      let spotName = post?.locationData?.name || post?.locationName || 'General';

      if (currentScope === 'CONTINENT') {
        // Continent Scope: Group by Country, Nested Spots = Cities/Venues
        areaName = extractCountryIntelligently(post);
        spotName = extractCityIntelligently(post);
      } else if (currentScope === 'COUNTRY') {
        // Country Scope: Group by City, Nested Spots = Neighborhoods/Venues
        areaName = extractCityIntelligently(post);
        spotName = post?.locationData?.neighborhood || post?.locationData?.name || post?.locationName || 'General';
      } else {
        // City Scope (Default): Group by Neighborhood/District, Nested Spots = Venues/Landmarks
        areaName = extractSubLocationName(post);
        spotName = post?.locationData?.name || post?.locationName || areaName;

        // Avoid redundancy (e.g. area name shouldn't equal main city name)
        if (areaName.toLowerCase() === String(locationName).toLowerCase()) {
          areaName = spotName !== areaName ? spotName : 'General';
        }
      }

      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          name: areaName,
          count: 0,
          thumbnail: post.imageUrl || '',
          posts: [],
          spots: []
        });
      }
      
      const areaObj = areaMap.get(areaName)!;
      areaObj.posts.push(post);
      areaObj.count++;

      // Spot Grouping within Area
      if (spotName !== areaName && spotName !== 'General') {
        let spotObj = areaObj.spots?.find(s => s.name === spotName);
        if (!spotObj) {
          spotObj = { name: spotName, thumbnail: post.imageUrl || '', posts: [] };
          areaObj.spots?.push(spotObj);
        }
        spotObj.posts.push(post);
      }
    });

    const subs = Array.from(areaMap.values()).sort((a, b) => b.count - a.count);
    setSubLocations(subs);
  }, [allPosts, locationName, scope, getGeoScope]);

  // Update Filtered Posts whenever selection or data changes
  useEffect(() => {
    if (!selectedSubLocation) {
      setFilteredPosts(allPosts);
      return;
    }

    const area = subLocations.find(sl => sl.name === selectedSubLocation);
    if (!area) {
      setFilteredPosts(allPosts);
      return;
    }

    if (!selectedSpecificSpot) {
      setFilteredPosts(area.posts);
    } else {
      const spot = area.spots?.find(s => s.name === selectedSpecificSpot);
      setFilteredPosts(spot ? spot.posts : area.posts);
    }
  }, [allPosts, selectedSubLocation, selectedSpecificSpot, subLocations]);

  const handleSubLocationFilter = (subLocationName: string) => {
    if (selectedSubLocation === subLocationName) {
      setSelectedSubLocation(null);
      setSelectedSpecificSpot(null);
    } else {
      setSelectedSubLocation(subLocationName);
      setSelectedSpecificSpot(null);
    }
    hapticLight();
  };

  const handleSpecificSpotFilter = (spotName: string) => {
    if (selectedSpecificSpot === spotName) {
      setSelectedSpecificSpot(null);
    } else {
      setSelectedSpecificSpot(spotName);
    }
    hapticLight();
  };



  if (!placeDetails) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <Text style={{ margin: 24, marginTop: 40 + insets.top, fontSize: 16, color: '#666' }}>No details found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View
        style={{
          height: animatedHeaderHeight,
          transform: [{ translateY: animatedHeaderTranslateY }],
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <View style={[styles.header, { justifyContent: 'space-between', paddingTop: safeTop, height: totalHeaderHeight }]}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
            style={styles.backButton}
          >
          <Feather name="arrow-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerRightIcons}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              router.push('/passport' as any);
            }}
          >
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              router.push('/inbox' as any);
            }}
          >
            <Feather name="message-square" size={20} color="#000" />
            <View style={styles.badge} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              setNotificationsModalVisible(true);
            }}
          >
            <Feather name="bell" size={20} color="#000" />
          </TouchableOpacity>
        </View>
        </View>
      </Animated.View>

      {loading && allPosts.length === 0 ? (
        <View style={{ flex: 1, paddingTop: totalHeaderHeight }}>
          <LocationSkeleton />
          <LocationSkeleton />
          <LocationSkeleton />
        </View>
      ) : (
        <FlatList
          data={selectedSubLocation ? filteredPosts : allPosts}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset?.y ?? 0;
            const prevY = lastScrollYRef.current;
            lastScrollYRef.current = y;

            const delta = y - prevY;
            if (Math.abs(delta) < 6) return; // ignore jitters

            if (y > 400) {
              if (!showScrollTop) setShowScrollTop(true);
            } else {
              if (showScrollTop) setShowScrollTop(false);
            }

            if (y <= 8) {
              applyHeaderState(false);
            } else if (y > 56) {
              applyHeaderState(true);
            }
          }}
          ref={flatListRef}
          keyExtractor={(item, index) => {
            const id = String(item?.id || item?._id || '').trim();
            return id || `post-${index}`;
          }}
          ListHeaderComponent={
            <>
              {/* Location Header Card */}
              <View style={styles.locationHeaderCard}>
                <Image
                  source={{ uri: getOptimizedUrl(mostLikedPostImage || 'https://via.placeholder.com/80', 400) }}
                  style={styles.locationImage}
                />
                <View style={styles.locationTextContainer}>
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={16} color="#000" />
                    <Text style={styles.locationNameText} numberOfLines={1}>
                      {placeDetails?.name || locationName}, {placeDetails?.country || 'United Kingdom'}
                    </Text>
                  </View>
                  <View style={[styles.locationRow, { marginTop: 6 }]}>
                    <Ionicons name="people" size={16} color="#666" />
                    <Text style={styles.visitsText}>{totalVisits} Visits</Text>
                  </View>
                  <View style={[styles.locationRow, { marginTop: 4 }]}>
                    <Ionicons name="checkmark-circle" size={16} color="#666" />
                    <Text style={styles.verifiedText}>{verifiedVisits || 137} Verified visits</Text>
                  </View>
                </View>
              </View>

              {/* Stories/People Section */}
              {stories.length > 0 && (
                <View style={styles.storiesSection}>
                  <Text style={styles.sectionTitle}>STORIES</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storiesScroll}
                  >
                    {stories.map((story, index) => (
                      <TouchableOpacity
                        key={story.id || story._id || `story - ${index} `}
                        style={styles.storyCard}
                        onPress={() => onStoryPress && onStoryPress(stories, index)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(story.imageUrl || story.userAvatar || '', 200) }}
                          style={styles.storyAvatar}
                        />
                        <Text style={styles.storyUserName} numberOfLines={1}>
                          {(story.userName || 'user').toLowerCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Sub Locations Section (PLACES) */}
              {subLocations.length > 0 && (
                <View style={styles.subLocationsSection}>
                  <Text style={styles.sectionTitle}>PLACES</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subLocationsScroll}
                  >
                    {subLocations.map((subLoc) => (
                      <TouchableOpacity
                        key={subLoc.name}
                        style={styles.subLocationCard}
                        onPress={() => handleSubLocationFilter(subLoc.name)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(subLoc.thumbnail || 'https://via.placeholder.com/100', 200) }}
                          style={[
                            styles.subLocationImage,
                            selectedSubLocation === subLoc.name && styles.subLocationImageSelected
                          ]}
                        />
                        <Text 
                          style={[
                            styles.subLocationName,
                            selectedSubLocation === subLoc.name && styles.subLocationNameSelected
                          ]} 
                          numberOfLines={2}
                        >
                          {subLoc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Nested Specific Spots (e.g. MARYLEBONE) */}
              {selectedSubLocation && subLocations.find(s => s.name === selectedSubLocation)?.spots?.length! > 0 && (
                <View style={[styles.subLocationsSection, { borderBottomWidth: 0, paddingTop: 0 }]}>
                  <Text style={[styles.sectionTitle, { textTransform: 'uppercase' }]}>{selectedSubLocation}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subLocationsScroll}
                  >
                    {subLocations.find(s => s.name === selectedSubLocation)?.spots?.map((spot) => (
                      <TouchableOpacity
                        key={spot.name}
                        style={styles.subLocationCard}
                        onPress={() => handleSpecificSpotFilter(spot.name)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(spot.thumbnail || 'https://via.placeholder.com/100', 200) }}
                          style={[
                            styles.subLocationImage,
                            selectedSpecificSpot === spot.name && styles.subLocationImageSelected
                          ]}
                        />
                        <Text 
                          style={[
                            styles.subLocationName,
                            selectedSpecificSpot === spot.name && styles.subLocationNameSelected
                          ]} 
                          numberOfLines={2}
                        >
                          {spot.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          }
          renderItem={({ item }) => (
            <PostCard 
              post={{
                ...item,
                imageUrl: getOptimizedUrl(item.imageUrl, 800)
              }} 
              currentUser={currentUser} 
              showMenu={false} 
            />
          )}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) {
              if (isRegionScope) fetchRegionPosts(regionIdStr, locationName as string, true);
              else fetchLocationPosts(locationName as string, true);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            ) : null
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="map-pin" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No posts from this location</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Stories Viewer Modal */}
      {showStoriesViewer && selectedStories.length > 0 && (
        <Modal
          visible={showStoriesViewer}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setShowStoriesViewer(false)}
        >
          <StoriesViewer
            stories={selectedStories}
            onClose={() => setShowStoriesViewer(false)}
          />
        </Modal>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <TouchableOpacity
          style={[styles.scrollTopButton, { bottom: 30 + (insets.bottom || 0) }]}
          onPress={() => {
            hapticLight();
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
        >
          <Feather name="arrow-up" size={24} color="#007AFF" />
        </TouchableOpacity>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  headerLogoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerIconBtn: {
    position: 'relative',
    padding: 2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0A3D62',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location Header Card
  // Location Header Card
  locationHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  locationImage: {
    width: 76,
    height: 76,
    borderRadius: 26,
    marginRight: 16,
    backgroundColor: '#f0f0f0',
  },
  locationTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginLeft: 6,
  },
  visitsText: {
    fontSize: 13,
    color: '#444',
    marginLeft: 6,
  },
  verifiedText: {
    fontSize: 13,
    color: '#222',
    marginLeft: 6,
  },

  // Section Defaults
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginLeft: 20,
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  // Stories Section
  storiesSection: {
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  storiesScroll: {
    paddingHorizontal: 20,
  },
  storyCard: {
    width: 68,
    marginRight: 14,
    alignItems: 'center',
  },
  storyAvatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
  },
  storyUserName: {
    fontSize: 12,
    fontWeight: '400',
    color: '#111',
    textAlign: 'center',
    width: 68,
    marginTop: 8,
  },

  // Sub Locations Section
  subLocationsSection: {
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  subLocationsScroll: {
    paddingHorizontal: 20,
  },
  subLocationCard: {
    width: 72,
    marginRight: 16,
    alignItems: 'center',
  },
  subLocationImage: {
    width: 72,
    height: 72,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  subLocationImageSelected: {
    borderColor: '#0A3D62',
    borderWidth: 2,
  },
  subLocationName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
    width: 76,
    marginTop: 8,
    lineHeight: 14,
  },
  subLocationNameSelected: {
    color: '#000',
    fontWeight: '700',
  },



  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  scrollTopButton: {
    position: 'absolute',
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
