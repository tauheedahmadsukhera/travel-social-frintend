/**
 * Chat Polling Service - Replaces expensive onSnapshot listeners
 * 
 * Cost Comparison:
 * - onSnapshot: 1 read per message per user (expensive!)
 * - Polling: 1 read per 10 seconds per user (90% cheaper!)
 */

import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface PollingConfig {
  interval: number; // milliseconds
  enabled: boolean;
}

class ChatPollingService {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private config: PollingConfig = {
    interval: 10000, // 10 seconds default
    enabled: true,
  };

  /**
   * Start polling conversations for a user
   */
  startConversationsPolling(
    userId: string,
    callback: (conversations: any[]) => void,
    intervalMs: number = this.config.interval
  ): () => void {
    if (!this.config.enabled) {
      console.log('⚠️ Polling disabled, skipping...');
      return () => {};
    }

    const key = `conversations-${userId}`;

    // Clear existing interval if any
    this.stopPolling(key);

    // Fetch immediately
    this.fetchConversations(userId, callback);

    // Then poll at interval
    const intervalId = setInterval(() => {
      this.fetchConversations(userId, callback);
    }, intervalMs);

    this.intervals.set(key, intervalId);

    // Return cleanup function
    return () => this.stopPolling(key);
  }

  /**
   * Start polling messages for a conversation
   */
  startMessagesPolling(
    conversationId: string,
    callback: (messages: any[]) => void,
    intervalMs: number = 5000 // 5 seconds for active chat
  ): () => void {
    if (!this.config.enabled) {
      console.log('⚠️ Polling disabled, skipping...');
      return () => {};
    }

    const key = `messages-${conversationId}`;

    // Clear existing interval if any
    this.stopPolling(key);

    // Fetch immediately
    this.fetchMessages(conversationId, callback);

    // Then poll at interval
    const intervalId = setInterval(() => {
      this.fetchMessages(conversationId, callback);
    }, intervalMs);

    this.intervals.set(key, intervalId);

    // Return cleanup function
    return () => this.stopPolling(key);
  }

  /**
   * Fetch conversations (replaces onSnapshot)
   */
  private async fetchConversations(userId: string, callback: (conversations: any[]) => void) {
    try {
      const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc'),
        limit(50) // Limit to reduce reads
      );

      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      callback(conversations);
    } catch (error) {
      console.error('❌ Error fetching conversations:', error);
    }
  }

  /**
   * Fetch messages (replaces onSnapshot)
   */
  private async fetchMessages(conversationId: string, callback: (messages: any[]) => void) {
    try {
      const messagesRef = collection(db, 'conversations', conversationId, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50));

      const snapshot = await getDocs(q);
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      callback(messages);
    } catch (error) {
      console.error('❌ Error fetching messages:', error);
    }
  }

  /**
   * Stop polling for a specific key
   */
  private stopPolling(key: string) {
    const intervalId = this.intervals.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(key);
      console.log(`✅ Stopped polling: ${key}`);
    }
  }

  /**
   * Stop all polling
   */
  stopAll() {
    this.intervals.forEach((intervalId, key) => {
      clearInterval(intervalId);
      console.log(`✅ Stopped polling: ${key}`);
    });
    this.intervals.clear();
  }

  /**
   * Update polling interval
   */
  setInterval(intervalMs: number) {
    this.config.interval = intervalMs;
  }

  /**
   * Enable/disable polling
   */
  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }
}

// Singleton instance
export const chatPollingService = new ChatPollingService();

