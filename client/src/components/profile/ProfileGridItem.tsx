import React, { useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getVideoThumbnailUrl } from '../../../lib/imageHelpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = SCREEN_WIDTH / 3;

interface ProfileGridItemProps {
  item: any;
  index: number;
  onPress: (item: any, index: number) => void;
  normalizeMediaUrl: (url: string) => string;
  isVideoUrl: (url: string) => boolean;
  DEFAULT_IMAGE_URL: string;
}

const ProfileGridItem = React.memo(({
  item,
  index,
  onPress,
  normalizeMediaUrl,
  isVideoUrl,
  DEFAULT_IMAGE_URL
}: ProfileGridItemProps) => {
  const firstMedia = Array.isArray(item.media) ? item.media[0] : null;
  const firstMediaUrl = firstMedia?.url || firstMedia?.mediaUrl || firstMedia?.imageUrl;
  const firstMediaType = String(firstMedia?.type || firstMedia?.mediaType || '').toLowerCase();
  const primaryMediaUrl = firstMediaUrl || item.mediaUrl || item.imageUrl ||
    (Array.isArray(item.mediaUrls) && item.mediaUrls[0]) ||
    (Array.isArray(item.imageUrls) && item.imageUrls[0]) ||
    '';
  const explicitThumbnailUrl = item.thumbnailUrl || firstMedia?.thumbnailUrl || firstMedia?.thumbnail || '';
  const normalizedPrimaryMediaUrl = normalizeMediaUrl(primaryMediaUrl);
  const isVideo = item.mediaType === 'video' || firstMediaType === 'video' || isVideoUrl(normalizedPrimaryMediaUrl);
  const mediaUrl = explicitThumbnailUrl || (isVideo ? getVideoThumbnailUrl(normalizedPrimaryMediaUrl) : normalizedPrimaryMediaUrl) || '';
  
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (isVideo && !explicitThumbnailUrl && normalizedPrimaryMediaUrl) {
      (async () => {
        try {
          const { getThumbnailAsync } = await import('expo-video-thumbnails');
          const { uri } = await getThumbnailAsync(normalizedPrimaryMediaUrl, { time: 1000 });
          if (isMounted) {
            setLocalThumbnail(uri);
          }
        } catch (e) {
          console.warn('[ProfileGridItem] Failed to generate video thumbnail:', e);
        }
      })();
    }
    return () => {
      isMounted = false;
    };
  }, [isVideo, explicitThumbnailUrl, normalizedPrimaryMediaUrl]);

  const normalizedUrl = normalizeMediaUrl(localThumbnail || mediaUrl) || DEFAULT_IMAGE_URL;

  return (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => onPress(item, index)}
      activeOpacity={0.8}
    >
      <ExpoImage
        source={{ uri: normalizedUrl }}
        style={styles.gridImage}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
      {isVideo && (
        <Ionicons
          name="play-circle-outline"
          size={24}
          color="#fff"
          style={styles.videoIcon}
        />
      )}
      {(Array.isArray(item.media) && item.media.length > 1) ||
       (Array.isArray(item.imageUrls) && item.imageUrls.length > 1) || 
       (Array.isArray(item.mediaUrls) && item.mediaUrls.length > 1) ? (
        <Ionicons
          name="copy-outline"
          size={18}
          color="#fff"
          style={styles.multiIcon}
        />
      ) : null}
    </TouchableOpacity>
  );
});

export default ProfileGridItem;

const styles = StyleSheet.create({
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderWidth: 0.5,
    borderColor: '#fff',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  videoIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  multiIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});
