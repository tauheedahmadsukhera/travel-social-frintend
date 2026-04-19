import { safeRouterBack } from '@/lib/safeRouterBack';
/**
 * Watch Live Screen - Simplified with ZeegoCloud UIKit
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ZeegocloudLiveViewer from '@/src/_components/ZeegocloudLiveViewer';

export default function WatchLive() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');

  useEffect(() => {
    initializeViewer();
  }, []);

  const initializeViewer = async () => {
    try {
      // Get user info
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedUserName = await AsyncStorage.getItem('userName') || 'Anonymous';
      
      if (!storedUserId) {
        Alert.alert('Error', 'Please login first');
        safeRouterBack();
        return;
      }

      // Get room ID from params
      const liveRoomId = params.roomId as string;
      
      if (!liveRoomId) {
        Alert.alert('Error', 'Invalid live stream');
        safeRouterBack();
        return;
      }

      setUserId(storedUserId);
      setUserName(storedUserName);
      setRoomId(liveRoomId);
      
      console.log('👁️ Joining stream:', { roomId: liveRoomId, userId: storedUserId });
    } catch (error) {
      console.error('❌ Initialize viewer error:', error);
      Alert.alert('Error', 'Failed to join stream');
      safeRouterBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeave = () => {
    safeRouterBack();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF385C" />
          <Text style={styles.loadingText}>Joining live stream...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!roomId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color="#FF385C" />
          <Text style={styles.errorText}>Stream not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => safeRouterBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ZeegocloudLiveViewer
      roomID={roomId}
      userID={userId}
      userName={userName}
      onLeave={handleLeave}
    />
  );
}

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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#FF385C',
    borderRadius: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

