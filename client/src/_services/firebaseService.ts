import { apiService } from './apiService';


export async function getUserProfile(userId: string, viewerId?: string) {
  // Backend API call for user profile
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}`, params);
  } catch (err: any) {
    console.error('[getUserProfile] Error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getUserPosts(userId: string, viewerId?: string) {
  // Backend API call for user posts - correct endpoint
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}/posts`, params);
  } catch (err: any) {
    console.error('[getUserPosts] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

export async function getUserSections(userId: string, viewerId?: string) {
  // Backend API call for user sections
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}/sections`, params);
  } catch (err: any) {
    console.error('[getUserSections] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

export async function getUserStories(userId: string, viewerId?: string) {
  // Backend API call for user stories
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}/stories`, params);
  } catch (err: any) {
    console.error('[getUserStories] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

export async function getUserHighlights(userId: string, viewerId?: string) {
  // Backend API call for user highlights
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}/highlights`, params);
  } catch (err: any) {
    console.error('[getUserHighlights] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

export async function getTaggedPosts(userId: string, viewerId?: string) {
  // Backend API call for posts where user is tagged
  try {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    return await apiService.get(`/users/${userId}/tagged-posts`, params);
  } catch (err: any) {
    console.warn('[getTaggedPosts] Error (non-critical):', err.message);
    return { success: false, error: err.message, data: [] };
  }
}

