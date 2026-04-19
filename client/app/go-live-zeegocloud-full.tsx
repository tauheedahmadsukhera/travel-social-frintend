import { DEFAULT_AVATAR_URL } from '../lib/api';
import { safeRouterBack } from '@/lib/safeRouterBack';
/**
 * Go Live Screen - ZeegoCloud with Full Features
 * Features: Comments, Viewers, Map, Share, etc.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
// ZeegoCloud imports
import { ZEEGOCLOUD_CONFIG, generateRoomId } from '../config/zeegocloud';
import ZeegocloudStreamingService from '../services/implementations/ZeegocloudStreamingService';
import ZeegocloudLiveHost from '@/src/_components/ZeegocloudLiveHost';

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default ?? RNMaps;
  Marker = RNMaps.Marker;
}

const { width, height } = Dimensions.get('window');


// Utility: sanitize coordinates for MapView/Marker
function getSafeCoordinate(coord: { latitude?: number; longitude?: number } | null, fallback = { latitude: 51.5074, longitude: -0.1278 }) {
  const lat = typeof coord?.latitude === 'number' && isFinite(coord.latitude) ? coord.latitude : fallback.latitude;
  const lon = typeof coord?.longitude === 'number' && isFinite(coord.longitude) ? coord.longitude : fallback.longitude;
  return { latitude: lat, longitude: lon };
}

// Calculate distance between two coordinates (in km)
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

// Format distance for display
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

export default function GoLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const zeegocloudServiceRef = useRef<ZeegocloudStreamingService | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [streamTitle, setStreamTitle] = useState('');

  // Refs
  const isStreamingRef = useRef(isStreaming);
  const roomIdRef = useRef(roomId);
  const isExplicitlyEndingRef = useRef<boolean>(false);
  const appStateRef = useRef<string>(AppState.currentState);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  // User state
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isUsingFrontCamera, setIsUsingFrontCamera] = useState(true);
  
  // Location state
  const [location, setLocation] = useState<{latitude: number; longitude: number} | null>(null);
  
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
  const [showStats, setShowStats] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [canToggleComments, setCanToggleComments] = useState(false);

  const commentsListRef = useRef<FlatList<Comment> | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const unreadCount = comments.reduce((acc, c) => acc + ((Number(c?.timestamp) || 0) > lastReadTs ? 1 : 0), 0);

  // Stats
  const [streamDuration, setStreamDuration] = useState(0);
  const streamStartTimeRef = useRef<number>(0);

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

  // Stream duration timer
  useEffect(() => {
    let interval: any;
    if (isStreaming) {
      streamStartTimeRef.current = Date.now();
      interval = setInterval(() => {
        setStreamDuration(Math.floor((Date.now() - streamStartTimeRef.current) / 1000));
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isStreaming]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Initialize ZeegoCloud
  const initZeegoCloud = useCallback(async () => {
    try {
      const service = ZeegocloudStreamingService.getInstance();
      const userId = currentUser?.uid || 'anonymous';
      const userName = currentUser?.displayName || 'Anonymous';
      const newRoomId = generateRoomId(userId);

      await service.initialize(userId, newRoomId, userName, true);
      zeegocloudServiceRef.current = service;
      setRoomId(newRoomId);
      return true;
    } catch (error) {
      logger.error('ZeegoCloud init error:', error);
      return false;
    }
  }, [currentUser]);

  // Start streaming
  const handleStartStream = async () => {
    if (!streamTitle.trim()) {
      Alert.alert('Error', 'Please enter a stream title');
      return;
    }

    try {
      setIsInitializing(true);
      const success = await initZeegoCloud();

      if (success && zeegocloudServiceRef.current) {
        await zeegocloudServiceRef.current.startBroadcast();
        setIsStreaming(true);
        isStreamingRef.current = true;

        // Save stream to backend
        // TODO: Call your backend API to save stream info

        logger.info('Stream started:', roomId);
      } else {
        Alert.alert('Error', 'Failed to initialize streaming');
      }
    } catch (error) {
      logger.error('Start stream error:', error);
      Alert.alert('Error', 'Failed to start stream');
    } finally {
      setIsInitializing(false);
    }
  };

  // End streaming
  const handleEndStream = async () => {
    Alert.alert(
      'End Stream',
      'Are you sure you want to end this live stream?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Stream',
          style: 'destructive',
          onPress: async () => {
            try {
              isExplicitlyEndingRef.current = true;

              if (zeegocloudServiceRef.current) {
                await zeegocloudServiceRef.current.stopBroadcast();
                await zeegocloudServiceRef.current.disconnect();
              }

              setIsStreaming(false);
              isStreamingRef.current = false;

              // TODO: Update backend that stream ended

              safeRouterBack();
            } catch (error) {
              logger.error('End stream error:', error);
            }
          },
        },
      ]
    );
  };

  // Toggle controls
  const toggleMute = () => setIsMuted(!isMuted);
  const toggleCamera = () => setIsCameraOn(!isCameraOn);
  const toggleCameraFacing = () => setIsUsingFrontCamera(!isUsingFrontCamera);

  // Share stream
  const handleShare = async () => {
    try {
      const shareUrl = `https://yourapp.com/watch-live?roomId=${roomId}`;
      await Share.share({
        message: `Watch my live stream: ${streamTitle}\n${shareUrl}`,
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

  // Back handler
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isStreaming) {
        Alert.alert(
          'Stream is Live',
          'Your stream is still live. Do you want to end it?',
          [
            { text: 'Keep Streaming', style: 'cancel' },
            { text: 'End Stream', style: 'destructive', onPress: handleEndStream },
          ]
        );
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [isStreaming]);

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

  // If not streaming, show setup screen
  if (!isStreaming) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Go Live</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.setupContainer}>
          <View style={styles.setupCard}>
            <Text style={styles.setupLabel}>Stream Title</Text>
            <TextInput
              style={styles.setupInput}
              placeholder="Enter stream title..."
              value={streamTitle}
              onChangeText={setStreamTitle}
              maxLength={100}
            />

            <Text style={styles.setupHint}>
              💡 Tip: Use a catchy title to attract more viewers!
            </Text>
          </View>

          <View style={styles.setupCard}>
            <Text style={styles.setupLabel}>📍 Location</Text>
            <Text style={styles.setupValue}>
              {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Getting location...'}
            </Text>
          </View>

          <View style={styles.setupCard}>
            <Text style={styles.setupLabel}>ℹ️ Stream Info</Text>
            <Text style={styles.setupInfo}>• Your stream will be visible to all users</Text>
            <Text style={styles.setupInfo}>• Viewers can comment and interact</Text>
            <Text style={styles.setupInfo}>• Stream will be saved for 24 hours</Text>
          </View>

          <TouchableOpacity
            style={[styles.startButton, isInitializing && styles.startButtonDisabled]}
            onPress={handleStartStream}
            disabled={isInitializing}
          >
            {isInitializing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="videocam" size={24} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.startButtonText}>Start Live Stream</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Streaming UI
  return (
    <SafeAreaView style={styles.container}>
      {/* ZeegoCloud Video Component */}
      <View style={styles.videoContainer}>
        <ZeegocloudLiveHost
          roomID={roomId}
          userID={currentUser?.uid || 'anonymous'}
          userName={currentUser?.displayName || 'Anonymous'}
          onLeave={handleEndStream}
          isCameraOn={isCameraOn}
          isMuted={isMuted}
          isUsingFrontCamera={isUsingFrontCamera}
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

          <TouchableOpacity style={styles.endPill} onPress={handleEndStream} activeOpacity={0.9}>
            <Text style={styles.endPillText}>End</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Panel */}
        {showStats && (
          <View style={styles.statsPanel}>
            <Text style={styles.statsTitle}>Stream Stats</Text>
            <Text style={styles.statsText}>👥 Viewers: {viewerCount}</Text>
            <Text style={styles.statsText}>💬 Comments: {comments.length}</Text>
            <Text style={styles.statsText}>⏱️ Duration: {formatDuration(streamDuration)}</Text>
            <Text style={styles.statsText}>📍 Location: {location ? 'Enabled' : 'Disabled'}</Text>
          </View>
        )}

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
              onPress={toggleCameraFacing}
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
            {unreadCount > 0 && !showComments && !showMap && !showViewers && !showStats && (
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
      {showMap && location && (
        <View style={styles.mapPanel}>
          <View style={styles.mapPanelHeader}>
            <Text style={styles.mapPanelTitle}>Stream Location</Text>
            <TouchableOpacity onPress={() => setShowMap(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && MapView ? (
            <MapView
              style={styles.map}
              googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
              mapType="standard"
              initialRegion={{
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              provider={Platform.OS === 'ios' ? 'google' : undefined}
            >
              <Marker coordinate={location} title="You are here" />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  setupContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  setupCard: { backgroundColor: '#fff', margin: 16, padding: 16, borderRadius: 12 },
  setupLabel: { fontSize: 16, fontWeight: '600', color: '#000', marginBottom: 8 },
  setupInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  setupHint: { marginTop: 8, fontSize: 14, color: '#666' },
  setupValue: { fontSize: 14, color: '#666' },
  setupInfo: { fontSize: 14, color: '#666', marginTop: 4 },
  startButton: { backgroundColor: '#667eea', margin: 16, padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
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
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', marginRight: 6 },
  liveText: { fontSize: 14, fontWeight: 'bold', color: '#fff', marginRight: 8 },
  durationText: { fontSize: 12, color: '#fff' },
  topRight: { flexDirection: 'row', gap: 8 },
  iconButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  iconButtonText: { fontSize: 14, color: '#fff', marginLeft: 4, fontWeight: 'bold' },
  statsPanel: { position: 'absolute', top: 70, right: 16, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, borderRadius: 12, minWidth: 200 },
  statsTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  statsText: { fontSize: 14, color: '#fff', marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, elevation: 50, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  controlButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  endButton: { backgroundColor: '#e74c3c' },
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

