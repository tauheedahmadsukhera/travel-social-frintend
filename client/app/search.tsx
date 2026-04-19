import React, { useRef, useState, useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { debounce } from 'lodash';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllPosts, searchUsers } from '../lib/firebaseHelpers/index';
import { getPostsByHashtag, getTrendingHashtags } from '../lib/mentions';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { apiService } from '@/src/_services/apiService';


// Cache for search results
const searchCache = new Map<string, { users: any[], posts: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [query, setQuery] = useState(params?.query ? String(params.query) : '');
  const [searchType, setSearchType] = useState(params?.type ? String(params.type) : 'posts');
  const [loading, setLoading] = useState(false);
  const [userResults, setUserResults] = useState<any[]>([]);
  const [postResults, setPostResults] = useState<any[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'hashtags'>(
    searchType === 'hashtag' ? 'hashtags' : 'posts'
  );
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Get current user ID on mount
  useEffect(() => {
    const getCurrentUserId = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        setCurrentUserId(userId);
      } catch (error) {
        console.error('Failed to get userId:', error);
      }
    };
    getCurrentUserId();
  }, []);

  // Load trending hashtags on mount
  React.useEffect(() => {
    let mounted = true;
    const loadTrendingHashtags = async () => {
      try {
        const trending = await getTrendingHashtags(10);
        if (mounted) {
          setTrendingHashtags(trending);
        }
      } catch (error) {
        console.warn('Failed to load trending hashtags:', error);
      }
    };
    loadTrendingHashtags();
    return () => { mounted = false; };
  }, []);

  // Load all posts once on mount (with limit)
  React.useEffect(() => {
    let mounted = true;
    const loadPosts = async () => {
      const cacheKey = 'all_posts';
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        if (mounted) setAllPosts(cached.posts);
        return;
      }
      
      const result = await getAllPosts();
      if (result.success && mounted) {
        const posts = (result.data || []).slice(0, 200);
        setAllPosts(posts);
        searchCache.set(cacheKey, { posts, users: [], timestamp: Date.now() });
      }
    };
    loadPosts();
    return () => { mounted = false; };
  }, []);

  // Debounced search handler with cache
  const debouncedSearch = useRef(
    debounce(async (text: string, tab: 'posts' | 'users' | 'hashtags') => {
      if (!text.trim()) {
        setUserResults([]);
        setPostResults([]);
        setLoading(false);
        return;
      }

      const cacheKey = `${tab}_${text.toLowerCase()}`;
      const cached = searchCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        if (tab === 'users') {
          // Filter out current user
          const uid = currentUserIdRef.current;
          const filteredUsers = cached.users.filter(u => u.id !== uid && u._id !== uid);
          setUserResults(filteredUsers);
        }
        else if (tab === 'hashtags') setPostResults(cached.posts);
        else setPostResults(cached.posts);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        if (tab === 'users') {
          const result = await searchUsers(text, 15);
          const users = result.success ? result.data : [];
          // Filter out current user from results
          const uid = currentUserIdRef.current;
          const filteredUsers = users.filter((u: any) => u.id !== uid && u._id !== uid);
          console.log('[Search] Found', users.length, 'users, showing', filteredUsers.length, 'after filtering current user');
          setUserResults(filteredUsers);
          searchCache.set(cacheKey, { users: filteredUsers, posts: [], timestamp: Date.now() });
        } else if (tab === 'hashtags') {
          // Search for posts with this hashtag
          const cleanHashtag = text.replace(/^#+/, ''); // Remove leading # if present
          const posts = await getPostsByHashtag(cleanHashtag);
          setPostResults(posts);
          searchCache.set(cacheKey, { posts, users: [], timestamp: Date.now() });
        } else {
          const q = text.toLowerCase().trim();
          const locationHaystack = (post: any) =>
            [
              typeof post.location === 'string' ? post.location : post.location?.name,
              post.locationName,
              post.locationData?.name,
              post.locationData?.address,
              post.locationData?.city,
              post.locationData?.country,
              ...(Array.isArray(post.locationKeys) ? post.locationKeys : []),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

          const localMatches = allPosts.filter((post: any) => {
            const cap = (post.caption || '').toLowerCase();
            const un = (post.userName || '').toLowerCase();
            return cap.includes(q) || un.includes(q) || locationHaystack(post).includes(q);
          });

          let merged: any[] = localMatches.slice(0, 250);
          try {
            if (q.length >= 2) {
              const remoteByLoc: any[] = [];
              const locPageSize = 50;
              const maxLocPages = 300;
              for (let p = 0; p < maxLocPages; p++) {
                const remote: any = await apiService.getPostsByLocation(
                  text.trim(),
                  p * locPageSize,
                  locPageSize,
                  currentUserIdRef.current || undefined
                );
                const chunk =
                  remote?.success && Array.isArray(remote?.data) ? remote.data : [];
                remoteByLoc.push(...chunk);
                if (chunk.length < locPageSize) break;
              }
              const byId = new Map<string, any>();
              for (const p of remoteByLoc) {
                const id = String(p?.id || p?._id || '');
                if (!id) continue;
                byId.set(id, { ...p, id: p.id || p._id });
              }
              for (const p of localMatches) {
                const id = String(p?.id || p?._id || '');
                if (!id) continue;
                if (!byId.has(id)) byId.set(id, { ...p, id: p.id || p._id });
              }
              merged = Array.from(byId.values())
                .filter((post: any) => {
                  const hay =
                    locationHaystack(post) +
                    ' ' +
                    (post.caption || '').toLowerCase() +
                    ' ' +
                    (post.userName || '').toLowerCase();
                  return hay.includes(q);
                })
                .sort(
                  (a: any, b: any) =>
                    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                )
                .slice(0, 250);
            }
          } catch {
            merged = localMatches.slice(0, 250);
          }

          setPostResults(merged);
          searchCache.set(cacheKey, { posts: merged, users: [], timestamp: Date.now() });
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 500)
  ).current;

  const handleSearch = (text: string) => {
    setQuery(text);
    if (text.trim()) {
      setLoading(true);
      debouncedSearch(text, activeTab as any);
    } else {
      setUserResults([]);
      setPostResults([]);
      setLoading(false);
    }
  };
  
  // Handle initial search if coming from hashtag tap
  React.useEffect(() => {
    if (query.trim() && searchType === 'hashtag') {
      handleSearch(query);
    }
  }, []);

  React.useEffect(() => {
    if (query.trim()) {
      setLoading(true);
      debouncedSearch(query, activeTab);
    } else {
      setUserResults([]);
      setPostResults([]);
      setLoading(false);
    }
  }, [activeTab]);

  const handleTabSwitch = (tab: 'posts' | 'users' | 'hashtags') => {
    setActiveTab(tab);
  };

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
        <FlatList
          data={userResults}
          keyExtractor={item => item.uid || item.id}
          renderItem={({ item }) => (
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
                <Text style={styles.name}>{item.displayName || item.userName || 'User'}</Text>
                <Text style={styles.email}>{item.email}</Text>
              </View>
              <Feather name="chevron-right" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No users found</Text>}
          refreshing={loading}
          onRefresh={() => handleSearch(query)}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
        />
      ) : activeTab === 'hashtags' ? (
        query.trim() ? (
          <FlatList
            data={postResults}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/highlight/[id]', params: { id: item.id } })}>
                <ExpoImage 
                  source={{ uri: item.imageUrl || item.mediaUrls?.[0] || item.imageUrls?.[0] || 'https://via.placeholder.com/200x200.png?text=Post' }} 
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
          />
        ) : (
          <FlatList
            data={trendingHashtags}
            keyExtractor={(item, idx) => `${item.hashtag}-${idx}`}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.hashtagRow}
                onPress={() => {
                  setQuery(item.hashtag);
                  handleSearch(item.hashtag);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.hashtagName}>#{item.hashtag}</Text>
                  <Text style={styles.hashtagCount}>{item.postCount || 0} posts</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#ccc" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ color: '#888', marginTop: 32, textAlign: 'center' }}>No trending hashtags</Text>}
          />
        )
      ) : (
        <FlatList
          data={postResults}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/highlight/[id]', params: { id: item.id } })}>
              <ExpoImage 
                source={{ uri: item.imageUrl || item.mediaUrls?.[0] || item.imageUrls?.[0] || DEFAULT_AVATAR_URL }} 
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
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
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


