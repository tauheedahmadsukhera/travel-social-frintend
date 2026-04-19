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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [verifiedVisits, setVerifiedVisits] = useState(0);
  const [mostLikedPostImage, setMostLikedPostImage] = useState<string>('');
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Story[]>([]);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);

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

  // Load current user when component mounts
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          setCurrentUser({ uid: userId, id: userId });
          console.log('[Location] Current user loaded:', userId);
        }
      } catch (error) {
        console.log('[Location] Failed to load current user:', error);
      }
    };
    loadCurrentUser();
  }, []);

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
      setLoading(true);
      try {
        // Use the location data passed from navigation params
        // This avoids CORS issues with Google Places Details API
        const placeDetails = {
          name: locationName as string,
          formatted_address: locationAddress as string || locationName as string,
        };
        setPlaceDetails(placeDetails);

        if (isRegionScope) {
          await fetchRegionPosts(regionIdStr, locationName as string);
        } else {
          // Fetch posts from backend that match this location
          await fetchLocationPosts(locationName as string);
        }

        // Fetch stories from Firebase that match this location
        await fetchLocationStories(locationName as string);
      } catch (e) {
        console.error('Error fetching location details:', e);
        setPlaceDetails(null);
      }
      setLoading(false);
    }
    if (locationName) fetchDetails();
  }, [placeId, locationName, locationAddress, isRegionScope, regionIdStr]);

  const extractSubLocationName = (locationName: string, locationAddress: string): string => {
    // Extract city/area name from location
    // If locationName is already a city (short name), use it
    // Otherwise, extract from address

    if (locationName && locationName.length < 30 && !locationName.includes(',')) {
      return locationName;
    }

    // Try to extract city from address
    const addressParts = locationAddress.split(',').map(p => p.trim());
    if (addressParts.length > 0) {
      // Return first part (usually city)
      return addressParts[0];
    }

    return locationName;
  };

  const fetchLocationPosts = async (searchLocationName: string) => {
    try {
      const viewerId = await AsyncStorage.getItem('userId');
      const locationAddressValue = Array.isArray(locationAddress) ? locationAddress[0] : locationAddress;
      const routePlaceIdRaw = typeof placeId === 'string' ? placeId : Array.isArray(placeId) ? placeId[0] : '';
      const routePlaceId = String(routePlaceIdRaw || '').trim();

      let metaHasVerifiedVisits = false;

      const normalize = (v: any) => String(v || '').trim().toLowerCase();
      const primarySearchPart =
        String(searchLocationName || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)[0] || String(searchLocationName || '');
      const primaryAddressPart =
        String(locationAddressValue || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)[0] || String(locationAddressValue || '');
      const rawNeedles = [searchLocationName, primarySearchPart, primaryAddressPart];
      const needles = Array.from(new Set(rawNeedles.map(normalize).filter((v) => v.length >= 3)));

      const postMatchesLocationQuery = (post: any) => {
        if (routePlaceId) {
          const sp = String(post?.locationData?.placeId || '').trim();
          if (sp && sp === routePlaceId) return true;
        }
        if (!needles.length) return false;
        const haystack = [
          post?.location,
          post?.locationName,
          post?.locationData?.name,
          post?.locationData?.address,
          post?.locationData?.city,
          post?.locationData?.country,
          ...(Array.isArray(post?.locationKeys) ? post.locationKeys : []),
        ]
          .map(normalize)
          .filter(Boolean);
        return needles.some((needle) => haystack.some((hay) => hay.includes(needle)));
      };

      const all: any[] = [];
      const pageSize = 50;
      const MAX_LOCATION_API_PAGES = 300;
      for (let page = 0; page < MAX_LOCATION_API_PAGES; page++) {
        const skip = page * pageSize;
        const response = await apiService.getPostsByLocation(searchLocationName, skip, pageSize, viewerId || undefined);
        const next = response?.success && Array.isArray(response?.data) ? response.data : [];
        all.push(...next);
        if (next.length < pageSize) break;
      }

      const byId = new Map<string, any>();
      const addPost = (post: any) => {
        const id = String(post?.id || post?._id || '').trim();
        if (!id) return;
        if (!byId.has(id)) byId.set(id, { ...post, id: post.id || post._id });
      };
      for (const post of all) addPost(post);

      const FEED_PAGE = 100;
      const MAX_FEED_PAGES = 50;
      for (let fp = 0; fp < MAX_FEED_PAGES; fp++) {
        const feedRes: any = await apiService.getPosts({
          skip: fp * FEED_PAGE,
          limit: FEED_PAGE,
          viewerId: viewerId || undefined,
          requesterUserId: viewerId || undefined,
        });
        const batch =
          feedRes?.success && Array.isArray(feedRes?.data) ? feedRes.data : Array.isArray(feedRes) ? feedRes : [];
        if (!batch.length) break;
        for (const post of batch) {
          if (postMatchesLocationQuery(post)) addPost(post);
        }
        if (batch.length < FEED_PAGE) break;
      }

      let locationPosts = Array.from(byId.values());
      locationPosts.sort((a: any, b: any) => {
        const ta =
          a?.createdAt && typeof a.createdAt === 'string'
            ? Date.parse(a.createdAt)
            : a?.createdAt?.toDate?.()
              ? a.createdAt.toDate().getTime()
              : 0;
        const tb =
          b?.createdAt && typeof b.createdAt === 'string'
            ? Date.parse(b.createdAt)
            : b?.createdAt?.toDate?.()
              ? b.createdAt.toDate().getTime()
              : 0;
        return (tb || 0) - (ta || 0);
      });

      console.log(
        `[Location] "${searchLocationName}": API pages ~${Math.ceil(all.length / pageSize)}, merged ${locationPosts.length} posts (API rows ${all.length})`
      );

      setAllPosts(locationPosts);
      setFilteredPosts(locationPosts);

      try {
        const metaRes = await apiService.getLocationMeta(searchLocationName, viewerId || undefined);
        const meta = metaRes?.success ? metaRes?.data : null;
        if (meta && typeof meta === 'object') {
          if (typeof meta.visits === 'number') setTotalVisits(meta.visits);
          else if (typeof meta.postCount === 'number') setTotalVisits(meta.postCount);
          if (typeof meta.verifiedVisits === 'number') {
            metaHasVerifiedVisits = true;
            setVerifiedVisits(meta.verifiedVisits);
          }
        } else {
          setTotalVisits(locationPosts.length);
        }
      } catch {
        setTotalVisits(locationPosts.length);
      }

      // Extract sub-locations from posts
      const subLocationMap = new Map<string, any[]>();
      locationPosts.forEach((post: Post) => {
        const locStr =
          post?.locationData?.name ||
          post?.locationName ||
          (typeof post?.location === 'string' ? post.location : post?.location?.name) ||
          '';
        const subLocName = extractSubLocationName(
          locStr,
          post?.locationData?.address || ''
        );
        if (!subLocationMap.has(subLocName)) {
          subLocationMap.set(subLocName, []);
        }
        subLocationMap.get(subLocName)?.push(post);
      });

      const subLocations = Array.from(subLocationMap.entries()).map(([name, posts]) => ({
        name,
        count: posts.length,
        thumbnail: posts[0]?.imageUrl || 'https://via.placeholder.com/60',
        posts
      }));

      subLocations.sort((a: any, b: any) => {
        const diff = (b?.count || 0) - (a?.count || 0);
        if (diff !== 0) return diff;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });

      setSubLocations(subLocations);

      // Count verified visits (if meta not available)
      if (!metaHasVerifiedVisits) {
        const verifiedCount = locationPosts.filter((p: any) => p?.locationData?.verified).length;
        setVerifiedVisits(verifiedCount);
      }

      // Set most liked post image for header
      if (locationPosts.length > 0) {
        const mostLiked = locationPosts.reduce((prev: any, curr: any) =>
          (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
        );
        if (mostLiked?.imageUrl) {
          setMostLikedPostImage(mostLiked.imageUrl);
        }
      }
    } catch (error) {
      console.error('Error fetching location posts:', error);
      setAllPosts([]);
      setFilteredPosts([]);
    }
  };

  const fetchRegionPosts = async (rid: string, regionName: string) => {
    try {
      const viewerId = await AsyncStorage.getItem('userId');
      const countries = await getCountriesForRegion(rid, regionName);

      if (countries.length === 0) {
        await fetchLocationPosts(regionName);
        return;
      }

      const pageSize = 50;
      const MAX_PAGES_PER_COUNTRY = 300;
      const maxCountries = 25; // protect device/network (increase if needed)

      const expandCountryAliases = (name: string): string[] => {
        const n = String(name || '').trim();
        const nl = n.toLowerCase();
        if (!n) return [];
        if (nl === 'united states' || nl === 'united states of america' || nl === 'usa') {
          return ['United States', 'United States of America', 'USA'];
        }
        if (nl === 'united kingdom' || nl === 'uk' || nl === 'great britain') {
          return ['United Kingdom', 'UK', 'Great Britain'];
        }
        return [n];
      };

      const pickedRaw = countries.slice(0, maxCountries);
      const picked: string[] = [];
      const seenPick = new Set<string>();
      for (const c of pickedRaw) {
        for (const alias of expandCountryAliases(c)) {
          const key = alias.trim().toLowerCase();
          if (!key || seenPick.has(key)) continue;
          seenPick.add(key);
          picked.push(alias);
        }
      }
      const allPostsOut: any[] = [];

      // small concurrency cap (avoid flooding)
      const chunkSize = 3;
      for (let i = 0; i < picked.length; i += chunkSize) {
        const chunk = picked.slice(i, i + chunkSize);
        const settled = await Promise.allSettled(
          chunk.map(async (countryName) => {
            const all: any[] = [];
            for (let page = 0; page < MAX_PAGES_PER_COUNTRY; page++) {
              const skip = page * pageSize;
              const response = await apiService.getPostsByLocation(countryName, skip, pageSize, viewerId || undefined);
              const next = response?.success && Array.isArray(response?.data) ? response.data : [];
              all.push(...next);
              if (next.length < pageSize) break;
            }
            return all;
          })
        );
        for (const r of settled) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            allPostsOut.push(...r.value);
          }
        }
      }

      const seen = new Set<string>();
      const normalized: any[] = [];
      for (const post of allPostsOut) {
        const id = String(post?.id || post?._id || '');
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        normalized.push({ ...post, id });
      }

      normalized.sort((a: any, b: any) => {
        const ta = (a?.createdAt && typeof a.createdAt === 'string') ? Date.parse(a.createdAt) : (a?.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0);
        const tb = (b?.createdAt && typeof b.createdAt === 'string') ? Date.parse(b.createdAt) : (b?.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0);
        return (tb || 0) - (ta || 0);
      });

      setAllPosts(normalized as any);
      setFilteredPosts(normalized as any);
      setTotalVisits(normalized.length);

      const verifiedCount = normalized.filter((p: any) => p?.locationData?.verified).length;
      setVerifiedVisits(verifiedCount);

      // Sub locations (same as single location)
      const subLocationMap = new Map<string, any[]>();
      (normalized as any[]).forEach((post: any) => {
        const locStr =
          post?.locationData?.name ||
          post?.locationName ||
          (typeof post?.location === 'string' ? post.location : post?.location?.name) ||
          '';
        const subLocName = extractSubLocationName(
          locStr,
          post?.locationData?.address || ''
        );
        if (!subLocationMap.has(subLocName)) subLocationMap.set(subLocName, []);
        subLocationMap.get(subLocName)?.push(post);
      });

      const subs = Array.from(subLocationMap.entries()).map(([name, posts]) => ({
        name,
        count: posts.length,
        thumbnail: posts[0]?.imageUrl || 'https://via.placeholder.com/60',
        posts,
      }));
      subs.sort((a: any, b: any) => {
        const diff = (b?.count || 0) - (a?.count || 0);
        if (diff !== 0) return diff;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });
      setSubLocations(subs as any);

      if ((normalized as any[]).length > 0) {
        const mostLiked = (normalized as any[]).reduce((prev: any, curr: any) =>
          (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
        );
        if (mostLiked?.imageUrl) setMostLikedPostImage(mostLiked.imageUrl);
      }
    } catch (error) {
      console.error('Error fetching region posts:', error);
      setAllPosts([]);
      setFilteredPosts([]);
      setSubLocations([]);
      setTotalVisits(0);
      setVerifiedVisits(0);
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

  const handleSubLocationFilter = (subLocationName: string) => {
    if (selectedSubLocation === subLocationName) {
      // Deselect - show all posts
      setSelectedSubLocation(null);
      setFilteredPosts(allPosts);
    } else {
      // Select - filter posts
      setSelectedSubLocation(subLocationName);
      const subLocation = subLocations.find(sl => sl.name === subLocationName);
      if (subLocation) {
        setFilteredPosts(subLocation.posts);
      }
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#0A3D62" style={{ marginTop: 40 + insets.top }} />
      </View>
    );
  }

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

      <FlatList
        data={filteredPosts}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset?.y ?? 0;
          const prevY = lastScrollYRef.current;
          lastScrollYRef.current = y;

          const delta = y - prevY;
          if (Math.abs(delta) < 6) return; // ignore jitters

          // Hysteresis: avoids rapid show/hide when rubber-banding at the top (blink).
          if (y <= 8) {
            applyHeaderState(false);
          } else if (y > 56) {
            applyHeaderState(true);
          }
        }}
        keyExtractor={(item, index) => {
          const id = String(item?.id || item?._id || '').trim();
          return id || `post-${index}`;
        }}
        ListHeaderComponent={
          <>
            {/* Location Header Card */}
            <View style={styles.locationHeaderCard}>
              <Image
                source={{ uri: mostLikedPostImage || 'https://via.placeholder.com/80' }}
                style={styles.locationImage}
              />
              <View style={styles.locationTextContainer}>
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={16} color="#000" />
                  <Text style={styles.locationNameText} numberOfLines={1}>
                    {placeDetails.name}
                  </Text>
                </View>
                <View style={[styles.locationRow, { marginTop: 4 }]}>
                  <Ionicons name="people-outline" size={16} color="#000" />
                  <Text style={styles.visitsText}>{totalVisits} Visits</Text>
                </View>
                {verifiedVisits > 0 && (
                  <View style={[styles.locationRow, { marginTop: 4 }]}>
                    <VerifiedBadge size={15} color="#000" />
                    <Text style={styles.verifiedText}>{verifiedVisits} Verified visits</Text>
                  </View>
                )}
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
                        source={{ uri: story.imageUrl || story.userAvatar || '' }}
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

            {/* Sub Locations Section */}
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
                      style={[
                        styles.subLocationCard,
                        selectedSubLocation === subLoc.name && styles.subLocationCardSelected
                      ]}
                      onPress={() => handleSubLocationFilter(subLoc.name)}
                    >
                      <Image
                        source={{ uri: subLoc.thumbnail || 'https://via.placeholder.com/100' }}
                        style={styles.subLocationImage}
                      />
                      <Text style={styles.subLocationName} numberOfLines={2}>
                        {subLoc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}


          </>
        }
        renderItem={({ item }) => (
          <PostCard post={item} currentUser={currentUser} showMenu={false} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No posts from this location</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

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
    fontSize: 11,
    fontWeight: '500',
    color: '#222',
    textAlign: 'center',
    width: 68,
    marginTop: 6,
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
    width: 68,
    marginRight: 14,
    alignItems: 'center',
  },
  subLocationCardSelected: {
    opacity: 0.7,
  },
  subLocationImage: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
  },
  subLocationName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#222',
    textAlign: 'center',
    width: 68,
    marginTop: 6,
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
});
