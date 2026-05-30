import React from 'react';
import { View, Image, Dimensions, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Feather } from '@expo/vector-icons';

const { width: windowWidth } = Dimensions.get('window');

interface MediaPreviewProps {
  uris: string[];
  thumbnails: Record<string, string>;
  isVideo: (uri: string) => boolean;
  height: number;
  onRemove?: (index: number) => void;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ uris, thumbnails, isVideo, height, onRemove }) => {
  if (uris.length === 0) return null;

  return (
    <View style={{ height, width: windowWidth, backgroundColor: '#f0f0f0' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {uris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={{ width: windowWidth, height }}>
            {isVideo(uri) ? (
              <Video
                source={{ uri }}
                style={{ flex: 1 }}
                useNativeControls
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={true}
                isMuted={true}
                posterSource={thumbnails[uri] ? { uri: thumbnails[uri] } : undefined}
                usePoster={!!thumbnails[uri]}
              />
            ) : (
              <Image
                source={{ uri }}
                style={{ flex: 1 }}
                resizeMode="cover"
              />
            )}
            
            {onRemove && uris.length > 1 && (
              <TouchableOpacity 
                style={styles.removeButton}
                onPress={() => onRemove(index)}
              >
                <Feather name="trash-2" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  removeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  }
});

export default MediaPreview;
