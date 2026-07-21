import { DEFAULT_AVATAR_URL } from '@/lib/api';
import { normalizeAvatarUrl } from '../utils/media';
/**
 * Check if a user is an approved follower
 */
export async function isApprovedFollower(userId: string, checkUserId: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const res = await apiService.get(`/follow/status?followerId=${checkUserId}&followingId=${userId}`);
    return res?.isFollowing || false;
  } catch (error: any) {
    return false;
  }
}

import { getUserHighlights as getUserHighlightsCore, getHighlightStories as getHighlightStoriesCore } from './core';

export { getUserHighlightsCore as getUserHighlights, getHighlightStoriesCore as getHighlightStories };

/**
 * Get all stories for feed (grouped by user)
 */
export async function getAllStoriesForFeed() {
  try {
    console.log('[getAllStoriesForFeed] Fetching stories feed...');

    // Use apiService so baseURL is resolved correctly on real devices (no localhost/relative issues)
    const { apiService } = await import('@/src/_services/apiService');
    const res = await apiService.get('/stories');
    const stories = res?.data || [];
    return { success: res?.success !== false, data: Array.isArray(stories) ? stories : [] };
  } catch (error: any) {
    console.log('[getAllStoriesForFeed] Error:', error.message);
    return { success: false, error: error.message };
  }
}

// User-related helpers

/**
 * Get user profile by UID
 */
export async function getUserProfile(uid: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const res = await apiService.get(`/users/${uid}`);

    if (!res.success) {
      return { success: false, error: res.error || 'User not found' };
    }

    const normalizeRemoteUrl = (value: any): string => {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();
      if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
      if (lower.startsWith('http://')) return `https://${trimmed.slice(7)}`;
      if (lower.startsWith('//')) return `https:${trimmed}`;
      return trimmed;
    };

    const userData = res.data;
    const defaultAvatar = DEFAULT_AVATAR_URL;
    const userAvatar = normalizeRemoteUrl(userData.avatar || userData.photoURL || userData.profilePicture) || defaultAvatar;
    
    console.log('[getUserProfile] Avatar resolution for', uid, ':', {
      responseAvatar: userData.avatar,
      responsePhotoURL: userData.photoURL,
      responseProfilePicture: userData.profilePicture,
      resolvedAvatar: userAvatar,
      isDefault: userAvatar === defaultAvatar
    });
    const profile = {
      id: userData._id || userData.uid,
      uid: userData.uid,
      name: userData.displayName || userData.name || 'User',
      email: userData.email || '',
      avatar: userAvatar,
      photoURL: userAvatar,
      bio: userData.bio || '',
      website: userData.website || '',
      username: userData.username || userData.displayName || '',
      followers: userData.followers || [],
      following: userData.following || [],
      followersCount: userData.followersCount || 0,
      followingCount: userData.followingCount || 0,
      postsCount: userData.postsCount || 0,
      isPrivate: userData.isPrivate || false,
      approvedFollowers: userData.followers || [],
      createdAt: userData.createdAt
    };
    return { success: true, data: profile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(uid: string, data: any) {
  try {
    // Import apiService dynamically to avoid circular dependencies
    const { apiService } = await import('@/src/_services/apiService');

    const safeData = {
      ...data,
    };

    if (data && 'avatar' in data) {
      let avatarValue = data.avatar;
      if (!avatarValue || (typeof avatarValue === 'string' && avatarValue.trim() === '')) {
        avatarValue = DEFAULT_AVATAR_URL;
      }
      safeData.avatar = avatarValue;
      safeData.photoURL = avatarValue;
    }

    const responseData = await apiService.patch(`/users/${uid}`, safeData);
    return { success: true, data: responseData };
  } catch (error: any) {
    console.error('❌ updateUserProfile error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Search users by query text
 */
export async function searchUsers(queryText: string, resultLimit: number = 20) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const res = await apiService.get('/users/search', { params: { q: queryText, limit: Math.min(50, resultLimit) } });
    let results = Array.isArray(res) ? res : (res?.data || []);

    // Normalize IDs:
    // - App-wide `userId` (AsyncStorage) is usually Mongo `_id`
    // - Some endpoints may return firebase uid fields (`firebaseUid`/`uid`)
    // We normalize `uid` to Mongo `_id` when available to keep DM/inbox consistent.
    if (Array.isArray(results)) {
      results = results.map((u: any) => {
        const mongoId = u?._id || u?.id;
        const firebaseId = u?.firebaseUid || u?.uid;
        const normalizedUid = mongoId ? String(mongoId) : (firebaseId ? String(firebaseId) : '');

        return {
          ...u,
          uid: normalizedUid,
          firebaseUid: u?.firebaseUid || (typeof u?.uid === 'string' && u.uid.length > 0 ? u.uid : undefined),
          displayName: u?.displayName || u?.name || u?.username || u?.email?.split?.('@')?.[0] || 'User',
          username: u?.username || '',
          photoURL: normalizeAvatarUrl(u?.photoURL || u?.avatar),
        };
      });
    }

    return { success: true, data: results };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}
/**
 * Get posts for a user (respects privacy settings)
 */
export async function getUserPosts(userId: string, requesterUserId?: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const params = requesterUserId ? { requesterUserId } : {};
    const res = await apiService.get(`/users/${userId}/posts`, params);
    return { success: res.success !== false, data: res.data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get sections for a user (respects privacy settings)
 */
export async function getUserSections(userId: string, requesterUserId?: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const params = requesterUserId ? { requesterUserId } : {};
    const res = await apiService.get(`/users/${userId}/sections`, params);
    return { success: res.success !== false, data: res.data || [] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get active stories for a user (respects privacy settings)
 */
export async function getUserStories(userId: string, requesterUserId?: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const params = requesterUserId ? { requesterUserId } : {};
    const res = await apiService.get(`/users/${userId}/stories`, params);
    const stories = res.data || [];
    stories.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    return { success: res.success !== false, stories };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
/**
 * Register push token for a user
 */
export async function registerPushToken(userId: string, pushToken: string) {
  try {
    const { apiService } = await import('@/src/_services/apiService');
    const res = await apiService.put(`/users/${userId}/push-token`, { pushToken });
    return res;
  } catch (error: any) {
    console.error('❌ registerPushToken error:', error);
    return { success: false, error: error.message };
  }
}
