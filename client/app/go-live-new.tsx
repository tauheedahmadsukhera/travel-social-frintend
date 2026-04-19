import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateRoomId } from '../config/zeegocloud';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ZeegocloudLiveHost from '@/src/_components/ZeegocloudLiveHost';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


const { width, height } = Dimensions.get('window');

const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

export default function GoLive() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [streamTitle, setStreamTitle] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState(DEFAULT_AVATAR);

  // UI Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isUsingFrontCamera, setIsUsingFrontCamera] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([
    { id: '1', user: 'Emma', text: 'Love this place!', avatar: 'https://i.pravatar.cc/150?u=1' },
    { id: '2', user: 'Alex', text: 'Wish I was there 😍', avatar: 'https://i.pravatar.cc/150?u=2' },
    { id: '3', user: 'Sarah', text: 'Where exactly is this?', avatar: 'https://i.pravatar.cc/150?u=3' },
  ]);

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        const storedUserName = await AsyncStorage.getItem('userName') || 'Anonymous';
        const storedAvatar = await AsyncStorage.getItem('userAvatar') || DEFAULT_AVATAR;

        if (storedUserId) {
          setUserId(storedUserId);
          setUserName(storedUserName);
          setUserAvatar(storedAvatar);
        }
      } catch (e) { }
    };
    loadUserInfo();
  }, []);

  const handleStartStream = async () => {
    if (!streamTitle.trim()) {
      Alert.alert('Error', 'Please enter a stream title');
      return;
    }

    try {
      setIsInitializing(true);
      if (!userId) {
        Alert.alert('Error', 'Please login first');
        safeRouterBack();
        return;
      }

      const newRoomId = generateRoomId(userId);
      setRoomId(newRoomId);
      setIsStreaming(true);

      console.log('🎬 Starting stream:', { roomId: newRoomId, userId });
    } catch (error) {
      console.error('❌ Start stream error:', error);
      Alert.alert('Error', 'Failed to start stream');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleEndStream = () => {
    Alert.alert(
      'End Live Video?',
      'You can end your live video now.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Now',
          style: 'destructive',
          onPress: () => {
            setIsStreaming(false);
            setRoomId('');
            safeRouterBack();
          },
        },
      ]
    );
  };

  const handleSendComment = () => {
    if (!comment.trim()) return;
    const newMsg = {
      id: Date.now().toString(),
      user: userName,
      text: comment.trim(),
      avatar: userAvatar
    };
    setComments(prev => [...prev.slice(-10), newMsg]);
    setComment('');
  };

  if (isStreaming && roomId) {
    return (
      <View style={styles.liveContainer}>
        <ZeegocloudLiveHost
          roomID={roomId}
          userID={userId}
          userName={userName}
          onLeave={() => setIsStreaming(false)}
          isCameraOn={isCameraOn}
          isMuted={isMuted}
          isUsingFrontCamera={isUsingFrontCamera}
        />

        {/* Top Header UI */}
        <View style={[styles.liveHeader, { top: insets.top + 10 }]}>
          <View style={styles.userPill}>
            <Image source={{ uri: userAvatar }} style={styles.miniAvatar} />
            <Text style={styles.userNameText} numberOfLines={1}>{userName}</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.viewerPill}>
            <Ionicons name="eye-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.viewerText}>234</Text>
          </View>

          <TouchableOpacity onPress={handleEndStream} style={styles.endButton}>
            <Text style={styles.endButtonText}>End</Text>
          </TouchableOpacity>
        </View>

        {/* Floating Map Window */}
        {showMap && (
          <View style={styles.mapWindow}>
            <Image
              source={{ uri: 'https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-0.1278,51.5074,12,0/300x200@2x?access_token=pk.placeholder' }}
              style={styles.mapInner}
            />
            <TouchableOpacity onPress={() => setShowMap(false)} style={styles.closeMap}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Comments Overlay */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <View style={styles.commentsList}>
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Image source={{ uri: item.avatar }} style={styles.commentAvatar} />
                  <View style={styles.commentContent}>
                    <Text style={styles.commentUser}>{item.user}</Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                  </View>
                </View>
              )}
            />
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder="Say something..."
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={comment}
                onChangeText={setComment}
                onSubmitEditing={handleSendComment}
              />
              <TouchableOpacity onPress={handleSendComment}>
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={() => setIsCameraOn(!isCameraOn)} style={styles.iconBtn}>
                <Ionicons name={isCameraOn ? "videocam" : "videocam-off"} size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMap(!showMap)} style={[styles.iconBtn, showMap && styles.activeIcon]}>
                <Ionicons name="map" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.iconBtn}>
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsUsingFrontCamera(!isUsingFrontCamera)} style={styles.iconBtn}>
                <Ionicons name="camera-reverse" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.setupHeader}>
        <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backBtn}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.setupTitle}>Live Video</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.setupContent}>
        <View style={styles.previewCard}>
          <Image source={{ uri: userAvatar }} style={styles.setupAvatar} />
          <View style={styles.liveIndicator}>
            <Text style={styles.liveIndicatorText}>PREVIEW</Text>
          </View>
        </View>

        <TextInput
          style={styles.titleInput}
          placeholder="Add a title..."
          placeholderTextColor="#666"
          value={streamTitle}
          onChangeText={setStreamTitle}
          maxLength={60}
        />

        <TouchableOpacity
          style={[styles.goLiveBtn, isInitializing && styles.disabledBtn]}
          onPress={handleStartStream}
          disabled={isInitializing}
        >
          {isInitializing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.goLiveBtnText}>Go Live</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  liveContainer: {
    flex: 1,
    backgroundColor: '#222',
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backBtn: {
    padding: 5,
  },
  setupTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  setupContent: {
    flex: 1,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    width: width * 0.7,
    aspectRatio: 3 / 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 25,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#333',
  },
  setupAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  liveIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  liveIndicatorText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  titleInput: {
    width: '100%',
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 40,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  goLiveBtn: {
    width: '100%',
    height: 60,
    backgroundColor: '#FF385C',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.6,
  },
  goLiveBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  liveHeader: {
    position: 'absolute',
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
    borderRadius: 25,
    maxWidth: width * 0.4,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  userNameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
    flexShrink: 1,
  },
  liveBadge: {
    backgroundColor: '#FF385C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 10,
  },
  viewerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  endButton: {
    marginLeft: 'auto',
    backgroundColor: '#FF385C',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  commentsList: {
    height: 200,
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  commentContent: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    flexShrink: 1,
  },
  commentUser: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  commentText: {
    color: '#eee',
    fontSize: 14,
  },
  bottomControls: {
    paddingHorizontal: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 15,
  },
  chatInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    marginRight: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIcon: {
    backgroundColor: '#FF385C',
  },
  mapWindow: {
    position: 'absolute',
    top: 120,
    right: 15,
    width: 200,
    height: 140,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 5,
  },
  mapInner: {
    flex: 1,
    backgroundColor: '#111',
  },
  closeMap: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
});

