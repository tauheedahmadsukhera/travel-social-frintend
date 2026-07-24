import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { getOptimizedImageUrl } from '../../../lib/imageHelpers';
import { DEFAULT_AVATAR_URL } from '../../../lib/api';

const IMAGE_PLACEHOLDER = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

let Marker: any = null;
if (Platform.OS !== 'web') {
  const RNMaps = require('react-native-maps');
  Marker = RNMaps.Marker;
}

interface PostType {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  imageUrls?: string[];
  caption?: string;
  location?: { lat: number; lon: number; name?: string } | string;
  lat: number;
  lon: number;
  likes?: number;
  likesCount?: number;
  comments?: number;
  commentsCount?: number;
  createdAt: any;
  isLive?: boolean;
}

interface LiveStream {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  channelName?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt: any;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export const PostMarker = React.memo(({ post, postsAtLocation, onSelect }: { 
  post: PostType; 
  postsAtLocation: PostType[];
  onSelect: (posts: PostType[] | null) => void;
}) => {
  const [tracks, setTracks] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTracks(false), 20000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (imgLoaded && avatarLoaded) setTracks(false);
  }, [imgLoaded, avatarLoaded]);

  const imageUrl = post.imageUrl || DEFAULT_AVATAR_URL;
  const avatarUrl = post.userAvatar || DEFAULT_AVATAR_URL;

  const markerImageUrl = getOptimizedImageUrl(imageUrl, 'map-marker');
  const markerAvatarUrl = getOptimizedImageUrl(avatarUrl, 'thumbnail');

  if (!Marker) return null;

  return (
    <Marker
      coordinate={{ latitude: Number(post.lat), longitude: Number(post.lon) }}
      tracksViewChanges={tracks}
      onPress={() => onSelect(postsAtLocation)}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.markerContainer}>
        <View style={styles.postImageWrapper}>
          <ExpoImage
            source={{ uri: markerImageUrl }}
            style={styles.postImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={IMAGE_PLACEHOLDER}
            transition={150}
            onLoadEnd={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />
        </View>
        <View style={styles.postAvatarOutside}>
          <ExpoImage
            source={{ uri: markerAvatarUrl }}
            style={styles.postAvatarImgFixed}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={IMAGE_PLACEHOLDER}
            transition={120}
            onLoadEnd={() => setAvatarLoaded(true)}
            onError={() => setAvatarLoaded(true)}
          />
        </View>
      </View>
    </Marker>
  );
});

export const LiveStreamMarker = React.memo(({ stream }: { stream: LiveStream }) => {
  return null;
});

const styles = StyleSheet.create({
  markerContainer: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postImageWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#ffa726',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  postAvatarOutside: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 5,
  },
  postAvatarImgFixed: {
    width: '100%',
    height: '100%',
  },
  liveMarkerContainer: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveAvatarOutside: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: '#FF3B30',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  liveAvatarNew: {
    width: '100%',
    height: '100%',
  },
  liveBadgeNew: {
    position: 'absolute',
    top: -4,
    zIndex: 10,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
});
