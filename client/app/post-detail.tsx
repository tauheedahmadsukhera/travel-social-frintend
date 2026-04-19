import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PostViewerModal from '@/src/_components/PostViewerModal';
import CommentSection from '@/src/_components/CommentSection';
import { useUser } from '@/src/_components/UserContext';
import { sharePost } from '../lib/postShare';
import { hapticLight } from '@/lib/haptics';
import { getCachedData, setCachedData, useOfflineBanner, useNetworkStatus } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';
import { safeRouterBack } from '@/lib/safeRouterBack';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const currentUser = useUser();
  const [post, setPost] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Comment Modal State
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentModalPostId, setCommentModalPostId] = useState("");
  const [commentModalAvatar, setCommentModalAvatar] = useState("");
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const CACHE_KEY = `post_detail_v1_${String(id || '')}`;

  const getKeyboardOffset = () => {
    if (Platform.OS === 'ios') return 0;
    return 0;
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

        if (!isOnline && post) {
          // Offline and already showing cached post
          return;
        }

        const { getPost } = await import('../lib/firebaseHelpers');
        const { getUserProfile } = await import('../lib/firebaseHelpers/user');
        
        const res = await getPost(id as string);
        if (res.success && res.data) {
          let fetchedProfile: any = null;
          setPost(res.data);
          // Load post owner profile
          if (res.data.userId) {
            const profRes = await getUserProfile(res.data.userId);
            if (profRes.success) {
              fetchedProfile = profRes.data;
              setProfile(profRes.data);
            }
          }

          // Persist cache snapshot for offline mode
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
        likedPosts: {},
        savedPosts: {},
        handleLikePost: () => { },
        handleSavePost: () => { },
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
