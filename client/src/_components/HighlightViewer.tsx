import React, { useEffect, useState, useRef } from 'react';
import { Dimensions, Image, Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Alert, SafeAreaView, Platform, Animated, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHighlightStories } from '../../lib/firebaseHelpers/core';
import { flattenStoryPayload, getCachedHighlightStories, pickStoryId, pickStoryMedia } from '../../lib/storyViewer';
import CommentSection from './CommentSection';
import { Video, ResizeMode } from 'expo-av';
import { highlightManager } from '../../lib/highlightManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../../lib/feedEventEmitter';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface HighlightViewerProps {
  visible: boolean;
  highlightId: string | null;
  onClose: () => void;
  userId?: string;
  userName?: string;
  userAvatar?: string;
}

interface Story {
  id?: string;
  _id?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | string;
  createdAt?: any;
  likes?: string[];
}

const HighlightViewer: React.FC<HighlightViewerProps> = ({ visible, highlightId, onClose, userId, userName, userAvatar }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [localUid, setLocalUid] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const progressAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!visible) {
      setShowComments(false);
      setIsPaused(false);
      progress.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    let mounted = true;
    if (!visible) return;
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        if (mounted) setLocalUid(uid ? String(uid) : null);
      } catch {
        if (mounted) setLocalUid(null);
      }
    })();
    return () => { mounted = false; };
  }, [visible]);

  useEffect(() => {
    if (highlightId && visible) {
      setLoading(true);
      getHighlightStories(highlightId).then((res: any) => {
        const storyArray = Array.isArray(res?.stories)
          ? res.stories
          : Array.isArray(res?.data?.stories)
            ? res.data.stories
            : Array.isArray(res?.data)
              ? res.data
              : [];
        const normalized = (Array.isArray(storyArray) ? storyArray : [])
          .map((raw: any, idx: number) => {
            const flat = flattenStoryPayload(raw);
            const media = pickStoryMedia(flat);
            const sid = pickStoryId(flat, raw, idx);
            return {
              ...flat,
              id: sid,
              _id: flat._id || flat.id || sid,
              imageUrl: media.mediaType === 'video' ? (media.imageUrl || media.videoUrl || '') : (media.imageUrl || ''),
              videoUrl: media.mediaType === 'video' ? media.videoUrl : undefined,
              mediaType: media.mediaType,
            } as Story;
          })
          .slice()
          .sort((a: any, b: any) => {
            const ta = Date.parse(String(a?.createdAt || a?.timestamp || 0)) || 0;
            const tb = Date.parse(String(b?.createdAt || b?.timestamp || 0)) || 0;
            return ta - tb;
          });
        (async () => {
          // If backend is empty (e.g. 24h expiry or eventual consistency), fall back to local archive.
          if (normalized.length === 0 && highlightId) {
            const cached = await getCachedHighlightStories(highlightId);
            const cachedNorm = (Array.isArray(cached) ? cached : []).map((raw: any, idx: number) => {
              const flat = flattenStoryPayload(raw);
              const media = pickStoryMedia(flat);
              const sid = pickStoryId(flat, raw, idx);
              return {
                ...flat,
                id: sid,
                _id: flat._id || flat.id || sid,
                imageUrl: media.mediaType === 'video' ? (media.imageUrl || media.videoUrl || '') : (media.imageUrl || ''),
                videoUrl: media.mediaType === 'video' ? media.videoUrl : undefined,
                mediaType: media.mediaType,
              } as Story;
            });
            setStories(cachedNorm);
          } else {
            setStories(normalized);
          }
          setLoading(false);
          setCurrentIndex(0);
        })();
      });
    }
  }, [highlightId, visible]);

  useEffect(() => {
    if (stories.length > 0 && visible && !loading && !showComments) {
      if (isPaused) {
        if (progressAnimation.current) progressAnimation.current.stop();
      } else {
        startProgress();
      }
    }
    return () => {
      if (progressAnimation.current) progressAnimation.current.stop();
    };
  }, [currentIndex, stories, visible, loading, isPaused, showComments]);

  const startProgress = () => {
    // Calculate remaining time if we were paused
    const currentProgress = (progress as any)._value || 0;
    const remainingDuration = 5000 * (1 - currentProgress);

    progressAnimation.current = Animated.timing(progress, {
      toValue: 1,
      duration: remainingDuration,
      useNativeDriver: false,
    });

    progressAnimation.current.start(({ finished }) => {
      if (finished) {
        handleNext();
      }
    });
  };

  const handleLongPressIn = () => {
    setIsPaused(true);
  };

  const handleLongPressOut = () => {
    setIsPaused(false);
  };

  const resolveStoryUri = (s: Story) => {
    const flat = flattenStoryPayload(s as any);
    const media = pickStoryMedia(flat);
    if (media.mediaType === 'video') {
      return media.imageUrl || media.videoUrl || String(flat.userAvatar || '');
    }
    return media.imageUrl || String(flat.userAvatar || '');
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      progress.setValue(0);
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      progress.setValue(0);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const toggleLike = () => {
    setIsLiked(!isLiked);
    // Add API call for like here if needed
  };

  const handleDeleteStory = async () => {
    if (!highlightId || !stories[currentIndex]) return;

    Alert.alert(
      'Delete Story',
      'Remove this story from highlight?',
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            setDeleting(true);
            try {
              const storyAtPress = stories[currentIndex];
              const storyId = storyAtPress?.id || storyAtPress?._id;
              if (!storyId) {
                Alert.alert('Error', 'Story id not found');
                return;
              }
              const mediaHint = String((storyAtPress as any)?.videoUrl || (storyAtPress as any)?.imageUrl || (storyAtPress as any)?.mediaUrl || '');

              // ✅ Instagram-like: remove instantly in UI, then sync server.
              const removedIndex = currentIndex;
              const nextStories = stories.filter((_, idx) => idx !== removedIndex);
              setStories(nextStories);
              if (nextStories.length === 0) {
                // Remove highlight from profile immediately (don't wait for refetch)
                try { feedEventEmitter.emitHighlightDeleted(String(highlightId)); } catch {}
                // If highlight becomes empty, close viewer immediately.
                onClose();
              } else {
                setCurrentIndex((idx) => Math.min(idx, nextStories.length - 1));
              }

              const result = await highlightManager.removeStoryFromHighlight({
                highlightId,
                storyId: String(storyId),
                mediaUrlHint: mediaHint || undefined,
                autoDeleteHighlightIfEmpty: true,
                userId: String(userId || localUid || ''),
              });

              // Don't block UX on server failure in production.
              if (result.error && __DEV__) {
                console.warn('[HighlightViewer] Server remove failed:', result.error);
              }
            } catch (error: any) {
              Alert.alert('Error', 'Failed to delete story: ' + error.message);
            } finally {
              setDeleting(false);
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const getRelativeTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d`;
  };

  const currentStoryId = stories[currentIndex]?.id || stories[currentIndex]?._id || '';

  const handleClose = () => {
    setShowComments(false);
    setIsPaused(false);
    onClose();
  };

  return (
    <Modal 
      visible={visible} 
      animationType="slide" 
      transparent={false} 
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : stories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <TouchableOpacity style={styles.closeBtnOverlay} onPress={handleClose}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Ionicons name="image-outline" size={48} color="#999" />
            <Text style={styles.loadingText}>No stories in this highlight</Text>
          </View>
        ) : (
          <View style={styles.storyContainer}>
            {String(stories[currentIndex]?.mediaType || '').toLowerCase() === 'video' &&
            (stories[currentIndex] as any)?.videoUrl ? (
              <Video
                source={{ uri: String((stories[currentIndex] as any).videoUrl) }}
                style={styles.storyImage}
                resizeMode={ResizeMode.COVER}
                shouldPlay={!isPaused && !showComments}
                isLooping
                isMuted={false}
                useNativeControls={false}
              />
            ) : (
              <Image
                source={{ uri: resolveStoryUri(stories[currentIndex]) }}
                style={styles.storyImage}
                resizeMode="cover"
              />
            )}
            
            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              {stories.map((_, idx) => (
                <View key={idx} style={styles.progressBarBackground}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      idx < currentIndex ? { width: '100%' } : 
                      idx === currentIndex ? { 
                        width: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        }) 
                      } : { width: '0%' }
                    ]}
                  />
                </View>
              ))}
            </View>
            
            {/* Top Bar Info */}
            <View style={styles.topBar}>
              <View style={styles.userInfo}>
                {userAvatar ? (
                  <Image source={{ uri: userAvatar }} style={styles.userAvatar} />
                ) : (
                  <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
                    <Ionicons name="person" size={14} color="#fff" />
                  </View>
                )}
                <Text style={styles.userName}>{userName || 'User'}</Text>
                <Text style={styles.timestamp}>{getRelativeTime(stories[currentIndex]?.createdAt)}</Text>
              </View>
              
              <View style={styles.topActions}>
                {(userId || localUid) && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleDeleteStory}
                    disabled={deleting}
                  >
                    <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={handleClose}>
                  <Ionicons name="close" size={30} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Navigation Areas */}
            <View style={styles.navOverlay}>
              <TouchableOpacity
                style={styles.navSide}
                onPress={handlePrev}
                onPressIn={handleLongPressIn}
                onPressOut={handleLongPressOut}
                activeOpacity={1}
              />
              <TouchableOpacity
                style={styles.navSide}
                onPress={handleNext}
                onPressIn={handleLongPressIn}
                onPressOut={handleLongPressOut}
                activeOpacity={1}
              />
            </View>

            {/* Bottom Actions - Instagram Style */}
            <View style={styles.bottomActions}>
              <TouchableOpacity style={styles.commentInputTrigger} onPress={() => { setIsPaused(true); setShowComments(true); }}>
                <Text style={styles.commentPlaceholder}>Send message</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.bottomIconBtn} onPress={toggleLike}>
                <Ionicons 
                  name={isLiked ? "heart" : "heart-outline"} 
                  size={28} 
                  color={isLiked ? "#ff3b30" : "#fff"} 
                />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.bottomIconBtn}>
                <Ionicons name="paper-plane-outline" size={26} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Comments Modal */}
            <Modal
              visible={showComments}
              transparent={true}
              animationType="slide"
              onRequestClose={() => { setShowComments(false); setIsPaused(false); }}
            >
              <View style={styles.commentsModalContainer}>
                <TouchableOpacity 
                  style={styles.commentsBackdrop} 
                  activeOpacity={1} 
                  onPress={() => { setShowComments(false); setIsPaused(false); }}
                />
                <KeyboardAvoidingView 
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  style={styles.keyboardAvoidingView}
                >
                  <View style={styles.commentsContent}>
                    <View style={styles.commentsHeader}>
                      <View style={styles.commentsHandle} />
                      <TouchableOpacity 
                        style={styles.commentsCloseBtn}
                        onPress={() => { setShowComments(false); setIsPaused(false); }}
                      >
                        <Ionicons name="close" size={24} color="#000" />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <CommentSection
                        postId={currentStoryId}
                        postOwnerId={userId || ''}
                        currentAvatar={userAvatar || ''}
                        currentUser={userId || ''}
                      />
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </View>
            </Modal>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnOverlay: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  storyContainer: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  storyImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },
  progressBarContainer: {
    flexDirection: 'row',
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 20,
    left: 10,
    right: 10,
    height: 2,
    zIndex: 10,
  },
  progressBarBackground: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginHorizontal: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 25 : 35,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fff',
  },
  userAvatarPlaceholder: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  timestamp: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginLeft: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 5,
    marginLeft: 10,
  },
  navOverlay: {
    position: 'absolute',
    top: 100,
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 5,
  },
  navSide: {
    flex: 1,
  },
  bottomActions: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 20 : 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 10,
  },
  commentInputTrigger: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  commentPlaceholder: {
    color: '#fff',
    fontSize: 14,
  },
  bottomIconBtn: {
    marginLeft: 15,
    padding: 5,
  },
  commentsModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  keyboardAvoidingView: {
    width: '100%',
    height: '70%',
  },
  commentsContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  commentsHeader: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  commentsHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#ddd',
    borderRadius: 2.5,
  },
  commentsCloseBtn: {
    position: 'absolute',
    right: 15,
    top: 10,
  },
});

export default HighlightViewer;
