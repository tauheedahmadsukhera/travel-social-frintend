import React from 'react';
import { View, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from "@expo/vector-icons";
import { styles } from './PostCard.styles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PostMediaProps {
  media: any[];
  mediaHeight: number;
  activeIndex: number;
  onScroll: (event: any) => void;
  onMediaPress: (index: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  videoRef: React.RefObject<any>;
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
  const renderItem = ({ item, index }: { item: any; index: number }) => {
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
          />
          <TouchableOpacity 
            style={styles.muteButton} 
            onPress={toggleMute}
          >
            <Ionicons 
              name={isMuted ? "volume-mute" : "volume-high"} 
              size={20} 
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
    <View style={{ height: mediaHeight }}>
      <FlatList
        data={media}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(item, index) => `${item.url}-${index}`}
      />
    </View>
  );
};

export default React.memo(PostMedia);
