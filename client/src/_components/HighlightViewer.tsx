import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Dimensions, Image, Modal, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Alert, SafeAreaView, Platform, Animated, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHighlightStories } from '../../lib/firebaseHelpers/core';
import { flattenStoryPayload, getCachedHighlightStories, pickStoryId, pickStoryMedia } from '../../lib/storyViewer';
import CommentSection from './CommentSection';
import { Video, ResizeMode } from 'expo-av';
import { highlightManager } from '../../lib/highlightManager';
import AsyncStorage from '@/lib/storage';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { apiService } from '../_services/apiService';
import StoriesViewer from './StoriesViewer';

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
  const [deleting, setDeleting] = useState(false);
  const [localUid, setLocalUid] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    console.log('[HighlightViewer] 🚀 Component MOUNTED! visible:', visible, 'highlightId:', highlightId);
    return () => {
      console.log('[HighlightViewer] 💀 Component UNMOUNTED!');
    };
  }, []);

  useEffect(() => {
    console.log('[HighlightViewer] 🔄 Prop changed - visible:', visible, 'highlightId:', highlightId);
  }, [visible, highlightId]);

  useEffect(() => {
    if (!visible) {
      setShowComments(false);
      setIsPaused(false);
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
      console.log('[HighlightViewer] 🔍 Fetching stories for highlightId:', highlightId);
      setLoading(true);

      // Helper: normalize raw story objects into our Story shape.
      const normalizeArray = (arr: any[]): Story[] =>
        (Array.isArray(arr) ? arr : [])
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
          .sort((a: any, b: any) => {
            const ta = Date.parse(String(a?.createdAt || a?.timestamp || 0)) || 0;
            const tb = Date.parse(String(b?.createdAt || b?.timestamp || 0)) || 0;
            return ta - tb;
          });

      // Helper: extract story array from any response shape.
      const extractStories = (res: any): any[] => {
        if (!res) return [];
        if (Array.isArray(res)) return res;
        if (Array.isArray(res.data)) return res.data;
        if (Array.isArray(res.stories)) return res.stories;
        if (Array.isArray(res.data?.stories)) return res.data.stories;
        if (Array.isArray(res.data?.data)) return res.data.data;
        return [];
      };

      (async () => {
        let stories: Story[] = [];
        let debugRes: any = null;

        // Strategy 1: Direct apiService call (simplest, most reliable).
        try {
          console.log('[HighlightViewer] 📡 Direct API call...');
          const directRes = await apiService.get(`/highlights/${highlightId}/stories`);
          debugRes = directRes;
          console.log('[HighlightViewer] 📡 Direct API response keys:', Object.keys(directRes || {}));
          const directArr = extractStories(directRes);
          console.log('[HighlightViewer] 📡 Direct API stories count:', directArr.length);
          if (directArr.length > 0) {
            stories = normalizeArray(directArr);
            console.log('[HighlightViewer] ✅ Got', stories.length, 'stories from direct API');
          }
        } catch (err: any) {
          console.warn('[HighlightViewer] ⚠️ Direct API failed:', err?.message || err);
          debugRes = { error: err?.message };
        }

        // Strategy 2: getHighlightStories helper (includes hydration + cache merge).
        if (stories.length === 0) {
          try {
            console.log('[HighlightViewer] 📡 Trying getHighlightStories helper...');
            const helperRes: any = await getHighlightStories(highlightId);
            const helperArr = extractStories(helperRes);
            console.log('[HighlightViewer] 📡 Helper stories count:', helperArr.length);
            if (helperArr.length > 0) {
              stories = normalizeArray(helperArr);
              console.log('[HighlightViewer] ✅ Got', stories.length, 'stories from helper');
            }
          } catch (err: any) {
            console.warn('[HighlightViewer] ⚠️ Helper failed:', err?.message || err);
          }
        }

        // Strategy 3: Local cache fallback.
        if (stories.length === 0) {
          try {
            console.log('[HighlightViewer] 💾 Trying local cache...');
            const cached = await getCachedHighlightStories(highlightId);
            if (Array.isArray(cached) && cached.length > 0) {
              stories = normalizeArray(cached);
              console.log('[HighlightViewer] ✅ Got', stories.length, 'stories from cache');
            }
          } catch (err: any) {
            console.warn('[HighlightViewer] ⚠️ Cache failed:', err?.message || err);
          }
        }

        console.log('[HighlightViewer] 🏁 Final stories count:', stories.length);
        if (stories.length === 0) {
          Alert.alert('Debug: No Stories', `ID: ${highlightId}\nDirect API: ${JSON.stringify(debugRes || 'failed')}`);
        }
        setStories(stories);
        setLoading(false);
      })();
    }
  }, [highlightId, visible]);



  const handleClose = () => {
    console.log('[HighlightViewer] handleClose called! Stack trace:\n', new Error().stack);
    setShowComments(false);
    setIsPaused(false);
    onClose();
  };

  const mappedStories = useMemo(() => {
    return stories.map((s: any) => ({
      ...s,
      userName: s.userName || userName || 'User',
      userAvatar: s.userAvatar || userAvatar || '',
    }));
  }, [stories, userName, userAvatar]);

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
          <StoriesViewer
            stories={mappedStories as any}
            onClose={handleClose}
            isHighlight={true}
            highlightId={highlightId || undefined}
          />
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
