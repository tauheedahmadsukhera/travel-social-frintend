import { Feather } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { DEFAULT_AVATAR_URL, API_BASE_URL } from '../../lib/api';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Platform
} from "react-native";
import PostCard from '@/src/_components/PostCard';
import StoriesRow from '@/src/_components/StoriesRow';
import LiveStreamsRow from '@/src/_components/LiveStreamsRow';
import StoriesViewer from '@/src/_components/StoriesViewer';
import { useHeaderVisibility, useHeaderHeight } from './_layout';
import { useTabEvent } from './_layout';

import { DEFAULT_CATEGORIES, getAllStoriesForFeed, getUserProfile } from '../../lib/firebaseHelpers/index';
import { getCategoryImageSource } from '../../lib/categoryImages';
import { apiService } from '@/src/_services/apiService';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { startLocationTracking } from '../../services/locationService';
import { resolveCanonicalUserId } from '../../lib/currentUser';
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';


const { width } = Dimensions.get("window");

const MIRROR_HOME = false;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  fab: {
    position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#e0245e', alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 100,
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  searchText: { color: '#666', fontSize: 15, fontWeight: '400' },
  headerSection: { paddingBottom: 6, paddingTop: 2 },
  chip: { alignItems: 'center', marginRight: 10 },
  chipIconWrap: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipIconWrapActive: { borderColor: '#0A3D62', borderWidth: 2.5 },
  chipText: { color: '#666', marginTop: 5, fontSize: 11, textAlign: 'center' },
  chipTextActive: { color: '#111', fontWeight: '700' },
  categoryImage: { width: 64, height: 64, borderRadius: 14 },
});

