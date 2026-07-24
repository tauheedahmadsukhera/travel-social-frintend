// Live streaming helpers

import { apiService } from '@/src/services/apiService';
import { userProfileCache } from '../userProfileCache';

export async function getActiveLiveStreams() {
  try {
    const res = await apiService.get('/live-streams');
    const streams = (res as any)?.streams ?? (res as any)?.data ?? [];
    return Array.isArray(streams) ? streams : [];
  } catch (error: any) {
    return [];
  }
}

export async function startLiveStream(userId: string, streamData: any) {
  try {
    return await apiService.post('/live-streams', { userId, ...streamData });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function endLiveStream(streamId: string, userId: string) {
  try {
    return await apiService.patch(`/live-streams/${streamId}/end`, { userId });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function joinLiveStream(streamId: string, userId: string) {
  try {
    const joined = await apiService.post(`/live-streams/${streamId}/join`, { userId });
    if (joined?.success !== false) return joined;
    return await apiService.get(`/live-streams/${streamId}`);
  } catch (error: any) {
    try {
      return await apiService.get(`/live-streams/${streamId}`);
    } catch (e: any) {
      return { success: false, error: e?.message || error?.message };
    }
  }
}

export async function joinLiveStreamWithProfile(
  streamId: string,
  userId: string,
  profile?: { userName?: string; userAvatar?: string }
) {
  try {
    const payload: any = { userId };
    if (profile?.userName) payload.userName = profile.userName;
    if (profile?.userAvatar) payload.userAvatar = profile.userAvatar;

    const joined = await apiService.post(`/live-streams/${streamId}/join`, payload);
    if (joined?.success !== false) return joined;
    return await apiService.get(`/live-streams/${streamId}`);
  } catch (error: any) {
    try {
      return await apiService.get(`/live-streams/${streamId}`);
    } catch (e: any) {
      return { success: false, error: e?.message || error?.message };
    }
  }
}

export async function addLiveComment(streamId: string, payload: { userId: string; text: string; userName?: string; userAvatar?: string }) {
  try {
    return await apiService.post(`/live-streams/${streamId}/comments`, payload);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function leaveLiveStream(streamId: string, userId: string) {
  try {
    return await apiService.post(`/live-streams/${streamId}/leave`, { userId });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function subscribeToLiveStream(streamId: string, callback: (stream: any) => void) {
  // Use polling for live stream
  const pollInterval = setInterval(async () => {
    try {
      const data = await apiService.get(`/live-streams/${streamId}`);
      if (data?.success !== false && data?.data) {
        callback(data.data);
      }
    } catch (error) {
      console.error('Error polling live stream:', error);
    }
  }, 5000);

  return () => clearInterval(pollInterval);
}

async function resolveViewerProfile(userId: string): Promise<{ id: string; name: string; avatar: string } | null> {
  const uid = typeof userId === 'string' ? userId : String(userId || '');
  if (!uid) return null;

  const cached = userProfileCache.get(uid);
  if (cached) {
    const name =
      cached?.displayName ||
      cached?.name ||
      cached?.username ||
      (typeof cached?.email === 'string' ? cached.email.split('@')[0] : undefined) ||
      'Viewer';
    const avatar = cached?.avatar || cached?.photoURL || cached?.userAvatar || null;
    return { id: uid, name: String(name || 'Viewer'), avatar: String(avatar || '') };
  }

  try {
    const res: any = await apiService.get(`/users/${uid}`);
    const userData = res?.data || res?.user || res;
    if (userData) {
      userProfileCache.set(uid, userData);
      const name =
        userData?.displayName ||
        userData?.name ||
        userData?.username ||
        (typeof userData?.email === 'string' ? userData.email.split('@')[0] : undefined) ||
        'Viewer';
      const avatar = userData?.avatar || userData?.photoURL || null;
      return { id: uid, name: String(name || 'Viewer'), avatar: String(avatar || '') };
    }
  } catch {}

  return { id: uid, name: 'Viewer', avatar: '' };
}

export function subscribeToLiveViewers(
  streamId: string,
  callback: (viewers: { id: string; name: string; avatar: string }[]) => void,
  onViewerCount?: (count: number) => void
) {
  const pollInterval = setInterval(async () => {
    try {
      const data: any = await apiService.get(`/live-streams/${streamId}`);
      if (data?.success === false) return;

      const stream = data?.data || data;
      const rawViewers = Array.isArray(stream?.viewers) ? stream.viewers : [];

      const viewerIds: string[] = rawViewers
        .map((v: any) => {
          if (typeof v === 'string') return v;
          const id = v?.userId || v?.odId || v?.uid || v?.id;
          return id ? String(id) : '';
        })
        .filter((v: string) => v.length > 0);

      const uniqueIds = Array.from(new Set(viewerIds));
      const resolved = await Promise.all(uniqueIds.map((id) => resolveViewerProfile(id)));
      const viewers = resolved
        .filter(Boolean)
        .map((v: any) => ({
          id: String(v.id),
          name: String(v.name || 'Viewer'),
          avatar: typeof v.avatar === 'string' ? v.avatar : '',
        }));

      callback(viewers);
      const count =
        typeof stream?.viewerCount === 'number'
          ? stream.viewerCount
          : (Array.isArray(stream?.viewers) ? stream.viewers.length : viewers.length);
      if (typeof onViewerCount === 'function') onViewerCount(count);
    } catch (error) {
      console.error('Error polling live viewers:', error);
    }
  }, 5000);

  return () => clearInterval(pollInterval);
}

export function subscribeToLiveComments(streamId: string, callback: (comments: any[]) => void) {
  // Use polling for comments
  const pollInterval = setInterval(async () => {
    try {
      const data = await apiService.get(`/live-streams/${streamId}/comments`);
      if (data?.success !== false) {
        const comments = data?.data || [];
        callback(comments);
      }
    } catch (error) {
      console.error('Error polling live comments:', error);
    }
  }, 5000);

  return () => clearInterval(pollInterval);
}
