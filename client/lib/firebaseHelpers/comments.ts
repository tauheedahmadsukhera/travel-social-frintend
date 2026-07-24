import { apiService } from '@/src/services/apiService';

// Timeout wrapper to prevent indefinite hanging
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout - please try again')), timeoutMs)
    )
  ]);
};

// ============= COMMENTS CRUD =============

/**
 * Add a comment to a post
 */
export async function addComment(postId: string, userId: string, userName: string, userAvatar: string, text: string) {
  try {
    console.log('[Comments API] addComment - postId:', postId, 'userId:', userId, 'text:', text);
    const data = await withTimeout(
      apiService.post(`/posts/${postId}/comments`, { userId, userName, userAvatar, text }),
      15000
    );
    console.log('[Comments API] addComment response:', data);
    return data;
  } catch (error: any) {
    console.error('❌ addComment error:', error);
    return { success: false, error: error.message || 'Request failed' };
  }
}

/**
 * Edit a comment
 */
export async function editComment(postId: string, commentId: string, userId: string, newText: string) {
  try {
    const data = await apiService.patch(`/posts/${postId}/comments/${commentId}`, { userId, text: newText });
    return data;
  } catch (error: any) {
    console.error('❌ editComment error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a comment
 */
export async function deleteComment(postId: string, commentId: string, userId: string, postOwnerId: string) {
  try {
    const data = await apiService.delete(`/posts/${postId}/comments/${commentId}`, { userId });
    return data;
  } catch (error: any) {
    console.error('❌ deleteComment error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a reply to a comment
 */
export async function addCommentReply(postId: string, parentCommentId: string, reply: any) {
  try {
    const data = await apiService.post(`/posts/${postId}/comments/${parentCommentId}/replies`, reply);
    return data;
  } catch (error: any) {
    console.error('❌ addCommentReply error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Edit a reply
 */
export async function editCommentReply(postId: string, commentId: string, replyId: string, userId: string, newText: string) {
  try {
    const data = await apiService.patch(`/posts/${postId}/comments/${commentId}/replies/${replyId}`, { userId, text: newText });
    return data;
  } catch (error: any) {
    console.error('❌ editCommentReply error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a reply
 */
export async function deleteCommentReply(postId: string, commentId: string, replyId: string, userId: string, postOwnerId: string) {
  try {
    const data = await apiService.delete(`/posts/${postId}/comments/${commentId}/replies/${replyId}`, { userId });
    return data;
  } catch (error: any) {
    console.error('❌ deleteCommentReply error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add or replace reaction to comment (Instagram style - one reaction per user)
 */
export async function addCommentReaction(postId: string, commentId: string, userId: string, reactionType: string) {
  try {
    // Send removeExisting flag to backend to handle one-reaction-per-user logic
    // Backend will remove any existing reaction from this user first, then add the new one
    const data = await apiService.post(`/posts/${postId}/comments/${commentId}/reactions`, { 
      userId, 
      reaction: reactionType, 
      removeExisting: true  // Backend should remove user's previous reaction
    });
    return data;
  } catch (error: any) {
    console.error('❌ addCommentReaction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove reaction from comment
 */
export async function removeCommentReaction(postId: string, commentId: string, userId: string) {
  try {
    const data = await apiService.delete(`/posts/${postId}/comments/${commentId}/reactions/${userId}`);
    return data;
  } catch (error: any) {
    console.error('❌ removeCommentReaction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all comments for a post
 */
export async function getPostComments(postId: string) {
  try {
    const data = await withTimeout(
      apiService.get(`/posts/${postId}/comments`),
      15000
    );
    return data;
  } catch (error: any) {
    console.error('❌ getPostComments error:', error);
    return { success: false, error: error.message || 'Request failed', data: [] };
  }
}