export default function Home() {

  const defaultCategoryObjects = Array.isArray(DEFAULT_CATEGORIES)
    ? DEFAULT_CATEGORIES.map((cat: any) =>
      typeof cat === 'string'
        ? { name: cat, image: '' }
        : cat
    )
    : [];

  const [categories, setCategories] = useState(defaultCategoryObjects);
  const params = useLocalSearchParams();
  const filter = (params.filter as string) || '';
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [allLoadedPosts, setAllLoadedPosts] = useState<any[]>([]);
  const allLoadedPostsRef = useRef<any[]>([]);
  useEffect(() => {
    allLoadedPostsRef.current = Array.isArray(allLoadedPosts) ? allLoadedPosts : [];
  }, [allLoadedPosts]);

  const nextPageRef = useRef(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [privacyFiltered, setPrivacyFiltered] = useState<any[]>([]);
  const [paginationOffset, setPaginationOffset] = useState(20);
  const POSTS_PER_PAGE = 10;
  const [storyMedia, setStoryMedia] = useState<{ uri: string; type: string } | null>(null);
  const flatListRef = React.useRef<FlatList>(null);
  const categoriesScrollRef = React.useRef<ScrollView>(null);
  const categoriesAutoScrolledRef = React.useRef(false);
  const openedStoryIdRef = React.useRef<string | null>(null);
  const { hideHeader, showHeader, headerScrollY } = useHeaderVisibility();
  // Header padding is handled by Tabs sceneStyle (see (tabs)/_layout.tsx)
  const headerHeight = 0;
  const tabEvent = useTabEvent();
  const lastScrollYRef = useRef(0);
  const lastEmitTsRef = useRef(0);
  const headerHiddenRef = useRef(false);
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const HOME_CACHE_KEY = useMemo(() => `home_feed_v1_${String(currentUserId || 'anon')}`, [currentUserId]);

  // Always show TopMenu when Home tab gains focus
  useFocusEffect(
    useCallback(() => {
      showHeader();
      headerHiddenRef.current = false;
    }, [showHeader])
  );

  useEffect(() => {
    if (!tabEvent?.subscribeHomeTabPress) return;
    const unsub = tabEvent.subscribeHomeTabPress(() => {
      requestAnimationFrame(() => {
        try {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch { }
      });
      headerHiddenRef.current = false;
      showHeader();
    });
    return unsub;
  }, [tabEvent, showHeader]);

  useEffect(() => {
    categoriesAutoScrolledRef.current = false;
  }, [categories.length]);

  // Handle media returning from story-creator screen
  useEffect(() => {
    const uri = params?.storyMediaUri != null ? String(params.storyMediaUri) : '';
    const type = params?.storyMediaType != null ? String(params.storyMediaType) : 'photo';
    if (!uri) return;
    setStoryMedia({ uri, type });
  }, [params?.storyMediaUri]);

  // Get current user ID from AsyncStorage (token-based auth)
  useEffect(() => {
    const getUserId = async () => {
      try {
        const userId = await resolveCanonicalUserId();
        setCurrentUserId(userId);

        // Also fetch user's display name and other info
        if (userId) {
          try {
            const response = await apiService.getUser(userId);
            if (response?.success && response?.data) {
              setCurrentUserData(response.data);
              if (__DEV__) console.log('[Home] User data loaded:', response.data?.displayName || response.data?.name);
            }

            // Start background location tracking for passport stamps
            await startLocationTracking(userId);
          } catch (error) {
            console.error('[Home] Initialization error:', error);
          }
        }
      } catch (error) {
        console.error('[Home] Failed to get userId from storage:', error);
      }
    };
    getUserId();
  }, []);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        if (__DEV__) console.log('[Home] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
        setAllLoadedPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
      if (event.type === 'POST_UPDATED' && event.postId) {
        const patch = event.data && typeof event.data === 'object' ? event.data : {};
        const apply = (p: any) => {
          if (!p) return p;
          const ids = [
            String(p.id || ''),
            String(p._id || ''),
            String((p as any).postId || ''),
          ].filter(Boolean);
          if (!ids.includes(String(event.postId))) return p;
          return {
            ...p,
            ...(patch.caption !== undefined ? { caption: patch.caption } : null),
            ...(patch.content !== undefined ? { content: patch.content } : null),
            updatedAt: new Date().toISOString(),
          };
        };
        setPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
        setAllLoadedPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
      }
    });
    return unsub;
  }, []);

  // Some flows emit a generic "feedUpdated" to force a lightweight refetch.
  // This avoids requiring an app reload when cached lists are stale.
  useEffect(() => {
    // @ts-ignore - fbemitter untyped
    const sub = feedEventEmitter.addListener('feedUpdated', () => {
      if (!isOnline) return;
      loadInitialFeed(0, { silent: true }).catch(() => {});
    });
    return () => sub.remove();
  }, [isOnline]);


  useEffect(() => {
    showHeader();
    return () => {
      showHeader();
    };
  }, [showHeader]);

  // Story deep-linking is now handled in (tabs)/_layout.tsx


  // Memoized shuffle
  const shufflePosts = useCallback((postsArray: any[]) => {
    const shuffled = [...postsArray];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Memoized feed mixer
  const createMixedFeed = useCallback((postsArray: any[]) => {
    if (postsArray.length === 0) return [];
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    // Helper to convert createdAt to timestamp
    const getPostTimestamp = (createdAt: any): number => {
      if (!createdAt) return 0;
      // If it's a Firestore timestamp with toMillis()
      if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
      // If it's an ISO string
      if (typeof createdAt === 'string') return new Date(createdAt).getTime();
      // If it's already a number
      if (typeof createdAt === 'number') return createdAt;
      return 0;
    };

    const recentPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime > oneDayAgo;
    });

    const mediumPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime <= oneDayAgo && postTime > threeDaysAgo;
    });

    const olderPosts = postsArray.filter((p: any) => {
      const postTime = getPostTimestamp(p.createdAt);
      return postTime <= threeDaysAgo;
    });

    if (__DEV__) console.log('[Home] createMixedFeed - recent:', recentPosts.length, 'medium:', mediumPosts.length, 'older:', olderPosts.length);

    const shuffledRecent = shufflePosts(recentPosts);
    const shuffledMedium = shufflePosts(mediumPosts);
    const shuffledOlder = shufflePosts(olderPosts);

    const mixed: any[] = [];
    const recentCount = Math.min(5, shuffledRecent.length);
    mixed.push(...shuffledRecent.slice(0, recentCount));

    const remaining = [...shuffledRecent.slice(recentCount), ...shuffledMedium, ...shuffledOlder];
    mixed.push(...shufflePosts(remaining));
    return mixed;
  }, [shufflePosts]);

  const normalizeAvatar = useCallback((value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
    if (lower.includes('via.placeholder.com/200x200.png?text=profile')) return '';
    if (lower.includes('/default%2fdefault-pic.jpg') || lower.includes('/default/default-pic.jpg')) return '';
    return trimmed;
  }, []);

  const getPostAuthorId = useCallback((post: any): string => {
    const raw = post?.userId;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
      return String(raw._id || raw.id || raw.uid || raw.firebaseUid || '');
    }
    return '';
  }, []);

  const loadInitialFeed = async (pageNum = 0, options?: { silent?: boolean }) => {
    if (pageNum === 0 && !options?.silent) setLoading(true);
    try {
      // OPTIMIZED: Use standard API service method
      // Reduce cold-start payload; additional posts load via pagination.
      const limit = 20;
      const skip = pageNum * limit;
      const response = await apiService.getPosts({ 
        skip, 
        limit, 
        requesterUserId: currentUserId || undefined 
      });

      // CLEAN RESPONSE HANDLING
      let postsData: any[] = [];
      if (response?.success && Array.isArray(response.data)) {
        postsData = response.data;
        if (__DEV__) console.log('[Home] Got posts:', postsData.length);
      } else if (Array.isArray(response)) {
        postsData = response;
        if (__DEV__) console.log('[Home] Got posts (array):', postsData.length);
      } else {
        if (__DEV__) console.warn('[Home] Unexpected response format:', response);
        postsData = [];
      }

      // Endless feed fallback: when “latest” posts end, load recommended/random posts.
      if (pageNum > 0 && postsData.length === 0) {
        const excludeIds = (allLoadedPostsRef.current || [])
          .map((p: any) => String(p?.id || p?._id || ''))
          .filter(Boolean)
          .slice(-180); // avoid huge query strings
        try {
          const recRes = await apiService.getRecommendedPosts({
            limit,
            excludeIds: excludeIds.join(','),
            requesterUserId: currentUserId || undefined,
          });
          if (recRes?.success && Array.isArray(recRes.data)) {
            postsData = recRes.data;
          }
        } catch { }
      }

      // Normalize posts: convert MongoDB _id to id, ensure required fields exist
      const normalizedPosts = postsData.map(p => ({
        ...p,
        id: p.id || p._id, // Use id if exists, otherwise use _id
        isPrivate: p.isPrivate ?? false, // Default to false if not set
        allowedFollowers: p.allowedFollowers || [], // Default to empty array
      }));

      // Hydrate missing/invalid avatars in a limited batch before rendering
      const postsWithAvatar = await (async () => {
        const authorIds = Array.from(new Set(normalizedPosts
          .map((p: any) => getPostAuthorId(p))
          .filter(Boolean)));

        const avatarMap: Record<string, string> = {};
        // Limit fanout to keep Home snappy
        const idsToFetch = authorIds.slice(0, 12);
        await Promise.all(idsToFetch.map(async (authorId) => {
          try {
            const profileRes: any = await getUserProfile(authorId);
            if (profileRes?.success && profileRes?.data) {
              const resolved = normalizeAvatar(
                profileRes.data.avatar || profileRes.data.photoURL || profileRes.data.profilePicture
              );
              if (resolved) avatarMap[authorId] = resolved;
            }
          } catch {
            // best-effort only
          }
        }));

        return normalizedPosts.map((p: any) => {
          const authorId = getPostAuthorId(p);
          const directAvatar = normalizeAvatar(
            p.userAvatar ||
            p.avatar ||
            p.photoURL ||
            p.profilePicture ||
            p?.userId?.avatar ||
            p?.userId?.photoURL ||
            p?.userId?.profilePicture
          );

          const hydratedAvatar = directAvatar || avatarMap[authorId] || '';
          if (!hydratedAvatar) return p;

          const hydratedUserObj = (p.userId && typeof p.userId === 'object')
            ? {
              ...p.userId,
              avatar: p.userId.avatar || hydratedAvatar,
              photoURL: p.userId.photoURL || hydratedAvatar,
              profilePicture: p.userId.profilePicture || hydratedAvatar,
            }
            : p.userId;

          return {
            ...p,
            userAvatar: p.userAvatar || hydratedAvatar,
            avatar: p.avatar || hydratedAvatar,
            photoURL: p.photoURL || hydratedAvatar,
            profilePicture: p.profilePicture || hydratedAvatar,
            userId: hydratedUserObj,
          };
        });
      })();

      // Cache the raw feed (not the filtered/paginated list).
      // This enables offline-first rendering next time.
      if (pageNum === 0) {
        try {
          await setCachedData(HOME_CACHE_KEY, postsWithAvatar, { ttl: 24 * 60 * 60 * 1000 });
        } catch { }
      }

      if (__DEV__) {
        console.log('[Home] Loaded posts count:', postsWithAvatar.length);
        // Log post details (dev-only; very expensive on device)
        postsWithAvatar.forEach((p) => {
          console.log(`  Loaded Post: id=${p.id}, userId=${p.userId}, isPrivate=${p.isPrivate}, category=${p.category}, location=${p.location?.name || p.location}`);
        });
      }

      if (pageNum === 0) {
        // First page: replace all
        if (__DEV__) console.log('[Home] Setting allLoadedPosts to:', postsWithAvatar.length);
        setAllLoadedPosts(postsWithAvatar);
        const mixedFeed = createMixedFeed(postsWithAvatar);
        if (__DEV__) console.log('[Home] Mixed feed count:', mixedFeed.length);
        setPosts(mixedFeed);
        setPaginationOffset(20); // Reset pagination
        nextPageRef.current = 0;
      } else {
        // Subsequent pages: append
        setAllLoadedPosts(prev => {
          const updated = [...(Array.isArray(prev) ? prev : []), ...postsWithAvatar];
          const unique = Array.from(new Map(updated.map((p: any) => [String(p?.id || p?._id || ''), p])).values())
            .filter((p: any) => p && (p.id || p._id));
          return unique;
        });
        // Keep rendered feed stable: append new posts (don’t reshuffle old ones).
        setPosts((prev: any[]) => {
          const cur = Array.isArray(prev) ? prev : [];
          const seen = new Set(cur.map((p: any) => String(p?.id || p?._id || '')));
          const toAdd = postsWithAvatar.filter((p: any) => {
            const id = String(p?.id || p?._id || '');
            if (!id) return false;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          return toAdd.length > 0 ? [...cur, ...toAdd] : cur;
        });
      }
    } catch (error: any) {
      if (error?.code === 'CIRCUIT_OPEN') {
        if (__DEV__) {
          console.warn('[Home] API cooling down (circuit); keeping cached feed if shown.');
        }
        return;
      }
      console.error('[Home] Error loading posts:', error);
    } finally {
      if (pageNum === 0 && !options?.silent) setLoading(false);
    }
  };

  const loadCategories = async () => {
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
      console.error('[Home] Failed to load categories:', error);
      setCategories(defaultCategoryObjects);
    }
  };

  useEffect(() => {
    if (__DEV__) console.log('[Home] Initial load effect running...');
    (async () => {
      // Cache-first boot: show cached feed immediately (works offline)
      try {
        const cached = await getCachedData<any[]>(HOME_CACHE_KEY);
        if (Array.isArray(cached) && cached.length > 0) {
          setAllLoadedPosts(cached);
          setPosts(createMixedFeed(cached));
          setPaginationOffset(20);
          setLoading(false);
        }
      } catch { }

      // If we're online, refresh in background; if offline and no cache, UI will keep loader.
      if (isOnline) {
        await loadInitialFeed(0);
      } else {
        // Ensure we don't block forever on first launch with no cache
        setLoading((prev) => (prev ? false : prev));
      }
    })();
    loadCategories();
  }, [HOME_CACHE_KEY, createMixedFeed, isOnline]);

  useEffect(() => {
    if (!MIRROR_HOME) return;
    if (!categories || categories.length === 0) return;
    requestAnimationFrame(() => {
      try {
        categoriesScrollRef.current?.scrollToEnd({ animated: false });
      } catch { }
    });
  }, [categories.length]);

  async function filterPostsByPrivacy(posts: any[], userId: string | undefined) {
    if (!userId) return posts.filter(post => !post.isPrivate);

    const viewerId = String(userId);
    return posts.filter(post => {
      const authorId = String(post.userId?._id || post.userId || '');
      if (!authorId) return false;
      if (authorId === viewerId) return true;
      if (!post.isPrivate) return true;
      
      if (post.isPrivate && Array.isArray(post.allowedFollowers)) {
        return post.allowedFollowers.some((id: any) => String(id) === viewerId);
      }
      return false;
    });
  }

  const filteredRaw = React.useMemo(() => {
    if (__DEV__) console.log('[Home] filteredRaw memo - posts count:', posts.length, 'filter:', filter, 'location:', params.location);

    const locationFilter = params.location as string;
    const selectedPostId = params.postId as string;

    if (locationFilter) {
      const key = String(locationFilter || '').trim().toLowerCase();
      const locationPosts = posts.filter((p: any) => {
        const pLoc = typeof p.location === 'object' ? p.location?.name : p.location;
        const exact = (pLoc || '').toLowerCase() === key;
        if (exact) return true;

        const keys = Array.isArray(p?.locationKeys) ? p.locationKeys : [];
        if (keys.some((k: any) => String(k || '').toLowerCase() === key)) return true;

        const ld = p?.locationData;
        const city = typeof ld?.city === 'string' ? ld.city.toLowerCase() : '';
        const country = typeof ld?.country === 'string' ? ld.country.toLowerCase() : '';
        const cc = typeof ld?.countryCode === 'string' ? ld.countryCode.toLowerCase() : '';
        if (city && city === key) return true;
        if (country && country === key) return true;
        if (cc && cc === key) return true;

        const addr = typeof ld?.address === 'string' ? ld.address.toLowerCase() : '';
        if (addr && addr.includes(key)) return true;

        return false;
      });

      if (__DEV__) console.log('[Home] filteredRaw location filter - result:', locationPosts.length);
      if (selectedPostId) {
        const selected = locationPosts.find((p: any) => p.id === selectedPostId);
        const others = locationPosts.filter((p: any) => p.id !== selectedPostId);
        return selected ? [selected, ...others] : others;
      }
      return locationPosts;
    }

    if (filter) {
      const categoryPosts = posts.filter((p: any) => p.category?.toLowerCase() === filter.toLowerCase());
      if (__DEV__) console.log('[Home] filteredRaw category filter - result:', categoryPosts.length);
      return categoryPosts;
    }

    return posts;
  }, [posts, filter, params.location, params.postId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const filtered = await filterPostsByPrivacy(filteredRaw, currentUserId || undefined);
      if (cancelled) return;
      setPrivacyFiltered(filtered.slice(0, paginationOffset));
    })();
    return () => {
      cancelled = true;
    };
  }, [filteredRaw, currentUserId, paginationOffset]);

  const loadMorePosts = useCallback(() => {
    if (loadingMore) return;
    if (privacyFiltered.length >= filteredRaw.length) {
      const nextPage = nextPageRef.current + 1;
      nextPageRef.current = nextPage;
      setLoadingMore(true);
      loadInitialFeed(nextPage).finally(() => setLoadingMore(false));
      return;
    }
    setLoadingMore(true);
    // Local pagination only: avoid artificial delay (was 300ms) for snappier scroll.
    requestAnimationFrame(() => {
      setPaginationOffset((prev) => prev + POSTS_PER_PAGE);
      setLoadingMore(false);
    });
  }, [loadingMore, privacyFiltered.length, filteredRaw.length, loadInitialFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPaginationOffset(20);
    await loadInitialFeed(0);
    setRefreshing(false);
  }, [loadInitialFeed]);

  const keyExtractor = useCallback((item: any) => {
    const id = item?.id || item?._id;
    return id ? `post-${String(id)}` : `post-fallback-${String(item?.createdAt || '')}`;
  }, []);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A3D62" />,
    [refreshing, onRefresh]
  );

  const skeletonItems = useMemo(() => Array.from({ length: 4 }, (_, i) => ({ key: `sk-${i}` })), []);
  const showInitialSkeleton = loading && (!Array.isArray(privacyFiltered) || privacyFiltered.length === 0);

  const contentContainerStyle = useMemo(
    // PERF/UX: keep bottom padding tight (avoid large white space near end).
    () => ({ paddingTop: headerHeight, paddingBottom: 24 }),
    [headerHeight]
  );

  const listFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color="#ffa726" />
        </View>
      );
    }
    if (privacyFiltered.length < allLoadedPosts.length) {
      // Keep footer quiet (Instagram-like). Avoid “scroll for more” messaging.
      return <View style={{ height: 16 }} />;
    }
    // Instagram-like: no “No more posts” message.
    return <View style={{ height: 16 }} />;
  }, [loadingMore, privacyFiltered.length, allLoadedPosts.length]);

  const renderSkeletonItem = useCallback(() => {
    return (
      <View style={{ paddingVertical: 10, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#eee' }} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ width: '46%', height: 10, borderRadius: 5, backgroundColor: '#eee', marginBottom: 8 }} />
            <View style={{ width: '32%', height: 10, borderRadius: 5, backgroundColor: '#f0f0f0' }} />
          </View>
        </View>
        <View style={{ width: '100%', aspectRatio: 1, backgroundColor: '#eee' }} />
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee' }} />
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <View style={{ width: '78%', height: 10, borderRadius: 5, backgroundColor: '#eee', marginBottom: 8 }} />
          <View style={{ width: '52%', height: 10, borderRadius: 5, backgroundColor: '#f0f0f0' }} />
        </View>
      </View>
    );
  }, []);

  const searchText = (!filter && !params.location) ? 'Search' : (params.location || filter);

  const renderPostItem = useCallback(
    ({ item }: { item: any }) => {
      const uniq = (values: any[]) => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const v of values) {
          const s = typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : '');
          if (!s || seen.has(s)) continue;
          seen.add(s);
          out.push(s);
        }
        return out;
      };

      const viewerIds = uniq([
        (currentUserData as any)?.firebaseUid,
        (currentUserData as any)?.uid,
        (currentUserData as any)?._id,
        (currentUserData as any)?.id,
        currentUserId,
      ]);

      const ownerIds = (() => {
        const rawUserId = item?.userId;
        const obj = rawUserId && typeof rawUserId === 'object' ? rawUserId : null;
        return uniq([
          typeof rawUserId === 'string' ? rawUserId : null,
          obj?._id,
          obj?.id,
          obj?.uid,
          obj?.firebaseUid,
          item?.uid,
          item?.userUid,
        ]);
      })();

      const viewerSet = new Set(viewerIds);
      const isOwner = ownerIds.some((id) => viewerSet.has(id));
      return (
        <PostCard
          post={item}
          currentUser={currentUserData || currentUserId}
          showMenu={isOwner}
          mirror={MIRROR_HOME}
        />
      );
    },
    [currentUserData, currentUserId]
  );

  const listHeader = useMemo(() => {
    return (
      <View>
        <LiveStreamsRow mirror={MIRROR_HOME} />

        <View style={styles.headerSection}>
          <TouchableOpacity
            style={[
              styles.searchBar,
              MIRROR_HOME ? { flexDirection: 'row-reverse', justifyContent: 'flex-start' } : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push('/search-modal');
            }}
          >
            <Feather name="search" size={18} color="#222" />
            <Text style={[styles.searchText, MIRROR_HOME && { marginLeft: 0, marginRight: 8 }]}>{searchText}</Text>
          </TouchableOpacity>

          <ScrollView
            ref={categoriesScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            persistentScrollbar={false}
            centerContent={true}
            alwaysBounceHorizontal={true}
            onContentSizeChange={() => {
              if (!MIRROR_HOME) return;
              if (categoriesAutoScrolledRef.current) return;
              categoriesAutoScrolledRef.current = true;
              requestAnimationFrame(() => {
                try {
                  categoriesScrollRef.current?.scrollToEnd({ animated: false });
                } catch { }
              });
            }}
            contentContainerStyle={[
              { paddingLeft: 16, paddingRight: 6, paddingVertical: 6, flexGrow: 1, justifyContent: 'center' },
              MIRROR_HOME && { flexDirection: 'row-reverse' },
            ]}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.name}
                style={[styles.chip, MIRROR_HOME && { marginRight: 0, marginLeft: 10 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  if (__DEV__) console.log('[Category] Clicked category:', cat.name);
                  const next = cat.name === filter ? '' : cat.name;
                  if (__DEV__) console.log('[Category] New filter:', next);
                  flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                  router.push(next ? `/(tabs)/home?filter=${encodeURIComponent(next)}` : `/(tabs)/home`);
                }}
              >
                <View style={[styles.chipIconWrap, filter === cat.name && styles.chipIconWrapActive]}>
                  <ExpoImage source={getCategoryImageSource(cat.name, cat.image)} style={styles.categoryImage} />
                </View>
                <Text style={[styles.chipText, filter === cat.name && styles.chipTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }, [categories, filter, router, searchText]);

  return (
    <View style={styles.container}>
      {showBanner && (
        <OfflineBanner
          text="You’re offline — showing saved feed"
          style={{ position: 'absolute', top: 8, left: 16, right: 16, zIndex: 500 }}
        />
      )}


      <Animated.FlatList
        ref={flatListRef}
        data={showInitialSkeleton ? skeletonItems : privacyFiltered}
        keyExtractor={(item: any, index: number) => {
          if (showInitialSkeleton) return String(item?.key || `sk-${index}`);
          return keyExtractor(item);
        }}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        persistentScrollbar={false}
        scrollEventThrottle={16}
        onScroll={
          headerScrollY
            ? Animated.event([{ nativeEvent: { contentOffset: { y: headerScrollY } } }], {
                useNativeDriver: false,
              })
            : undefined
        }
        // PERF: slightly larger window reduces blanking/jank while scrolling.
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={9}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}

        contentContainerStyle={contentContainerStyle}
        ListHeaderComponent={listHeader}
        renderItem={showInitialSkeleton ? (renderSkeletonItem as any) : renderPostItem}
        ListFooterComponent={listFooter}
        onEndReached={loadMorePosts}
        // Instagram-like: prefetch earlier so loader doesn’t appear inside a big blank gap.
        onEndReachedThreshold={0.85}
      />

    </View>
  );
}
