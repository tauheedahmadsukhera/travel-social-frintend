/**
 * Polling Service - Replace real-time listeners with efficient polling
 * Reduces Firebase costs by 70-80% at scale
 * 
 * Usage:
 * - For chat: Poll every 10-30 seconds instead of continuous listeners
 * - For notifications: Poll every 5-10 seconds
 * - For presence: Poll every 2-3 seconds
 */

import { apiService } from '@/src/_services/apiService';

export interface PollingConfig {
  interval: number; // milliseconds
  enabled: boolean;
  retryCount?: number;
  retryDelay?: number;
}

export interface PollingService {
  id: string;
  callback: (data: any) => void;
  config: PollingConfig;
  intervalId?: NodeJS.Timeout;
  lastFetch?: number;
  lastError?: string;
  retries: number;
}

const activePollers = new Map<string, PollingService>();

/**
 * Start polling for conversations (replace onSnapshot)
 * Polls every 15 seconds instead of real-time
 */
export async function startConversationsPolling(
  userId: string,
  callback: (conversations: any[]) => void,
  interval: number = 15000
) {
  const pollerId = `conversations-${userId}`;

  const poll = async () => {
    try {
      if (__DEV__) console.log(`🔄 Polling conversations for userId: ${userId}`);
      
      // Pass userId as query parameter
      const response = await apiService.get(`/conversations?userId=${userId}`);
      
      if (__DEV__) {
        console.log('📡 Conversations API summary:', {
          success: !!response?.success,
          count: Array.isArray(response?.data) ? response.data.length : 0,
        });
      }
      
      // apiService returns response.data directly, so response is { success, data: [] }
      // NOT response.data.data
      let conversations = response?.data;
      
      if (!response?.success) {
        if (__DEV__) console.warn('⚠️ API returned success:false', response?.error || 'unknown error');
        conversations = [];
      }
      
      if (!Array.isArray(conversations)) {
        if (__DEV__) console.warn('⚠️ Conversations not an array, got:', typeof conversations, JSON.stringify(conversations).substring(0, 100));
        conversations = [];
      }

      if (__DEV__) console.log(`✅ Got ${conversations.length} conversations`);
      
      // Call callback with raw conversations
      callback(conversations);
      
      // Reset retries on success
      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.retries = 0;
        poller.lastError = undefined;
      }
    } catch (error: any) {
      console.error('❌ Conversations polling error:', error.message);
      // Call callback with empty array to unblock loading
      callback([]);
      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.lastError = error.message;
        poller.retries++;
      }
    }
  };

  // Initial fetch with timeout
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Initial poll timeout')), 5000)
    );
    await Promise.race([poll(), timeoutPromise]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (__DEV__) console.warn('⚠️ Initial poll failed, will retry:', message);
    callback([]); // Unblock loading
  }

  // Set up interval for subsequent polls
  const intervalId = setInterval(poll, interval);

  activePollers.set(pollerId, {
    id: pollerId,
    callback,
    config: { interval, enabled: true },
    intervalId,
    lastFetch: Date.now(),
    retries: 0,
  });

  return () => stopPolling(pollerId);
}

/**
 * Start polling for messages (replace onSnapshot)
 * Polls every 5-10 seconds
 */
export async function startMessagesPolling(
  conversationId: string,
  callback: (messages: any[]) => void,
  interval: number = 8000
) {
  const pollerId = `messages-${conversationId}`;

  const poll = async () => {
    try {
      const response = await apiService.get(`/conversations/${conversationId}/messages`);
      
      // Unwrap response data structure
      const messages = response.data || response || [];
      
      if (!Array.isArray(messages)) {
        console.error('❌ Messages endpoint returned non-array:', typeof messages, messages);
        callback([]);
        return;
      }

      callback(messages.reverse());

      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.lastFetch = Date.now();
        poller.retries = 0;
        poller.lastError = undefined;
      }
    } catch (error: any) {
      if (__DEV__) console.error('Messages polling error:', error);
      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.lastError = error.message;
        poller.retries++;
      }
    }
  };

  // Initial fetch
  await poll();

  // Set up interval
  const intervalId = setInterval(poll, interval);

  activePollers.set(pollerId, {
    id: pollerId,
    callback,
    config: { interval, enabled: true },
    intervalId,
    lastFetch: Date.now(),
    retries: 0,
  });

  return () => stopPolling(pollerId);
}

/**
 * Start polling for notifications
 * Polls every 10 seconds
 */
export async function startNotificationsPolling(
  userId: string,
  callback: (notifications: any[]) => void,
  interval: number = 10000
) {
  const pollerId = `notifications-${userId}`;

  const poll = async () => {
    try {
      const response = await apiService.get(`/notifications/${userId}`);
      
      // Unwrap response data structure
      const notifications = response.data || response || [];
      
      if (!Array.isArray(notifications)) {
        console.error('❌ Notifications endpoint returned non-array:', typeof notifications, notifications);
        callback([]);
        return;
      }

      callback(notifications);

      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.lastFetch = Date.now();
        poller.retries = 0;
        poller.lastError = undefined;
      }
    } catch (error: any) {
      if (__DEV__) console.error('Notifications polling error:', error);
      const poller = activePollers.get(pollerId);
      if (poller) {
        poller.lastError = error.message;
        poller.retries++;
      }
    }
  };

  // Initial fetch
  await poll();

  // Set up interval
  const intervalId = setInterval(poll, interval);

  activePollers.set(pollerId, {
    id: pollerId,
    callback,
    config: { interval, enabled: true },
    intervalId,
    lastFetch: Date.now(),
    retries: 0,
  });

  return () => stopPolling(pollerId);
}

/**
 * Stop polling service
 */
export function stopPolling(pollerId: string) {
  const poller = activePollers.get(pollerId);
  if (poller?.intervalId) {
    clearInterval(poller.intervalId);
    activePollers.delete(pollerId);
  }
}

/**
 * Stop all polling services
 */
export function stopAllPolling() {
  for (const [id, poller] of activePollers) {
    if (poller.intervalId) {
      clearInterval(poller.intervalId);
    }
  }
  activePollers.clear();
}

/**
 * Get polling status
 */
export function getPollingStatus() {
  const statuses = [];
  for (const [id, poller] of activePollers) {
    statuses.push({
      id,
      enabled: poller.config.enabled,
      interval: poller.config.interval,
      lastFetch: poller.lastFetch,
      retries: poller.retries,
      lastError: poller.lastError,
    });
  }
  return statuses;
}

/**
 * Enable/disable polling globally (for battery saving)
 */
export function setPollingEnabled(enabled: boolean) {
  for (const poller of activePollers.values()) {
    poller.config.enabled = enabled;
    if (enabled && !poller.intervalId) {
      // Re-enable polling
      poller.intervalId = setInterval(() => {
        poller.callback({});
      }, poller.config.interval);
    } else if (!enabled && poller.intervalId) {
      // Disable polling
      clearInterval(poller.intervalId);
      poller.intervalId = undefined;
    }
  }
}
