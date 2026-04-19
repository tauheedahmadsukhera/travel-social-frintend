
import { apiService } from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/api';
import * as FileSystem from 'expo-file-system';

/** Lowercase extension including dot, e.g. `.m4a`, or empty if unknown */
export function extensionFromFileUri(uri: string): string {
  if (typeof uri !== 'string') return '';
  const pathPart = uri.split('?')[0];
  const base = pathPart.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return '';
  return base.slice(dot).toLowerCase();
}

export function inferAudioMultipartMeta(localUri: string): { fileName: string; mimeType: string } {
  const ext = extensionFromFileUri(localUri) || '.m4a';
  const mimeByExt: Record<string, string> = {
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.caf': 'audio/x-caf',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.3gp': 'audio/3gpp',
  };
  const mimeType = mimeByExt[ext] || 'audio/mp4';
  return { fileName: `audio-${Date.now()}${ext}`, mimeType };
}

/**
 * React to a message with an emoji (Instagram-style)
 */
export async function reactToMessage(conversationId: string, messageId: string, userId: string, emoji: string) {
  try {
    const res = await apiService.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, { userId, emoji });
    return res;
  } catch (error: any) {
    console.error('❌ reactToMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Subscribe to real-time messages in a conversation
 * FALLBACK polling only — Socket.IO in dm.tsx is the primary real-time channel.
 * This polls at 30s intervals just to catch any missed socket messages.
 */
export function subscribeToMessages(conversationId: string, callback: (messages: any[]) => void) {
  console.log('[subscribeToMessages] Starting fallback polling for:', conversationId);
  
  // Initial immediate fetch
  (async () => {
    try {
      const res = await apiService.get(`/conversations/${conversationId}/messages`);
      console.log('[subscribeToMessages] Initial fetch:', { success: res?.success, count: res?.messages?.length });
      if (res.success && res.messages) {
        const sortedMessages = res.messages.slice().reverse();
        callback(sortedMessages);
      }
    } catch (error) {
      console.error('[subscribeToMessages] Initial fetch error:', error);
    }
  })();

  // Fallback poll every 30 seconds (Socket.IO handles real-time)
  const pollInterval = setInterval(async () => {
    try {
      const res = await apiService.get(`/conversations/${conversationId}/messages`);
      if (res.success && res.messages) {
        const sortedMessages = res.messages.slice().reverse();
        callback(sortedMessages);
      }
    } catch (error) {
      console.error('Error polling messages:', error);
    }
  }, 30000); // 30 seconds fallback

  return () => {
    console.log('[subscribeToMessages] Stopping polling for:', conversationId);
    clearInterval(pollInterval);
  };
}

/**
 * Edit a message
 */
export async function editMessage(conversationId: string, messageId: string, userId: string, newText: string) {
  try {
    const res = await apiService.patch(`/conversations/${conversationId}/messages/${messageId}`, { userId, text: newText });
    return res;
  } catch (error: any) {
    console.error('❌ editMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(conversationId: string, messageId: string, userId: string) {
  try {
    const res = await apiService.delete(`/conversations/${conversationId}/messages/${messageId}`, { userId });
    return res;
  } catch (error: any) {
    console.error('❌ deleteMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send media message (image, video, audio)
 */
export async function sendMediaMessage(
  conversationId: string,
  senderId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'audio',
  options?: {
    recipientId?: string;
    text?: string;
    audioUrl?: string;
    audioDuration?: number;
    thumbnailUrl?: string;
  }
) {
  try {
    const payload = {
      senderId,
      recipientId: options?.recipientId,
      mediaUrl,
      mediaType,
      text: options?.text || '',
      audioUrl: options?.audioUrl,
      audioDuration: options?.audioDuration,
      thumbnailUrl: options?.thumbnailUrl,
      tempId: (options as any)?.tempId
    };

    const res = await apiService.post(`/conversations/${conversationId}/messages/media`, payload);
    return res;
  } catch (error: any) {
    console.error('❌ sendMediaMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload media file to cloudinary
 */
export async function uploadMedia(
  file: string, // base64 or file path
  mediaType: 'image' | 'video' | 'audio'
) {
  try {
    let payloadFile = file;

    // Prefer multipart for local files (especially audio) to avoid large base64 conversion failures.
    if (typeof file === 'string' && file.startsWith('file://')) {
      try {
        const token = await AsyncStorage.getItem('token');
        const endpointUrl = `${API_BASE_URL}/media/upload`;
        const inferredAudio = mediaType === 'audio' ? inferAudioMultipartMeta(file) : null;
        const fileName =
          inferredAudio?.fileName
          ?? `${mediaType}-${Date.now()}.${mediaType === 'audio' ? 'm4a' : mediaType === 'video' ? 'mp4' : 'jpg'}`;
        const mimeType =
          inferredAudio?.mimeType
          ?? (mediaType === 'audio'
            ? 'audio/mp4'
            : mediaType === 'video'
              ? 'video/mp4'
              : 'image/jpeg');

        const formData = new FormData();
        formData.append('mediaType', mediaType);
        formData.append('fileName', fileName);
        formData.append('file', { uri: file, name: fileName, type: mimeType } as any);

        const multipartRes: any = await new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', endpointUrl);
          xhr.setRequestHeader('Accept', 'application/json');
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

          xhr.onload = () => {
            try {
              const parsed = JSON.parse(xhr.responseText || '{}');
              resolve(parsed);
            } catch {
              resolve({ success: false, error: `Upload failed (${xhr.status})` });
            }
          };
          xhr.onerror = () => resolve({ success: false, error: 'Network upload failed' });
          xhr.send(formData as any);
        });

        if (multipartRes?.success) return multipartRes;
      } catch (multipartErr: any) {
        console.warn('⚠️ multipart upload fallback triggered:', multipartErr?.message || multipartErr);
      }

      // Multipart failed: convert local file URI to base64 for JSON upload fallback.
      try {
        const base64 = await FileSystem.readAsStringAsync(file, { encoding: FileSystem.EncodingType.Base64 });
        const mime =
          mediaType === 'audio'
            ? inferAudioMultipartMeta(file).mimeType
            : mediaType === 'video'
              ? 'video/mp4'
              : 'image/jpeg';
        payloadFile = `data:${mime};base64,${base64}`;
      } catch (fileErr: any) {
        console.error('❌ local file base64 fallback failed:', fileErr?.message || fileErr);
        return { success: false, error: 'Local file upload failed' };
      }
    }

    const res = await apiService.post('/media/upload', {
      file: payloadFile,
      mediaType
    });
    return res;
  } catch (error: any) {
    console.error('❌ uploadMedia error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a story attached to the messaging/conversations API (not the main /stories feed).
 * Barrel `createStory` comes from `./core`.
 */
export async function createConversationStory(
  userId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  options?: {
    caption?: string;
    userName?: string;
    userAvatar?: string;
  }
) {
  try {
    const res = await apiService.post('/conversations/stories', {
      userId,
      mediaUrl,
      mediaType,
      caption: options?.caption,
      userName: options?.userName,
      userAvatar: options?.userAvatar
    });
    return res;
  } catch (error: any) {
    console.error('❌ createConversationStory error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all stories (feed)
 */
export async function getStoriesFeed() {
  try {
    const res = await apiService.get('/conversations/stories/feed');
    return res;
  } catch (error: any) {
    console.error('❌ getStoriesFeed error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a shared post message
 */
export async function sendPostMessage(
  conversationId: string,
  senderId: string,
  sharedPost: any,
  options?: {
    recipientId?: string;
    text?: string;
  }
) {
  try {
    const mediaCandidates = [
      ...(Array.isArray(sharedPost?.mediaUrls) ? sharedPost.mediaUrls : []),
      ...(Array.isArray(sharedPost?.imageUrls) ? sharedPost.imageUrls : []),
      ...(Array.isArray(sharedPost?.images) ? sharedPost.images : []),
      ...(Array.isArray(sharedPost?.media) ? sharedPost.media : []),
    ];

    const mediaUrls = mediaCandidates
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          return item.url || item.uri || item.imageUrl || item.mediaUrl || '';
        }
        return '';
      })
      .filter((url: string) => typeof url === 'string' && !!url.trim());

    const fallbackImage = sharedPost.imageUrl || sharedPost.image;
    const uniqueMediaUrls = Array.from(new Set([...(fallbackImage ? [fallbackImage] : []), ...mediaUrls]));
    const mediaCount = Number(sharedPost?.mediaCount) > 0
      ? Number(sharedPost.mediaCount)
      : uniqueMediaUrls.length;

    const payload = {
      senderId,
      recipientId: options?.recipientId,
      mediaType: 'post',
      text: options?.text || '',
      sharedPost: {
        postId: sharedPost.id || sharedPost._id,
        imageUrl: uniqueMediaUrls[0] || fallbackImage,
        mediaUrls: uniqueMediaUrls,
        mediaCount,
        text: sharedPost.text || sharedPost.caption,
        caption: sharedPost.caption,
        userId: sharedPost.userId,
        userDisplayName: sharedPost.userDisplayName || sharedPost.displayName,
        userName: sharedPost.userName || sharedPost.username,
        userAvatar: sharedPost.userAvatar || sharedPost.avatar,
      }
    };

    const res = await apiService.post(`/conversations/${conversationId}/messages/media`, payload);
    console.log('[sendPostMessage] Success:', res);
    return res;
  } catch (error: any) {
    console.error('❌ sendPostMessage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a shared story message
 */
export async function sendStoryMessage(
  conversationId: string,
  senderId: string,
  sharedStory: any,
  options?: {
    recipientId?: string;
    text?: string;
  }
) {
  try {
    const resolvedStoryId = sharedStory?.storyId || sharedStory?.id || sharedStory?._id;
    const resolvedMediaUrl =
      sharedStory?.mediaUrl ||
      sharedStory?.imageUrl ||
      sharedStory?.videoUrl ||
      sharedStory?.image ||
      sharedStory?.video;

    const payload = {
      senderId,
      recipientId: options?.recipientId,
      mediaType: 'story',
      text: options?.text || '',
      sharedStory: {
        storyId: resolvedStoryId,
        mediaUrl: resolvedMediaUrl,
        mediaType: sharedStory.mediaType || (sharedStory.videoUrl ? 'video' : 'image'),
        userId: sharedStory.userId,
        userName: sharedStory.userName || sharedStory.username,
        userAvatar: sharedStory.userAvatar || sharedStory.avatar,
      }
    };

    const res = await apiService.post(`/conversations/${conversationId}/messages/media`, payload);
    console.log('[sendStoryMessage] Success:', res);
    return res;
  } catch (error: any) {
    console.error('❌ sendStoryMessage error:', error);
    return { success: false, error: error.message };
  }
}

