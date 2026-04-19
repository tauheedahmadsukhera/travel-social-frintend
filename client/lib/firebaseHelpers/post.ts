import { apiService } from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAPIBaseURL as getBaseUrl } from '../../config/environment';

function stripApiSuffix(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api$/, '');
}

function normalizeBase(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function buildLikeCandidates(postId: string): string[] {
  const raw = normalizeBase(getBaseUrl());
  const stripped = stripApiSuffix(raw);
  const withApi = stripped.endsWith('/api') ? stripped : `${stripped}/api`;

  // Prefer canonical /api/posts path first, then legacy /posts path.
  const candidates = [
    `${withApi}/posts/${postId}/like`,
    `${raw}/posts/${postId}/like`,
    `${stripped}/api/posts/${postId}/like`,
    `${stripped}/posts/${postId}/like`,
  ];

  return Array.from(
    new Set(
      candidates
        .map((u) => u.replace(/([^:]\/)\/+/g, '$1'))
        .filter((u) => !/\/api\/api\//.test(u))
    )
  );
}

async function requestLikeFallback(method: 'POST' | 'DELETE', postId: string, userId: string) {
  const token = await AsyncStorage.getItem('token');
  const candidates = buildLikeCandidates(postId);
  let lastError = 'Endpoint not found';
  let firstMeaningfulError = '';

  for (const url of candidates) {
    try {
      if (__DEV__) {
        console.log('[Post API] fallback attempt:', { method, url, postId, userId });
      }
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });

      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = { success: res.ok };
      }

      if (res.ok && payload?.success !== false) {
        if (__DEV__) {
          console.log('[Post API] fallback success:', { method, url, status: res.status, payload });
        }
        return payload?.success === undefined ? { success: true, data: payload } : payload;
      }

      const currentError = payload?.error || payload?.message || `HTTP ${res.status}`;
      lastError = currentError;
      if (!firstMeaningfulError && !/endpoint not found/i.test(String(currentError))) {
        firstMeaningfulError = String(currentError);
      }

      if (__DEV__) {
        console.log('[Post API] fallback non-success:', {
          method,
          url,
          status: res.status,
          payload,
        });
      }
    } catch {
      if (__DEV__) {
        console.log('[Post API] fallback request failed:', { method, url });
      }
      lastError = 'Network request failed';
      // try next candidate
    }
  }

  return { success: false, error: firstMeaningfulError || lastError || 'Endpoint not found' };
}

/**
 * Get a post by its ID
 */
export async function getPostById(postId: string) {
  try {
    const data = await apiService.get(`/posts/${postId}`);
    return data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Backward-compatible alias used by older screens (e.g. post-detail)
export const getPost = getPostById;

/**
 * Like a post
 */
export async function likePost(postId: string, userId: string) {
  try {
    console.log('[Post API] likePost - postId:', postId, 'userId:', userId);
    let data = await apiService.post(`/posts/${postId}/like`, { userId });
    if (!data?.success) {
      data = await requestLikeFallback('POST', postId, userId);
    }
    console.log('[Post API] likePost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] likePost error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Unlike a post
 */
export async function unlikePost(postId: string, userId: string) {
  try {
    console.log('[Post API] unlikePost - postId:', postId, 'userId:', userId);
    let data = await apiService.delete(`/posts/${postId}/like`, { userId });
    if (!data?.success) {
      data = await requestLikeFallback('DELETE', postId, userId);
    }
    console.log('[Post API] unlikePost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] unlikePost error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * React to a post with an emoji
 */
export async function reactToPost(postId: string, userId: string, userName: string, userAvatar: string, emoji: string) {
  try {
    console.log('[Post API] reactToPost - postId:', postId, 'userId:', userId, 'emoji:', emoji);
    const data = await apiService.post(`/posts/${postId}/react`, { userId, userName, userAvatar, emoji });
    console.log('[Post API] reactToPost response:', data);
    return data;
  } catch (error: any) {
    console.error('[Post API] reactToPost error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save a post
 */
export async function savePost(postId: string, userId: string) {
  try {
    const data = await apiService.post(`/users/${userId}/saved`, { postId });
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Unsave a post
 */
export async function unsavePost(postId: string, userId: string) {
  try {
    const data = await apiService.delete(`/users/${userId}/saved/${postId}`);
    return { success: true, ...data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

