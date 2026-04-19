// Conversation and DM helpers

import { apiService } from '@/src/_services/apiService';
import { clearConversation } from './archive';

// Get or create a conversation between two users
export async function getOrCreateConversation(userId1: string, userId2: string) {
  try {
    const id1 = String(userId1 || '').trim();
    const id2 = String(userId2 || '').trim();
    if (!id1 || !id2) return { success: false, conversationId: null, error: 'Invalid user ids' };

    // Resolve canonical conversation from backend (normalizes ID variants and avoids duplicates).
    const resolved = await apiService.post('/conversations/resolve', { otherUserId: id2 });
    const resolvedId = String(resolved?.conversationId || resolved?.data?.conversationId || resolved?.data?._id || '').trim();
    if (resolved?.success && resolvedId) {
      console.log('[Conversation] Using resolved conversationId:', resolvedId);
      return { success: true, conversationId: resolvedId };
    }

    // Fallback legacy deterministic key if resolve endpoint fails.
    const ids = [id1, id2].sort();
    const conversationId = `${ids[0]}_${ids[1]}`;
    console.log('[Conversation] Using fallback conversationId:', conversationId);
    return { success: true, conversationId };
  } catch (error: any) {
    console.error('Error in getOrCreateConversation:', error);
    return { success: false, conversationId: null, error: error.message };
  }
}

export async function getConversationById(conversationId: string) {
  try {
    const res = await apiService.get(`/conversations/${conversationId}`);
    if (res?.success) return { success: true, data: res.data };
    return { success: false, error: res?.error || 'Conversation not found' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createGroupConversation(
  name: string,
  memberIds: string[],
  options?: { avatar?: string; description?: string }
) {
  try {
    const payload: any = {
      name,
      memberIds,
    };
    if (options?.avatar) payload.avatar = options.avatar;
    if (options?.description) payload.description = options.description;

    const res = await apiService.post('/conversations/group', payload);
    if (res?.success) {
      return {
        success: true,
        conversationId: String(res?.conversationId || res?.data?.conversationId || res?.data?._id || ''),
        data: res?.data,
      };
    }
    return { success: false, error: res?.error || 'Failed to create group' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateGroupMembers(
  conversationId: string,
  changes: { addMemberIds?: string[]; removeMemberIds?: string[] }
) {
  try {
    const res = await apiService.patch(`/conversations/${conversationId}/group-members`, changes || {});
    if (res?.success) return { success: true, data: res?.data };
    return { success: false, error: res?.error || 'Failed to update group members' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Subscribe to user's conversations with real-time updates
export function subscribeToConversations(userId: string, callback: (convos: any[]) => void) {
  // Use polling for conversations
  const pollInterval = setInterval(async () => {
    try {
      const res = await apiService.get(`/conversations?userId=${userId}`);
      if (res.success) {
        callback(res.data || []);
      }
    } catch (error: any) {
      if (error?.code === 'CIRCUIT_OPEN') {
        if (__DEV__) console.warn('[conversations] Poll skipped (API cooling down).');
        return;
      }
      console.error('Error polling conversations:', error);
    }
  }, 10000);

  return () => clearInterval(pollInterval);
}

// Get all conversations for a user
export async function getUserConversations(userId: string) {
  try {
    const res = await apiService.get(`/conversations?userId=${userId}`);
    return res.data || [];
  } catch (error: any) {
    if (error?.code === 'CIRCUIT_OPEN') {
      if (__DEV__) console.warn('[getUserConversations] API cooling down; returning empty (tabs will retry).');
      return [];
    }
    console.error('Error in getUserConversations:', error);
    return [];
  }
}

// Mark a conversation as read
export async function markConversationAsRead(conversationId: string, userId: string) {
  try {
    const res = await apiService.patch(`/conversations/${conversationId}/read`, { userId });
    return res;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Send a message in a conversation
export async function sendMessage(
  conversationId: string, 
  senderId: string, 
  text: string, 
  recipientId?: string,
  replyTo?: { id: string; text: string; senderId: string } | null,
  tempId?: string
) {
  try {
    const messageData: any = {
      senderId,
      text,
      read: false
    };
    
    if (tempId) {
      messageData.tempId = tempId;
    }
    
    // Add recipientId if provided
    if (recipientId) {
      messageData.recipientId = recipientId;
    }
    
    // Add replyTo if replying to a message
    if (replyTo) {
      messageData.replyTo = {
        id: replyTo.id,
        text: replyTo.text,
        senderId: replyTo.senderId
      };
    }
    
    const res = await apiService.post(`/conversations/${conversationId}/messages`, messageData);
    console.log('[SendMessage] Response:', res);
    return res;
  } catch (error: any) {
    console.error('Error in sendMessage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create or update a conversation for DM/message notifications
 */
export async function upsertConversation(recipientId: string, senderId: string, message: string) {
  try {
    // Generate consistent conversationId
    const ids = [recipientId, senderId].sort();
    const conversationId = `${ids[0]}_${ids[1]}`;
    
    // Send the message
    await sendMessage(conversationId, senderId, message, recipientId);
    
    console.log('[UpsertConversation] Message sent to:', conversationId);
    return { success: true, id: conversationId };
  } catch (error: any) {
    console.error('Error in upsertConversation:', error);
    return { success: false, error: error.message };
  }
}

// Defensive default export for compatibility with namespace/default import call-sites.
const conversationHelpers = {
  getOrCreateConversation,
  getConversationById,
  createGroupConversation,
  updateGroupMembers,
  subscribeToConversations,
  getUserConversations,
  markConversationAsRead,
  sendMessage,
  upsertConversation,
  clearConversation,
};

export default conversationHelpers;
