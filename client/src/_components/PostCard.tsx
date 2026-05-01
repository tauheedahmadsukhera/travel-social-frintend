import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Dimensions, StyleSheet, InteractionManager } from "react-native";
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { styles as postStyles } from './PostCard/PostCard.styles';
import PostHeader from './PostCard/PostHeader';
import PostMedia from './PostCard/PostMedia';
import PostActions from './PostCard/PostActions';
import PostCaption from './PostCard/PostCaption';
import CommentSection from "./CommentSection";
import ShareModal from "./ShareModal";
import { useUser } from "./UserContext";
import { likePost, unlikePost } from "../../lib/firebaseHelpers";
import { apiService } from '@/src/_services/apiService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostCardProps {
  post: any;
  currentUser: any;
  showMenu?: boolean;
  highlightedCommentId?: string;
  highlightedCommentText?: string;
  showCommentsModal?: boolean;
  onCloseCommentsModal?: () => void;
  onCommentPress?: (postId: string, avatar: string) => void;
  mirror?: boolean;
}

const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  currentUser, 
  showMenu = true, 
  highlightedCommentId, 
  onCommentPress,
  mirror = false
}) => {
  const router = useRouter();
  const user = useUser();
  const [isLiked, setIsLiked] = useState(post?.isLiked || false);
  const [likeCount, setLikeCount] = useState(post?.likeCount || 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const videoRef = useRef<any>(null);

  // Derived data
  const postUserName = post?.user?.displayName || post?.user?.name || 'Traveler';
  const postUserAvatar = post?.user?.profilePicture || post?.user?.avatar || post?.user?.photoURL;
  const locationName = post?.locationData?.name || post?.locationName || '';
  const postTimeText = 'Just now'; // Simplified for demo, should use dayjs/date-fns

  const handleLike = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev: number) => newLiked ? prev + 1 : prev - 1);
    
    try {
      if (newLiked) await likePost(post._id, user?.uid);
      else await unlikePost(post._id, user?.uid);
    } catch (err) {
      // Revert on error
      setIsLiked(!newLiked);
      setLikeCount((prev: number) => !newLiked ? prev + 1 : prev - 1);
    }
  }, [isLiked, post._id, user?.uid]);

  const onScroll = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  }, [activeIndex]);

  return (
    <View style={postStyles.cardInner}>
      <PostHeader 
        post={post}
        postUserName={postUserName}
        postUserAvatar={postUserAvatar}
        locationName={locationName}
        postTimeText={postTimeText}
        onProfilePress={() => router.push({ pathname: '/user/[userId]', params: { userId: post?.userId } } as any)}
        onLocationPress={() => {}}
        onMenuPress={() => {}}
        showMenu={showMenu}
      />

      <PostMedia 
        media={post?.media || []}
        mediaHeight={400}
        activeIndex={activeIndex}
        onScroll={onScroll}
        onMediaPress={(index) => {}}
        isMuted={isMuted}
        toggleMute={() => setIsMuted(!isMuted)}
        videoRef={videoRef}
      />

      <PostActions 
        isLiked={isLiked}
        onLikePress={handleLike}
        onCommentPress={() => setShowComments(true)}
        onSharePress={() => setShowShare(true)}
        post={post}
        likeCount={likeCount}
        commentCount={post?.commentCount || 0}
        reactions={post?.reactions}
      />

      <PostCaption 
        postUserName={postUserName}
        caption={post?.caption || ''}
        hashtags={post?.hashtags || []}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
      />

      {showComments && (
        <CommentSection 
          postId={post._id}
          postOwnerId={post?.userId?._id || post?.userId}
          currentAvatar={currentUser?.avatar || currentUser?.photoURL || ''}
          currentUser={currentUser}
        />
      )}

      {showShare && (
        <ShareModal 
          visible={showShare}
          onClose={() => setShowShare(false)}
          onSend={(userIds) => {
            console.log('Sending post to users:', userIds);
          }}
          currentUserId={currentUser?._id || currentUser?.id || currentUser?.uid}
          sharePayload={post}
          modalVariant="home"
        />
      )}
    </View>
  );
};

export default React.memo(PostCard);
