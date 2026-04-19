import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SaveButton from '@/src/_components/SaveButton';
import { useUser } from '@/src/_components/UserContext';
import { likePost, unlikePost } from '../lib/firebaseHelpers';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

// Move context to top-level
const PostLocationModalContext = React.createContext<{ onImagePress?: (post: PostType) => void }>({});
export interface PostLocationModalProps {
  visible: boolean;
  onClose: () => void;
  posts: PostType[];
  onImagePress?: (post: PostType) => void;
}

interface PostType {
  id: string;
  imageUrl?: string;
  imageUrls?: string[];
  userName?: string;
  caption?: string;
  likes?: number;
  likesCount?: number;
  comments?: number;
  commentsCount?: number;
  location?: string | {
    name?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  liked?: boolean; // backend value
  saved?: boolean; // backend value
}

// Per-post card component to keep hooks at top level
const PostItem: React.FC<{ item: PostType }> = ({ item }) => {
  let imageUrl = item.imageUrl;
  if (!imageUrl && Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
    imageUrl = item.imageUrls[0];
  }
  if (!imageUrl) {
    imageUrl = DEFAULT_AVATAR_URL;
  }
  const user = useUser();
  const userId = user?.uid ?? '';
  const [likes, setLikes] = useState<string[]>(Array.isArray(item.likes) ? item.likes : []);
  const [likesCount, setLikesCount] = useState<number>(item.likesCount ?? (Array.isArray(item.likes) ? item.likes.length : 0));
  const [saved, setSaved] = useState<boolean>(!!item.saved);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const liked = userId ? likes.includes(userId) : false;

  useEffect(() => {
    setLikes(Array.isArray(item.likes) ? item.likes : []);
    setLikesCount(item.likesCount ?? (Array.isArray(item.likes) ? item.likes.length : 0));
    setSaved(!!item.saved);
  }, [item.likes, item.likesCount, item.saved]);

  const handleLike = async () => {
    if (!userId) return;
    const wasLiked = likes.includes(userId);
    if (wasLiked) {
      setLikes(prev => prev.filter(id => id !== userId));
      setLikesCount(prev => Math.max(0, prev - 1));
      await unlikePost(item.id, userId);
    } else {
      setLikes(prev => [...prev, userId]);
      setLikesCount(prev => prev + 1);
      await likePost(item.id, userId);
    }
  };

  const handleShare = async () => {
    try {
      const { Share } = await import('react-native');
      let shareMessage = `Check out this post`;
      if (item?.userName) shareMessage += ` by ${item.userName}`;
      if (item?.location) shareMessage += ` at ${item.location}`;
      if (item?.caption) shareMessage += `\n\n${item.caption}`;
      await Share.share({ message: shareMessage });
    } catch (error) {}
  };

  // Accept onImagePress from props via context
  const { onImagePress } = React.useContext(PostLocationModalContext);
  return (
    <View key={item.id} style={styles.postPreview}>
      <TouchableOpacity onPress={() => onImagePress && onImagePress(item)}>
        <Image source={{ uri: imageUrl }} style={styles.bigImage} resizeMode="cover" />
      </TouchableOpacity>
      <View style={styles.iconRow}>
        <TouchableOpacity onPress={handleLike} style={{ marginRight: 8, flexDirection: 'row', alignItems: 'center' }}>
          {liked ? (
            <MaterialCommunityIcons name="heart" size={24} color="#e74c3c" />
          ) : (
            <MaterialCommunityIcons name="heart-outline" size={24} color="#222" />
          )}
          <Text style={{ marginLeft: 6, fontWeight: '700', color: '#222', fontSize: 15 }}>{typeof likesCount === 'number' || typeof likesCount === 'string' ? String(likesCount) : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowCommentsModal(true)} style={{ marginRight: 24 }}>
          <Feather name="message-circle" size={22} color="#222" />
        </TouchableOpacity>
        <TouchableOpacity style={{ marginRight: 24 }} onPress={handleShare}>
          <Feather name="send" size={22} color="#007aff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <SaveButton post={{ ...item, saved }} />
      </View>
      <Text style={styles.likesText}>{typeof likesCount === 'number' ? `${likesCount.toLocaleString()} likes` : ''}</Text>
      <Text style={styles.userText}>{item.userName}</Text>
      <Text style={styles.captionText}>{item.caption}</Text>
      <TouchableOpacity onPress={() => setShowCommentsModal(true)}>
        <Text style={[styles.commentText, { marginTop: -2 }]}> 
          View all {item.commentsCount ?? item.comments ?? 0} comments
        </Text>
      </TouchableOpacity>
      {/* Comments Modal (same as feed) */}
      {/* ...existing code... */}
    </View>
  );
};

export const PostLocationModal: React.FC<PostLocationModalProps> = ({ visible, onClose, posts, onImagePress }) => {
  const safePosts: PostType[] = Array.isArray(posts) ? posts : [];
  const router = useRouter();
  if (!visible) return null;
  // Use first post for location info
  const firstPost: PostType = safePosts[0] || {} as PostType;
  const locationChips: string[] = [];
  if (firstPost.location) {
    if (typeof firstPost.location === 'object') {
      if (firstPost.location.city) locationChips.push(firstPost.location.city);
      if (firstPost.location.country) locationChips.push(firstPost.location.country);
      if (firstPost.location.name) locationChips.push(firstPost.location.name);
    } else if (typeof firstPost.location === 'string') {
      locationChips.push(firstPost.location);
    }
  }
  // Fallback chips
  if (locationChips.length === 0) locationChips.push('Unknown');
  const postCount = safePosts.length;
  return (
    <PostLocationModalContext.Provider value={{ onImagePress }}>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentFull}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Feather name="x" size={24} color="#333" />
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {locationChips.map((chip: string, idx: number) => (
                  <View key={idx} style={styles.chip}><Text style={styles.chipText}>{chip}</Text></View>
                ))}
              </View>
              <Text style={styles.postCount}>{postCount} Post{postCount !== 1 ? 's' : ''}</Text>
              <View style={styles.locationBlock}>
                <Text style={styles.locationName}>{typeof firstPost.location === 'object' ? (firstPost.location.name || 'Location') : (firstPost.location || 'Location')}</Text>
                <Text style={styles.locationAddress}>{typeof firstPost.location === 'object' ? (firstPost.location.address || firstPost.location.city || '') : ''}</Text>
              </View>
              {safePosts.map((item: PostType) => (
                <PostItem key={item.id} item={item} />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </PostLocationModalContext.Provider>
  );
};
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.12)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  modalContentFull: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 0,
    width: '100%',
    maxWidth: undefined,
    minWidth: undefined,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingLeft: 18,
    gap: 8,
  },
  chip: {
    backgroundColor: '#ffe9c7',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 2,
    shadowColor: '#0A3D62',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  chipText: {
    color: '#0A3D62',
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  postCount: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 2,
  },
  locationBlock: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 2,
    textAlign: 'center',
  },
  locationAddress: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
    textAlign: 'center',
  },
  postPreview: {
    backgroundColor: '#fff',
    borderRadius: 0,
    marginHorizontal: 0,
    marginBottom: 0,
    shadowColor: 'transparent',
    elevation: 0,
    overflow: 'visible',
  },
  bigImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#eee',
    borderRadius: 0,
    alignSelf: 'center',
    marginBottom: 0,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 22,
  },
  icon: {
    marginRight: 22,
  },
  likesText: {
    fontWeight: '700',
    fontSize: 15,
    paddingHorizontal: 18,
    paddingTop: 6,
    color: '#222',
  },
  userText: {
    fontWeight: '700',
    fontSize: 15,
    paddingHorizontal: 18,
    paddingTop: 2,
    color: '#222',
  },
  captionText: {
    color: '#333',
    fontSize: 15,
    marginTop: 2,
    paddingHorizontal: 18,
    paddingBottom: 2,
  },
  commentText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '400',
    paddingHorizontal: 18,
    paddingBottom: 10,
    marginTop: 2,
  },
});

