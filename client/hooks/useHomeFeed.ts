import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { apiService } from '../src/_services/apiService';
import { getUserProfile } from '../lib/firebaseHelpers/index';
import { getCachedData, setCachedData } from '../hooks/useOffline';

export function useHomeFeed(currentUserId: string | null, isOnline: boolean, categoryFilter?: string) {
  const [posts, setPosts] = useState<any[]>([]);
  const [allLoadedPosts, setAllLoadedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  
  const nextPageRef = useRef(0);
  const allLoadedPostsRef = useRef<any[]>([]);
  const hasFetchedRef = useRef(false);
  const lastCategoryRef = useRef<string | undefined>(categoryFilter);

  useEffect(() => {
    allLoadedPostsRef.current = Array.isArray(allLoadedPosts) ? allLoadedPosts : [];
  }, [allLoadedPosts]);

  const HOME_CACHE_KEY = useMemo(
    () => `home_feed_v1_${String(currentUserId || 'anon')}_${categoryFilter || 'all'}`,
    [currentUserId, categoryFilter]
  );

  const shufflePosts = useCallback((postsArray: any[]) => {
    if (Platform.OS === 'ios') return [...postsArray];
    const shuffled = [...postsArray];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const createMixedFeed = useCallback((postsArray: any[]) => {
    if (postsArray.length === 0) return [];
    
    const getPostTimestamp = (createdAt: any): number => {
      if (!createdAt) return 0;
      if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
      if (typeof createdAt === 'string') return new Date(createdAt).getTime();
      if (typeof createdAt === 'number') return createdAt;
      return 0;
    };

    // 1. Separate very recent posts (last 6 hours) to keep them prioritized
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const veryRecent = postsArray.filter(p => getPostTimestamp(p.createdAt) > sixHoursAgo);
    const older = postsArray.filter(p => getPostTimestamp(p.createdAt) <= sixHoursAgo);

    // 2. Sort very recent by date (newest first)
    const sortedRecent = [...veryRecent].sort((a: any, b: any) => getPostTimestamp(b.createdAt) - getPostTimestamp(a.createdAt));

    // 3. Shuffle older posts to provide "freshness" on every reload
    const shuffledOlder = [...older];
    for (let i = shuffledOlder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOlder[i], shuffledOlder[j]] = [shuffledOlder[j], shuffledOlder[i]];
    }

    // 4. Combine: Top 3 newest, then a mix of recent and shuffled older
    return [...sortedRecent.slice(0, 3), ...shufflePosts([...sortedRecent.slice(3), ...shuffledOlder])];
  }, [shufflePosts]);

  const normalizeAvatar = useCallback((value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (['null', 'undefined', 'n/a', 'na'].includes(lower)) return '';
    if (lower.includes('via.placeholder.com/200x200.png?text=profile')) return '';
    if (lower.includes('/default%2fdefault-pic.jpg') || lower.includes('/default/default-pic.jpg')) return '';
    return trimmed;
  }, []);

  const getPostAuthorId = useCallback((post: any): string => {
    const raw = post?.userId;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') return String(raw._id || raw.id || raw.uid || raw.firebaseUid || '');
    return '';
  }, []);

  const loadInitialFeed = async (pageNum = 0, options?: { silent?: boolean, [key: string]: any }) => {
    if (pageNum === 0 && !options?.silent) setLoading(true);
    try {
      const limit = 20;
      const skip = pageNum * limit;
      console.log('[useHomeFeed] Fetching feed for category:', categoryFilter, 'pageNum:', pageNum);
      const response = await apiService.getPosts({ 
        skip, 
        limit, 
        requesterUserId: currentUserId || undefined,
        category: categoryFilter || undefined,
        ...options
      });
      console.log('[useHomeFeed] Raw response success:', response?.success, 'isArray:', Array.isArray(response), 'data length:', response?.data?.length || response?.length);

      let postsData: any[] = [];
      if (response?.success && Array.isArray(response.data)) {
        postsData = response.data;
      } else if (Array.isArray(response)) {
        postsData = response;
      }

      if (pageNum > 0 && postsData.length === 0) {
        const excludeIds = (allLoadedPostsRef.current || [])
          .map((p: any) => String(p?.id || p?._id || ''))
          .filter(Boolean)
          .slice(-180);
        try {
          const recRes = await apiService.getRecommendedPosts({
            limit,
            excludeIds: excludeIds.join(','),
            requesterUserId: currentUserId || undefined,
          });
          if (recRes?.success && Array.isArray(recRes.data)) {
            postsData = recRes.data;
          }
        } catch {}
      }

      const normalizedPosts = postsData.map(p => ({
        ...p,
        id: p.id || p._id,
        isPrivate: p.isPrivate ?? false,
        allowedFollowers: p.allowedFollowers || [],
      }));

      // Redundant safety filter for blocked users
      const blockedSet = new Set<string>();
      try {
        const { fetchBlockedUserIds } = await import('../services/moderation');
        const ids = await fetchBlockedUserIds(currentUserId || '');
        ids.forEach(id => blockedSet.add(String(id)));
      } catch {}

      const filteredPosts = normalizedPosts.filter(p => {
        const authorId = p.userId && typeof p.userId === 'object' 
          ? String(p.userId._id || p.userId.id || '') 
          : String(p.userId || '');
        return !blockedSet.has(authorId);
      });

      if (pageNum === 0) {
        try { await setCachedData(HOME_CACHE_KEY, filteredPosts, { ttl: 24 * 60 * 60 * 1000 }); } catch {}
        setAllLoadedPosts(filteredPosts);
        setPosts(createMixedFeed(filteredPosts));
        nextPageRef.current = 0;
      } else {
        setAllLoadedPosts(prev => {
          const updated = [...(Array.isArray(prev) ? prev : []), ...normalizedPosts];
          return Array.from(new Map(updated.map((p: any) => [String(p?.id || p?._id || ''), p])).values()).filter((p: any) => p && (p.id || p._id));
        });
        setPosts(prev => {
          const cur = Array.isArray(prev) ? prev : [];
          const seen = new Set(cur.map((p: any) => String(p?.id || p?._id || '')));
          const toAdd = normalizedPosts.filter(p => {
            const id = String(p?.id || p?._id || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          return [...cur, ...toAdd];
        });
      }
      return postsData;
    } catch (error: any) {
      console.error('[HomeFeed] Error loading posts:', error);
      return [];
    } finally {
      if (pageNum === 0 && !options?.silent) setLoading(false);
    }
  };

  // Track whether we've done an anonymous fetch (no userId) so we re-fetch
  // once the user's identity resolves.
  const fetchedAsAnonymousRef = useRef(false);

  useEffect(() => {
    (async () => {
      let hasCache = false;
      try {
        const cached = await getCachedData<any[]>(HOME_CACHE_KEY);
        if (Array.isArray(cached) && cached.length > 0) {
          setAllLoadedPosts(cached);
          setPosts(createMixedFeed(cached));
          setLoading(false);
          hasCache = true;
        }
      } catch {}

      // If category filter changed, force a reload and skip the already-fetched checks
      const categoryChanged = lastCategoryRef.current !== categoryFilter;
      if (categoryChanged) {
        lastCategoryRef.current = categoryFilter;
        hasFetchedRef.current = false;
      }

      // Allow feed to load even without a userId (optionalAuth on backend).
      // If we already fetched WITH a userId, don't refetch.
      // If we fetched anonymously and now have a userId, refetch to get personalized data.
      if (hasFetchedRef.current && !fetchedAsAnonymousRef.current) return;
      if (hasFetchedRef.current && fetchedAsAnonymousRef.current && !currentUserId) return;

      hasFetchedRef.current = true;
      fetchedAsAnonymousRef.current = !currentUserId;

      if (isOnline) {
        await loadInitialFeed(0, { silent: hasCache });
      } else {
        setLoading(prev => (prev ? false : prev));
      }
    })();
  }, [HOME_CACHE_KEY, createMixedFeed, isOnline, currentUserId, categoryFilter]);

  const loadMorePosts = useCallback(() => {
    if (loadingMore || loading || !hasMorePosts) return;
    const nextPage = nextPageRef.current + 1;
    setLoadingMore(true);
    loadInitialFeed(nextPage).then((res: any) => {
      const newData = Array.isArray(res) ? res : (res?.data || []);
      if (newData.length > 0) {
        nextPageRef.current = nextPage;
        setHasMorePosts(true);
      } else {
        setHasMorePosts(false);
      }
    }).finally(() => setLoadingMore(false));
  }, [loadingMore, loading, hasMorePosts, loadInitialFeed]);

  return {
    posts,
    setPosts,
    allLoadedPosts,
    setAllLoadedPosts,
    loading,
    loadingMore,
    hasMorePosts,
    setHasMorePosts,
    loadInitialFeed,
    loadMorePosts,
    createMixedFeed,
    HOME_CACHE_KEY
  };
}
