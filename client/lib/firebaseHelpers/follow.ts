import { apiService } from '@/src/_services/apiService';

// Check if user is following another user
export async function checkFollowStatus(followerId: string, followingId: string) {
  try {
    console.log('[checkFollowStatus] Checking follow status:', { followerId, followingId });
    const res = await apiService.get('/follow/status', { params: { followerId, followingId } });
    console.log('[checkFollowStatus] Response:', res);
    return res;
  } catch (error: any) {
    console.error('[checkFollowStatus] Error:', error.message);
    return { success: false, isFollowing: false, error: error.message };
  }
}

// isApprovedFollower is exported from `./user` (single barrel export).

export async function followUser(followerId: string, followingId: string) {
  try {
    console.log('[followUser] Sending follow request:', { followerId, followingId });
    const res = await apiService.post('/follow', { followerId, followingId });
    console.log('[followUser] Response:', res);
    return res;
  } catch (error: any) {
    console.error('[followUser] Error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function unfollowUser(followerId: string, followingId: string) {
  try {
    console.log('[unfollowUser] Sending unfollow request:', { followerId, followingId });
    const res = await apiService.delete('/follow', { followerId, followingId });
    console.log('[unfollowUser] Response:', res);
    return res;
  } catch (error: any) {
    console.error('[unfollowUser] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send a follow request to a private account
 */
export async function sendFollowRequest(fromUserId: string, toUserId: string) {
  try {
    console.log('[sendFollowRequest] Sending follow request:', { fromUserId, toUserId });
    const res = await apiService.post('/follow/request', { fromUserId, toUserId });
    console.log('[sendFollowRequest] Response:', res);
    return res;
  } catch (error: any) {
    console.error('[sendFollowRequest] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Reject a follow request
 */
export async function rejectFollowRequest(privateUserId: string, requesterId: string) {
  try {
    console.log('[rejectFollowRequest] Rejecting follow request:', { privateUserId, requesterId });
    const res = await apiService.delete(`/follow/request/${requesterId}`, { userId: privateUserId });
    console.log('[rejectFollowRequest] Response:', res);
    return res;
  } catch (error: any) {
    console.error('[rejectFollowRequest] Error:', error.message);
    return { success: false, error: error.message };
  }
}
