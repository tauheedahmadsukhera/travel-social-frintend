import { DEFAULT_AVATAR_URL } from '../lib/api';
/**
 * Watch Live Screen - ZeegoCloud with Full Features
 * Features: Comments, Viewers, Map, Share, etc.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../config/firebase';
import { logger } from '../utils/logger';
// ZeegoCloud imports
import { ZEEGOCLOUD_CONFIG } from '../config/zeegocloud';
import ZeegocloudStreamingService from '../services/implementations/ZeegocloudStreamingService';
import ZeegocloudLiveViewer from '@/src/_components/ZeegocloudLiveViewer';
import { joinLiveStreamWithProfile, leaveLiveStream, subscribeToLiveViewers } from '../lib/firebaseHelpers/live';

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default ?? RNMaps;
  Marker = RNMaps.Marker;
}

const { width, height } = Dimensions.get('window');


// Utility functions
function getSafeCoordinate(coord: { latitude?: number; longitude?: number } | null, fallback = { latitude: 51.5074, longitude: -0.1278 }) {
  const lat = typeof coord?.latitude === 'number' && isFinite(coord.latitude) ? coord.latitude : fallback.latitude;
  const lon = typeof coord?.longitude === 'number' && isFinite(coord.longitude) ? coord.longitude : fallback.longitude;
  return { latitude: lat, longitude: lon };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: any;
}

interface Viewer {
  id: string;
  name: string;
  avatar: string;
  location?: { latitude: number; longitude: number };
}

export default function WatchLiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const streamIdParam = typeof params.streamId === 'string' ? params.streamId : undefined;
  const roomId = params.roomId as string;
  const streamTitle = params.title as string || 'Live Stream';
  
  const zeegocloudServiceRef = useRef<ZeegocloudStreamingService | null>(null);
  const viewersUnsubRef = useRef<null | (() => void)>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  // User state
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Location state
  const [location, setLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [broadcasterLocation, setBroadcasterLocation] = useState<{latitude: number; longitude: number} | null>(null);
  
  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [lastReadTs, setLastReadTs] = useState(0);
  
  // Viewers state
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  
  // UI state
  const [showComments, setShowComments] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [canToggleComments, setCanToggleComments] = useState(false);

  const commentsListRef = useRef<FlatList<Comment> | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const unreadCount = comments.reduce((acc, c) => acc + ((Number(c?.timestamp) || 0) > lastReadTs ? 1 : 0), 0);

  // Get current location
  useEffect(() => {
    const getLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (error) {
        logger.error('Error getting location:', error);
      }
    };
    getLocation();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent as any, (e: any) => {
      const h = e?.endCoordinates?.height;
      setKeyboardHeight(typeof h === 'number' ? h : 0);
    });
    const subHide = Keyboard.addListener(hideEvent as any, () => setKeyboardHeight(0));

    return () => {
      try { subShow.remove(); } catch {}
      try { subHide.remove(); } catch {}
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setCanToggleComments(true), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showComments) return;
    const latest = comments.reduce((m, c) => Math.max(m, Number(c?.timestamp) || 0), 0);
    setLastReadTs(latest);
  }, [showComments, comments]);

  // Load user data
  useEffect(() => {
    const loadUser = async () => {
      const user = auth?.currentUser;
      if (user) {
        setCurrentUser({ uid: user.uid, displayName: user.displayName || 'Anonymous', photoURL: user.photoURL || DEFAULT_AVATAR_URL });
      }
    };
    loadUser();
  }, []);

  // Auto-join stream
  useEffect(() => {
    if (roomId && currentUser && !isJoined && !isJoining) {
      handleJoinStream();
    }
  }, [roomId, currentUser]);

  // Join stream
  const handleJoinStream = async () => {
    if (!roomId) {
      Alert.alert('Error', 'Invalid room ID');
      router.back();
      return;
    }

    try {
      setIsJoining(true);
      const service = ZeegocloudStreamingService.getInstance();
      const userId = currentUser?.uid || 'anonymous';
      const userName = currentUser?.displayName || 'Anonymous';

      await service.initialize(userId, roomId, userName, false);
      zeegocloudServiceRef.current = service;
      setIsJoined(true);

      try {
        if (streamIdParam && userId) {
          const authEmail = auth?.currentUser?.email;
          await joinLiveStreamWithProfile(String(streamIdParam), String(userId), {
            userName: String(currentUser?.displayName || '').trim() || (typeof authEmail === 'string' ? authEmail.split('@')[0] : 'Viewer'),
            userAvatar: String(currentUser?.photoURL || '').trim() || DEFAULT_AVATAR_URL,
          });
        }
      } catch (e: any) {
        logger.error('Join live stream (backend) failed:', e);
      }

      try {
        if (streamIdParam) {
          if (viewersUnsubRef.current) {
            try { viewersUnsubRef.current(); } catch {}
            viewersUnsubRef.current = null;
          }

          const unsub = subscribeToLiveViewers(
            String(streamIdParam),
            (items) => {
              const mapped: Viewer[] = (Array.isArray(items) ? items : []).map((v: any) => ({
                id: String(v?.id || ''),
                name: String(v?.name || 'Viewer'),
                avatar: (typeof v?.avatar === 'string' && v.avatar.trim().length > 0) ? v.avatar : DEFAULT_AVATAR_URL,
              }));
              setViewers(mapped);
            },
            (count) => {
              if (typeof count === 'number') setViewerCount(count);
            }
          );

          viewersUnsubRef.current = () => {
            try { unsub(); } catch {}
          };
        }
      } catch (e: any) {
        logger.error('Subscribe to live viewers failed:', e);
      }

      logger.info('Joined stream:', roomId);
    } catch (error) {
      logger.error('Join stream error:', error);
      Alert.alert('Error', 'Failed to join stream');
      router.back();
    } finally {
      setIsJoining(false);
    }
  };

  // Leave stream
  const handleLeaveStream = async () => {
    try {
      try {
        if (viewersUnsubRef.current) {
          viewersUnsubRef.current();
          viewersUnsubRef.current = null;
        }
      } catch {}

      if (zeegocloudServiceRef.current) {
        await zeegocloudServiceRef.current.disconnect();
      }

      // Notify backend that user left (best-effort)
      try {
        const userId = currentUser?.uid;
        if (streamIdParam && userId) {
          await leaveLiveStream(String(streamIdParam), String(userId));
        }
      } catch (e: any) {
        logger.error('Leave live stream (backend) failed:', e);
      }

      router.back();
    } catch (error) {
      logger.error('Leave stream error:', error);
      router.back();
    }
  };

  useEffect(() => {
    return () => {
      try {
        if (viewersUnsubRef.current) {
          viewersUnsubRef.current();
          viewersUnsubRef.current = null;
        }
      } catch {}
    };
  }, []);

  // Toggle mute
  const toggleMute = () => setIsMuted(!isMuted);

  // Share stream
  const handleShare = async () => {
    try {
      const shareUrl = `https://yourapp.com/watch-live?roomId=${roomId}`;
      await Share.share({
        message: `Watch this live stream: ${streamTitle}\n${shareUrl}`,
        url: shareUrl,
      });
    } catch (error) {
      logger.error('Share error:', error);
    }
  };

  // Send comment
  const handleSendComment = () => {
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: Date.now().toString(),
      userId: currentUser?.uid || 'anonymous',
      userName: currentUser?.displayName || 'Anonymous',
      userAvatar: currentUser?.photoURL || DEFAULT_AVATAR_URL,
      text: newComment.trim(),
      timestamp: Date.now(),
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');

    requestAnimationFrame(() => {
      try {
        commentsListRef.current?.scrollToEnd({ animated: true });
      } catch {}
    });

    // TODO: Send to backend/Firebase
  };

  // Render comment item
  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <Image source={{ uri: item.userAvatar }} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <Text style={styles.commentUser}>{item.userName}</Text>
        <Text style={styles.commentText}>{item.text}</Text>
      </View>
    </View>
  );

  // Render viewer item
  const renderViewer = ({ item }: { item: Viewer }) => {
    let distance = '';
    if (location && item.location) {
      const km = calculateDistance(location.latitude, location.longitude, item.location.latitude, item.location.longitude);
      distance = `${km.toFixed(1)} km`;
    }

    return (
      <View style={styles.viewerItem}>
        <Image source={{ uri: item.avatar || DEFAULT_AVATAR_URL }} style={styles.viewerAvatar} />
        <View style={styles.viewerInfo}>
          <Text style={styles.viewerName}>{item.name}</Text>
          {distance && <Text style={styles.viewerDistance}>{distance} away</Text>}
        </View>
      </View>
    );
  };

  // Loading state
  if (isJoining) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Joining stream...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Main UI
  return (
    <SafeAreaView style={styles.container}>
      {/* ZeegoCloud Video Component */}
      <View style={styles.videoContainer}>
        <ZeegocloudLiveViewer
          roomID={roomId}
          userID={currentUser?.uid || 'anonymous'}
          userName={currentUser?.displayName || 'Anonymous'}
          onLeave={handleLeaveStream}
        />
      </View>

      {/* Overlay UI */}
      <View style={styles.overlay}>
        <View style={[styles.figmaTopRow, { paddingTop: 12 + (insets?.top || 0) }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.viewersPill}
            onPress={() => setShowViewers(true)}
            activeOpacity={0.85}
          >
            <View style={styles.avatarStack}>
              {(Array.isArray(viewers) ? viewers : []).slice(0, 4).map((v, idx) => (
                <Image
                  key={`${v?.id || idx}`}
                  source={{ uri: v?.avatar || DEFAULT_AVATAR_URL }}
                  style={[styles.avatarStackItem, { marginLeft: idx === 0 ? 0 : -10, zIndex: 10 - idx }]}
                />
              ))}
            </View>
            <Text style={styles.viewersPillText}>{(typeof viewerCount === 'number' ? viewerCount : viewers.length)} Viewers</Text>
            <View style={styles.liveDotGreen} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.endPill} onPress={handleLeaveStream} activeOpacity={0.9}>
            <Text style={styles.endPillText}>End</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomBar} pointerEvents={showComments ? 'box-none' : 'auto'}>
          <View pointerEvents={showComments ? 'none' : 'auto'}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={() => setShowMap(!showMap)}
            >
              <Ionicons name="map" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View pointerEvents={showComments ? 'none' : 'auto'}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={toggleMute}
            >
              <Ionicons name="camera" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              if (!canToggleComments) return;
              setShowComments(v => !v);
            }}
          >
            <Ionicons name="chatbubble" size={24} color="#fff" />
            {unreadCount > 0 && !showComments && !showMap && !showViewers && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View pointerEvents={showComments ? 'none' : 'auto'}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleShare}
            >
              <Ionicons
                name="paper-plane"
                size={22}
                color="#fff"
                style={{ transform: [{ rotate: '-25deg' }, { translateY: -1 }] }}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Comments Panel */}
      {showComments && (
        <View style={styles.commentsOverlay} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowComments(false)}
          />

          <View style={{ flex: 1 }}>
            <View style={[styles.commentsOverlayHeader, { paddingTop: 12 + (insets?.top || 0) }]}>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setShowComments(false)} style={styles.commentsOverlayClose}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              ref={(r) => {
                commentsListRef.current = r;
              }}
              data={comments}
              renderItem={renderComment}
              keyExtractor={(item) => item.id}
              style={[
                styles.commentsOverlayList,
                {
                  top: Math.round(height * 0.42),
                  bottom: clampNumber(82 + (insets?.bottom || 0) + (keyboardHeight || 0), 82, height),
                },
              ]}
              contentContainerStyle={[
                styles.commentsOverlayListContent,
                { paddingBottom: 12 },
              ]}
              keyboardShouldPersistTaps="handled"
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
                shouldAutoScrollRef.current = distanceFromBottom < 40;
              }}
              scrollEventThrottle={16}
              onContentSizeChange={() => {
                if (!shouldAutoScrollRef.current) return;
                try {
                  commentsListRef.current?.scrollToEnd({ animated: true });
                } catch {}
              }}
            />

            <View
              style={[
                styles.commentsOverlayInputRow,
                {
                  paddingBottom: 12 + (insets?.bottom || 0),
                  bottom: keyboardHeight ? keyboardHeight : 70,
                },
              ]}
            >
              <TextInput
                style={styles.commentsOverlayTextInput}
                placeholder="Send a message"
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={newComment}
                onChangeText={setNewComment}
              />
              <TouchableOpacity onPress={handleSendComment} style={styles.commentsOverlaySendBtn}>
                <Ionicons name="paper-plane" size={18} color="#fff" style={{ transform: [{ rotate: '-25deg' }, { translateY: -1 }] }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Viewers Panel */}
      {showViewers && (
        <View style={styles.viewersPanel}>
          <View style={styles.viewersPanelHeader}>
            <TouchableOpacity onPress={() => setShowViewers(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.viewersPanelTitle}>Viewers ({viewers.length})</Text>
          </View>

          <FlatList
            data={viewers}
            renderItem={renderViewer}
            keyExtractor={(item) => item.id}
            style={styles.viewersList}
          />
        </View>
      )}

      {/* Map Panel */}
      {showMap && broadcasterLocation && (
        <View style={styles.mapPanel}>
          <View style={styles.mapPanelHeader}>
            <Text style={styles.mapPanelTitle}>Broadcaster Location</Text>
            <TouchableOpacity onPress={() => setShowMap(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && MapView ? (
            <MapView
              style={styles.map}
              googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
              initialRegion={{
                latitude: broadcasterLocation.latitude,
                longitude: broadcasterLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              provider={Platform.OS === 'ios' ? 'google' : undefined}
            >
              <Marker coordinate={broadcasterLocation} title="Broadcaster" />
              {location && <Marker coordinate={location} title="You" pinColor="blue" />}
            </MapView>
          ) : (
            <View style={[styles.map, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#666' }}>Map is not available on web preview.</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#fff' },
  videoContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  figmaTopRow: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, elevation: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  viewersPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)' },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  avatarStackItem: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  viewersPillText: { fontSize: 13, fontWeight: '600', color: '#fff', marginRight: 8 },
  liveDotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2ecc71' },
  endPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#ff4d4f' },
  endPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  topBar: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  backButton: { padding: 8, marginRight: 12 },
  streamInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 6 },
  liveText: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  streamTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff' },
  topRight: { flexDirection: 'row', gap: 8 },
  iconButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  iconButtonText: { fontSize: 14, color: '#fff', marginLeft: 4, fontWeight: 'bold' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, elevation: 50, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  controlButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#e74c3c', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
  commentsPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  commentsPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  commentsPanelTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  commentsList: { flex: 1 },
  commentItem: { flexDirection: 'row', paddingVertical: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 10 },
  commentContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  commentUser: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 2 },
  commentText: { fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  commentInput: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  commentTextInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  commentsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10, flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  commentsOverlayClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlayList: { position: 'absolute', left: 0, right: 0 },
  commentsOverlayListContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 90 },
  commentsOverlayInputRow: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  commentsOverlayTextInput: { flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 14, paddingRight: 60, color: '#fff', backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlaySendBtn: { position: 'absolute', right: 16, top: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  viewersPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  viewersPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  viewersPanelTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  viewersList: { flex: 1 },
  viewerItem: { flexDirection: 'row-reverse', justifyContent: 'flex-end', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  viewerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  viewerInfo: { flex: 1, justifyContent: 'center', alignItems: 'flex-end' },
  viewerName: { fontSize: 14, fontWeight: '600', color: '#000', textAlign: 'right' },
  viewerDistance: { fontSize: 12, color: '#666', marginTop: 2, textAlign: 'right' },
  mapPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.5, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  mapPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  mapPanelTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  map: { flex: 1 },
});

