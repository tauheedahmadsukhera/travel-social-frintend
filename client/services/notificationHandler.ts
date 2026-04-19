/**
 * Setup notification listeners
 * Safely handles notification initialization with error handling
 */
export function setupNotificationListeners() {
  try {
    // Dynamically import Notifications to avoid early load issues
    const Notifications = require('expo-notifications');
    const { router } = require('expo-router');
    
    if (!Notifications || !Notifications.addNotificationReceivedListener) {
      console.warn('[NotificationHandler] Notifications API not available');
      return;
    }

    // Handle notification received while app is foregrounded
    Notifications.addNotificationReceivedListener((notification: any) => {
      console.log('📬 Notification received:', notification);
    });

    const safeStr = (v: any) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] || '') : v != null ? String(v) : '');

    // Handle notification tapped
    Notifications.addNotificationResponseReceivedListener((response: any) => {
      try {
        console.log('☝️ Notification tapped:', JSON.stringify(response, null, 2));
        
        const data = response.notification.request.content.data;
        console.log('📦 Notification data:', JSON.stringify(data, null, 2));
        
        const type = safeStr(data?.type).toLowerCase();
        const screenHint = safeStr(data?.screen).toLowerCase();
        const senderId = safeStr(data?.senderId);
        const postId = safeStr(data?.postId);
        const conversationId = safeStr(data?.conversationId);

        // Use a small timeout to ensure router is ready on cold start
        setTimeout(() => {
          try {
            // If payload doesn't specify a route, do not hijack startup.
            if (!type && !screenHint) {
              return;
            }
            if (type === 'passport' || type === 'passport_suggestion' || screenHint === 'passport') {
              router.push('/passport');
              return;
            }

            if (type === 'message' || type === 'dm') {
              const qs = `conversationId=${encodeURIComponent(conversationId)}&otherUserId=${encodeURIComponent(senderId)}`;
              router.push((conversationId ? `/dm?${qs}` : `/inbox`) as any);
              return;
            }

            if (type === 'follow' || type === 'new-follower' || type === 'follow-request' || type === 'follow-approved') {
              if (senderId) router.push((`/user-profile?id=${encodeURIComponent(senderId)}`) as any);
              return;
            }

            if (type === 'like' || type === 'comment' || type === 'mention' || type === 'tag') {
              if (postId) router.push((`/post-detail?id=${encodeURIComponent(postId)}`) as any);
              return;
            }

            // Fallback: do nothing (avoid opening Notifications screen on cold start)
            // If you want a safe default, use home:
            // router.push('/(tabs)/home');
          } catch (error) {
            console.error('❌ Navigation from notification failed:', error);
          }
        }, 500);
      } catch (e) {
        console.error('[NotificationHandler] Error handling notification response:', e);
      }
    });
  } catch (e) {
    console.warn('[NotificationHandler] Failed to setup notification listeners:', e);
  }
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
  try {
    const Notifications = require('expo-notifications');
    if (Notifications && Notifications.dismissAllNotificationsAsync) {
      await Notifications.dismissAllNotificationsAsync();
    }
  } catch (e) {
    console.warn('[NotificationHandler] Failed to clear notifications:', e);
  }
}

