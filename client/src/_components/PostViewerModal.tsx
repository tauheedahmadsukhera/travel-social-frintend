import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Dimensions, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCard from './PostCard';

interface Post {
  id: string;
  imageUrl?: string;
  imageUrls?: string[];
  caption?: string;
  userId: string;
  likes?: string[];
  savedBy?: string[];
  commentsCount?: number;
  comments?: any[];
}

interface Profile {
  avatar?: string;
  username?: string;
  name?: string;
}

interface AuthUser {
  uid?: string;
}

interface PostViewerModalProps {
  visible: boolean;
  onClose: () => void;
  posts: Post[];
  selectedPostIndex: number;
  profile: Profile | null;
  authUser: AuthUser | null;
  likedPosts: { [key: string]: boolean };
  savedPosts: { [key: string]: boolean };
  handleLikePost: (post: Post) => void;
  handleSavePost: (post: Post) => void;
  handleSharePost: (post: Post) => void;
  setCommentModalPostId: (id: string | null) => void;
  setCommentModalAvatar: (avatar: string) => void;
  setCommentModalVisible: (visible: boolean) => void;
  title?: string;
}

export default function PostViewerModal({
  visible,
  onClose,
  posts,
  selectedPostIndex,
  profile,
  authUser,
  likedPosts,
  savedPosts,
  handleLikePost,
  handleSavePost,
  handleSharePost,
  setCommentModalPostId,
  setCommentModalAvatar,
  setCommentModalVisible,
  title = "Posts",
}: PostViewerModalProps): React.ReactElement {
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const didInitialScrollRef = useRef(false);
  const prevVisibleRef = useRef(false);
  const targetIndexRef = useRef(0);

  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!visible) {
      didInitialScrollRef.current = false;
      return;
    }
    // Only run the initial positioning when the modal transitions from hidden -> visible.
    if (wasVisible || !visible) return;
    if (!flatListRef.current) return;
    if (!Array.isArray(posts) || posts.length === 0) return;
    if (selectedPostIndex < 0 || selectedPostIndex >= posts.length) return;

    targetIndexRef.current = selectedPostIndex;
    
    // Smooth initial scroll handling - slightly longer delay to ensure layout is ready
    const timer = setTimeout(() => {
      if (!flatListRef.current || didInitialScrollRef.current) return;
      try {
        flatListRef.current.scrollToIndex({ 
          index: selectedPostIndex, 
          animated: false,
          viewPosition: 0 
        });
        didInitialScrollRef.current = true;
      } catch (e) {
        // Fallback handled by onScrollToIndexFailed
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [visible, selectedPostIndex]); // Removed posts.length dependency to avoid jumping during data updates

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onClose();
      }}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onClose();
            }}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          ref={flatListRef}
          data={posts}
          keyExtractor={(item, index) => String(item?.id || item?._id || index)}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => {
            didInitialScrollRef.current = true;
          }}
          // Continuous scrolling feels better for variable height posts
          snapToAlignment="start"
          decelerationRate="fast"
          initialNumToRender={Math.min(posts.length, 5)}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onScrollToIndexFailed={(info) => {
            if (!Array.isArray(posts) || posts.length === 0) return;
            const safeIndex = Math.max(0, Math.min(posts.length - 1, info.index));
            // For variable height, we jump to an estimate and then try again.
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * safeIndex,
              animated: false,
            });
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({ index: safeIndex, animated: false });
              } catch {}
            }, 100);
          }}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUser={authUser}
              showMenu={true}
              inPostViewer
              onCommentPress={(pid, avatar) => {
                setCommentModalPostId(pid);
                setCommentModalAvatar(avatar);
                setCommentModalVisible(true);
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        />
      </View>
    </Modal>
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
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
});
