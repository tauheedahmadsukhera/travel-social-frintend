/**
 * Rate Limiting Utility
 * Prevents abuse of posts, comments, messages
 * Uses device storage + timestamp checks
 */

import AsyncStorage from '@/lib/storage';
import { RATE_LIMITS } from '../../config/environment';

const RATE_LIMIT_KEYS = {
  posts: 'rl_posts',
  comments: 'rl_comments',
  messages: 'rl_messages',
  follows: 'rl_follows',
};

interface RateLimitEntry {
  timestamp: number;
}

/**
 * Check if action is rate-limited
 * @param action - Type of action (posts, comments, messages)
 * @returns { allowed: boolean, nextAvailableIn: number (seconds) }
 */
export async function checkRateLimit(action: keyof typeof RATE_LIMIT_KEYS): Promise<{ allowed: boolean; nextAvailableIn: number }> {
  const now = Date.now();
  const limit = RATE_LIMITS[`${action}PerHour` as keyof typeof RATE_LIMITS] || RATE_LIMITS[`${action}PerMinute` as keyof typeof RATE_LIMITS];
  
  if (!limit) {
    return { allowed: true, nextAvailableIn: 0 };
  }

  const timeWindowMs = action === 'messages' ? 60 * 1000 : 60 * 60 * 1000; // 1min for messages, 1hr for others
  const key = RATE_LIMIT_KEYS[action];

  try {
    const stored = await AsyncStorage.getItem(key);
    const entries: RateLimitEntry[] = stored ? JSON.parse(stored) : [];

    // Remove old entries outside time window
    const recentEntries = entries.filter(e => now - e.timestamp < timeWindowMs);

    // Check if limit exceeded
    if (recentEntries.length >= limit) {
      const oldestEntry = recentEntries[0];
      const nextAvailable = Math.ceil((timeWindowMs - (now - oldestEntry.timestamp)) / 1000);
      console.warn(`⚠️ Rate limit exceeded for ${action}. Try again in ${nextAvailable}s`);
      return { allowed: false, nextAvailableIn: nextAvailable };
    }

    // Add current action
    recentEntries.push({ timestamp: now });
    await AsyncStorage.setItem(key, JSON.stringify(recentEntries));

    return { allowed: true, nextAvailableIn: 0 };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Fail open in case of storage error
    return { allowed: true, nextAvailableIn: 0 };
  }
}

/**
 * Reset rate limit for action (admin use, testing)
 */
export async function resetRateLimit(action: keyof typeof RATE_LIMIT_KEYS): Promise<void> {
  try {
    const key = RATE_LIMIT_KEYS[action];
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error resetting rate limit:', error);
  }
}

/**
 * Get remaining quota for action
 */
export async function getRateLimitStatus(action: keyof typeof RATE_LIMIT_KEYS): Promise<{ used: number; remaining: number; resetIn: number }> {
  const now = Date.now();
  const limit = RATE_LIMITS[`${action}PerHour` as keyof typeof RATE_LIMITS] || RATE_LIMITS[`${action}PerMinute` as keyof typeof RATE_LIMITS];
  
  if (!limit) {
    return { used: 0, remaining: limit || 0, resetIn: 0 };
  }

  const timeWindowMs = action === 'messages' ? 60 * 1000 : 60 * 60 * 1000;
  const key = RATE_LIMIT_KEYS[action];

  try {
    const stored = await AsyncStorage.getItem(key);
    const entries: RateLimitEntry[] = stored ? JSON.parse(stored) : [];
    const recentEntries = entries.filter(e => now - e.timestamp < timeWindowMs);
    const oldestEntry = recentEntries[0];
    const resetIn = oldestEntry ? Math.ceil((timeWindowMs - (now - oldestEntry.timestamp)) / 1000) : 0;

    return {
      used: recentEntries.length,
      remaining: Math.max(0, limit - recentEntries.length),
      resetIn,
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return { used: 0, remaining: limit || 0, resetIn: 0 };
  }
}
