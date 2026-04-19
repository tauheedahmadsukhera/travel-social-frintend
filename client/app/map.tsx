import { DEFAULT_AVATAR_URL } from '../lib/api';
﻿import { Image as ExpoImage } from 'expo-image';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Dimensions, FlatList, KeyboardAvoidingView, PermissionsAndroid, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { PostLocationModal } from '../components/PostLocationModal';
import { useUser } from '@/src/_components/UserContext';
import PostCard from '@/src/_components/PostCard';

// ... existing code ...

import { getAllPosts } from '../lib/firebaseHelpers';
import { apiService } from '@/src/_services/apiService';
import { getOptimizedImageUrl } from '../lib/imageHelpers';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default ?? RNMaps;
  Marker = RNMaps.Marker;
}

const IMAGE_PLACEHOLDER = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

interface PostType {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  imageUrls?: string[];
  caption?: string;
  location?: { lat: number; lon: number; name?: string } | string;
  lat?: number;
  lon?: number;
  likes?: number;
  likesCount?: number;
  comments?: number;
  commentsCount?: number;
  createdAt: any;
  isLive?: boolean;
}

interface LiveStream {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  channelName?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt: any;
  location?: {
    latitude: number;
    longitude: number;
  };
}

const DEFAULT_REGION: Region = {
  latitude: 33.6844,
  longitude: 73.0479,
  latitudeDelta: 0.09,
  longitudeDelta: 0.09,
};



type LocationSuggestion = {
  name: string;
  count: number;
  verifiedCount?: number;
};

type LocationMeta = {
  location: string;
  postCount: number;
  visits: number;
  verifiedVisits: number;
};

