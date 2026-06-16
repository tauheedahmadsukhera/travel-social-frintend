import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';

const { width: windowWidth } = Dimensions.get('window');

interface MediaPreviewProps {
  uris: string[];
  thumbnails: Record<string, string>;
  isVideo: (uri: string) => boolean;
  height: number;
  onRemove?: (index: number) => void;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ uris, thumbnails, isVideo, height, onRemove }) => {
  const [resolvedUris, setResolvedUris] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    async function resolveAll() {
      const resolved = await Promise.all(
        uris.map(async (uri) => {
          if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
            try {
              const assetId = uri.startsWith('ph://')
                ? uri.replace('ph://', '').split('/')[0]
                : uri;
              const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
              return assetInfo?.localUri || assetInfo?.uri || uri;
            } catch (e) {
              console.warn('[MediaPreview] Failed to resolve iOS asset:', e);
              return uri;
            }
          }
          return uri;
        })
      );
      if (active) {
        setResolvedUris(resolved);
      }
    }
    resolveAll();
    return () => {
      active = false;
    };
  }, [uris]);

  if (uris.length === 0) return null;

  return (
    <View style={{ height, width: windowWidth, backgroundColor: '#f0f0f0' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {resolvedUris.map((uri, index) => {
          const rawUri = uris[index];
          return (
            <View key={`${rawUri}-${index}`} style={{ width: windowWidth, height }}>
              {isVideo(rawUri) ? (
                <Video
                  source={{ uri }}
                  style={{ flex: 1 }}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  isLooping
                  shouldPlay={true}
                  isMuted={true}
                  posterSource={thumbnails[rawUri] ? { uri: thumbnails[rawUri] } : undefined}
                  usePoster={!!thumbnails[rawUri]}
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
          );
        })}
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
