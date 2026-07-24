import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Dimensions, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCard from './PostCard';
import { feedEventEmitter } from '../../lib/feedEventEmitter';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Post {
  id: string;
  _id?: string;
  imageUrl?: string;
  imageUrls?: string[];
  caption?: string;
  userId: any;
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
  _id?: string;
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
  const flashListRef = useRef<FlashList<any>>(null);
  const insets = useSafeAreaInsets();
  const didInitialScrollRef = useRef(false);
  const targetIndexRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      didInitialScrollRef.current = false;
      return;
    }
    if (!flashListRef.current) return;
    if (!Array.isArray(posts) || posts.length === 0) return;
    if (selectedPostIndex < 0 || selectedPostIndex >= posts.length) return;

    targetIndexRef.current = selectedPostIndex;
    
    // FlashList initial positioning is much faster
    const timer = setTimeout(() => {
      if (!flashListRef.current || didInitialScrollRef.current) return;
      try {
        flashListRef.current.scrollToIndex({ 
          index: selectedPostIndex, 
          animated: false
        });
        didInitialScrollRef.current = true;
      } catch (e) {
        // Fallback
      }
    }, 16); // Even shorter delay for FlashList

    return () => clearTimeout(timer);
  }, [visible, selectedPostIndex]);

  useEffect(() => {
    const subscription = feedEventEmitter.addListener('closePostViewer', () => {
      onClose();
    });
    return () => subscription.remove();
  }, [onClose]);

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

        <FlashList
          ref={flashListRef}
          data={posts}
          keyExtractor={(item, index) => String(item?.id || item?._id || index)}
          estimatedItemSize={SCREEN_HEIGHT * 0.75}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => {
            didInitialScrollRef.current = true;
          }}
          initialScrollIndex={selectedPostIndex >= 0 && selectedPostIndex < posts.length ? selectedPostIndex : undefined}
          snapToAlignment="start"
          decelerationRate="fast"
          removeClippedSubviews={Platform.OS === 'android'}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUser={authUser}
              showMenu={true}
              onCommentPress={(pid: string, avatar: string) => {
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
