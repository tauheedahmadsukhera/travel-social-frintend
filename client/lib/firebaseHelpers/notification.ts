import { apiService } from '@/src/services/apiService';

// Get notifications for a user
export async function getUserNotifications(userId: string) {
  try {
    const res = await apiService.get(`/notifications/${userId}`);
    return res?.data || [];
  } catch (error: any) {
    return [];
  }
}
// Notification-related Firestore helpers


/**
 * Add notification to user's notifications subcollection
 */
export async function addNotification(recipientId: string, senderId: string, type: string, message: string, createdAt: any) {
  try {
    const data = await apiService.post('/notifications', { recipientId, type, message, createdAt });
    return data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
