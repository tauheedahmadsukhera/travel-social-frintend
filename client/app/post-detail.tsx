import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PostViewerModal from '@/src/_components/PostViewerModal';
import CommentSection from '@/src/_components/CommentSection';
import { sharePost } from '../lib/postShare';
import { hapticLight } from '@/lib/haptics';
import { getCachedData, setCachedData, useOfflineBanner, useNetworkStatus } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { resolveCanonicalUserId } from '../lib/currentUser';

export default function PostDetailScreen() {
  const { id, openComments } = useLocalSearchParams();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [post, setPost] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Interaction State
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Comment Modal State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState("");
  const [commentModalAvatar, setCommentModalAvatar] = useState("");
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const CACHE_KEY = `post_detail_v1_${String(id || '')}`;

  useEffect(() => {
    if (openComments === 'true' && post && currentUser) {
      setCommentModalPostId(String(post.id || post._id));
      setCommentModalAvatar(currentUser.avatar || "");
      setCommentModalVisible(true);
    }
  }, [openComments, post, currentUser]);

  const getKeyboardOffset = () => {
    if (Platform.OS === 'ios') return 0;
    return 0;
  };

  useEffect(() => {
    async function initUser() {
      const uid = await resolveCanonicalUserId();
      if (uid) {
        // Also get other IDs from storage to be thorough
        const [storedUid, storedFirebaseUid] = await Promise.all([
          import('@react-native-async-storage/async-storage').then(m => m.default.getItem('uid')),
          import('@react-native-async-storage/async-storage').then(m => m.default.getItem('firebaseUid'))
        ]);

        const candidates = Array.from(new Set([uid, storedUid, storedFirebaseUid].filter(Boolean)));
        
        const { getUserProfile } = await import('../lib/firebaseHelpers/user');
        const res = await getUserProfile(uid);
        
        const userData = res.success && res.data ? res.data : {};
        setCurrentUser({ 
          ...userData, 
          id: uid, 
          _id: uid, 
          candidates: candidates 
        });
      }
    }
    initUser();
  }, []);

  useEffect(() => {
    if (post && currentUser?.candidates) {
      const candidates = currentUser.candidates;
      const liked = Array.isArray(post.likes) && post.likes.some((id: any) => candidates.includes(String(id)));
      const saved = Array.isArray(post.savedBy) && post.savedBy.some((id: any) => candidates.includes(String(id)));
      
      setIsLiked(liked);
      setIsSaved(saved);
    }
  }, [post, currentUser]);

  const handleLikeLocal = async () => {
    if (!currentUser || !post) return;
    const { likePost } = await import('../lib/firebaseHelpers');
    hapticLight();
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    
    try {
      await likePost(post.id || post._id, currentUser.id || currentUser.uid);
    } catch (e) {
      setIsLiked(!newLikedState); // Rollback on failure
    }
  };

  const handleSaveLocal = async () => {
    if (!currentUser || !post) return;
    // Assuming you have a savePost helper, if not we'll just toggle UI for now
    hapticLight();
    setIsSaved(!isSaved);
  };

  useEffect(() => {
    async function loadPost() {
      if (!id) return;
      try {
        // Cache-first boot
        try {
          const cached = await getCachedData<any>(CACHE_KEY);
          if (cached?.post) setPost(cached.post);
          if (cached?.profile) setProfile(cached.profile);
          if (cached?.post) setLoading(false);
        } catch { }

        if (!isOnline && post) return;

        const { getPost } = await import('../lib/firebaseHelpers');
        const { getUserProfile } = await import('../lib/firebaseHelpers/user');
        const { resolveCanonicalUserId } = await import('../lib/currentUser');
        
        const uid = await resolveCanonicalUserId();
        const res = await getPost(id as string, uid);
        if (res.success && res.data) {
          let fetchedProfile: any = null;
          setPost(res.data);
          if (res.data.userId) {
            const profRes = await getUserProfile(res.data.userId);
            if (profRes.success) {
              fetchedProfile = profRes.data;
              setProfile(profRes.data);
            }
          }

          try {
            await setCachedData(CACHE_KEY, { post: res.data, profile: fetchedProfile }, { ttl: 24 * 60 * 60 * 1000 });
          } catch { }
        }
      } catch (e) {
        console.error('Error loading post:', e);
      } finally {
        setLoading(false);
      }
    }
    loadPost();
  }, [id, isOnline]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="small" color="#999" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {showBanner && (
        <OfflineBanner text="You’re offline — showing saved post" />
      )}
      {React.createElement(PostViewerModal as any, {
        visible: true,
        onClose: () => safeRouterBack(),
        posts: post ? [post] : [],
        selectedPostIndex: 0,
        profile: profile,
        authUser: currentUser,
        likedPosts: post?.id || post?._id ? { [post.id || post._id]: isLiked } : {},
        savedPosts: post?.id || post?._id ? { [post.id || post._id]: isSaved } : {},
        handleLikePost: handleLikeLocal,
        handleSavePost: handleSaveLocal,
        handleSharePost: (p: any) => sharePost(p),
        setCommentModalPostId: (id: string) => setCommentModalPostId(id || ""),
        setCommentModalAvatar: setCommentModalAvatar,
        setCommentModalVisible: setCommentModalVisible,
        title: "Post",
      })}

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
          keyboardVerticalOffset={getKeyboardOffset()}
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
                postOwnerId={post?.userId || ""}
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
});
