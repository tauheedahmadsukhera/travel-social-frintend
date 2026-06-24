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
import AsyncStorage from '@/lib/storage';
import { feedEventEmitter } from '../lib/feedEventEmitter';
import { hapticLight } from '../lib/haptics';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { normalizeMediaUrl, isVideoUrl } from '../lib/utils/media';
import { getVideoThumbnailUrl } from '../lib/imageHelpers';

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
      const cleanTag = tagString.replace(/^#/, '');
      console.log(`[Hashtag] Fetching posts for #${cleanTag}`);

      // Use the new dedicated hashtag posts endpoint
      const response = await apiService.get('/posts/hashtags/posts', { 
        hashtag: cleanTag,
        viewerId: currentUserId || undefined 
      });

      if (response?.success && Array.isArray(response?.data)) {
        // Ensure uniqueness just in case
        const uniquePosts = response.data.filter((post: any, index: number, self: any[]) =>
          index === self.findIndex((p) => (p.id || p._id) === (post.id || post._id))
        );

        const normalizedPosts = uniquePosts.map((post: any) => {
          const isVideo = post.mediaType === 'video' || isVideoUrl(post.mediaUrl || post.imageUrl);
          let thumb = post.thumbnailUrl;
          if (!thumb && isVideo) {
            thumb = getVideoThumbnailUrl(post.mediaUrl || post.imageUrl || '');
          }
          if (!thumb && !isVideo) {
            thumb = post.mediaUrl || post.imageUrl || (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : '');
          }
          
          return {
            ...post,
            id: post.id || post._id,
            gridThumb: thumb || post.mediaUrl || post.imageUrl || (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : ''),
          };
        });

        setPosts(normalizedPosts);
      } else {
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
                  source={{ uri: normalizeMediaUrl((post as any).gridThumb || post.imageUrl) }}
                  style={styles.gridImage}
                  contentFit="cover"
                  transition={200}
                  cachePolicy="memory-disk"
                />
                {(post.mediaType === 'video' || isVideoUrl(post.imageUrl)) && (
                  <View style={styles.playIconOverlay}>
                    <Ionicons name="play" size={16} color="#fff" />
                  </View>
                )}
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
  playIconOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
