import React, { useCallback } from 'react';
import { AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Feather, Ionicons } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { apiService } from '@/src/_services/apiService';

type Props = {
  text?: string;
  imageUrl?: string | null;
  mediaType?: 'text' | 'image' | 'video' | 'audio' | 'post' | string;
  mediaUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number;
  createdAt: any;
  editedAt?: any;
  isSelf: boolean;
  formatTime: (ts: any) => string;
  replyTo?: { id: string; text: string; senderId: string } | null;
  username?: string;
  currentUserId?: string;
  compact?: boolean;
  showTail?: boolean;
  sent?: boolean;
  delivered?: boolean;
  read?: boolean;
  sharedPost?: any;
  sharedStory?: any;
  onPressStory?: (story: any) => void;
  onPressPost?: (post: any) => void;
  onPressShare?: () => void;
  onPressImage?: (url: string) => void;
  onLongPress?: () => void;
  activeSoundId?: string | null;
  onPlayStart?: (id: string) => void;
  id: string;
  avatarUrl?: string | null;
  onReaction?: (emoji: string) => void;
  reactions?: { [emoji: string]: string[] };
};

function MessageBubbleInner({
  text,
  imageUrl,
  mediaType,
  mediaUrl,
  audioUrl,
  audioDuration,
  createdAt,
  editedAt,
  isSelf,
  formatTime,
  replyTo,
  username,
  currentUserId,
  compact,
  showTail,
  sent,
  delivered,
  read,
  sharedPost,
  sharedStory,
  onPressPost,
  onPressShare,
  onPressStory,
  onPressImage,
  onLongPress,
  activeSoundId,
  onPlayStart,
  id,
  avatarUrl,
  onReaction,
  reactions,
}: Props) {
  const [playing, setPlaying] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [playbackPosition, setPlaybackPosition] = React.useState(0);
  const [playbackDuration, setPlaybackDuration] = React.useState(0);
  const [resolvedStory, setResolvedStory] = React.useState<any>(sharedStory || null);
  const [storyExpired, setStoryExpired] = React.useState(false);
  const [storyLoading, setStoryLoading] = React.useState(false);
  const displayText = typeof text === 'string'
    ? text.trim().replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, '$1$2')
    : text;
  const inferMediaType = React.useCallback((explicitType: any, mUrl: any, aUrl: any, imgUrl: any, aDuration: any, msgText: any) => {
    const explicit = typeof explicitType === 'string' ? explicitType.trim().toLowerCase() : '';
    if (explicit && explicit !== 'text') return explicit;
    const trimmedText = typeof msgText === 'string' ? msgText.trim() : msgText;
    if (explicit === 'text' && (aUrl || (aDuration && !trimmedText))) return 'audio';
    if (aUrl) return 'audio';
    if (aDuration && !trimmedText) return 'audio';

    const candidate = String(mUrl || imgUrl || '').toLowerCase();
    if (!candidate) return 'text';
    if (candidate.startsWith('data:audio') || /(\.m4a|\.aac|\.mp3|\.wav|\.ogg)(\?|$)/i.test(candidate)) return 'audio';
    if (candidate.startsWith('data:video') || /(\.mp4|\.mov|\.webm)(\?|$)/i.test(candidate)) return 'video';
    if (candidate.startsWith('data:image') || /(\.jpe?g|\.png|\.gif|\.webp)(\?|$)/i.test(candidate)) return 'image';
    return imgUrl ? 'image' : 'text';
  }, []);

  const resolvedMediaUrl = mediaUrl || imageUrl || null;
  const resolvedMediaType = inferMediaType(mediaType, resolvedMediaUrl, audioUrl, imageUrl, audioDuration, text);
  const playbackUrl = audioUrl || (resolvedMediaType === 'audio' ? resolvedMediaUrl : null);
  const isLegacyStoryText = typeof displayText === 'string' && /shared a story:/i.test(displayText);
  const isStoryMetaText = typeof displayText === 'string' && /\b(sent|shared)\b.*\bstory\b/i.test(displayText);
  const initialSharedStoryId = sharedStory?.storyId || sharedStory?.id || sharedStory?._id || '';
  const sharedPostMediaUrls = React.useMemo(() => {
    if (!sharedPost) return [] as string[];

    const candidates = [
      ...(Array.isArray(sharedPost?.mediaUrls) ? sharedPost.mediaUrls : []),
      ...(Array.isArray(sharedPost?.imageUrls) ? sharedPost.imageUrls : []),
      ...(Array.isArray(sharedPost?.images) ? sharedPost.images : []),
      ...(Array.isArray(sharedPost?.media) ? sharedPost.media : []),
      ...(sharedPost?.imageUrl ? [sharedPost.imageUrl] : []),
      ...(sharedPost?.image ? [sharedPost.image] : []),
    ];

    const urls = candidates
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.url || item.uri || item.imageUrl || item.mediaUrl || '';
        }
        return '';
      })
      .filter((url: string) => typeof url === 'string' && !!url.trim());

    return Array.from(new Set(urls));
  }, [sharedPost]);
  const sharedPostMediaCount = React.useMemo(() => {
    if (Number(sharedPost?.mediaCount) > 0) return Number(sharedPost.mediaCount);
    return sharedPostMediaUrls.length;
  }, [sharedPost, sharedPostMediaUrls]);
  const sharedPostPreviewUrl = sharedPostMediaUrls[0] || sharedPost?.imageUrl || sharedPost?.image || null;
  const legacyStoryId = typeof text === 'string'
    ? (text.match(/story[:;]\/\/([A-Za-z0-9_-]+)/i)?.[1] || text.match(/Shared a story:\s*([A-Za-z0-9_-]+)/i)?.[1] || '')
    : '';
  const storyId = resolvedStory?.storyId || resolvedStory?.id || initialSharedStoryId || legacyStoryId || '';

  React.useEffect(() => {
    setResolvedStory(sharedStory || null);
    setStoryExpired(false);
  }, [sharedStory]);

  React.useEffect(() => {
    let cancelled = false;

    // Always try to fetch full story data when we have a storyId
    const needsLookup = resolvedMediaType === 'story' && storyId && !storyExpired;
    if (!needsLookup) return () => { cancelled = true; };

    // Skip if we already have full story data with a media URL
    const hasFullData = resolvedStory?.mediaUrl || resolvedStory?.imageUrl || resolvedStory?.image || resolvedStory?.videoUrl || resolvedStory?.video;
    if (hasFullData) return () => { cancelled = true; };

    setStoryLoading(true);
    (async () => {
      try {
        const res = await apiService.get(`/stories/${storyId}`);
        if (cancelled) return;

        if (res?.expired) {
          // Story has expired or been deleted
          setStoryExpired(true);
          // Keep partial data for the expired card (userName, userAvatar)
          if (res?.data) setResolvedStory(res.data);
        } else if (res?.success && res?.data) {
          setResolvedStory(res.data);
          setStoryExpired(false);
        } else if (!res?.success) {
          setStoryExpired(true);
        }
      } catch {
        if (!cancelled) {
          setStoryExpired(true);
        }
      } finally {
        if (!cancelled) setStoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedMediaType, storyId, storyExpired]);

  const formatDuration = (seconds?: number) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const [sound, setSound] = React.useState<Audio.Sound | null>(null);
  const [audioUnavailable, setAudioUnavailable] = React.useState(false);
  const appStateRef = React.useRef(AppState.currentState);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  const isLikelyLocalFileUri = React.useCallback((uri: string) => {
    return uri.startsWith('file://')
      || uri.startsWith('/var/')
      || uri.startsWith('/private/')
      || uri.startsWith('/data/')
      || uri.startsWith('/storage/');
  }, []);

  const normalizeLocalUri = React.useCallback((uri: string) => {
    if (uri.startsWith('file://')) return uri;
    if (uri.startsWith('/')) return `file://${uri}`;
    return uri;
  }, []);

  const resolvePlayableAudioUri = React.useCallback(async (uri: string) => {
    const trimmed = uri.trim();
    if (!trimmed) return null;
    
    // If it's a network URL, just return it
    if (trimmed.startsWith('http')) return trimmed;
    
    if (!isLikelyLocalFileUri(trimmed)) return trimmed;

    const localUri = normalizeLocalUri(trimmed);
    try {
      const info = await FileSystem.getInfoAsync(localUri);
      return info.exists ? localUri : null;
    } catch {
      return null;
    }
  }, [isLikelyLocalFileUri, normalizeLocalUri]);
  
  React.useEffect(() => {
    if (activeSoundId && activeSoundId !== id && sound && playing) {
      sound.pauseAsync().then(() => setPlaying(false)).catch(() => {});
    }
  }, [activeSoundId, id, sound, playing]);

  React.useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  React.useEffect(() => {
    setAudioUnavailable(false);
  }, [playbackUrl]);

  // Pre-load and Pre-fetch audio/images
  React.useEffect(() => {
    if (resolvedMediaType === 'audio' && playbackUrl) {
      (async () => {
        try {
          const playableUri = await resolvePlayableAudioUri(playbackUrl);
          if (!playableUri) return;

          const fileName = playableUri.split('/').pop();
          const localCacheUri = `${FileSystem.cacheDirectory}${fileName}`;
          
          // Pre-fetch: Download if not in cache
          if (playableUri.startsWith('http')) {
            const fileInfo = await FileSystem.getInfoAsync(localCacheUri);
            if (!fileInfo.exists) {
              await FileSystem.downloadAsync(playableUri, localCacheUri).catch(() => {});
            }
          }
          
          // Pre-load sound object if not already loaded
          if (!sound) {
            const finalUri = playableUri.startsWith('http') ? localCacheUri : playableUri;
            const { sound: newSound } = await Audio.Sound.createAsync(
              { uri: finalUri },
              { shouldPlay: false, isLooping: false },
              (status: any) => {
                if (status.isLoaded) {
                  setPlaybackPosition(status.positionMillis / 1000);
                  if (typeof status.durationMillis === 'number' && status.durationMillis > 0) {
                    setPlaybackDuration(status.durationMillis / 1000);
                  }
                  if (status.didJustFinish) {
                    setPlaying(false);
                    newSound.stopAsync();
                    newSound.setPositionAsync(0);
                  }
                }
              }
            );
            setSound(newSound);
            setIsLoaded(true);
          }
        } catch (e) {
          console.log('Background pre-fetch error:', e);
        }
      })();
    }
  }, [resolvedMediaType, playbackUrl]);

  // Handle Playback mode switching
  const setupAudioMode = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });
    } catch (e) {}
  };

  // Debounce play button to prevent rapid tapping from creating multiple sounds
  const isPlayingActionRef = React.useRef(false);

  const handlePlayAudio = async () => {
    if (!playbackUrl) return;
    if (appStateRef.current !== 'active') return;
    if (isPlayingActionRef.current) return; // Prevent rapid double-taps
    isPlayingActionRef.current = true;
    
    try {
      await setupAudioMode();

      if (sound) {
        if (playing) {
          await sound.pauseAsync();
          setPlaying(false);
        } else {
          try {
            onPlayStart?.(id);
            await sound.playAsync();
            setPlaying(true);
          } catch (internalErr: any) {
            const internalMsg = String(internalErr || '');
            if (internalMsg.includes('AudioFocusNotAcquiredException') || internalMsg.includes('audio focus')) {
              // Retry once after a short delay
              setTimeout(async () => {
                try {
                  if (appStateRef.current !== 'active') return;
                  await setupAudioMode();
                  await sound.playAsync();
                  setPlaying(true);
                } catch {}
              }, 500);
            } else {
              console.error('Playback error:', internalErr);
              setSound(null);
            }
          }
        }
        isPlayingActionRef.current = false;
        return;
      }
      
      // Fallback if not pre-loaded or corrupted
      const playableUri = await resolvePlayableAudioUri(playbackUrl);
      if (!playableUri) {
        setAudioUnavailable(true);
        isPlayingActionRef.current = false;
        return;
      }

      onPlayStart?.(id);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: playableUri },
        { shouldPlay: true, isLooping: false },
        (status: any) => {
          if (status.isLoaded) {
            setPlaybackPosition(status.positionMillis / 1000);
            if (typeof status.durationMillis === 'number' && status.durationMillis > 0) {
              setPlaybackDuration(status.durationMillis / 1000);
            }
            if (status.didJustFinish) {
              setPlaying(false);
              newSound.stopAsync().catch(() => {});
              newSound.setPositionAsync(0).catch(() => {});
            }
          }
        }
      );
      setSound(newSound);
      setIsLoaded(true);
      setPlaying(true);
      setAudioUnavailable(false);
    } catch (e: any) {
      console.error('Audio playback exception:', e);
      setAudioUnavailable(true);
    } finally {
      // Release debounce after a short delay
      setTimeout(() => { isPlayingActionRef.current = false; }, 300);
    }
  };

  const lastPressRef = React.useRef(0);

  const handlePress = () => {
    const now = Date.now();
    if (now - lastPressRef.current < 300) {
      if (onReaction) onReaction('❤️');
      lastPressRef.current = 0;
    } else {
      lastPressRef.current = now;
    }
  };

  return (
    <View style={[styles.container, isSelf ? styles.containerSelf : styles.containerOther]}>
      {!isSelf && (
        <ExpoImage
          source={{ uri: avatarUrl || DEFAULT_AVATAR_URL }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      )}
      
      <View style={[styles.bubbleWrapper, isSelf ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
        <View style={{ flexDirection: isSelf ? 'row-reverse' : 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            activeOpacity={1}
            onPress={handlePress}
            onLongPress={onLongPress}
            delayLongPress={200}
            style={[
              styles.msgBubble,
              isSelf ? styles.msgBubbleRight : styles.msgBubbleLeft,
              compact && styles.msgBubbleCompact,
              (resolvedMediaType === 'post' || resolvedMediaType === 'story') && {
                paddingHorizontal: 0,
                paddingVertical: 0,
                overflow: 'hidden',
                backgroundColor: 'transparent',
              }
            ]}
          >
            {resolvedMediaType === 'image' && resolvedMediaUrl && (
              <TouchableOpacity onPress={() => onPressImage?.(resolvedMediaUrl)}>
                <Image source={{ uri: resolvedMediaUrl }} style={styles.msgImage} />
              </TouchableOpacity>
            )}
            
            {resolvedMediaType === 'video' && resolvedMediaUrl && (
              <View style={styles.videoStub}>
                <Ionicons name="play" color="white" size={40} style={styles.centerPlay} />
                <View style={styles.bottomPlayCircle}>
                  <Ionicons name="play" color="white" size={14} />
                </View>
              </View>
            )}
  
            {resolvedMediaType === 'audio' && (audioUrl || resolvedMediaUrl || audioDuration) && (
              <TouchableOpacity
                style={[styles.premiumAudioContainer, audioUnavailable && styles.audioUnavailableContainer]}
                onPress={handlePlayAudio}
                disabled={!playbackUrl}
                activeOpacity={!playbackUrl ? 1 : 0.8}
              >
                <View style={[styles.audioPlayCircle, isSelf && styles.audioPlayCircleSelf]}>
                  <Ionicons
                    name={audioUnavailable ? 'alert-circle' : (playbackUrl ? (playing ? 'pause' : 'play') : 'mic')}
                    size={18}
                    color={isSelf ? '#fff' : '#111'}
                  />
                </View>

                <View style={styles.audioBody}>
                  <View style={[styles.waveformContainer, { overflow: 'hidden' }]}>
                    {(() => {
                      const barCount = 34;
                      const progress = playbackDuration > 0 ? playbackPosition / playbackDuration : 0;
                      const filledCount = Math.floor(progress * barCount);

                      return [...Array(barCount)].map((_, i) => {
                        const height = 5 + Math.abs(Math.sin(i * 1.15) * 10);
                        const isFilled = i < filledCount && playing;

                        return (
                          <View
                            key={i}
                            style={[
                              styles.waveBar,
                              { height },
                              {
                                backgroundColor: isSelf
                                  ? (isFilled ? '#ffffff' : 'rgba(255,255,255,0.45)')
                                  : (isFilled ? '#111111' : 'rgba(0,0,0,0.14)')
                              }
                            ]}
                          />
                        );
                      });
                    })()}
                  </View>

                  <View style={styles.audioMetaRow}>
                    <Text style={[styles.audioTimeText, isSelf && { color: 'rgba(255,255,255,0.85)' }]}>
                      {audioUnavailable ? 'Unavailable' : (!playbackUrl ? 'Voice message' : formatDuration(playbackPosition))}
                    </Text>
                    <Text style={[styles.audioTimeText, isSelf && { color: 'rgba(255,255,255,0.85)' }]}>
                      {audioUnavailable ? '--:--' : formatDuration(audioDuration || playbackDuration)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
  
            {resolvedMediaType === 'post' && sharedPost && (
              <TouchableOpacity 
                activeOpacity={0.9} 
                onPress={() => onPressPost?.(sharedPost)}
                style={styles.premiumPostContainer}
              >
                <View style={styles.sharedPostAuthor}>
                  <ExpoImage 
                    source={{ uri: sharedPost.userThumbnailUrl || sharedPost.userAvatar || DEFAULT_AVATAR_URL }} 
                    style={styles.sharedPostAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <Text style={styles.sharedPostAuthorName} numberOfLines={1}>{sharedPost.userName || sharedPost.username || 'User'}</Text>
                </View>
                {sharedPostPreviewUrl ? (
                  <View style={styles.sharedPostImageWrap}>
                    <Image source={{ uri: sharedPostPreviewUrl }} style={styles.sharedPostImage} />
                    {sharedPostMediaCount > 1 && (
                      <View style={styles.multiMediaBadge}>
                        <Ionicons name="copy-outline" size={12} color="#fff" />
                        <Text style={styles.multiMediaBadgeText}>{sharedPostMediaCount}</Text>
                      </View>
                    )}
                  </View>
                ) : null}
                <View style={styles.sharedPostCaptionBar}>
                  <Text style={styles.sharedPostCaption} numberOfLines={2}>
                    <Text style={styles.sharedPostCaptionUser}>{sharedPost.userName || sharedPost.username || 'user'}</Text>
                    <Text> </Text>
                    <Text>{sharedPost.caption || sharedPost.text || '...'}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* ===== STORY CARD - Instagram Style ===== */}
            {resolvedMediaType === 'story' && !storyExpired && resolvedStory && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onPressStory?.(resolvedStory)}
                style={styles.storyCard}
              >
                {/* Story thumbnail */}
                <Image
                  source={{ uri: resolvedStory.mediaUrl || resolvedStory.imageUrl || resolvedStory.videoUrl || resolvedStory.image || resolvedStory.video || DEFAULT_AVATAR_URL }}
                  style={styles.storyCardImage}
                />
                {/* Gradient overlay top */}
                <View style={styles.storyCardGradientTop} />
                {/* Gradient overlay bottom */}
                <View style={styles.storyCardGradientBottom} />
                {/* Header with avatar + name */}
                <View style={styles.storyCardHeader}>
                  <View style={styles.storyAvatarRing}>
                      <ExpoImage
                        source={{ uri: resolvedStory.userAvatar || DEFAULT_AVATAR_URL }}
                        style={styles.storyCardAvatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                  </View>
                  <Text style={styles.storyCardUsername} numberOfLines={1}>
                    {resolvedStory.userName || 'Story'}
                  </Text>
                </View>
                {/* Video indicator */}
                {(resolvedStory.mediaType === 'video' || resolvedStory.videoUrl || resolvedStory.video) && (
                  <View style={styles.storyVideoIcon}>
                    <Ionicons name="play" size={14} color="#fff" />
                  </View>
                )}
                {/* Footer label */}
                <View style={styles.storyCardFooter}>
                  <View style={styles.storyBadge}>
                    <Feather name="aperture" size={12} color="#fff" />
                    <Text style={styles.storyBadgeText}>Story</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Story loading */}
            {resolvedMediaType === 'story' && storyLoading && !resolvedStory && !storyExpired && (
              <View style={[styles.storyCard, styles.storyCardUnavailable]}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="loader" size={24} color="#aaa" />
                  <Text style={styles.storyUnavailableText}>Loading story...</Text>
                </View>
              </View>
            )}

            {/* Story expired / unavailable */}
            {resolvedMediaType === 'story' && (storyExpired || (!resolvedStory && !storyLoading && (legacyStoryId || storyId))) && (
              <View style={[styles.storyCard, styles.storyCardUnavailable]}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                  <View style={styles.storyUnavailableIcon}>
                    <Feather name="camera-off" size={28} color="#999" />
                  </View>
                  <Text style={styles.storyUnavailableTitle}>Story unavailable</Text>
                  <Text style={styles.storyUnavailableText}>This story is no longer available</Text>
                </View>
              </View>
            )}

            {!!displayText && !(resolvedMediaType === 'story' && (isLegacyStoryText || isStoryMetaText)) && (
              <View>
                <Text style={[styles.msgText, isSelf && styles.msgTextSelf]}>
                  {displayText}
                </Text>
                {editedAt && (
                  <Text style={[styles.editedText, isSelf ? styles.editedTextSelf : styles.editedTextOther]}>
                    Edited
                  </Text>
                )}
              </View>
            )}
  
            {/* Removed internal timestamp for cleaner Instagram style */}
            <View style={styles.msgFooter}>
              {isSelf && (
                <View style={styles.statusIcons}>
                  {read ? (
                    <Ionicons name="checkmark-done" size={14} color="#fff" />
                  ) : delivered ? (
                    <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" />
                  ) : sent ? (
                    <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.6)" />
                  ) : (
                    <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.2)" />
                  )}
                </View>
              )}
            </View>

            {/* Reactions Display */}
            {reactions && Object.keys(reactions).length > 0 && (
              <View style={styles.reactionsBadge}>
                {Object.keys(reactions).map(emoji => (
                  <Text key={emoji} style={styles.reactionEmoji}>{emoji}</Text>
                ))}
              </View>
            )}
          </TouchableOpacity>
          
          {/* Share icon next to bubble (only for media/story/post) */}
          {(resolvedMediaType === 'video' || resolvedMediaType === 'image' || resolvedMediaType === 'post' || resolvedMediaType === 'story') && (
            <TouchableOpacity style={styles.bubbleShareBtnCircle} onPress={onPressShare}>
              <Ionicons name="paper-plane-outline" size={18} color="#262626" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// Wrap with React.memo to prevent unnecessary re-renders when parent state changes
const MessageBubble = React.memo(MessageBubbleInner, (prev, next) => {
  // Only re-render when these props actually change
  return (
    prev.id === next.id &&
    prev.text === next.text &&
    prev.sent === next.sent &&
    prev.delivered === next.delivered &&
    prev.read === next.read &&
    prev.activeSoundId === next.activeSoundId &&
    prev.isSelf === next.isSelf &&
    prev.mediaUrl === next.mediaUrl &&
    prev.audioUrl === next.audioUrl &&
    prev.reactions === next.reactions
  );
});

export default MessageBubble;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
  },
  containerSelf: {
    justifyContent: 'flex-end',
  },
  containerOther: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    backgroundColor: '#efefef',
  },
  bubbleWrapper: {
    maxWidth: '85%',
  },
  msgBubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 60,
  },
  msgBubbleLeft: {
    backgroundColor: '#efefef',
  },
  msgBubbleRight: {
    backgroundColor: '#3797f0',
  },
  msgBubbleCompact: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  msgText: {
    fontSize: 15,
    color: '#000',
    lineHeight: 20,
  },
  msgTextSelf: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  editedText: {
    fontSize: 10,
    marginTop: 2,
    fontStyle: 'italic',
  },
  editedTextSelf: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  editedTextOther: {
    color: '#8e8e8e',
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    paddingBottom: 2,
  },
  msgTime: {
    fontSize: 10,
    color: '#8e8e8e',
  },
  msgTimeSelf: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  statusIcons: {
    marginLeft: 4,
  },
  statusSent: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  statusDelivered: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  statusRead: { fontSize: 10, color: '#fff', fontWeight: '800' },
  statusPending: { fontSize: 8 },
  replyBox: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    padding: 6,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#3797f0',
  },
  replyBoxSelf: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  replyBoxOther: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  replyName: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyText: { fontSize: 12, color: '#666' },
  msgImage: {
    width: 240,
    height: 240,
    borderRadius: 16,
    marginBottom: 4,
  },
  videoStub: {
    width: 240,
    height: 320,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  centerPlay: {
    opacity: 0.9,
  },
  bottomPlayCircle: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  premiumAudioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 240,
  },
  audioUnavailableContainer: {
    opacity: 0.7,
  },
  audioPlayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginRight: 10,
  },
  audioPlayCircleSelf: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  audioBody: {
    flex: 1,
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    height: 26,
    gap: 2,
  },
  waveBar: {
    width: 2,
    borderRadius: 1,
  },
  audioMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audioTimeText: {
    fontSize: 10,
    color: '#8e8e8e',
  },
  premiumPostContainer: {
    backgroundColor: '#fff',
    width: 250,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e7e7e7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  sharedPostAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  sharedPostAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
  sharedPostImageWrap: {
    position: 'relative',
  },
  sharedPostAuthorName: { fontSize: 14, fontWeight: '700', color: '#262626' },
  sharedPostImage: { width: '100%', height: 300, resizeMode: 'cover' },
  multiMediaBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  multiMediaBadgeText: {
    marginLeft: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  // ===== INSTAGRAM-STYLE STORY CARD =====
  storyCard: {
    width: 200,
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  storyCardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  storyCardGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'transparent',
    // Simulate gradient with overlapping layers
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  storyCardGradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  storyCardHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  storyAvatarRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#E1306C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  storyCardAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  storyCardUsername: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storyVideoIcon: {
    position: 'absolute',
    top: 50,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyCardFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  storyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  storyBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  storyCardUnavailable: {
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  storyUnavailableIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  storyUnavailableTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  storyUnavailableText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  sharedPostCaptionBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sharedPostCaption: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: 18,
  },
  sharedPostCaptionUser: {
    fontWeight: '700',
    color: '#111827',
  },
  bubbleShareBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  reactionsBadge: {
    position: 'absolute',
    bottom: -12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  reactionEmoji: {
    fontSize: 12,
    marginHorizontal: 1,
  },
});
