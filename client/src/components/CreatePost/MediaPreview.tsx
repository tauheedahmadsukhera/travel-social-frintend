import React, { useState, useEffect } from 'react';
import { View, Dimensions, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Image as RNImage } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system';

const { width: windowWidth } = Dimensions.get('window');

/**
 * Copies a native video URI (ph://, content://, assets-library://) to the
 * app cache directory so expo-av and expo-video-thumbnails can access it.
 * Returns a file:// URI. Uses a hash of the original URI as filename to
 * avoid redundant copies.
 */
async function copyVideoToCache(nativeUri: string): Promise<string> {
  // Build a short, stable filename from the URI
  const hash = nativeUri.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
  const dest = `${FileSystem.cacheDirectory}vidcache_${hash}.mp4`;

  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;

  // Try FileSystem.copyAsync first – works for content:// on Android
  // and sometimes for ph:// on iOS
  try {
    await FileSystem.copyAsync({ from: nativeUri, to: dest });
    const check = await FileSystem.getInfoAsync(dest);
    if (check.exists) return dest;
  } catch (_) {
    // fall through to MediaLibrary path
  }

  // Fallback: use MediaLibrary to get a localUri, then copy that
  try {
    const assetId = nativeUri.startsWith('ph://')
      ? nativeUri.replace('ph://', '').split('/')[0]
      : nativeUri;
    const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, { copyToLocalContainer: true } as any);
    const localUri = assetInfo?.localUri;
    if (localUri) {
      await FileSystem.copyAsync({ from: localUri, to: dest });
      const check2 = await FileSystem.getInfoAsync(dest);
      if (check2.exists) return dest;
      // Even if copy failed, the localUri itself might be playable
      return localUri;
    }
  } catch (_) {
    // fall through
  }

  // Last resort: return the original URI and hope for the best
  return nativeUri;
}

/** Returns true if the URI is a native asset URI that needs resolution */
function isNativeUri(uri: string): boolean {
  return uri.startsWith('ph://') || uri.startsWith('assets-library://') || uri.startsWith('content://');
}

// ─────────────────────────────────────────────
// AutoplayVideoPreview – plays a short muted loop
// ─────────────────────────────────────────────
const AutoplayVideoPreview: React.FC<{ uri: string; rawUri: string; posterUri?: string }> = ({ uri, rawUri, posterUri }) => {
  const videoRef = React.useRef<Video>(null);
  const [playableUri, setPlayableUri] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // If the URI we received is already a file:// or http(s):// URI, use it directly
      if (!isNativeUri(uri)) {
        if (active) setPlayableUri(uri);
        return;
      }
      // Otherwise copy it to cache
      try {
        const cached = await copyVideoToCache(uri);
        if (active) setPlayableUri(cached);
      } catch {
        if (active) setPlayableUri(uri); // fallback
      }
    })();
    return () => { active = false; };
  }, [uri]);

  useEffect(() => {
    if (isLoaded && videoRef.current) {
      videoRef.current.playAsync().catch(() => {});
    }
  }, [isLoaded, playableUri]);

  return (
    <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
      {/* Placeholder while video loads */}
      {!isLoaded && (
        <View style={StyleSheet.absoluteFillObject}>
          {posterUri ? (
            <ExpoImage source={{ uri: posterUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (rawUri.startsWith('ph://') || rawUri.startsWith('assets-library://')) ? (
            <RNImage source={{ uri: rawUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#FF8D00" />
            </View>
          )}
        </View>
      )}
      {playableUri && (
        <Video
          ref={videoRef}
          source={{ uri: playableUri }}
          style={{ width: '100%', height: '100%', opacity: isLoaded ? 1 : 0 }}
          resizeMode={ResizeMode.COVER}
          useNativeControls={false}
          shouldPlay
          isMuted
          isLooping
          onLoad={() => setIsLoaded(true)}
          onPlaybackStatusUpdate={(status) => {
            if (status.isLoaded && status.positionMillis >= 2000) {
              videoRef.current?.setStatusAsync({ positionMillis: 0, shouldPlay: true }).catch(() => {});
            }
          }}
        />
      )}
    </View>
  );
};

// ─────────────────────────────────────────────
// MediaPreview – scrollable preview of selected media
// ─────────────────────────────────────────────
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
          if (!isNativeUri(uri)) return uri;

          try {
            // First try MediaLibrary to detect media type
            const assetId = uri.startsWith('ph://')
              ? uri.replace('ph://', '').split('/')[0]
              : uri;
            const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId, { copyToLocalContainer: true } as any);
            if (assetInfo) {
              const isVid = (assetInfo.mediaType as string) === 'video' || (assetInfo.mediaType as any) === MediaLibrary.MediaType.video;
              isVideoMap[uri] = isVid;

              if (isVid) {
                // For videos, copy to cache so we have full permissions
                const cached = await copyVideoToCache(uri);
                isVideoMap[cached] = true;
                return cached;
              }

              // For images, localUri is fine
              const localUri = assetInfo.localUri || uri;
              return localUri;
            }
          } catch (e) {
            console.warn('[MediaPreview] Failed to resolve asset:', e);
          }
          return uri;
        })
      );

      if (!active) return;

      setResolvedUris(resolved);
      setDetectedVideoUris(prev => ({ ...prev, ...isVideoMap }));

      // Generate thumbnails for resolved video URIs (now they are file:// so permissions are fine)
      for (let idx = 0; idx < resolved.length; idx++) {
        const resolvedUri = resolved[idx];
        const rawUri = uris[idx];
        const isVid = isVideoMap[rawUri] || isVideoMap[resolvedUri] || isVideo(rawUri) || isVideo(resolvedUri);

        if (!isVid) continue;
        if (thumbnails[rawUri] || localThumbnails[rawUri] || localThumbnails[resolvedUri]) continue;
        if (isNativeUri(resolvedUri)) continue; // still native = skip, can't thumbnail it

        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(resolvedUri, { time: 500 });
          if (active && thumbUri) {
            setLocalThumbnails(prev => ({
              ...prev,
              [rawUri]: thumbUri,
              [resolvedUri]: thumbUri
            }));
          }
        } catch (e) {
          // Thumbnail generation is best-effort; video will still autoplay
          console.warn('[MediaPreview] Thumbnail generation skipped:', e);
        }
      }
    }

    resolveAll();
    return () => { active = false; };
  }, [uris, thumbnails]);

  if (uris.length === 0) return null;

  return (
    <View style={{ height, width: windowWidth, backgroundColor: '#f0f0f0' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
        {resolvedUris.map((uri, index) => {
          const rawUri = uris[index];
          const posterUri = localThumbnails[rawUri] || localThumbnails[uri] || thumbnails[rawUri];
          const isVid = detectedVideoUris[rawUri] || detectedVideoUris[uri] || isVideo(rawUri) || isVideo(uri);

          return (
            <View key={`${rawUri}-${index}`} style={{ width: windowWidth, height }}>
              {isVid ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                  <AutoplayVideoPreview uri={uri} rawUri={rawUri} posterUri={posterUri} />
                </View>
              ) : isNativeUri(uri) ? (
                <View style={{ flex: 1 }}>
                  {Platform.OS === 'ios' ? (
                    <RNImage source={{ uri: rawUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <ExpoImage source={{ uri: rawUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  )}
                </View>
              ) : (
                <ExpoImage source={{ uri }} style={{ flex: 1 }} contentFit="cover" />
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
