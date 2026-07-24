import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Dimensions, StyleSheet, InteractionManager, Alert, Modal, Pressable, Platform, Text, Animated, PanResponder, TouchableOpacity, Keyboard, ScrollView } from "react-native";
import AppErrorBoundary from './AppErrorBoundary';
import { Ionicons, Feather } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { styles as postStyles } from './PostCard/PostCard.styles';
import PostHeader from './PostCard/PostHeader';
import PostMedia from './PostCard/PostMedia';
import PostActions from './PostCard/PostActions';
import PostCaption from './PostCard/PostCaption';
import { CommentSection } from "./CommentSection";
import { feedEventEmitter } from "../../lib/feedEventEmitter";
import ShareModal from "./ShareModal";
import { useUser } from "./UserContext";
import { likePost, unlikePost, sendPostMessage } from "../../lib/firebaseHelpers";
import { apiService } from '@/src/_services/apiService';
import { BACKEND_URL } from "../../lib/api";

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
  containerHeight?: number;
  /** When false, pause video buffering (off-screen feed items). */
  isVisible?: boolean;
}


const PostCard: React.FC<PostCardProps> = ({ 
  post, 
  currentUser, 
  showMenu = true, 
  highlightedCommentId, 
  highlightedCommentText,
  showCommentsModal,
  onCloseCommentsModal,
  onCommentPress,
  mirror = false,
  containerHeight,
  isVisible = true,
}) => {

  const router = useRouter();
  const user = useUser();
  const [isLiked, setIsLiked] = useState(() => {
    // 1. Trust backend flag FIRST
    if (post?.isLiked !== undefined) return post.isLiked;

    // 2. Fallback to local calculation (Standard MongoDB _id only)
    const myId = String((currentUser as any)?._id || currentUser?.id || currentUser?.uid || currentUser?.firebaseUid || (typeof currentUser === 'string' ? currentUser : '') || (user as any)?._id || user?.id || user?.uid || '');
    if (myId && Array.isArray(post?.likes)) {
      return post.likes.some((id: any) => {
        const lid = String(id?._id || id?.id || id?.uid || id?.firebaseUid || id || '');
        return lid === myId;
      });
    }
    return false;
  });

  const [likeCount, setLikeCount] = useState(post?.likeCount || 0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [paginationOffset, setPaginationOffset] = useState(20);
  const [showComments, setShowComments] = useState<false | 'comment' | 'reactions'>(false);
  const [showShare, setShowShare] = useState(false);
  const [showFullScreen, setShowFullScreen] = useState<number | null>(null);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [showTagsOverlay, setShowTagsOverlay] = useState(false);
  const [localReactions, setLocalReactions] = useState<any[]>(post?.reactions || []);
  const [localCommentCount, setLocalCommentCount] = useState<number>(
    post?.commentCount !== undefined ? post.commentCount : (post?.commentsCount || 0)
  );
  const [localCaption, setLocalCaption] = useState(post?.caption || post?.text || '');

  // Sync like state when user or post changes
  useEffect(() => {
    // 1. Trust backend flag FIRST
    if (post?.isLiked !== undefined) {
      setIsLiked(post.isLiked);
      return;
    }

    // 2. Fallback to local calculation (Standard MongoDB _id only)
    const myId = String((currentUser as any)?._id || currentUser?.id || currentUser?.uid || currentUser?.firebaseUid || (typeof currentUser === 'string' ? currentUser : '') || (user as any)?._id || user?.id || user?.uid || '');
    if (myId && Array.isArray(post?.likes)) {
      const liked = post.likes.some((id: any) => {
        const lid = String(id?._id || id?.id || id?.uid || id?.firebaseUid || id || '');
        return lid === myId;
      });
      setIsLiked(liked);
    }
  }, [currentUser, user, post?.likes, post?.isLiked]);
  const videoRef = useRef<any>(null);


  const translateY = useRef(new Animated.Value(0)).current;
  // Use Animated.Value so keyboard movement causes ZERO React re-renders
  // Zero re-renders = touches always reach the Post button cleanly
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration ?? 250,
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardAnim, {
        toValue: 0,
        duration: (e as any).duration ?? 200,
        useNativeDriver: false,
      }).start();
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (e, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          setShowComments(false);
          translateY.setValue(0);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!showComments) {
      translateY.setValue(0);
    }
  }, [showComments]);

  useEffect(() => {
    const sub = feedEventEmitter.onPostUpdated(post._id || post.id, (pid, data) => {
      if (!data) return; // Guard against undefined data
      if (data.reactions) {
        setLocalReactions(data.reactions);
      }
      if (data.isLiked !== undefined) setIsLiked(data.isLiked);
      if (data.likeCount !== undefined) setLikeCount(data.likeCount);
      
      if (data.commentCount !== undefined) {
        setLocalCommentCount(data.count || data.commentCount);
      } else if (data.commentsCount !== undefined) {
        setLocalCommentCount(data.commentsCount);
      }

      if (data.caption !== undefined) {
        setLocalCaption(data.caption);
      } else if (data.text !== undefined) {
        setLocalCaption(data.text);
      }
    });

    const commentSub = (feedEventEmitter as any).addListener('commentAdded', (data: any) => {
      // Just a trigger - we rely on commentCountUpdated for the actual number
    });

    const commentDeleteSub = (feedEventEmitter as any).addListener('commentDeleted', (data: any) => {
      // Just a trigger - we rely on commentCountUpdated for the actual number
    });

    const commentCountSub = (feedEventEmitter as any).addListener('commentCountUpdated', (data: any) => {
      if (data.postId === post._id || data.postId === post.id) {
        setLocalCommentCount(data.count);
      }
    });

    return () => {
      sub.remove();
      commentSub.remove();
      commentDeleteSub.remove();
      commentCountSub.remove();
    };
  }, [post._id, post.id]);

  // Force sync when post prop changes (e.g. after refresh)
  useEffect(() => {
    setIsLiked(post?.isLiked || false);
    setLikeCount(post?.likeCount || 0);
    setLocalReactions(post?.reactions || []);
    setLocalCaption(post?.caption || post?.text || '');
    
    const count = post?.commentCount !== undefined ? post.commentCount : (post?.commentsCount || 0);
    setLocalCommentCount(count);
  }, [post?._id, post?.id, post?.isLiked, post?.likeCount, post?.reactions, post?.commentCount, post?.commentsCount, post?.caption, post?.text]);


  // Derived data
  const postUserName = post?.userName || post?.user?.displayName || post?.user?.name || post?.userId?.displayName || post?.userId?.name || 'User';
  const postUserAvatar = post?.userAvatar || post?.user?.profilePicture || post?.user?.avatar || post?.user?.photoURL || post?.userId?.avatar || post?.userId?.profilePicture;
  const locationName = post?.locationData?.name || post?.locationName || post?.location || '';
  
  const getPostTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    if (diff < 2419200) return `${Math.floor(diff / 604800)}w`;
    
    // Format: September 9 2023
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
  };
  const postTimeText = useMemo(() => getPostTime(post?.createdAt || post?.timestamp), [post?.createdAt, post?.timestamp]);


  const handleLike = useCallback(async () => {
    const activeUserId = 
      (typeof currentUser === 'string' ? currentUser : ((currentUser as any)?._id || currentUser?.id || currentUser?.uid || currentUser?.firebaseUid)) || 
      (user as any)?._id || user?.id || user?.uid;
    
    if (!activeUserId) {
      if (__DEV__) {
        console.warn('[PostCard] Cannot like: No ID found. Structure:', JSON.stringify(currentUser));
        console.log('[PostCard] Hook User structure:', JSON.stringify(user));
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikeCount((prev: number) => newLiked ? prev + 1 : prev - 1);
    
    try {
      const userName = currentUser?.displayName || currentUser?.name || 'Someone';
      if (newLiked) await likePost(post._id || post.id, activeUserId);
      else await unlikePost(post._id || post.id, activeUserId);
    } catch (err) {
      // Revert on error
      setIsLiked(!newLiked);
      setLikeCount((prev: number) => !newLiked ? prev + 1 : prev - 1);
    }
  }, [isLiked, post._id, post.id, currentUser]);

  const onScroll = useCallback((event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / SCREEN_WIDTH);
    if (index !== activeIndex) setActiveIndex(index);
  }, [activeIndex]);

  const mediaData = useMemo(() => {
    const rawMedia = Array.isArray(post?.media) ? post.media : [];
    return rawMedia.map((m: any, idx: number) => ({
      ...m,
      // Pass the grid thumbnail to the first item so it loads instantly from cache
      thumbnailUrl: m.thumbnailUrl || (idx === 0 ? (post?.thumbnailUrl || post?.imageUrl) : undefined)
    }));
  }, [post]);

  const isOwner = useMemo(() => {
    // Build all possible author IDs
    const authorIds = [
      post?.userId?._id,
      post?.userId?.id,
      post?.userId?.uid,
      post?.userId?.firebaseUid,
      // If userId is a plain string (not populated)
      typeof post?.userId === 'string' ? post.userId : null,
    ].filter(Boolean).map(String);

    // Build all possible viewer IDs
    const viewerIds: string[] = [];
    if (typeof currentUser === 'string') {
      // currentUser is just a userId string
      viewerIds.push(currentUser);
    } else if (currentUser) {
      [currentUser._id, currentUser.id, currentUser.uid, currentUser.firebaseUid]
        .filter(Boolean)
        .forEach(id => viewerIds.push(String(id)));
    }

    if (authorIds.length === 0 || viewerIds.length === 0) return false;
    return authorIds.some(aid => viewerIds.includes(aid));
  }, [post, currentUser]);

  const submitPostReport = async (reason: string) => {
    try {
      await apiService.reportContent({
        targetId: post._id || post.id,
        targetType: 'post',
        reason: reason
      });
      Alert.alert("Report Submitted", "Thank you for helping us keep the community safe. We will review this post shortly.");
    } catch (err) {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  return (
    <View style={postStyles.cardContainer}>
      {/* ... previous content ... */}
      <PostHeader 
        post={post}
        postUserName={postUserName}
        postUserAvatar={postUserAvatar}
        locationName={locationName}
        postTimeText={postTimeText}
        onProfilePress={() => {
          const uid = post?.userId?._id || post?.userId?.id || post?.userId || post?.user?.uid;
          if (uid) router.push(`/user-profile?uid=${uid}`);
        }}
        onLocationPress={() => {
          const pid = post?.locationData?.placeId || 'unknown';
          router.push({
            pathname: '/location/[placeId]' as any,
            params: {
              placeId: pid,
              locationName: post?.locationData?.name || locationName,
              locationAddress: post?.locationData?.address || locationName
            }
          } as any);
        }}
        onMenuPress={() => setShowPostMenu(true)}
        showMenu={showMenu}
      />

      <View style={{ position: 'relative' }}>
        <PostMedia 
          media={mediaData}
          activeIndex={activeIndex}
          isVisible={isVisible}
          onScroll={onScroll}
          onMediaPress={(index) => {
            if (post?.taggedUsers && post.taggedUsers.length > 0) {
              setShowTagsOverlay(!showTagsOverlay);
            } else {
              setShowFullScreen(index);
            }
          }}
          onDoubleTap={() => {
            if (!isLiked) handleLike();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
          isMuted={isMuted}
          toggleMute={() => setIsMuted(!isMuted)}
          videoRef={videoRef}
        />

        {/* Small silhouette person icon overlay at bottom-left, exactly like Instagram */}
        {post?.taggedUsers && post.taggedUsers.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowTagsOverlay(!showTagsOverlay)}
            activeOpacity={0.8}
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              width: 32,
              height: 32,
              borderRadius: 16,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 50,
            }}
          >
            <Ionicons name="person-outline" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Staggered absolute-positioned Instagram-style tag overlays */}
        {showTagsOverlay && post?.taggedUsers && post.taggedUsers.length > 0 && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]}>
            {post.taggedUsers.map((taggedUser: any, idx: number) => {
              const uId = taggedUser._id || taggedUser.id || taggedUser.uid;
              const positions = [
                { top: '30%', left: '20%' },
                { top: '60%', left: '45%' },
                { top: '40%', left: '55%' },
                { top: '20%', left: '50%' },
                { top: '50%', left: '15%' },
              ] as const;
              const pos = positions[idx % positions.length];
              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.9}
                  onPress={() => {
                    if (uId) {
                      setShowTagsOverlay(false);
                      router.push(`/user-profile?uid=${uId}` as any);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 0.5,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 3,
                    elevation: 4,
                  }}
                >
                  <Ionicons name="person" size={10} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                    {taggedUser.username || taggedUser.displayName || 'user'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>


      <View style={{ backgroundColor: '#fff' }}>
        <PostActions 
          isLiked={isLiked}
          onLikePress={handleLike}
          onCommentPress={() => setShowComments('comment')}
          onReactionPress={() => setShowComments('reactions')}
          onSharePress={() => setShowShare(true)}
          post={post}
          likeCount={likeCount}
          commentCount={localCommentCount}
          reactions={localReactions}
          currentUserId={(currentUser as any)?._id || currentUser?.id || currentUser?.uid || (typeof currentUser === 'string' ? currentUser : '') || (user as any)?._id || user?.id || user?.uid}
        />

        <PostCaption 
          postUserName={postUserName}
          caption={localCaption}
          hashtags={post?.hashtags || []}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          onHashtagPress={(tag) => {
            router.push(`/hashtag-detail?tag=${encodeURIComponent(tag)}`);
          }}
        />

      </View>



      {/* Post Options Menu (Edit, Delete, Report) */}
      <Modal
        visible={showPostMenu}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPostMenu(false)}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} 
          onPress={() => setShowPostMenu(false)} 
        />
        <View style={{ 
          backgroundColor: '#fff', 
          borderTopLeftRadius: 20, 
          borderTopRightRadius: 20, 
          paddingBottom: 40,
          marginTop: 'auto'
        }}>
          <View style={{ height: 4, width: 40, backgroundColor: '#ddd', borderRadius: 2, alignSelf: 'center', marginVertical: 12 }} />
          
          {isOwner ? (
            <>
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}
                onPress={() => {
                  setShowPostMenu(false);
                  feedEventEmitter.emit('closePostViewer');
                  setTimeout(() => {
                    router.push(`/create-post?editPostId=${post._id || post.id}&initialData=${encodeURIComponent(JSON.stringify(post))}`);
                  }, 100);
                }}
              >
                <Feather name="edit-3" size={22} color="#333" />
                <Text style={{ marginLeft: 15, fontSize: 16, fontWeight: '500' }}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}
                onPress={() => {
                  setShowPostMenu(false);
                  setTimeout(() => {
                    Alert.alert("Delete", "Are you sure?", [
                      { text: "Cancel" },
                      { text: "Delete", style: "destructive", onPress: async () => {
                         try {
                           const res = await apiService.delete(`/posts/${post._id || post.id}`);
                           if (res && res.success) {
                             feedEventEmitter.emitFeedUpdate({ type: 'POST_DELETED', postId: post._id || post.id });
                             Alert.alert("Success", "Post deleted successfully.");
                           } else {
                             Alert.alert("Error", res?.error || "Failed to delete post.");
                           }
                         } catch (err: any) {
                           Alert.alert("Error", err.response?.data?.error || err.message || "Failed to delete post.");
                         }
                      }}
                    ]);
                  }, 300);
                }}
              >
                <Feather name="trash-2" size={22} color="#ff4d4d" />
                <Text style={{ marginLeft: 15, fontSize: 16, fontWeight: '500', color: '#ff4d4d' }}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}
                onPress={() => {
                  setShowPostMenu(false);
                  setTimeout(() => {
                    setShowShare(true);
                  }, 650); // Increased from 300ms to 650ms to ensure full options modal dismissal transition
                }}
              >
                <Feather name="share-2" size={22} color="#333" />
                <Text style={{ marginLeft: 15, fontSize: 16, fontWeight: '500' }}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}
                onPress={() => {
                  setShowPostMenu(false);
                  setTimeout(() => {
                    Alert.alert(
                      "Report Post",
                      "Why are you reporting this post?",
                      [
                        { text: "Spam", onPress: () => submitPostReport('spam') },
                        { text: "Inappropriate", onPress: () => submitPostReport('inappropriate') },
                        { text: "Harassment", onPress: () => submitPostReport('harassment') },
                        { text: "Cancel", style: "cancel" }
                      ]
                    );
                  }, 300);
                }}
              >
                <Feather name="flag" size={22} color="#ff4d4d" />
                <Text style={{ marginLeft: 15, fontSize: 16, fontWeight: '500', color: '#ff4d4d' }}>Report Post</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', padding: 18 }}
                onPress={() => {
                  setShowPostMenu(false);
                  setTimeout(() => {
                    Alert.alert(
                      "Block User",
                      `Are you sure you want to block ${postUserName}? You won't see their posts anymore.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        { 
                          text: "Block", 
                          style: "destructive", 
                          onPress: async () => {
                            try {
                              const myId = (currentUser as any)?._id || currentUser?.id || currentUser?.uid || (typeof currentUser === 'string' ? currentUser : '') || (user as any)?._id || user?.id || user?.uid;
                              const targetId = post?.userId?._id || post?.userId;
                              if (myId && targetId) {
                                await apiService.blockUser(String(myId), String(targetId));
                                Alert.alert("Blocked", "You will no longer see posts from this user.");
                                feedEventEmitter.emitFeedUpdate({ type: 'USER_BLOCKED', userId: targetId });
                              }
                            } catch (err) {
                              Alert.alert("Error", "Failed to block user.");
                            }
                          } 
                        }
                      ]
                    );
                  }, 300);
                }}
              >
                <Feather name="slash" size={22} color="#ff4d4d" />
                <Text style={{ marginLeft: 15, fontSize: 16, fontWeight: '500', color: '#ff4d4d' }}>Block User</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity 
            style={{ marginTop: 10, padding: 18, alignItems: 'center' }}
            onPress={() => setShowPostMenu(false)}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#0095f6' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={!!showComments}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => { Keyboard.dismiss(); setShowComments(false); }}
      >
        {/* Backdrop covers full screen */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { Keyboard.dismiss(); setShowComments(false); }}
        />

        {/* Sheet: position absolute, bottom & height both animated so top stays fixed */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: keyboardAnim,
            // height shrinks by same amount as bottom rises → top edge stays fixed on screen
            height: Animated.subtract(
              Dimensions.get('window').height * 0.85,
              keyboardAnim
            ),
            backgroundColor: '#fff',
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            overflow: 'hidden',
            transform: [{ translateY }],
          }}
        >
          {/* keyboardShouldPersistTaps=always ensures Post tap fires immediately */}
          <ScrollView
            style={{ flex: 1 }}
            scrollEnabled={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ flex: 1 }}
          >
            {/* Drag Handle */}
            <View
              {...panResponder.panHandlers}
              style={{
                height: 40,
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#fff',
              }}
            >
              <View style={{ height: 5, width: 40, backgroundColor: '#ddd', borderRadius: 3 }} />
            </View>

            <CommentSection
              postId={post._id || post.id}
              postOwnerId={post?.userId?._id || post?.userId}
              currentAvatar={currentUser?.avatar || currentUser?.photoURL || ''}
              currentUser={currentUser}
              maxHeight={Dimensions.get('window').height * 0.8}
              initialTab={showComments === 'reactions' ? 'reactions' : 'comment'}
            />
          </ScrollView>
        </Animated.View>
      </Modal>

      <Modal
        visible={showFullScreen !== null}
        transparent={true}
        onRequestClose={() => setShowFullScreen(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          <Pressable style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }} onPress={() => setShowFullScreen(null)}>
            <Ionicons name="close-circle" size={40} color="#fff" />
          </Pressable>
          {showFullScreen !== null && (
            <PostMedia 
              media={mediaData}
              activeIndex={showFullScreen}
              onScroll={() => {}}
              onMediaPress={() => setShowFullScreen(null)}
              isMuted={isMuted}
              toggleMute={() => setIsMuted(!isMuted)}
              videoRef={videoRef}
            />
          )}
        </View>
      </Modal>


      {showShare && (
        <ShareModal 
          visible={showShare}
          onClose={() => setShowShare(false)}
          onSend={async (userIds) => {
            setShowShare(false);
          }}
          currentUserId={(currentUser as any)?._id || currentUser?.id || currentUser?.uid || (typeof currentUser === 'string' ? currentUser : '') || (user as any)?._id || user?.id || user?.uid}
          sharePayload={post}
          modalVariant="home"
          onAddToStory={() => {
            router.push({
              pathname: '/story-creator',
              params: {
                sharePostId: post._id || post.id || '',
                sharePostData: encodeURIComponent(JSON.stringify(post))
              }
            } as any);
          }}
        />
      )}
    </View>
  );
};

const PostCardWithBoundary = (props: any) => (
  <AppErrorBoundary fallback={<View style={{ height: 8, backgroundColor: '#f8f8f8' }} />}>
    <PostCardMemo {...props} />
  </AppErrorBoundary>
);

const PostCardMemo = React.memo(PostCard);
export default PostCardWithBoundary;
