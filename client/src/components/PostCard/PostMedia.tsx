import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, FlatList, TouchableOpacity, Dimensions, NativeSyntheticEvent, NativeScrollEvent, Text, ActivityIndicator, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from '@react-navigation/native';
import { styles } from './PostCard.styles';
import { BACKEND_URL } from '../../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── INSTAGRAM ASPECT RATIO LOGIC ───────────────────────────────────────────
export const getDisplayRatio = (aspectRatio?: number): number => {
  const ratio = aspectRatio || 1;
  return Math.max(0.45, Math.min(ratio, 2.0));
};

export const getMediaHeight = (aspectRatio?: number): number => {
  return SCREEN_WIDTH / getDisplayRatio(aspectRatio);
};
// ────────────────────────────────────────────────────────────────────────────

interface MediaItem {
  url: string;
  type?: 'image' | 'video' | string;
  field?: string;
  aspectRatio?: number;
  thumbnailUrl?: string;
}

const getMediaUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('file:')) {
    if (url.includes('cloudinary.com') && url.includes('/upload/') && !url.includes('/q_')) {
      const isVideo = url.toLowerCase().includes('.mp4') || url.toLowerCase().includes('.mov');
      const transformation = isVideo ? 'q_auto:eco,f_auto,vc_h264/' : 'q_auto:best,f_auto/';
      return url.replace('/upload/', `/upload/${transformation}`);
    }
    return url;
  }
  const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${baseUrl}${path}`;
};

// ─── SUB-COMPONENTS TO HANDLE THEIR OWN HOOKS ───────────────────────────────

interface VideoItemProps {
  url: string;
  containerHeight: number;
  shouldPlay: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  isMuted: boolean;
  toggleMute: () => void;
  videoRef?: React.RefObject<Video>;
  onPress: () => void;
  resizeMode?: ResizeMode;
  onRatioDetected?: (ratio: number) => void;
  thumbnailUrl?: string;
}

const VideoItem: React.FC<VideoItemProps> = ({
  url,
  containerHeight,
  shouldPlay,
  isPlaying,
  setIsPlaying,
  isMuted,
  toggleMute,
  videoRef,
  onPress,
  resizeMode = ResizeMode.CONTAIN,
  onRatioDetected,
  thumbnailUrl
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const mediaUri = getMediaUrl(url);
  const thumbUri = thumbnailUrl ? getMediaUrl(thumbnailUrl) : undefined;
  const [videoUri, setVideoUri] = useState(mediaUri);

  useEffect(() => {
    let active = true;
    const { getCachedVideoUri } = require('@/lib/videoCache');
    getCachedVideoUri(mediaUri).then((resolved: string) => {
      if (active) setVideoUri(resolved);
    });
    return () => { active = false; };
  }, [mediaUri]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => {
        setIsPlaying(!isPlaying);
        onPress();
      }}
      style={{ width: SCREEN_WIDTH, height: containerHeight, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}
    >
      {/* Instant placeholder from cache instead of loader */}
      {!isLoaded && thumbUri && (
        <ExpoImage
          source={{ uri: thumbUri }}
          style={{ position: 'absolute', width: SCREEN_WIDTH, height: containerHeight, zIndex: 1 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
        />
      )}
      {!isLoaded && (
        <ActivityIndicator
          size="small"
          color="#FF8D00"
          style={{ position: 'absolute', zIndex: 2 }}
        />
      )}
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={{ width: SCREEN_WIDTH, height: containerHeight }}
        resizeMode={resizeMode}
        isLooping
        shouldPlay={shouldPlay && isPlaying}
        isMuted={isMuted}
        useNativeControls={false}
        onLoad={() => setIsLoaded(true)}
        onReadyForDisplay={(event: any) => {
          if (onRatioDetected && event.naturalSize && event.naturalSize.height > 0) {
            onRatioDetected(event.naturalSize.width / event.naturalSize.height);
          }
        }}
        onPlaybackStatusUpdate={(status: any) => {
          if (status.isLoaded) {
            if (status.didJustFinish && !status.isLooping) {
              setIsPlaying(false);
            }
          }
        }}
      />

      {/* Central Play Button */}
      {!isPlaying && isLoaded && (
        <View 
          pointerEvents="none"
          style={{ 
            position: 'absolute', 
            top: 0, left: 0, right: 0, bottom: 0, 
            justifyContent: 'center', 
            alignItems: 'center',
            zIndex: 30
          }}
        >
          <View style={{ 
            backgroundColor: 'rgba(0,0,0,0.4)', 
            width: 70, 
            height: 70, 
            borderRadius: 35, 
            justifyContent: 'center', 
            alignItems: 'center',
            paddingLeft: 5 // Offset to look visually centered
          }}>
            <Ionicons name="play" size={40} color="#fff" />
          </View>
        </View>
      )}

      <View style={styles.videoOverlay} pointerEvents="box-none">
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.muteButtonMini}
          onPress={toggleMute}
        >
          <Ionicons
            name={isMuted ? "volume-mute" : "volume-high"}
            size={16}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

interface ImageItemProps {
  url: string;
  containerHeight: number;
  onPress: () => void;
  priority?: "high" | "normal";
  thumbnailUrl?: string;
}

const ImageItem = React.memo<ImageItemProps>(({ url, containerHeight, onPress, priority = "normal", thumbnailUrl }) => {
  const mediaUri = getMediaUrl(url);
  const thumbUri = thumbnailUrl && thumbnailUrl !== url ? getMediaUrl(thumbnailUrl) : undefined;
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={{ width: SCREEN_WIDTH, height: containerHeight, backgroundColor: '#111', margin: 0, padding: 0 }}
    >
      <ExpoImage
        source={{ uri: mediaUri }}
        placeholder={thumbUri ? { uri: thumbUri } : undefined}
        style={{ width: SCREEN_WIDTH, height: containerHeight }}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        transition={0}
      />
    </TouchableOpacity>
  );
});

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

interface PostMediaProps {
  media: MediaItem[];
  mediaHeight?: number;
  activeIndex: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMediaPress: (index: number) => void;
  onDoubleTap?: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  videoRef: React.RefObject<Video>;
  /** Pause off-screen videos so only visible posts buffer/play. */
  isVisible?: boolean;
}

const PostMedia: React.FC<PostMediaProps> = ({
  media,
  mediaHeight,
  onScroll,
  onMediaPress,
  isMuted,
  toggleMute,
  videoRef,
  onDoubleTap,
  isVisible = true,
}) => {
  const isFocused = useIsFocused();
  const [isPlaying, setIsPlaying] = useState(true);
  const [localActiveIndex, setLocalActiveIndex] = useState(0);
  const localActiveIndexRef = useRef(0);
  const [detectedRatio, setDetectedRatio] = useState<number | null>(null);
  
  const lastTap = useRef<number>(0);
  const flatListRef = useRef<FlatList>(null);

  const firstItem = media[0];

  // Auto-pause when screen loses focus or card scrolls off-screen
  useEffect(() => {
    if (!isFocused || !isVisible) setIsPlaying(false);
    else setIsPlaying(true);
  }, [isFocused, isVisible]);

  // Reset detected ratio and scroll flags when the media changes
  useEffect(() => {
    setDetectedRatio(null);
    setLocalActiveIndex(0);
    localActiveIndexRef.current = 0;
  }, [firstItem?.url]);

  const handlePress = useCallback((index: number, isVideo: boolean = false) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (lastTap.current && (now - lastTap.current) < DOUBLE_TAP_DELAY) {
      onDoubleTap?.();
    } else if (!isVideo) {
      onMediaPress(index);
    }
    lastTap.current = now;
  }, [onDoubleTap, onMediaPress]);
  const displayRatio = getDisplayRatio(detectedRatio || firstItem?.aspectRatio);
  const displayHeight = mediaHeight || (SCREEN_WIDTH / displayRatio);

  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => {
    const isVideo = item.type === 'video'
      || item.url?.toLowerCase().includes('.mp4')
      || item.url?.toLowerCase().includes('.mov')
      || item.url?.includes('video/upload');

    const containerHeight = mediaHeight || getMediaHeight(detectedRatio || media[0]?.aspectRatio);
    const normalizedIndex = index % media.length;
    const shouldAutoPlay = isFocused && isVisible && normalizedIndex === localActiveIndex;

    if (isVideo) {
      return (
        <VideoItem
          url={item.url}
          containerHeight={containerHeight}
          shouldPlay={shouldAutoPlay}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          isMuted={isMuted}
          toggleMute={toggleMute}
          videoRef={normalizedIndex === localActiveIndex ? videoRef : undefined}
          onPress={() => handlePress(index, true)}
          resizeMode={ResizeMode.CONTAIN}
          onRatioDetected={setDetectedRatio}
          thumbnailUrl={item.thumbnailUrl}
        />
      );
    }

    return (
      <ImageItem
        url={item.url}
        containerHeight={containerHeight}
        onPress={() => handlePress(index)}
        priority={index === 0 ? "high" : "normal"}
        thumbnailUrl={item.thumbnailUrl}
      />
    );
  }, [media, mediaHeight, isFocused, isVisible, localActiveIndex, isPlaying, isMuted, toggleMute, videoRef, handlePress, detectedRatio]);

  const loopedMedia = useMemo(() => {
    if (media.length <= 1) return media;
    return [...media, ...media, ...media];
  }, [media]);

  const initialContentOffset = useMemo(() => ({
    x: media.length > 1 ? media.length * SCREEN_WIDTH : 0,
    y: 0,
  }), [media.length]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const singleSetWidth = media.length * SCREEN_WIDTH;

    if (singleSetWidth > 0) {
      const rawIndex = Math.round(x / SCREEN_WIDTH);
      const normalizedIndex = ((rawIndex % media.length) + media.length) % media.length;
      if (normalizedIndex !== localActiveIndexRef.current) {
        localActiveIndexRef.current = normalizedIndex;
        setLocalActiveIndex(normalizedIndex);
      }
    }
    onScroll(event);
  }, [media.length, onScroll]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (media.length <= 1) return;
    const x = event.nativeEvent.contentOffset.x;
    const singleSetWidth = media.length * SCREEN_WIDTH;

    if (singleSetWidth > 0) {
      if (x >= singleSetWidth * 2) {
        const targetOffset = x - singleSetWidth;
        flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
      } else if (x <= singleSetWidth / 2 && x > 0) {
        const targetOffset = x + singleSetWidth;
        flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
      }
    }
  }, [media.length]);

  if (media.length === 1) {
    const item = firstItem;
    const isVideo = item.type === 'video'
      || item.url?.toLowerCase().includes('.mp4')
      || item.url?.toLowerCase().includes('.mov')
      || item.url?.includes('video/upload');

    if (isVideo) {
      return (
        <VideoItem
          url={item.url}
          containerHeight={displayHeight}
          shouldPlay={isFocused}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          isMuted={isMuted}
          toggleMute={toggleMute}
          videoRef={videoRef}
          onPress={() => {}}
          resizeMode={ResizeMode.CONTAIN}
          onRatioDetected={setDetectedRatio}
          thumbnailUrl={item.thumbnailUrl}
        />
      );
    }

    return (
      <ImageItem
        url={item.url}
        containerHeight={displayHeight}
        onPress={() => handlePress(0)}
        priority="high"
        thumbnailUrl={item.thumbnailUrl}
      />
    );
  }

  return (
    <View style={{ width: SCREEN_WIDTH, height: displayHeight, overflow: 'hidden' }}>
      <FlatList
        ref={flatListRef}
        data={loopedMedia}
        renderItem={renderItem}
        horizontal
        contentOffset={initialContentOffset}
        pagingEnabled={false}
        decelerationRate={0.985}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        bounces={false}
        overScrollMode="never"
        removeClippedSubviews={false}
        keyExtractor={(item, index) => `${item.url || index}_set_${index}`}
        initialNumToRender={media.length * 3}
        maxToRenderPerBatch={10}
        windowSize={11}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      <View style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        zIndex: 10,
      }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
          {localActiveIndex + 1}/{media.length}
        </Text>
      </View>
    </View>
  );
};

export default React.memo(PostMedia);
