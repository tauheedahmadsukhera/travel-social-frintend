import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PostCard from '../../../src/_components/PostCard';
import { apiService } from '../../../src/_services/apiService';
import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../../../hooks/useOffline';
import { safeRouterBack } from '@/lib/safeRouterBack';



const PAGE_SIZE = 20;
const INITIAL_PAGE_SIZE = 100;
const MAX_INITIAL_PAGES = 5;
const HEADER_H = 52;

export default function UserPostsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const userId = useMemo(() => {
    const v = (params as any)?.userId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const postId = useMemo(() => {
    const v = (params as any)?.postId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const listRef = useRef<FlatList>(null);
  const didScrollToTargetRef = useRef(false);
  const pendingScrollIndexRef = useRef<number | null>(null);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const single = useMemo(() => {
    return (params as any)?.single === 'true' || (params as any)?.single === true;
  }, [params]);

  const CACHE_KEY = useMemo(() => {
    const uid = String(userId || 'unknown');
    const pid = postId ? `_${String(postId)}` : '';
    const mode = single ? '_single' : '';
    return `user_posts_v2_${uid}${pid}${mode}`;
  }, [postId, single, userId]);

  // Cache-first boot: show cached posts immediately (works offline).
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const cached = await getCachedData<any>(CACHE_KEY);
        if (cached) {
          if (cached.profile !== undefined) setProfile(cached.profile);
          if (Array.isArray(cached.posts) && cached.posts.length > 0) {
            setPosts(cached.posts);
            setSkip(typeof cached.skip === 'number' ? cached.skip : cached.posts.length);
            if (typeof cached.hasMore === 'boolean') setHasMore(cached.hasMore);
            setLoading(false);
          }
        }
      } catch { }
    })();
  }, [CACHE_KEY, userId]);

  useEffect(() => {
    (async () => {
      try {
        const id = await AsyncStorage.getItem('userId');
        setViewerId(id);
      } catch {
        setViewerId(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        if (!isOnline && profile) return;
        const res = await apiService.get(`/users/${userId}`, viewerId ? { requesterUserId: viewerId } : undefined);
        if (res?.success) setProfile(res?.data || null);
      } catch {
        setProfile(null);
      }
    })();
  }, [isOnline, profile, userId, viewerId]);

  const normalizePosts = useCallback((arr: any[]) => {
    return (Array.isArray(arr) ? arr : []).map((p: any) => ({
      ...p,
      id: p?.id || p?._id,
    })).filter((p: any) => p?.id);
  }, []);

  const mergeDedup = useCallback((prev: any[], next: any[]) => {
    const map = new Map<string, any>();
    [...prev, ...next].forEach((p: any) => {
      const id = String(p?.id || p?._id || '');
      if (!id) return;
      map.set(id, { ...p, id });
    });
    return Array.from(map.values());
  }, []);

  const tryScrollToPost = useCallback((allPosts: any[]) => {
    if (!postId) return;
    if (didScrollToTargetRef.current) return;

    const idx = allPosts.findIndex((p: any) => String(p?.id || p?._id || '') === String(postId));
    if (idx < 0) return;

    pendingScrollIndexRef.current = idx;
  }, [postId]);

  // Perform the scroll only after the FlatList has data rendered.
  useEffect(() => {
    const idx = pendingScrollIndexRef.current;
    if (idx == null) return;
    if (!Array.isArray(posts) || posts.length === 0) return;
    if (idx < 0 || idx >= posts.length) return;
    if (didScrollToTargetRef.current) return;

    didScrollToTargetRef.current = true;
    requestAnimationFrame(() => {
      try {
        // Instagram-like: land exactly on the tapped post (no "half previous post" visible)
        listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0, viewOffset: HEADER_H });
      } catch {
      }
    });
  }, [posts]);


  const fetchInitial = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadingMore(false);
    didScrollToTargetRef.current = false;

    try {
      if (!isOnline && posts.length > 0) {
        setLoading(false);
        return;
      }

      if (single && postId) {
        // Fetch only the specific post
        const res = await apiService.get(`/posts/${postId}`);
        const data = res?.success && res?.data ? [res.data] : [];
        const normalized = normalizePosts(data);
        setPosts(normalized);
        setSkip(normalized.length);
        setHasMore(false); // No more posts to fetch in single mode
        try {
          await setCachedData(CACHE_KEY, { profile, posts: normalized, skip: normalized.length, hasMore: false }, { ttl: 24 * 60 * 60 * 1000 });
        } catch { }
        return;
      }

      let nextSkip = 0;
      let merged: any[] = [];
      let lastBatchSize = 0;

      const limit = postId ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const maxPages = postId ? MAX_INITIAL_PAGES : 1;

      for (let i = 0; i < maxPages; i += 1) {
        const res = await apiService.getUserPosts(String(userId), {
          skip: nextSkip,
          limit,
          viewerId: viewerId || undefined,
        });

        const data = res?.success && Array.isArray(res?.data) ? res.data : [];
        const normalized = normalizePosts(data);
        lastBatchSize = normalized.length;
        merged = mergeDedup(merged, normalized);
        nextSkip += normalized.length;

        tryScrollToPost(merged);

        if (!postId) break;
        const found = merged.some((p: any) => String(p?.id || p?._id || '') === String(postId));
        if (found) break;
        if (normalized.length < limit) break;
      }

      setPosts(merged);
      setSkip(nextSkip);
      setHasMore(lastBatchSize >= limit);
      try {
        await setCachedData(CACHE_KEY, { profile, posts: merged, skip: nextSkip, hasMore: lastBatchSize >= limit }, { ttl: 24 * 60 * 60 * 1000 });
      } catch { }
    } catch {
      setPosts([]);
      setSkip(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, isOnline, mergeDedup, normalizePosts, postId, posts.length, profile, single, tryScrollToPost, userId, viewerId]);

  const fetchMore = useCallback(async () => {
    if (!userId) return;
    if (loading || loadingMore) return;
    if (!hasMore) return;
    if (!isOnline) return;

    setLoadingMore(true);
    try {
      const res = await apiService.getUserPosts(String(userId), {
        skip,
        limit: PAGE_SIZE,
        viewerId: viewerId || undefined,
      });

      const data = res?.success && Array.isArray(res?.data) ? res.data : [];
      const normalized = normalizePosts(data);

      setPosts(prev => {
        const next = mergeDedup(prev, normalized);
        tryScrollToPost(next);
        return next;
      });

      setSkip(prev => prev + normalized.length);
      setHasMore(normalized.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, isOnline, loading, loadingMore, mergeDedup, normalizePosts, skip, tryScrollToPost, userId, viewerId]);

  useEffect(() => {
    if (!userId) return;
    setHasMore(true);
    setSkip(0);
    fetchInitial();
  }, [fetchInitial, userId]);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[UserPosts] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
      if (event.type === 'POST_UPDATED' && event.postId) {
        const patch = event.data && typeof event.data === 'object' ? event.data : {};
        const apply = (p: any) => {
          if (!p) return p;
          const ids = [String(p.id || ''), String(p._id || ''), String((p as any).postId || '')].filter(Boolean);
          if (!ids.includes(String(event.postId))) return p;
          return {
            ...p,
            ...(patch.caption !== undefined ? { caption: patch.caption } : null),
            ...(patch.content !== undefined ? { content: patch.content } : null),
            updatedAt: new Date().toISOString(),
          };
        };
        setPosts(prev => (Array.isArray(prev) ? prev.map(apply) : prev));
      }
    });
    return unsub;
  }, []);

  // Generic refresh signal used after edits/deletes to refetch from server.
  useEffect(() => {
    // @ts-ignore - fbemitter untyped
    const sub = feedEventEmitter.addListener('feedUpdated', () => {
      if (!isOnline) return;
      fetchInitial().catch(() => {});
    });
    return () => sub.remove();
  }, [fetchInitial, isOnline]);


  const onEndReached = () => {
    fetchMore();
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'bottom']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeRouterBack()}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.missingText}>Missing userId</Text>
      </SafeAreaView>
    );
  }

  if (loading && posts.length === 0) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#0A3D62" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {showBanner && posts.length > 0 && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>You’re offline — showing cached posts</Text>
        </View>
      )}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeRouterBack()}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {String(profile?.displayName || profile?.name || profile?.username || 'Posts')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(item: any, index: number) => String(item?.id || item?._id || `post-${index}`)}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews
        renderItem={({ item }: { item: any }) => (
          <PostCard
            post={item}
            currentUser={viewerId}
            showMenu={true}
          />
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color="#0A3D62" />
            </View>
          ) : null
        }
        onScrollToIndexFailed={(info) => {
          if (!Array.isArray(posts) || posts.length === 0) return;
          if (info.index < 0 || info.index >= posts.length) return;
          const offset = info.averageItemLength * info.index;
          listRef.current?.scrollToOffset({ offset, animated: false });
          setTimeout(() => {
            if (!Array.isArray(posts) || posts.length === 0) return;
            if (info.index < 0 || info.index >= posts.length) return;
            listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0, viewOffset: HEADER_H });
          }, 150);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  backBtn: { padding: 6, marginRight: 8 },
  headerRight: { width: 28 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  footer: { paddingVertical: 16, alignItems: 'center' },
  missingText: { marginTop: 12, color: '#666', fontSize: 14 },
  offlineBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    opacity: 0.92,
  },
  offlineBannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});
