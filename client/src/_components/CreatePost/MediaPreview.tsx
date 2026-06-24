import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Image as RNImage } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';

const { width: windowWidth } = Dimensions.get('window');

interface MediaPreviewProps {
  uris: string[];
  thumbnails: Record<string, string>;
  isVideo: (uri: string) => boolean;
  height: number;
  onRemove?: (index: number) => void;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({ uris, thumbnails, isVideo, height, onRemove }) => {
  const [resolvedUris, setResolvedUris] = useState<string[]>(uris);
  const [localThumbnails, setLocalThumbnails] = useState<Record<string, string>>({});
  const [detectedVideoUris, setDetectedVideoUris] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setResolvedUris(uris);
    let active = true;
    async function resolveAll() {
      const isVideoMap: Record<string, boolean> = {};
      const resolved = await Promise.all(
        uris.map(async (uri) => {
          if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
            try {
              const assetId = uri.startsWith('ph://')
                ? uri.replace('ph://', '').split('/')[0]
                : uri;
              const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, { copyToLocalContainer: true });
              if (assetInfo) {
                const isVid = (assetInfo.mediaType as string) === 'video' || (assetInfo.mediaType as any) === MediaLibrary.MediaType.video;
                isVideoMap[uri] = isVid;
                isVideoMap[assetInfo.localUri || assetInfo.uri || uri] = isVid;
                return assetInfo?.localUri || assetInfo?.uri || uri;
              }
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
        setDetectedVideoUris(prev => ({ ...prev, ...isVideoMap }));
        
        // Generate thumbnails for resolved video URIs
        resolved.forEach(async (uri, idx) => {
          const rawUri = uris[idx];
          const isVid = isVideoMap[rawUri] || isVideoMap[uri] || isVideo(rawUri) || isVideo(uri);
          if (isVid && !(uri.startsWith('ph://') || uri.startsWith('assets-library://'))) {
            if (thumbnails[rawUri] || localThumbnails[rawUri] || localThumbnails[uri]) {
              return;
            }
            try {
              const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
                time: 1000,
              });
              if (active && thumbUri) {
                setLocalThumbnails(prev => ({
                  ...prev,
                  [rawUri]: thumbUri,
                  [uri]: thumbUri
                }));
              }
            } catch (e) {
              console.warn('[MediaPreview] Failed to generate video thumbnail:', e);
            }
          }
        });
      }
    }
    resolveAll();
    return () => {
      active = false;
    };
  }, [uris, thumbnails]);

  if (uris.length === 0) return null;

  return (
    <View style={{ height, width: windowWidth, backgroundColor: '#f0f0f0' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {resolvedUris.map((uri, index) => {
          const rawUri = uris[index];
          const isNotResolved = uri.startsWith('ph://') || uri.startsWith('assets-library://');
          const posterUri = localThumbnails[rawUri] || localThumbnails[uri] || thumbnails[rawUri];
          const isVid = detectedVideoUris[rawUri] || detectedVideoUris[uri] || isVideo(rawUri) || isVideo(uri);

          return (
            <View key={`${rawUri}-${index}`} style={{ width: windowWidth, height }}>
              {isNotResolved ? (
                <View style={{ flex: 1 }}>
                  <RNImage source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  {isVid && (
                    <View style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0,0,0,0.5)',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Feather name="play" size={24} color="#fff" />
                    </View>
                  )}
                </View>
              ) : isVid ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                  <Video
                    source={{ uri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={true}
                    isMuted={true}
                    isLooping={true}
                    useNativeControls={false}
                    usePoster={true}
                    posterSource={posterUri ? { uri: posterUri } : undefined}
                    posterStyle={{ resizeMode: 'cover' }}
                  />
                </View>
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
