import apiService from '@/src/_services/apiService';

export const userService = {
  // Block a user
  async blockUser(userId: string, blockUserId: string): Promise<boolean> {
    try {
      const response = await apiService.put(`/users/${userId}/block/${blockUserId}`);
      console.log('[userService] Blocked user:', blockUserId);
      // apiService resolves with response.data directly in successful cases or ApiResponse format
      return response?.success || response?.data?.success || false;
    } catch (err) {
      console.error('[userService] Error blocking user:', err);
      return false;
    }
  },

  // Unblock a user
  async unblockUser(userId: string, blockUserId: string): Promise<boolean> {
    try {
      const response = await apiService.delete(`/users/${userId}/block/${blockUserId}`);
      console.log('[userService] Unblocked user:', blockUserId);
      return response?.success || response?.data?.success || false;
    } catch (err) {
      console.error('[userService] Error unblocking user:', err);
      return false;
    }
  },

  // Report a user
  async reportUser(
    userId: string,
    reporterId: string,
    reason: string,
    details?: string
  ): Promise<boolean> {
    try {
      const response = await apiService.post(`/users/${userId}/report`, { reporterId, reason, details });
      console.log('[userService] Reported user:', userId);
      return response?.success || response?.data?.success || false;
    } catch (err) {
      console.error('[userService] Error reporting user:', err);
      return false;
    }
  },

  // Get shareable profile URL
  async getProfileUrl(userId: string): Promise<string | null> {
    try {
      const response = await apiService.get(`/users/${userId}/profile-url`);
      console.log('[userService] Generated profile URL');
      return response?.data?.profileUrl || response?.profileUrl || null;
    } catch (err) {
      console.error('[userService] Error getting profile URL:', err);
      return null;
    }
  },

  // Get blocked users
  async getBlockedUsers(userId: string): Promise<any[]> {
    try {
      const response = await apiService.get(`/users/${userId}/blocked`);
      if (response?.success && Array.isArray(response.data)) {
        return response.data;
      }
      if (Array.isArray(response)) {
        return response;
      }
      return [];
    } catch (err) {
      console.error('[userService] Error getting blocked users:', err);
      return [];
    }
  },

  // Report a post
  async reportPost(
    postId: string,
    userId: string,
    reason: string,
    details?: string
  ): Promise<boolean> {
    try {
      const response = await apiService.post(`/posts/${postId}/report`, { userId, reason, details });
      console.log('[userService] Reported post:', postId);
      return response?.success || response?.data?.success || false;
    } catch (err) {
      console.error('[userService] Error reporting post:', err);
      return false;
    }
  }
};
