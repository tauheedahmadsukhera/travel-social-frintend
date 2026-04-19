import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import PostCard from '@/src/_components/PostCard';
import PostViewerModal from '@/src/_components/PostViewerModal';
import CommentSection from '@/src/_components/CommentSection';
import { apiService } from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../lib/feedEventEmitter';
import { hapticLight } from '../lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  hashtags?: string[];
  likes: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: any;
};

export default function HashtagDetailsScreen() {
  const { tag } = useLocalSearchParams();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Post Viewer State
  const [postViewerVisible, setPostViewerVisible] = useState(false);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);

  // Comment Modal State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState("");
  const [commentModalAvatar, setCommentModalAvatar] = useState("");

  // Load current user when component mounts
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const userId = await AsyncStorage.getItem('userId');
        if (userId) {
          setCurrentUserId(userId);
          setCurrentUser({ uid: userId, id: userId });
        }
      } catch (error) {
        console.log('[Hashtag] Failed to load current user:', error);
      }
    };
    loadCurrentUser();
  }, []);

  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[Hashtag] Post deleted event received:', event.postId);
        setPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });

    const subscription = feedEventEmitter.addListener('feedUpdated', () => {
      fetchPosts();
    });

    return () => {
      unsub();
      subscription.remove();
    };
  }, [tag, currentUserId]);

  // Fetch posts with this hashtag
  async function fetchPosts() {
    if (!tag) return;
    setLoading(true);
    try {
      const tagString = Array.isArray(tag) ? tag[0] : tag;
      console.log(`[Hashtag] Fetching posts for #${tagString}`);

      // Try the API first
      try {
        const response = await apiService.get('/hashtags/posts', { hashtag: tagString });
        if (response?.success && Array.isArray(response?.data)) {
          const normalizedPosts = response.data.map((post: any) => ({
            ...post,
            id: post.id || post._id,
          }));
          setPosts(normalizedPosts);
          setLoading(false);
          return;
        }
      } catch (apiError) {
        console.log('[Hashtag] API endpoint not available, using local search:', apiError);
      }

      // Fallback: fetch all posts and filter by hashtag locally
      try {
        const feedRes: any = await apiService.getPosts({
          skip: 0,
          limit: 300,
          viewerId: currentUserId || undefined,
          requesterUserId: currentUserId || undefined,
        });
        const allPosts = feedRes?.success && Array.isArray(feedRes?.data) ? feedRes.data : [];

        const normalize = (str: string) => String(str || '').toLowerCase().trim();
        const normalizedTag = normalize(tagString.replace(/^#/, ''));

        const filteredPosts = allPosts.filter((post: any) => {
          const postHashtags = Array.isArray(post?.hashtags) ? post.hashtags : [];
          return postHashtags.some((ht: any) => normalize(String(ht)) === normalizedTag);
        });

        const normalized = filteredPosts.map((post: any) => ({
          ...post,
          id: post.id || post._id,
        }));

        setPosts(normalized);
      } catch (error) {
        console.log('[Hashtag] Fallback search error:', error);
        setPosts([]);
      }
    } catch (error) {
      console.error('[Hashtag] Error fetching posts:', error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPosts();
  }, [tag, currentUserId]);

  const tagString = Array.isArray(tag) ? tag[0] : tag;

  const renderSkeletonGrid = () => (
    <View style={styles.grid}>
      {Array.from({ length: 9 }).map((_, idx) => (
        <View key={idx} style={styles.gridItem}>
          <View style={{ backgroundColor: '#f0f0f0', width: '100%', height: '100%' }} />
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            hapticLight();
            safeRouterBack();
          }}
          style={styles.backBtn}
        >
          <Feather name="arrow-left" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitleText}>#{tagString}</Text>
        </View>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hashtag Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.hashtagBox}>
            <Text style={styles.hashtagIcon}>#</Text>
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.tagNameBold}>#{tagString}</Text>
            <Text style={styles.postCountText}>
              {posts.length >= 1000 ? `${(posts.length / 1000).toFixed(1)}K` : posts.length} posts
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Grid View */}
        {loading ? (
          renderSkeletonGrid()
        ) : posts.length === 0 ? (
          <View style={styles.centerContent}>
            <Feather name="hash" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No posts found</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {posts.map((post, index) => (
              <TouchableOpacity
                key={post.id || post._id}
                style={styles.gridItem}
                activeOpacity={0.9}
                onPress={() => {
                  hapticLight();
                  setSelectedPostIndex(index);
                  setPostViewerVisible(true);
                }}
              >
                <ExpoImage
                  source={{ uri: post.imageUrl || (post.imageUrls && post.imageUrls[0]) || '' }}
                  style={styles.gridImage}
                  contentFit="cover"
                  transition={200}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Post Viewer Modal */}
      {postViewerVisible && (
        <PostViewerModal
          visible={postViewerVisible}
          onClose={() => setPostViewerVisible(false)}
          posts={posts}
          selectedPostIndex={selectedPostIndex}
          profile={null}
          authUser={currentUser}
          likedPosts={{}}
          savedPosts={{}}
          handleLikePost={() => {}}
          handleSavePost={() => {}}
          handleSharePost={() => {}}
          setCommentModalPostId={(id) => setCommentModalPostId(id || "")}
          setCommentModalAvatar={(avatar) => setCommentModalAvatar(avatar)}
          setCommentModalVisible={(visible) => setCommentModalVisible(visible)}
          title="Hashtag Posts"
        />
      )}

      {/* Comment Section Modal */}
      <Modal
        visible={commentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          hapticLight();
          setCommentModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              activeOpacity={1}
              style={{ flex: 1 }}
              onPress={() => {
                hapticLight();
                setCommentModalVisible(false);
              }}
            />
            <View style={{ backgroundColor: '#fff', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#eee', borderRadius: 2, alignSelf: 'center', marginVertical: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#eee' }}>
                <Text style={{ fontWeight: '700', fontSize: 16 }}>Comments</Text>
                <TouchableOpacity
                  onPress={() => {
                    hapticLight();
                    setCommentModalVisible(false);
                  }}
                >
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <CommentSection
                postId={commentModalPostId}
                postOwnerId={posts.find(p => (p.id || p._id) === commentModalPostId)?.userId || ""}
                currentAvatar={commentModalAvatar}
                currentUser={currentUser}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  backBtn: {
    padding: 4,
    zIndex: 10,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#ddd', // matches the light color in screenshot
  },
  headerRightPlaceholder: {
    width: 32,
  },
  infoSection: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  hashtagBox: {
    width: 120,
    height: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hashtagIcon: {
    fontSize: 80,
    fontWeight: '300',
    color: '#000',
  },
  infoContent: {
    flex: 1,
    marginLeft: 20,
  },
  tagNameBold: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  postCountText: {
    fontSize: 16,
    color: '#888',
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: SCREEN_WIDTH / 3,
    aspectRatio: 1,
    padding: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  centerContent: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#999',
  },
});
