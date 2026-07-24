import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from 'expo-haptics';
import { DEFAULT_AVATAR_URL, API_BASE_URL } from '../../lib/api';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScrollToTop } from '@react-navigation/native';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import AsyncStorage from '@/lib/storage';
import { FlashList } from '@shopify/flash-list';
import PostCard from '@/src/components/PostCard';
import { Skeleton } from '@/src/components/SkeletonLoader';
import { useHeaderVisibility } from './_layout';
import { useTabEvent } from './_layout';

import { getCategoryImageSource } from '../../lib/categoryImages';
import { apiService } from '@/src/services/apiService';
import { startLocationTracking } from '@/src/services/locationService';
import { resolveCanonicalUserId } from '../../lib/currentUser';
import { useNetworkStatus, useOfflineBanner } from '../../hooks/useOffline';
import { OfflineBanner } from '@/src/components/OfflineBanner';
import { getDisplayRatio } from '@/src/components/PostCard/PostMedia';

// New Custom Hooks
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { useCategories } from '@/hooks/useCategories';
import { useFeedEvents } from '@/hooks/useFeedEvents';
import { useAssetPreloader } from '@/hooks/useAssetPreloader';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MIRROR_HOME = false;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  fab: {
    position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#e0245e', alignItems: 'center', justifyContent: 'center', elevation: 8, zIndex: 100,
  },
  searchBar: {
    marginHorizontal: 10,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#F0F2F5',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  searchText: { color: '#222', fontSize: 15, fontWeight: '400', textAlign: 'center' },
  headerSection: { paddingBottom: 12, paddingTop: 12, backgroundColor: '#fff', marginBottom: 0 },
  chip: { alignItems: 'center', marginRight: 12 },
  chipIconWrap: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chipIconWrapActive: { borderColor: '#FF8D00', borderWidth: 2.5 },
  chipText: { color: '#000000', marginTop: 5, fontSize: 11, textAlign: 'center' },
  chipTextActive: { color: '#000000', fontWeight: '800' },
  categoryImage: { width: 64, height: 64, borderRadius: 14 },
});

