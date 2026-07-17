import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@/lib/storage';
import { getAllPosts, searchUsers } from '../lib/firebaseHelpers/index';
import { getPostsByHashtag, getTrendingHashtags } from '../lib/mentions';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { apiService } from '@/src/_services/apiService';
import VerifiedBadge from '@/src/_components/VerifiedBadge';
import { normalizeMediaUrl, isVideoUrl } from '../lib/utils/media';
import { getVideoThumbnailUrl } from '../lib/imageHelpers';
import { resolveCanonicalUserId } from '../lib/currentUser';
import { useAssetPreloader } from '@/hooks/useAssetPreloader';

import { useSearchData } from '@/src/features/search/hooks/useSearchData';

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [query, setQuery] = useState(params?.query ? String(params.query) : '');
  const [searchType, setSearchType] = useState(params?.type ? String(params.type) : 'posts');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'hashtags'>(
    searchType === 'hashtag' ? 'hashtags' : 'posts'
  );
  const insets = useSafeAreaInsets();

  useEffect(() => {
    resolveCanonicalUserId().then(setCurrentUserId).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      setQuery('');
    }, [])
  );

  const {
    trendingHashtags,
    results,
    isLoading: dataLoading,
    isSearching
  } = useSearchData({
    query,
    activeTab,
    currentUserId
  });

  useAssetPreloader(results, (item: any) => [
    item.imageUrl, 
    item.avatar, 
    item.photoURL, 
    item.media?.[0]?.url,
    item.userAvatar
  ].filter(Boolean));

  const loading = isSearching;

  const handleSearch = (text: string) => {
    setQuery(text);
  };

  const handleTabSwitch = (tab: 'posts' | 'users' | 'hashtags') => {
    setActiveTab(tab);
  };

  const userResults = activeTab === 'users' ? results : [];
  const postResults = activeTab !== 'users' ? results : [];

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Math.max(insets.top, 12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
        <TextInput
          style={{ flex: 1, fontSize: 16, backgroundColor: '#f7f7f7', borderRadius: 8, padding: 10 }}
          placeholder={activeTab === 'users' ? 'Search users...' : activeTab === 'hashtags' ? 'Search hashtags...' : 'Search posts...'}
          value={query}
          onChangeText={handleSearch}
        />
        <TouchableOpacity onPress={() => setQuery('')} style={{ marginLeft: 8 }}>
          <Feather name="x" size={22} color="#888" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
        <TouchableOpacity onPress={() => handleTabSwitch('posts')} style={[styles.tabBtn, activeTab === 'posts' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleTabSwitch('users')} style={[styles.tabBtn, activeTab === 'users' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>Users</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleTabSwitch('hashtags')} style={[styles.tabBtn, activeTab === 'hashtags' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'hashtags' && styles.tabTextActive]}>#Tags</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#FFB800" style={{ marginTop: 32 }} />
      ) : activeTab === 'users' ? (
        <FlashList
          data={userResults}
          keyExtractor={item => item.uid || item.id}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity 
              style={styles.row} 
              onPress={() => {
                const itemUserId = item.uid || item.id;
                // If it's current user, go to profile tab instead of wrapper
                if (itemUserId === currentUserId) {
                  router.push('/(tabs)/profile');
                } else {
                  // Other users go to wrapper with uid param
                  router.push({ pathname: '/user-profile', params: { uid: itemUserId } });
                }
              }}
            >
              <ExpoImage 
                source={{ uri: item.photoURL || item.avatar || DEFAULT_AVATAR_URL }} 
                style={styles.avatar}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name}>{item.displayName || item.userName || 'User'}</Text>
                  {!!(item.verified || item.isVerified) && <VerifiedBadge size={14} />}
                </View>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No users found</Text>}
          refreshing={loading}
          onRefresh={() => handleSearch(query)}
          estimatedItemSize={75}
        />
      ) : activeTab === 'hashtags' ? (
        query.trim() ? (
          <FlashList
            data={postResults}
            keyExtractor={item => item.id}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/post-detail', params: { id: item.id } })}>
                <ExpoImage 
                  source={{ 
                    uri: normalizeMediaUrl(
                      (item.mediaType === 'video' || isVideoUrl(item.imageUrl || item.mediaUrls?.[0]))
                        ? getVideoThumbnailUrl(item.imageUrl || item.mediaUrls?.[0] || '')
                        : (item.imageUrl || item.mediaUrls?.[0] || item.imageUrls?.[0] || DEFAULT_AVATAR_URL)
                    ) 
                  }} 
                  style={styles.postImg}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.userName || 'User'}</Text>
                  <Text style={styles.caption} numberOfLines={1}>{item.caption}</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No posts with this hashtag</Text>}
            estimatedItemSize={80}
          />
        ) : (
          <FlashList
            data={trendingHashtags}
            keyExtractor={(item: any, idx) => `${item.tag || idx}-${idx}`}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity 
                style={styles.hashtagRow}
                onPress={() => {
                  setQuery(item.tag);
                  handleSearch(item.tag);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.hashtagName}>#{item.tag}</Text>
                  <Text style={styles.hashtagCount}>{item.postCount || 0} posts</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No trending hashtags</Text>}
            estimatedItemSize={70}
          />
        )
      ) : (
        <FlashList
          data={postResults}
          keyExtractor={item => item.id}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/post-detail', params: { id: item.id } })}>
              <ExpoImage 
                source={{ 
                  uri: normalizeMediaUrl(
                    (item.mediaType === 'video' || isVideoUrl(item.imageUrl || item.mediaUrls?.[0]))
                      ? getVideoThumbnailUrl(item.imageUrl || item.mediaUrls?.[0] || '')
                      : (item.imageUrl || item.mediaUrls?.[0] || item.imageUrls?.[0] || DEFAULT_AVATAR_URL)
                  ) 
                }} 
                style={styles.postImg}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.userName || 'User'}</Text>
                <Text style={styles.caption}>{item.caption}</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No posts found</Text>}
          refreshing={loading}
          onRefresh={() => handleSearch(query)}
          estimatedItemSize={80}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBtn: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f7f7f7',
    marginHorizontal: 6,
  },
  tabActive: {
    backgroundColor: '#FFB800',
  },
  tabText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 14,
    backgroundColor: '#eee',
  },
  postImg: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: '#eee',
  },
  name: {
    fontWeight: '700',
    fontSize: 15,
    color: '#111',
  },
  email: {
    color: '#888',
    fontSize: 13,
  },
  caption: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  hashtagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  hashtagName: {
    fontWeight: '700',
    fontSize: 16,
    color: '#667eea',
  },
  hashtagCount: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
});


