/**
 * User Presence & Activity Status Management
 * Tracks when users are online, typing, active in DM, etc.
 */

import { apiService } from '@/src/_services/apiService';
import { db, doc, updateDoc } from './firebaseCompatibility';
import { AppState } from 'react-native';

export interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeen: Date;
  activeInConversation?: string; // conversationId if currently in DM
  typing?: boolean;
}

/**
 * Update user presence when they open app or start messaging
 */
export async function updateUserPresence(userId: string, conversationId?: string) {
  try {
    await apiService.post('/presence/online', {
      userId,
      conversationId: conversationId || null,
    });
  } catch (error) {
    // Presence is best-effort in this backend.
  }
}

/**
 * Mark user as offline when they close app or leave conversation
 */
export async function updateUserOffline(userId: string) {
  try {
    await apiService.post('/presence/offline', { userId });
  } catch (error) {
    // Presence is best-effort in this backend.
  }
}

/**
 * Subscribe to user's online status - returns real-time updates
 */
export function subscribeToUserPresence(userId: string, callback: (presence: UserPresence | null) => void) {
  if (!userId) {
    callback(null);
    return () => {};
  }

  let cancelled = false;
  let intervalId: any = null;

  const refreshPresence = async () => {
    if (cancelled) return;
    const presence = await getUserPresence(userId);
    if (!cancelled) {
      callback(presence);
    }
  };

  const start = () => {
    if (intervalId) return;
    void refreshPresence();
    intervalId = setInterval(refreshPresence, 15000);
  };
  const stop = () => {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  };

  // Foreground-only presence polling
  start();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') start();
    else stop();
  });

  return () => {
    cancelled = true;
    stop();
    sub.remove();
  };
}

/**
 * Get user's online status (one-time read)
 */
export async function getUserPresence(userId: string): Promise<UserPresence | null> {
  try {
    const data = await apiService.get(`/presence/${userId}`);
    if (!data) return null;
    return {
      userId,
      isOnline: !!data.isOnline,
      lastSeen: data.lastSeen ? new Date(data.lastSeen) : new Date(),
      activeInConversation: data.activeInConversation,
      typing: !!data.typing,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get formatted active status text for display
 * e.g., "Active now", "Active 5m ago", "Active yesterday"
 */
export function getFormattedActiveStatus(presence: UserPresence | null): string {
  if (!presence) return 'Offline';
  
  if (presence.isOnline) {
    return 'Active now';
  }

  const now = new Date();
  const lastSeen = new Date(presence.lastSeen);
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Active now';
  } else if (diffMins < 60) {
    return `Active ${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `Active ${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'Active yesterday';
  } else if (diffDays < 30) {
    return `Active ${diffDays}d ago`;
  } else {
    return 'Offline';
  }
}

/**
 * Update typing status in conversation
 */
export async function updateTypingStatus(userId: string, conversationId: string, isTyping: boolean) {
  try {
    const presenceRef = doc(db, 'presence', userId);
    await updateDoc(presenceRef, {
      typing: isTyping,
      activeInConversation: conversationId,
    });
  } catch (error) {
    if (__DEV__) console.error('Error updating typing status:', error);
  }
}
