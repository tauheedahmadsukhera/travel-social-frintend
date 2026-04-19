import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, FlatList, ScrollView } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/api';
import { useAppDialog } from '@/src/_components/AppDialogProvider';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function SavedPostsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const targetUserId = typeof params.userId === 'string' ? params.userId : null;
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { showSuccess } = useAppDialog();

  const isOwner = !targetUserId || targetUserId === currentUserId;

  // Load saved posts
  const loadSavedPosts = useCallback(async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      setCurrentUserId(storedUserId);

      const userIdToFetch = targetUserId || storedUserId;
      
      if (!userIdToFetch) {
        Alert.alert('Error', 'User not specified');
        router.push('/auth/welcome');
        return;
      }

      setUserId(userIdToFetch);
      setLoading(true);

      // Fetch saved posts from backend
      const url = `${API_BASE_URL}/users/${userIdToFetch}/saved?limit=50`;
      console.log('[SavedPosts] Fetching from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[SavedPosts] Response status:', response.status);
      const json = await response.json();
      console.log('[SavedPosts] Response JSON:', JSON.stringify(json, null, 2));
      
      if (json.success) {
        console.log('✅ Loaded', json.data.length, 'saved posts');
        setSavedPosts(json.data);
      } else {
        console.error('❌ Failed to load saved posts:', json.error);
        setSavedPosts([]);
      }
    } catch (error) {
      console.error('❌ Error loading saved posts:', error);
      setSavedPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedPosts();
    }, [loadSavedPosts])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadSavedPosts();
  };

  const handleUnsave = async (postId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/saved/${postId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const json = await response.json();
      if (json.success) {
        setSavedPosts(savedPosts.filter(post => post._id !== postId));
        showSuccess('Post unsaved');
      } else {
        Alert.alert('Error', 'Failed to unsave post');
      }
    } catch (error) {
      console.error('❌ Error unsaving post:', error);
      Alert.alert('Error', 'Failed to unsave post');
    }
  };

  const renderPost = ({ item }: { item: any }) => (
    <View style={styles.postCard}>
      <TouchableOpacity 
        style={styles.postImageContainer}
        onPress={() => {
          const tappedPostId = String(item?.id || item?._id || '');
          const ownerId =
            (typeof item?.userId === 'string' ? item.userId : (item?.userId?._id || item?.userId?.uid)) ||
            (typeof item?.ownerId === 'string' ? item.ownerId : undefined) ||
            (typeof item?.authorId === 'string' ? item.authorId : undefined) ||
            (typeof item?.postedBy === 'string' ? item.postedBy : (item?.postedBy?._id || item?.postedBy?.uid)) ||
            '';

          if (ownerId && tappedPostId) {
            router.push({
              pathname: '/user/[userId]/posts',
              params: { userId: String(ownerId), postId: tappedPostId }
            } as any);
            return;
          }

          router.push({ pathname: '/post-detail', params: { postId: tappedPostId || item._id } });
        }}
        activeOpacity={0.7}
      >
        {item.mediaUrls && item.mediaUrls.length > 0 ? (
          <ExpoImage
            source={{ uri: item.mediaUrls[0] }}
            style={styles.postImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : item.imageUrl ? (
          <ExpoImage
            source={{ uri: item.imageUrl }}
            style={styles.postImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.postImage, styles.emptyImage]}>
            <Text style={styles.emptyText} numberOfLines={3}>{item.caption || item.content}</Text>
          </View>
        )}

        {/* Unsave button overlay */}
        {isOwner && (
          <TouchableOpacity
            style={styles.unsaveButton}
            onPress={() => {
              Alert.alert('Unsave Post?', 'Remove this post from your saved items?', [
                { text: 'Cancel', onPress: () => {} },
                {
                  text: 'Unsave',
                  onPress: () => handleUnsave(item._id),
                  style: 'destructive',
                },
              ]);
            }}
          >
            <Ionicons name="bookmark" size={20} color="#007aff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <View style={styles.postInfo}>
        <Text style={styles.caption} numberOfLines={2}>
          {item.caption || item.content}
        </Text>
        <View style={styles.postStats}>
          <View style={styles.stat}>
            <Ionicons name="heart" size={14} color="#ff3b30" />
            <Text style={styles.statText}>{item.likesCount || 0}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="chatbubble" size={14} color="#007aff" />
            <Text style={styles.statText}>{item.commentsCount || 0}</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="bookmark" size={14} color="#34c759" />
            <Text style={styles.statText}>{item.savesCount || 0}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007aff" />
          <Text style={styles.loadingText}>Loading saved posts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeRouterBack()}>
          <Ionicons name="chevron-back" size={28} color="#222" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Posts</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#222" />
        </TouchableOpacity>
      </View>

      {savedPosts.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Saved Posts</Text>
          <Text style={styles.emptySubtitle}>Save posts to view them later</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={savedPosts}
          renderItem={renderPost}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          scrollEnabled={true}
        />
      )}
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    padding: 8,
    paddingBottom: 32,
  },
  postCard: {
    backgroundColor: '#fff',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  postImageContainer: {
    position: 'relative',
    width: '100%',
    height: 240,
    backgroundColor: '#f5f5f5',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  emptyImage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  unsaveButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  postInfo: {
    padding: 12,
  },
  caption: {
    fontSize: 14,
    color: '#222',
    marginBottom: 8,
    lineHeight: 20,
  },
  postStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});
