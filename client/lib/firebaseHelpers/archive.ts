// Archive conversation helpers

import { apiService } from '@/src/_services/apiService';

export async function archiveConversation(conversationId: string, userId: string) {
  try {
    return await apiService.post(`/conversations/${conversationId}/archive`, { userId });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function unarchiveConversation(conversationId: string, userId: string) {
  try {
    return await apiService.post(`/conversations/${conversationId}/unarchive`, { userId });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getArchivedConversations(userId: string) {
  try {
    const data = await apiService.get(`/users/${userId}/conversations/archived`);
    return { success: data?.success !== false, data: data?.data || [] };
  } catch (error: any) {
    return { success: false, error: error.message, data: [] };
  }
}

export async function deleteConversation(conversationId: string, userId: string) {
  try {
    return await apiService.post(`/conversations/${conversationId}/delete`, { userId });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clearConversation(conversationId: string) {
  try {
    return await apiService.post(`/conversations/${conversationId}/clear`);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
