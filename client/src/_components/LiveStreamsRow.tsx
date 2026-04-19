import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// Firestore imports removed
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { apiService } from '../_services/apiService';



interface LiveStream {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  channelName: string;
  roomId?: string;
  title?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt: any;
}

interface LiveStreamsRowProps {
  mirror?: boolean;
}

function LiveStreamsRowComponent({ mirror = false }: LiveStreamsRowProps) {
  const router = useRouter();
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);

  // OPTIMIZATION: One-time fetch instead of real-time listener (saves Firebase reads)
  useEffect(() => {
    const fetchLiveStreams = async () => {
      try {
        console.log('[LiveStreams] Fetching live streams...');
        let res = await apiService.get('/live-streams');
        console.log('[LiveStreams] Response:', res);

        // Defensive: handle all possible response shapes
        let streams: any[] = [];
        if (res && typeof res === 'object') {
          streams = res.streams || res.data || [];
        }
        if (!Array.isArray(streams)) streams = [];

        // Sort by viewer count (safe)
        if (streams.length > 0) {
          streams.sort((a: any, b: any) => (b?.viewerCount || 0) - (a?.viewerCount || 0));
        }
        setLiveStreams(streams);
        console.log('[LiveStreams] Set', streams.length, 'streams');
      } catch (error: any) {
        console.warn('[LiveStreams] Failed to fetch (backend may be sleeping):', error.message);
        // Silently fail - don't show error to user, just hide the section
        setLiveStreams([]);
      }
    };

    fetchLiveStreams();

    // Refresh every 60 seconds (reduced frequency to avoid spam during cold start)
    const interval = setInterval(fetchLiveStreams, 60000);
    return () => clearInterval(interval);
  }, []);

  if (liveStreams.length === 0) {
    return null;
  }

  const handleStreamPress = (stream: LiveStream) => {
    const resolvedRoomId = (stream as any)?.roomId || stream.channelName || stream.id;
    router.push({
      pathname: '/watch-live',
      params: {
        streamId: stream.id,
        roomId: resolvedRoomId,
        channelName: resolvedRoomId,
        title: (stream as any)?.title || 'Live Stream',
        hostName: stream.userName,
        hostAvatar: stream.userAvatar
      }
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, mirror && { flexDirection: 'row-reverse' }]}>
        <View style={{ flexDirection: mirror ? 'row-reverse' : 'row', alignItems: 'center' }}>
          <View style={[styles.liveDot, mirror ? { marginRight: 0, marginLeft: 8 } : null]} />
          <Text style={styles.title}>Live Now</Text>
        </View>
        <Text style={styles.count}>{liveStreams.length} streaming</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, mirror && { flexDirection: 'row-reverse' }]}
      >
        {liveStreams.map((stream) => (
          <TouchableOpacity
            key={stream.id}
            style={[styles.streamCard, mirror ? { marginRight: 0, marginLeft: 16 } : null]}
            onPress={() => handleStreamPress(stream)}
            activeOpacity={0.8}
          >
            <View style={styles.avatarContainer}>
              <Image 
                source={{ uri: stream.userAvatar || DEFAULT_AVATAR_URL }} 
                style={styles.avatar}
              />
              <View style={styles.liveRing} />
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            
            <Text style={styles.userName} numberOfLines={1}>
              {stream.userName}
            </Text>
            
            <View style={styles.viewerInfo}>
              <Ionicons name="eye" size={12} color="#666" />
              <Text style={styles.viewerCount}>
                {stream.viewerCount || 0}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default React.memo(LiveStreamsRowComponent, (prevProps, nextProps) => {
  return prevProps.mirror === nextProps.mirror;
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff0000',
    marginRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  count: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  streamCard: {
    alignItems: 'center',
    marginRight: 16,
    width: 80,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f0f0',
  },
  liveRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  liveBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ff0000',
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 4,
    width: '100%',
  },
  viewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewerCount: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});