export default function MapScreen() {
  const currentUser = useUser();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  function isValidLatLon(lat: any, lon: any) {
    return (
      typeof lat === 'number' && typeof lon === 'number' &&
      !isNaN(lat) && !isNaN(lon) &&
      lat >= -90 && lat <= 90 &&
      lon >= -180 && lon <= 180
    );
  }

  function isValidRegion(region: Region | null): boolean {
    return (
      !!region &&
      isValidLatLon(region.latitude, region.longitude) &&
      typeof region.latitudeDelta === 'number' && typeof region.longitudeDelta === 'number' &&
      isFinite(region.latitudeDelta) && isFinite(region.longitudeDelta) &&
      region.latitudeDelta > 0 && region.longitudeDelta > 0
    );
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostType[]>([]);
  const safePosts = Array.isArray(posts) ? posts : [];
  const [selectedPosts, setSelectedPosts] = useState<PostType[] | null>(null);
  const safeSelectedPosts = Array.isArray(selectedPosts) ? selectedPosts : [];

  const mapRef = useRef<any>(null);
  const appStateRef = useRef<string>(AppState.currentState);

  const [modalComment, setModalComment] = useState<{[id:string]:string}>({});
  const [modalLikes, setModalLikes] = useState<{[id:string]:number}>({});
  const [modalLiked, setModalLiked] = useState<{[id:string]:boolean}>({});
  const [modalCommentsCount, setModalCommentsCount] = useState<{[id:string]:number}>({});

  const router = useRouter();
  const params = useLocalSearchParams();
  const initialQuery = (params.q as string) || '';
  const userId = (params.user as string) || undefined; // Get userId from params
  const latParam = params.lat ? parseFloat(params.lat as string) : undefined;
  const lonParam = params.lon ? parseFloat(params.lon as string) : undefined;

  const [query, setQuery] = useState(initialQuery);
  const [viewerCoords, setViewerCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const safeLiveStreams = Array.isArray(liveStreams) ? liveStreams : [];

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [locationMeta, setLocationMeta] = useState<LocationMeta | null>(null);
  const [locationPosts, setLocationPosts] = useState<any[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationLoadingMore, setLocationLoadingMore] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSkip, setLocationSkip] = useState(0);
  const [locationHasMore, setLocationHasMore] = useState(true);

  const suggestionCacheRef = useRef<Map<string, { ts: number; data: LocationSuggestion[] }>>(new Map());
  const debounceTimerRef = useRef<any>(null);
  const lastSuggestReqRef = useRef<number>(0);

  const livePollTimerRef = useRef<any>(null);
  const isFetchingLiveRef = useRef<boolean>(false);
  const lastLiveFetchRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const [mapRegion, setMapRegion] = useState<Region | null>(DEFAULT_REGION);
  const [locationPermission, setLocationPermission] = useState<'granted'|'denied'|'unknown'>('unknown');
  const [showSearch, setShowSearch] = useState(false);
  const [showCommentsModalId, setShowCommentsModal] = useState<string | null>(null);

  const lastCenteredAtRef = useRef<number>(0);

  useEffect(() => {
    if (!showSearch) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowSearch(false);
      return true;
    });

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [showSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        if (!cancelled) setCurrentUserId(uid);
      } catch {
        if (!cancelled) setCurrentUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetLocationSearch = useCallback(() => {
    setSuggestions([]);
    setSelectedLocation(null);
    setLocationMeta(null);
    setLocationPosts([]);
    setLocationError(null);
    setLocationSkip(0);
    setLocationHasMore(true);
  }, []);

  const fetchSuggestions = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }

    const cacheKey = q.toLowerCase();
    const cached = suggestionCacheRef.current.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < 2 * 60 * 1000) {
      setSuggestions(cached.data);
      return;
    }

    const reqId = Date.now();
    lastSuggestReqRef.current = reqId;

    try {
      const res: any = await apiService.getLocationSuggestions(q, 12);
      if (lastSuggestReqRef.current !== reqId) return;
      const data = Array.isArray(res?.data) ? res.data : [];
      const normalized: LocationSuggestion[] = data
        .map((d: any) => ({
          name: String(d?.name || '').trim(),
          count: typeof d?.count === 'number' ? d.count : 0,
          verifiedCount: typeof d?.verifiedCount === 'number' ? d.verifiedCount : 0,
        }))
        .filter((d: any) => d.name);

      suggestionCacheRef.current.set(cacheKey, { ts: Date.now(), data: normalized });
      setSuggestions(normalized);
    } catch {
      if (lastSuggestReqRef.current !== reqId) return;
      setSuggestions([]);
    }
  }, []);

  const fetchLocationFeed = useCallback(async (locationName: string, mode: 'reset' | 'more' = 'reset') => {
    const loc = locationName.trim();
    if (!loc) return;

    if (mode === 'reset') {
      setLocationLoading(true);
      setLocationError(null);
      setLocationSkip(0);
      setLocationHasMore(true);
      setLocationPosts([]);
    } else {
      if (locationLoading || locationLoadingMore || !locationHasMore) return;
      setLocationLoadingMore(true);
    }

    const nextSkip = mode === 'reset' ? 0 : locationSkip;
    try {
      if (mode === 'reset') {
        try {
          const metaRes: any = await apiService.getLocationMeta(loc, currentUserId || undefined);
          const meta = metaRes?.data;
          if (meta && typeof meta === 'object') {
            setLocationMeta({
              location: String(meta.location || loc),
              postCount: typeof meta.postCount === 'number' ? meta.postCount : 0,
              visits: typeof meta.visits === 'number' ? meta.visits : 0,
              verifiedVisits: typeof meta.verifiedVisits === 'number' ? meta.verifiedVisits : 0,
            });
          } else {
            setLocationMeta({ location: loc, postCount: 0, visits: 0, verifiedVisits: 0 });
          }
        } catch {
          setLocationMeta({ location: loc, postCount: 0, visits: 0, verifiedVisits: 0 });
        }
      }

      const res: any = await apiService.getPostsByLocation(loc, nextSkip, 20, currentUserId || undefined);
      const newPosts = Array.isArray(res?.data) ? res.data : [];
      const normalized = newPosts.map((p: any) => ({ ...p, id: p?.id || p?._id }));

      setLocationPosts((prev) => (mode === 'reset' ? normalized : [...prev, ...normalized]));
      setLocationSkip(nextSkip + normalized.length);
      setLocationHasMore(normalized.length >= 20);
    } catch (e: any) {
      setLocationError(e?.message || 'Failed to load posts');
    } finally {
      if (mode === 'reset') setLocationLoading(false);
      else setLocationLoadingMore(false);
    }
  }, [currentUserId, locationHasMore, locationLoading, locationLoadingMore, locationSkip]);

  useEffect(() => {
    if (!showSearch) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const q = query.trim();
    if (!q) {
      resetLocationSearch();
      return;
    }

    if (selectedLocation && q.toLowerCase() === selectedLocation.toLowerCase()) {
      return;
    }

    setSelectedLocation(null);
    setLocationMeta(null);
    setLocationPosts([]);
    setLocationError(null);
    setLocationSkip(0);
    setLocationHasMore(true);

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(q);
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [fetchSuggestions, query, resetLocationSearch, selectedLocation, showSearch]);

  const postsCache = useRef<PostType[]>([]);
  const lastFetchTime = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const now = Date.now();
    if (postsCache.current.length > 0 && (now - lastFetchTime.current) < 60000) {
      setPosts(postsCache.current);
      setLoading(false);
      return;
    }

    getAllPosts(50)
      .then((res: any) => {
        if (cancelled) return;
        if (res?.success) {
          const postsArray = Array.isArray(res.posts) ? res.posts : [];
          setPosts(postsArray);
          postsCache.current = postsArray;
          lastFetchTime.current = now;
        } else {
          setError(res?.error || 'Failed to load posts');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (latParam && lonParam && isValidLatLon(latParam, lonParam)) {
      setMapRegion((prev) => {
        const base = prev && isValidRegion(prev) ? prev : DEFAULT_REGION;
        return {
          ...base,
          latitude: latParam,
          longitude: lonParam,
        };
      });
    }
  }, [latParam, lonParam]);

  const centerOnUserLocation = useCallback(async () => {
    try {
      // If the screen was opened with explicit coordinates, respect them
      if (latParam && lonParam && isValidLatLon(latParam, lonParam)) return;

      const now = Date.now();
      // Throttle to avoid repeated permission/location prompts on quick tab switches
      if (now - lastCenteredAtRef.current < 1500) return;
      lastCenteredAtRef.current = now;

      let granted = false;
      if (Platform.OS === 'android') {
        // Some devices still require explicit Android permission prompt handling
        const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (already) {
          granted = true;
        } else {
          const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          granted = result === PermissionsAndroid.RESULTS.GRANTED;
        }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        granted = status === 'granted';
      }

      setLocationPermission(granted ? 'granted' : 'denied');
      if (!granted) return;

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos?.coords?.latitude;
      const lon = pos?.coords?.longitude;
      if (!isValidLatLon(lat, lon)) return;

      setViewerCoords({ lat, lon });

      const nextRegion: Region = {
        latitude: lat,
        longitude: lon,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };

      setMapRegion(nextRegion);
      try {
        mapRef.current?.animateToRegion?.(nextRegion, 450);
      } catch {}
    } catch {
      setLocationPermission('denied');
    }
  }, [isValidLatLon, latParam, lonParam]);

  const fetchLiveStreams = useCallback(async () => {
    try {
      const res: any = await apiService.get('/live-streams');
      const data = res?.data;
      const streams = Array.isArray(data?.streams)
        ? data.streams
        : (Array.isArray(data) ? data : []);

      streams.sort((a: any, b: any) => (b.viewerCount || 0) - (a.viewerCount || 0));
      setLiveStreams(streams);
    } catch (err) {
      setLiveStreams([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchLiveStreams();
      centerOnUserLocation();
      const t = setInterval(fetchLiveStreams, 5000);
      return () => clearInterval(t);
    }, [centerOnUserLocation, fetchLiveStreams])
  );

  const filteredPosts = safePosts.filter((p) => {
    const lat = p.lat ?? (typeof p.location !== 'string' ? p.location?.lat : undefined);
    const lon = p.lon ?? (typeof p.location !== 'string' ? p.location?.lon : undefined);
    const likes = p.likesCount ?? p.likes ?? 0;
    if (userId) return isValidLatLon(lat, lon) && p.userId === userId;
    return isValidLatLon(lat, lon) && likes >= 100;
  });

  // Group posts by location for map markers
  const locationGroups: { [key: string]: PostType[] } = {};

  (Array.isArray(filteredPosts) ? filteredPosts : []).forEach((p) => {
    let lat = p.lat ?? (typeof p.location !== 'string' ? p.location?.lat : undefined);
    let lon = p.lon ?? (typeof p.location !== 'string' ? p.location?.lon : undefined);
    if ((lat == null || lon == null) && typeof p.location === 'object' && p.location) {
      lat = p.location.lat;
      lon = p.location.lon;
    }

    const imageUrl = p.imageUrl || (Array.isArray((p as any).mediaUrls) && (p as any).mediaUrls[0]) || (Array.isArray(p.imageUrls) && p.imageUrls[0]) || DEFAULT_AVATAR_URL;
    if (isValidLatLon(lat, lon) && typeof imageUrl === 'string' && imageUrl) {
      const key = `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
      if (!locationGroups[key]) locationGroups[key] = [];
      locationGroups[key].push({ ...p, lat: Number(lat), lon: Number(lon), imageUrl });
      locationGroups[key] = locationGroups[key]
        .sort((a, b) => ((b.likesCount ?? b.likes ?? 0) - (a.likesCount ?? a.likes ?? 0)))
        .slice(0, 5);
    }
  });
  const limitedLocationGroups = Object.entries(locationGroups)
    .slice(0, 50)
    .reduce((acc, [key, val]) => {
      acc[key] = val;
      return acc;
    }, {} as typeof locationGroups);

  const validRegion = isValidRegion(mapRegion);

  const PostMarker: React.FC<{ post: PostType; postsAtLocation: PostType[] }> = ({ post, postsAtLocation }) => {
    const [tracks, setTracks] = useState(true);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [avatarLoaded, setAvatarLoaded] = useState(false);

    useEffect(() => {
      const timeout = setTimeout(() => setTracks(false), 20000);
      return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
      if (imgLoaded && avatarLoaded) setTracks(false);
    }, [imgLoaded, avatarLoaded]);

    const imageUrl = post.imageUrl || (Array.isArray((post as any).mediaUrls) && (post as any).mediaUrls[0]) || (Array.isArray(post.imageUrls) && post.imageUrls[0]) || DEFAULT_AVATAR_URL;
    const avatarUrl = post.userAvatar || DEFAULT_AVATAR_URL;

    const markerImageUrl = getOptimizedImageUrl(imageUrl, 'map-marker');
    const markerAvatarUrl = getOptimizedImageUrl(avatarUrl, 'thumbnail');

    return Marker ? (
      <Marker
        key={`post-${post.id}`}
        coordinate={{ latitude: Number(post.lat), longitude: Number(post.lon) }}
        tracksViewChanges={tracks}
        onPress={() => setSelectedPosts(postsAtLocation)}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={styles.markerContainer}>
          <View style={styles.postImageWrapper}>
            <ExpoImage
              source={{ uri: markerImageUrl }}
              style={styles.postImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              placeholder={IMAGE_PLACEHOLDER}
              transition={150}
              onLoadEnd={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          </View>
          <View style={styles.postAvatarOutside}>
            <ExpoImage
              source={{ uri: markerAvatarUrl }}
              style={styles.postAvatarImgFixed}
              contentFit="cover"
              cachePolicy="memory-disk"
              placeholder={IMAGE_PLACEHOLDER}
              transition={120}
              onLoadEnd={() => setAvatarLoaded(true)}
              onError={() => setAvatarLoaded(true)}
            />
          </View>
        </View>
      </Marker>
    ) : null;
  };

  const LiveStreamMarker = ({ stream }: { stream: LiveStream }) => {
    if (!Marker || !stream.location) return null;
    return (
      <Marker
        key={`live-${stream.id}`}
        coordinate={{ latitude: stream.location.latitude, longitude: stream.location.longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        onPress={() => {
          router.push({
            pathname: '/watch-live',
            params: {
              streamId: (stream as any)?.id || (stream as any)?._id,
              roomId: (stream as any)?.roomId || stream.channelName || (stream as any)?.id,
              channelName: stream.channelName || (stream as any)?.id,
              title: (stream as any)?.title,
              hostName: (stream as any)?.userName,
              hostAvatar: (stream as any)?.userAvatar,
            }
          });
        }}
      >
        <View style={styles.liveMarkerContainer}>
          <View style={styles.liveBadgeNew}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.liveAvatarOutside}>
            <ExpoImage
              source={{ uri: stream.userAvatar || DEFAULT_AVATAR_URL }}
              style={styles.liveAvatarNew}
              contentFit="cover"
              cachePolicy="memory-disk"
              placeholder={IMAGE_PLACEHOLDER}
              transition={120}
            />
          </View>
        </View>
      </Marker>
    );
  };

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        {/* Main map or error fallback */}
        {!loading && validRegion && Platform.OS !== 'web' && MapView ? (
          <MapView
            ref={mapRef}
            style={styles.mapView}
            googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
            provider={Platform.OS === 'ios' ? 'google' : undefined}
            initialRegion={mapRegion && isValidLatLon(mapRegion.latitude, mapRegion.longitude)
              ? mapRegion
              : DEFAULT_REGION
            }
            region={mapRegion && isValidLatLon(mapRegion.latitude, mapRegion.longitude)
              ? mapRegion
              : DEFAULT_REGION
            }
          >
            {/* Live stream markers - only show LIVE pill, no distance */}
            {safeLiveStreams.map((stream) => (
              <LiveStreamMarker key={stream.id} stream={stream} />
            ))}
            {/* Post markers */}
            {Object.entries(limitedLocationGroups).map(([key, postsAtLocation]) => {
              try {
                const safePostsAtLocation = Array.isArray(postsAtLocation) ? postsAtLocation : [];
                const post = safePostsAtLocation[0];
                if (
                  post &&
                  isValidLatLon(post.lat, post.lon) &&
                  typeof post.imageUrl === 'string' && post.imageUrl &&
                  isFinite(Number(post.lat)) && isFinite(Number(post.lon))
                ) {
                  return <PostMarker key={`post-${key}`} post={post as any} postsAtLocation={safePostsAtLocation as any} />;
                }
              } catch (err) {
                console.error('Error rendering marker:', err, key, postsAtLocation);
                return null;
              }
              return null;
            })}
          </MapView>
        ) : (
          <View style={styles.errorText}>
            <Text style={{ color: '#c00', fontWeight: 'bold' }}>
              No valid map data available. Please try again later.
            </Text>
          </View>
        )}
        {/* ...existing code for modals... */}
        <PostLocationModal
          visible={!!safeSelectedPosts.length}
          posts={safeSelectedPosts}
          onClose={() => setSelectedPosts(null)}
          onImagePress={post => {
            let locationName = '';
            if (typeof post.location === 'string') {
              locationName = post.location;
            } else if (typeof post.location === 'object' && post.location?.name) {
              locationName = post.location.name;
            }
            if (locationName) {
              setSelectedPosts(null);
              router.push({
                pathname: '/(tabs)/home',
                params: { location: locationName }
              });
            }
          }}
        />

        {!showSearch && (
          <TouchableOpacity
            style={[styles.searchFab, { bottom: tabBarHeight + 12 }]}
            activeOpacity={0.85}
            onPress={() => {
              setShowSearch(true);
            }}
          >
            <Ionicons name="search" size={20} color="#0A3D62" />
          </TouchableOpacity>
        )}

        {showSearch && (
          <View style={[styles.searchOverlay, { bottom: 0 }]} pointerEvents="box-none">
            <View
              pointerEvents="none"
              renderToHardwareTextureAndroid
              style={[
                styles.tabBarBackdrop,
                {
                  height: tabBarHeight + 80,
                },
              ]}
            />

            <KeyboardAvoidingView
              style={[styles.searchSheet, { bottom: tabBarHeight }]}
              pointerEvents="auto"
              behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
              keyboardVerticalOffset={Platform.select({ ios: 90, android: tabBarHeight + (insets?.bottom || 0) })}
            >
              <View style={styles.searchSheetHandle} />
              <View style={styles.searchSheetBar}>
                {query ? (
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close" size={18} color="#111" />
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 26 }} />
                )}

                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search a location"
                  placeholderTextColor="#777"
                  style={styles.searchSheetInput}
                  returnKeyType="search"
                  onSubmitEditing={() => {
                    const q = query.trim();
                    if (!q) return;
                    const exact = suggestions.find((s) => s.name.toLowerCase() === q.toLowerCase());
                    const chosen = exact?.name || suggestions[0]?.name;
                    if (!chosen) return;
                    setSelectedLocation(chosen);
                    setQuery(chosen);
                    setSuggestions([]);
                    fetchLocationFeed(chosen, 'reset');
                  }}
                />

                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.85}
                  onPress={() => {
                    const q = query.trim();
                    if (!q) return;
                    const exact = suggestions.find((s) => s.name.toLowerCase() === q.toLowerCase());
                    const chosen = exact?.name || suggestions[0]?.name;
                    if (!chosen) return;
                    setSelectedLocation(chosen);
                    setQuery(chosen);
                    setSuggestions([]);
                    fetchLocationFeed(chosen, 'reset');
                  }}
                >
                  <Ionicons name="search" size={20} color="#111" />
                </TouchableOpacity>
              </View>

              {selectedLocation ? (
                <View style={styles.searchResultsWrap}>
                  <FlatList
                    data={locationError ? [] : locationPosts}
                    keyExtractor={(item: any, idx: number) => String(item?.id || item?._id || `loc-${idx}`)}
                    renderItem={({ item }) => (
                      <PostCard post={item} currentUser={currentUser || (currentUserId ? { uid: currentUserId, id: currentUserId } : null)} showMenu={true} />
                    )}
                    ListHeaderComponent={() => {
                      const postCount = typeof locationMeta?.postCount === 'number' ? locationMeta.postCount : locationPosts.length;
                      const postLabel = postCount === 1 ? 'Post' : 'Posts';
                      return (
                        <View style={styles.locationHeaderRow}>
                          <Text style={styles.locationHeaderCount}>
                            {postCount} {postLabel}
                          </Text>
                          <Text style={styles.locationHeaderTitle} numberOfLines={1}>
                            {selectedLocation}
                          </Text>
                        </View>
                      );
                    }}
                    onEndReached={() => {
                      if (!selectedLocation) return;
                      fetchLocationFeed(selectedLocation, 'more');
                    }}
                    onEndReachedThreshold={0.6}
                    ListFooterComponent={
                      locationLoadingMore ? (
                        <View style={{ paddingVertical: 12 }}>
                          <ActivityIndicator size="small" color="#111" />
                        </View>
                      ) : null
                    }
                    ListEmptyComponent={
                      <View style={styles.searchCenterState}>
                        {locationLoading ? (
                          <ActivityIndicator size="small" color="#111" />
                        ) : locationError ? (
                          <Text style={{ color: '#c00' }}>{locationError}</Text>
                        ) : (
                          <Text style={{ color: '#666' }}>No posts found</Text>
                        )}
                      </View>
                    }
                    contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
                    style={{ flex: 1 }}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  />
                </View>
              ) : (
                <View style={styles.searchResultsWrap}>
                  {!query.trim() ? null : suggestions.length === 0 ? (
                    <View style={styles.searchCenterState}>
                      <Text style={{ color: '#666' }}>No locations found</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={suggestions}
                      keyExtractor={(item) => item.name}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.suggestionRow}
                          onPress={() => {
                            setSelectedLocation(item.name);
                            setQuery(item.name);
                            setSuggestions([]);
                            fetchLocationFeed(item.name, 'reset');
                          }}
                        >
                          <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.suggestionCount}>{item.count} Post</Text>
                        </TouchableOpacity>
                      )}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    />
                  )}
                </View>
              )}
            </KeyboardAvoidingView>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  mapContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapView: { width: '100%', height: '100%' },
  errorText: { position: 'absolute', bottom: 20, color: '#c00', backgroundColor: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6 },

  searchFab: {
    position: 'absolute',
    right: 16,
    bottom: Platform.OS === 'ios' ? 34 : 20,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },

  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
    elevation: 30,
  },
  tabBarBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    zIndex: 1000,
    elevation: 1000,
  },
  searchBackButtonWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1002,
    elevation: 8,
  },
  searchBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  searchSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    zIndex: 1001,
    elevation: 1001,
  },
  searchSheetHandle: {
    width: 54,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d9d9d9',
    marginTop: 10,
    marginBottom: 14,
  },
  searchSheetBar: {
    width: '92%',
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  searchSheetInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    textAlign: 'right',
    paddingRight: 10,
  },

  searchResultsWrap: {
    flex: 1,
    width: '100%',
    paddingTop: 10,
  },
  searchCenterState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  suggestionRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionName: {
    fontSize: 16,
    color: '#111',
    flex: 1,
    paddingRight: 10,
  },
  suggestionCount: {
    fontSize: 13,
    color: '#666',
  },
  locationHeaderRow: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  locationHeaderCount: {
    fontSize: 13,
    color: '#111',
    fontWeight: '600',
    textAlign: 'center',
  },
  locationHeaderTitle: {
    fontSize: 20,
    color: '#111',
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },

  markerContainer: {
    position: 'relative',
    width: 44,
    height: 44,
  },
  postImageWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffa726',
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  postImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  postAvatarOutside: {
    position: 'absolute',
    top: -2,
    left: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 6,
    zIndex: 100,
    overflow: 'hidden',
  },
  postAvatarImgFixed: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },

  liveMarkerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  liveBadgeNew: {
    backgroundColor: '#e0245e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: -8,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  liveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  liveAvatarOutside: {
    marginLeft: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  liveAvatarNew: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
