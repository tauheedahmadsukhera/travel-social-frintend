import { DEFAULT_AVATAR_URL } from '../lib/api';
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
  Modal,
  Platform,
  Pressable,
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
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
// ZeegoCloud imports
import { ZEEGOCLOUD_CONFIG, generateRoomId } from '../config/zeegocloud';
import ZeegocloudStreamingService from '../services/implementations/ZeegocloudStreamingService';
import ZeegocloudLiveHost from '@/src/_components/ZeegocloudLiveHost';
import { endLiveStream, getActiveLiveStreams, startLiveStream, subscribeToLiveViewers } from '../lib/firebaseHelpers/live';

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
  const viewersUnsubRef = useRef<null | (() => void)>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [streamTitle, setStreamTitle] = useState('');

  // User state
  const [currentUser, setCurrentUser] = useState<any>(null);

  const storedUserIdRef = useRef<string | null>(null);

  const backendStreamIdRef = useRef<string | null>(null);
  const streamOwnerIdRef = useRef<string | null>(null);

  // Refs
  const isStreamingRef = useRef(isStreaming);
  const roomIdRef = useRef(roomId);
  const isExplicitlyEndingRef = useRef<boolean>(false);
  const appStateRef = useRef<string>(AppState.currentState);

  useEffect(() => { isStreamingRef.current = isStreaming; }, [isStreaming]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);

  useEffect(() => {
    (async () => {
      try {
        const uid = await AsyncStorage.getItem('userId');
        storedUserIdRef.current = uid ? String(uid) : null;
      } catch {
        storedUserIdRef.current = null;
      }
    })();
  }, []);

  const normalizeStreamId = useCallback((value: any): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      if (typeof (value as any).$oid === 'string') return (value as any).$oid;
      if (typeof (value as any).toHexString === 'function') {
        try { return (value as any).toHexString(); } catch {}
      }
      if (typeof (value as any).toString === 'function') {
        try {
          const s = (value as any).toString();
          if (s && s !== '[object Object]') return s;
        } catch {}
      }
    }
    return null;
  }, []);

  const resolveOwnActiveStreamId = useCallback(async (userId: string): Promise<string | null> => {
    try {
      const streams: any[] = await getActiveLiveStreams();
      if (!Array.isArray(streams) || streams.length === 0) return null;

      const mine = streams.find((s: any) => String(s?.userId || '') === String(userId));
      return normalizeStreamId(mine?.id) || normalizeStreamId(mine?._id);
    } catch {
      return null;
    }
  }, [normalizeStreamId]);

  const endBackendStreamBestEffort = useCallback(async (streamId: string, userId: string | null | undefined) => {
    try {
      if (!streamId || !userId) return;

      const first: any = await endLiveStream(String(streamId), String(userId));
      if (first?.success === true) return;

      const errText = String(first?.error || '');
      const looksLikeOwnerMismatch = errText.toLowerCase().includes('only stream owner') || errText.toLowerCase().includes('owner');
      const fallbackUserId = auth?.currentUser?.uid;

      if (looksLikeOwnerMismatch && fallbackUserId && String(fallbackUserId) !== String(userId)) {
        await endLiveStream(String(streamId), String(fallbackUserId));
      }
    } catch (e: any) {
      logger.error('endBackendStreamBestEffort failed:', e);
    }
  }, []);

  const endStreamSilently = useCallback(async () => {
    try {
      if (isExplicitlyEndingRef.current) return;
      if (!isStreamingRef.current) return;

      isExplicitlyEndingRef.current = true;

      try {
        if (zeegocloudServiceRef.current) {
          await zeegocloudServiceRef.current.stopBroadcast();
          await zeegocloudServiceRef.current.disconnect();
        }
      } catch (e: any) {
        logger.error('Silent stop/disconnect failed:', e);
      }

      setIsStreaming(false);
      isStreamingRef.current = false;

      try {
        if (viewersUnsubRef.current) {
          viewersUnsubRef.current();
          viewersUnsubRef.current = null;
        }
      } catch {}

      try {
        let streamId = backendStreamIdRef.current;
        const userId = streamOwnerIdRef.current || storedUserIdRef.current || currentUser?.uid;

        if (!streamId && userId) {
          streamId = await resolveOwnActiveStreamId(String(userId));
        }

        if (streamId && userId) {
          await endBackendStreamBestEffort(String(streamId), String(userId));
        }
      } catch (e: any) {
        logger.error('Silent end live stream (backend) failed:', e);
      }

      backendStreamIdRef.current = null;
      streamOwnerIdRef.current = null;
    } catch (e: any) {
      logger.error('endStreamSilently failed:', e);
    }
  }, []);

  const startViewersPolling = useCallback((streamId: string) => {
    try {
      if (!streamId) return;
      if (viewersUnsubRef.current) {
        try { viewersUnsubRef.current(); } catch {}
        viewersUnsubRef.current = null;
      }

      const unsub = subscribeToLiveViewers(
        String(streamId),
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
    } catch (e: any) {
      logger.error('Start viewers polling failed:', e);
    }
  }, []);

  // Controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isUsingFrontCamera, setIsUsingFrontCamera] = useState(true);

  
  // Location state
  const [location, setLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [manualLocation, setManualLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [manualLocationLabel, setManualLocationLabel] = useState<string>('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickerLocation, setPickerLocation] = useState<{latitude: number; longitude: number}>(getSafeCoordinate(null));
  const [pickerLocationLabel, setPickerLocationLabel] = useState<string>('');
  const [isResolvingPickerLabel, setIsResolvingPickerLabel] = useState(false);

  const getLiveLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('Live location permission denied');
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        logger.warn('Location services disabled');
        return null;
      }

      let best: { latitude: number; longitude: number } | null = null;

      try {
        const last = await Location.getLastKnownPositionAsync({});
        if (last?.coords && isFinite(last.coords.latitude) && isFinite(last.coords.longitude)) {
          best = { latitude: last.coords.latitude, longitude: last.coords.longitude };
          setLocation(best);
        }
      } catch {}

      try {
        const timeoutMs = 4500;
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
        const current = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const loc: any = await Promise.race([current, timeout]);
        if (loc?.coords && isFinite(loc.coords.latitude) && isFinite(loc.coords.longitude)) {
          best = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setLocation(best);
        }
      } catch (e) {
        logger.error('Error getting current location:', e);
      }

      return best;
    } catch (error) {
      logger.error('Error getting location:', error);
      return null;
    }
  }, []);

  const resolvePickerLabel = useCallback(async (coord: { latitude: number; longitude: number }) => {
    try {
      setIsResolvingPickerLabel(true);
      const results = await Location.reverseGeocodeAsync({ latitude: coord.latitude, longitude: coord.longitude });
      const first = Array.isArray(results) && results.length > 0 ? results[0] : null;
      const city = (first as any)?.city || (first as any)?.subregion || (first as any)?.region || '';
      const country = (first as any)?.country || '';
      const label = [city, country].filter(Boolean).join(', ');
      setPickerLocationLabel(label || `${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
    } catch (e) {
      setPickerLocationLabel(`${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)}`);
    } finally {
      setIsResolvingPickerLabel(false);
    }
  }, []);

  const openLocationPicker = useCallback(() => {
    const base = location || manualLocation || getSafeCoordinate(null);
    setPickerLocation({ latitude: base.latitude, longitude: base.longitude });
    setShowLocationPicker(true);
    resolvePickerLabel({ latitude: base.latitude, longitude: base.longitude });
  }, [location, manualLocation, resolvePickerLabel]);
  
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

  // Stats
  const [streamDuration, setStreamDuration] = useState(0);
  const streamStartTimeRef = useRef<number>(0);

  // Get current location
  useEffect(() => {
    const getLocation = async () => {
      try {
        await getLiveLocation();
      } catch (error) {
        logger.error('Error getting location:', error);
      }
    };
    getLocation();
  }, [getLiveLocation]);

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

  // Request camera and microphone permissions
  const requestPermissions = async () => {
    try {
      console.log('📷 Requesting camera permission...');
      const cameraPermission = await Camera.requestCameraPermissionsAsync();
      console.log('📷 Camera permission:', cameraPermission.status);

      console.log('🎤 Requesting microphone permission...');
      const audioPermission = await Audio.requestPermissionsAsync();
      console.log('🎤 Microphone permission:', audioPermission.status);

      if (cameraPermission.status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required for live streaming');
        return false;
      }

      if (audioPermission.status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is required for live streaming');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      Alert.alert('Error', 'Failed to request permissions. Please check app settings.');
      return false;
    }
  };

  // Start streaming
  const handleStartStream = async () => {
    if (!streamTitle.trim()) {
      Alert.alert('Error', 'Please enter a stream title');
      return;
    }

    if (!storedUserIdRef.current) {
      try {
        const uid = await AsyncStorage.getItem('userId');
        storedUserIdRef.current = uid ? String(uid) : null;
      } catch {
        storedUserIdRef.current = null;
      }
    }

    const authU = auth?.currentUser;
    const effectiveUserId = storedUserIdRef.current || authU?.uid || currentUser?.uid;
    if (!effectiveUserId) {
      Alert.alert('Error', 'User not available. Please sign in again.');
      return;
    }

    isExplicitlyEndingRef.current = false;
    backendStreamIdRef.current = null;
    streamOwnerIdRef.current = effectiveUserId;

    try {
      setIsInitializing(true);

      const liveLoc = await getLiveLocation();
      const effectiveLoc = liveLoc || manualLocation;

      // Request permissions first
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        setIsInitializing(false);
        return;
      }

      const success = await initZeegoCloud();

      if (success && zeegocloudServiceRef.current) {
        await zeegocloudServiceRef.current.startBroadcast();
        setIsStreaming(true);
        isStreamingRef.current = true;

        // Save stream to backend
        // TODO: Call your backend API to save stream info

        try {
          const userId = effectiveUserId;
          const userName = authU?.displayName || currentUser?.displayName || 'Anonymous';
          const userAvatar = authU?.photoURL || currentUser?.photoURL || DEFAULT_AVATAR_URL;
          const effectiveRoomId = typeof zeegocloudServiceRef.current.getRoomId === 'function'
            ? zeegocloudServiceRef.current.getRoomId()
            : roomId;

          const resp: any = await startLiveStream(userId, {
            title: streamTitle,
            roomId: effectiveRoomId,
            channelName: effectiveRoomId,
            userName,
            userAvatar,
            location: effectiveLoc ? { latitude: effectiveLoc.latitude, longitude: effectiveLoc.longitude } : undefined,
            latitude: effectiveLoc?.latitude,
            longitude: effectiveLoc?.longitude,
          });

          const newId =
            normalizeStreamId(resp?.data?.id) ||
            normalizeStreamId(resp?.data?._id) ||
            normalizeStreamId(resp?.id);
          if (newId) backendStreamIdRef.current = newId;

          if (newId) {
            startViewersPolling(String(newId));
          }
        } catch (e: any) {
          logger.error('Start live stream (backend) failed:', e);
        }

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

              try {
                if (viewersUnsubRef.current) {
                  viewersUnsubRef.current();
                  viewersUnsubRef.current = null;
                }
              } catch {}

              // TODO: Update backend that stream ended

              try {
                let streamId = backendStreamIdRef.current;
                const userId = streamOwnerIdRef.current || storedUserIdRef.current || currentUser?.uid;

                if (!streamId && userId) {
                  streamId = await resolveOwnActiveStreamId(String(userId));
                }

                if (streamId && userId) {
                  await endBackendStreamBestEffort(String(streamId), String(userId));
                }
              } catch (e: any) {
                logger.error('End live stream (backend) failed:', e);
              }

              backendStreamIdRef.current = null;
              streamOwnerIdRef.current = null;

              router.back();
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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        void endStreamSilently();
      }
    });

    return () => {
      try {
        sub.remove();
      } catch {}
      void endStreamSilently();
    };
  }, [endStreamSilently]);

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
    const effectiveLocation = location || manualLocation;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
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
              {effectiveLocation
                ? (manualLocation ? (manualLocationLabel || `${effectiveLocation.latitude.toFixed(4)}, ${effectiveLocation.longitude.toFixed(4)}`) : `${effectiveLocation.latitude.toFixed(4)}, ${effectiveLocation.longitude.toFixed(4)}`)
                : 'Location not detected yet'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.locationActionBtn, styles.locationActionPrimary]}
                onPress={openLocationPicker}
              >
                <Ionicons name="map" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.locationActionTextPrimary}>Open Map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.locationActionBtn, styles.locationActionSecondary]}
                onPress={async () => {
                  try {
                    await getLiveLocation();
                  } catch (e) {
                    logger.error('Retry live location failed:', e);
                  }
                }}
              >
                <Ionicons name="locate" size={16} color="#667eea" style={{ marginRight: 6 }} />
                <Text style={styles.locationActionTextSecondary}>Try Again</Text>
              </TouchableOpacity>
            </View>
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

        <Modal
          visible={showLocationPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowLocationPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Pick Location</Text>
                <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
                  <Ionicons name="close" size={22} color="#000" />
                </TouchableOpacity>
              </View>

              {Platform.OS !== 'web' && MapView ? (
                <MapView
                  style={styles.pickerMap}
                  googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}
                  mapType="standard"
                  initialRegion={{
                    latitude: pickerLocation.latitude,
                    longitude: pickerLocation.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  provider={Platform.OS === 'ios' ? 'google' : undefined}
                  onPress={(e: any) => {
                    const coord = e?.nativeEvent?.coordinate;
                    if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
                      setPickerLocation({ latitude: coord.latitude, longitude: coord.longitude });
                      resolvePickerLabel({ latitude: coord.latitude, longitude: coord.longitude });
                    }
                  }}
                >
                  <Marker
                    coordinate={pickerLocation}
                    draggable
                    onDragEnd={(e: any) => {
                      const coord = e?.nativeEvent?.coordinate;
                      if (coord && typeof coord.latitude === 'number' && typeof coord.longitude === 'number') {
                        setPickerLocation({ latitude: coord.latitude, longitude: coord.longitude });
                        resolvePickerLabel({ latitude: coord.latitude, longitude: coord.longitude });
                      }
                    }}
                    title="Selected"
                  />
                </MapView>
              ) : (
                <View style={[styles.pickerMap, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#666' }}>Map is not available on web preview.</Text>
                </View>
              )}

              <View style={styles.pickerFooter}>
                <Text style={styles.pickerSubtitle} numberOfLines={2}>
                  {isResolvingPickerLabel
                    ? 'Resolving location...'
                    : (pickerLocationLabel || `${pickerLocation.latitude.toFixed(4)}, ${pickerLocation.longitude.toFixed(4)}`)}
                </Text>

                <TouchableOpacity
                  style={styles.pickerConfirmBtn}
                  onPress={() => {
                    setManualLocation({ latitude: pickerLocation.latitude, longitude: pickerLocation.longitude });
                    setManualLocationLabel(pickerLocationLabel || `${pickerLocation.latitude.toFixed(4)}, ${pickerLocation.longitude.toFixed(4)}`);
                    setShowLocationPicker(false);
                  }}
                >
                  <Text style={styles.pickerConfirmText}>Confirm Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
            <Text style={styles.statsText}>📍 Location: {(location || manualLocation) ? 'Enabled' : 'Disabled'}</Text>
          </View>
        )}

        {/* Bottom Controls */}
        <View
          style={[styles.bottomBar, { paddingBottom: 16 + (insets?.bottom || 0) }]}
          pointerEvents={showComments ? 'box-none' : 'auto'}
        >
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
      {showMap && (location || manualLocation) && (
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
                latitude: (location || manualLocation)!.latitude,
                longitude: (location || manualLocation)!.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              provider={Platform.OS === 'ios' ? 'google' : undefined}
            >
              <Marker coordinate={(location || manualLocation)!} title="You are here" />
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
  locationActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  locationActionPrimary: { backgroundColor: '#667eea' },
  locationActionSecondary: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe' },
  locationActionTextPrimary: { color: '#fff', fontWeight: '700', fontSize: 13 },
  locationActionTextSecondary: { color: '#667eea', fontWeight: '700', fontSize: 13 },
  setupInfo: { fontSize: 14, color: '#666', marginTop: 4 },
  startButton: { backgroundColor: '#667eea', margin: 16, padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', maxHeight: '85%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  pickerMap: { width: '100%', height: 320, backgroundColor: '#f2f2f2' },
  pickerFooter: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eee' },
  pickerSubtitle: { fontSize: 13, color: '#444', marginBottom: 10 },
  pickerConfirmBtn: { backgroundColor: '#667eea', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  pickerConfirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, elevation: 50, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: 'transparent' },
  controlButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
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

