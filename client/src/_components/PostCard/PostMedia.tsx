import React from 'react';
import { View, FlatList, TouchableOpacity, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons, Feather } from "@expo/vector-icons";
import { styles } from './PostCard.styles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MediaItem {
  url: string;
  type?: 'image' | 'video' | string;
}

interface PostMediaProps {
  media: MediaItem[];
  mediaHeight: number;
  activeIndex: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMediaPress: (index: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  videoRef: React.RefObject<Video>;
}

const PostMedia: React.FC<PostMediaProps> = ({
  media,
  mediaHeight,
  activeIndex,
  onScroll,
  onMediaPress,
  isMuted,
  toggleMute,
  videoRef,
}) => {
  const renderItem = ({ item, index }: { item: MediaItem; index: number }) => {
    const isVideo = item.type === 'video' || item.url?.includes('.mp4') || item.url?.includes('video/upload');

    if (isVideo) {
      return (
        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => onMediaPress(index)}
          style={[styles.imageWrap, { height: mediaHeight }]}
        >
          <Video
            ref={videoRef}
            source={{ uri: item.url }}
            style={styles.image}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={activeIndex === index}
            isMuted={isMuted}
            useNativeControls={false}
          />
          <TouchableOpacity 
            style={styles.muteButton} 
            onPress={toggleMute}
            activeOpacity={0.7}
          >
            <Feather 
              name={isMuted ? "volume-x" : "volume-2"} 
              size={18} 
              color="#fff" 
            />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity 
        activeOpacity={0.9} 
        onPress={() => onMediaPress(index)}
        style={[styles.imageWrap, { height: mediaHeight }]}
      >
        <ExpoImage
          source={{ uri: item.url }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ height: mediaHeight, backgroundColor: '#f0f0f0' }}>
      <FlatList
        data={media}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item.url || index}-${index}`}
      />
    </View>
  );

};

export default React.memo(PostMedia);