export default function Home() {
  const navigation = useNavigation();
  const listRef = useRef<FlashList<any>>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const filter = (params.filter as string) || '';
  
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();
  const { showHeader } = useHeaderVisibility();
  const tabEvent = useTabEvent();

  // 1. Identity & Profile
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // 2. Custom Hooks for Logic Separation
  const { 
    posts, setPosts, 
    allLoadedPosts, setAllLoadedPosts, 
    loading, loadingMore, 
    loadInitialFeed, loadMorePosts, 
    HOME_CACHE_KEY 
  } = useHomeFeed(currentUserId, !!isOnline, filter);

  const { categories, loadCategories } = useCategories();
  
  // Refresh categories on focus to sync with Admin Panel
  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories])
  );

  useFeedEvents(setPosts, setAllLoadedPosts, !!isOnline, loadInitialFeed);

  // Use official hook for basic tap
  useScrollToTop(listRef);

  // Custom logic for "already focused" tab press (double tap behavior)
  useEffect(() => {
    const unsubscribe = (navigation.getParent() as any)?.addListener('tabPress', (e: any) => {
      const isFocused = navigation.isFocused();
      if (isFocused && e.target.includes('home')) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation]);

  // Initial user setup
  useEffect(() => {
    const getUserId = async () => {
      try {
        // EULA Validation Check
        const eulaAccepted = await AsyncStorage.getItem('eula_accepted_v2');
        if (eulaAccepted !== 'true') {
          router.replace('/auth/eula-screen');
          return;
        }

        const userId = await resolveCanonicalUserId();
        setCurrentUserId(userId);
        currentUserIdRef.current = userId;

        if (userId) {
          try {
            const response = await apiService.getUser(userId);
            if (response?.success && response?.data) {
              setCurrentUserData(response.data);
            }
            await startLocationTracking(userId);
          } catch (error) {}
        }
      } catch (error) {}
    };
    getUserId();
  }, []);

  useFocusEffect(
    useCallback(() => {
      showHeader();
      if (currentUserIdRef.current) {
        void startLocationTracking(currentUserIdRef.current);
      }
    }, [showHeader])
  );

  useEffect(() => {
    if (!tabEvent?.subscribeHomeTabPress) return;
    const unsub = tabEvent.subscribeHomeTabPress(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      showHeader();
    });
    return unsub;
  }, [tabEvent, showHeader]);

  // Forced refresh logic
  const lastRefreshTsRef = useRef<string>('');
  useEffect(() => {
    const ts = String((params as any)?.refreshTs || '');
    if (!ts || ts === lastRefreshTsRef.current) return;
    lastRefreshTsRef.current = ts;
    loadInitialFeed(0, { silent: true, _t: Number(ts) || Date.now() }).catch(() => {});
  }, [(params as any)?.refreshTs, loadInitialFeed]);

  // Filtering Logic
  const filteredRaw = useMemo(() => {
    const locationFilter = params.location as string;
    const selectedPostId = params.postId as string;

    let result = posts;

    if (locationFilter) {
      const key = String(locationFilter || '').trim().toLowerCase();
      result = posts.filter((p: any) => {
        const pLoc = typeof p.location === 'object' ? p.location?.name : p.location;
        if ((pLoc || '').toLowerCase() === key) return true;
        const keys = Array.isArray(p?.locationKeys) ? p.locationKeys : [];
        if (keys.some((k: any) => String(k || '').toLowerCase() === key)) return true;
        const ld = p?.locationData;
        if (ld?.city?.toLowerCase() === key || ld?.country?.toLowerCase() === key || ld?.countryCode?.toLowerCase() === key) return true;
        if (ld?.address?.toLowerCase()?.includes(key)) return true;
        return false;
      });

      if (selectedPostId) {
        const selected = result.find((p: any) => p.id === selectedPostId);
        const others = result.filter((p: any) => p.id !== selectedPostId);
        result = selected ? [selected, ...others] : others;
      }
    }

    console.log('[home.tsx] filter:', filter, 'posts length:', posts.length);
    if (filter) {
      result = result.filter((p: any) => {
        const catName = typeof p.category === 'string' ? p.category : String(p.category?.name || '');
        return catName.toLowerCase() === filter.toLowerCase();
      });
    }
    console.log('[home.tsx] filteredRaw result length:', result.length);
    return result;
  }, [posts, filter, params.location, params.postId]);

  useAssetPreloader(filteredRaw, (item: any) => {
    const media = Array.isArray(item.media) ? item.media : [];
    const isVideoUrl = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) || /\/video\//i.test(u);
    return [
      // Prefer posters/thumbs — do not prefetch full MP4s via ExpoImage
      ...media.map((m: any) => m.thumbnailUrl || (m.type === 'video' ? '' : m.url)),
      item.thumbnailUrl,
      item.imageUrl && !isVideoUrl(String(item.imageUrl)) ? item.imageUrl : '',
      item.userAvatar,
    ].filter((u) => !!u && !isVideoUrl(String(u)));
  });

  // Video prefetch: silently preload next 3 posts' video URLs so playback is instant
  useEffect(() => {
    if (!filteredRaw || filteredRaw.length === 0) return;
    const { preloadVideos } = require('@/lib/videoCache');
    const videoUrls: string[] = [];
    for (const item of filteredRaw.slice(0, 5)) {
      const media = Array.isArray(item.media) ? item.media : [];
      for (const m of media) {
        if (m?.type === 'video' && m?.url) videoUrls.push(m.url);
      }
      if (item.videoUrl) videoUrls.push(item.videoUrl);
    }
    if (videoUrls.length > 0) {
      preloadVideos(videoUrls, 3);
    }
  }, [filteredRaw]);

  const [visiblePostIds, setVisiblePostIds] = useState<Set<string>>(() => new Set());
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item?: any }[] }) => {
    const next = new Set<string>();
    for (const v of viewableItems || []) {
      const id = String(v?.item?.id || v?.item?._id || '');
      if (id) next.add(id);
    }
    setVisiblePostIds(next);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55, minimumViewTime: 80 }).current;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialFeed(0);
    setRefreshing(false);
  }, [loadInitialFeed]);

  const keyExtractor = useCallback((item: any) => {
    const id = item?.id || item?._id;
    return id ? `post-${String(id)}` : `post-fallback-${String(item?.createdAt || '')}`;
  }, []);

  const renderPostItem = useCallback(
    ({ item }: { item: any }) => {
      const id = String(item?.id || item?._id || '');
      const isVisible = !id || visiblePostIds.size === 0 || visiblePostIds.has(id);
      return (
        <PostCard
          post={item}
          currentUser={currentUserData || currentUserId}
          mirror={MIRROR_HOME}
          isVisible={isVisible}
        />
      );
    },
    [currentUserData, currentUserId, visiblePostIds]
  );

  const renderSkeletonItem = useCallback(() => (
    <View style={{ paddingVertical: 10, backgroundColor: '#fff', marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10 }}>
        <Skeleton width={34} height={34} borderRadius={17} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Skeleton width="46%" height={10} style={{ marginBottom: 8 }} />
          <Skeleton width="32%" height={10} />
        </View>
      </View>
      <Skeleton width="100%" height={SCREEN_WIDTH} borderRadius={0} />
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 10 }}>
        <Skeleton width={22} height={22} borderRadius={11} />
        <Skeleton width={22} height={22} borderRadius={11} />
        <Skeleton width={22} height={22} borderRadius={11} />
      </View>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <Skeleton width="78%" height={10} style={{ marginBottom: 8 }} />
        <Skeleton width="52%" height={10} />
      </View>
    </View>
  ), []);

  const showInitialSkeleton = loading && filteredRaw.length === 0;
  const skeletonItems = useMemo(() => Array.from({ length: 4 }, (_, i) => ({ key: `sk-${i}` })), []);

  const listHeader = useMemo(() => {
    const searchText = (!filter && !params.location) ? 'Search' : (params.location || filter);
    return (
      <View>
        <View style={styles.headerSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              { paddingLeft: 10, paddingRight: 10, paddingVertical: 0, flexGrow: 1 },
              MIRROR_HOME && { flexDirection: 'row-reverse' },
            ]}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.name}
                style={[styles.chip, MIRROR_HOME && { marginRight: 0, marginLeft: 10 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  const next = cat.name === filter ? '' : cat.name;
                  listRef.current?.scrollToOffset({ offset: 0, animated: true });
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

          <TouchableOpacity
            style={[
              styles.searchBar,
              MIRROR_HOME ? { flexDirection: 'row-reverse', justifyContent: 'flex-start' } : null,
            ]}
            onPress={() => router.push('/search-modal')}
          >
            <Feather name="search" size={18} color="#222" />
            <Text style={[styles.searchText, MIRROR_HOME && { marginLeft: 0, marginRight: 8 }]}>{searchText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [categories, filter, router, params.location]);

  const listFooter = useMemo(() => (
    loadingMore ? (
      <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color="#FF8D00" />
      </View>
    ) : <View style={{ height: 16 }} />
  ), [loadingMore]);

  return (
    <View style={styles.container}>
      {showBanner && <OfflineBanner text="You’re offline — showing saved feed" style={{ position: 'absolute', top: 8, left: 16, right: 16, zIndex: 500 }} />}
      <FlashList
        testID="home-feed-list"
        ref={listRef}
        showsVerticalScrollIndicator={false}
        data={showInitialSkeleton ? skeletonItems : filteredRaw}
        renderItem={showInitialSkeleton ? (renderSkeletonItem as any) : renderPostItem}
        keyExtractor={(item: any, index: number) => showInitialSkeleton ? String(item?.key || `sk-${index}`) : keyExtractor(item)}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          !loading ? (
            <View style={{ flex: 1, paddingVertical: 80, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="compass-outline" size={64} color="#ccc" style={{ marginBottom: 16 }} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 8, textAlign: 'center' }}>
                No Posts in {filter || 'this Category'}
              </Text>
              <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
                {filter 
                  ? `Be the first to share your travel moments under the ${filter} category!` 
                  : 'Be the first to share your travel adventures with the community!'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  router.push('/create-post' as any);
                }}
                style={{
                  marginTop: 20,
                  backgroundColor: '#FF8D00',
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Create Post</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        onEndReached={loadMorePosts}
        onEndReachedThreshold={1.5}
        estimatedItemSize={750}
        overrideItemLayout={(layout, item) => {
          const firstMedia = Array.isArray(item?.media) ? item.media[0] : null;
          const mediaHeight = SCREEN_WIDTH / getDisplayRatio(firstMedia?.aspectRatio);
          layout.size = 60 + mediaHeight + 50 + 60 + 20;
        }}
        drawDistance={SCREEN_HEIGHT * 2}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8D00" />}
      />
    </View>
  );
}
