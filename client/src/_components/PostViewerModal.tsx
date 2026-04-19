import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Dimensions, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCard from './PostCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  useEffect(() => {
    if (
      visible &&
      flatListRef.current &&
      Array.isArray(posts) &&
      posts.length > 0 &&
      selectedPostIndex >= 0 &&
      selectedPostIndex < posts.length
    ) {
      // Small timeout to ensure list is ready
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: selectedPostIndex,
          animated: false,
        });
      }, 100);
    }
  }, [visible, selectedPostIndex, posts]);

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
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={40}
          removeClippedSubviews
          onScrollToIndexFailed={(info) => {
            if (!Array.isArray(posts) || posts.length === 0) return;
            if (info.index < 0 || info.index >= posts.length) return;
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(() => {
              if (!Array.isArray(posts) || posts.length === 0) return;
              if (info.index < 0 || info.index >= posts.length) return;
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 100);
          }}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUser={authUser}
              // Let PostCard decide owner-ness (handles Mongo _id vs firebase uid)
              showMenu={true}
              inPostViewer
              onCommentPress={(pid, avatar) => {
                setCommentModalPostId(pid);
                setCommentModalAvatar(avatar);
                setCommentModalVisible(true);
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
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
