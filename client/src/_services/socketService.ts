/**
 * Professional Socket.IO Service for Real-time Messaging
 * Instagram-like features: delivery status, read receipts, typing indicators
 */

import io, { Socket } from 'socket.io-client';
import { getAPIBaseURL } from '../../config/environment';
import AsyncStorage from '@react-native-async-storage/async-storage';

let socket: Socket | null = null;
let currentUserId: string | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20;

/**
 * Initialize socket connection
 */
export function initializeSocket(userId: string): Socket {
  if (socket && socket.connected && currentUserId === userId) {
    console.log('[Socket] Already connected for user:', userId);
    return socket;
  }

  if (socket && currentUserId === userId && !socket.connected) {
    console.log('[Socket] Recreating disconnected socket for user:', userId);
    socket.disconnect();
    socket = null;
    currentUserId = null;
  }

  // Disconnect existing socket if different user
  if (socket && currentUserId !== userId) {
    console.log('[Socket] Disconnecting previous user:', currentUserId);
    socket.disconnect();
  }

  const API_BASE = getAPIBaseURL();
  const SOCKET_URL = API_BASE.replace('/api', ''); // Remove /api suffix

  console.log('[Socket] Connecting to:', SOCKET_URL, 'for user:', userId);

  socket = io(SOCKET_URL, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 30000,
    autoConnect: true,
    forceNew: true,
    rememberUpgrade: false,
    withCredentials: false,
  });

  currentUserId = userId;

  // Connection events
  socket.on('connect', () => {
    console.log('[Socket] ✅ Connected:', socket?.id);
    reconnectAttempts = 0;

    // Join with userId
    socket?.emit('join', userId);
  });

  socket.on('connected', (data) => {
    console.log('[Socket] 👤 Joined as:', data.userId);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] ❌ Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
    reconnectAttempts++;

    // Force websocket retry after a few polling failures.
    if (socket && reconnectAttempts === 3) {
      try {
        socket.io.opts.transports = ['websocket', 'polling'];
      } catch {
        // best effort
      }
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[Socket] Max reconnection attempts reached');
    }
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[Socket] 🔄 Reconnected after', attemptNumber, 'attempts');
    socket?.emit('join', userId);
  });

  return socket;
}

/**
 * Get current socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket) {
    console.log('[Socket] Disconnecting...');
    socket.disconnect();
    socket = null;
    currentUserId = null;
  }
}

/**
 * Send message with delivery tracking
 */
export function sendMessage(data: {
  conversationId: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp?: Date;
}) {
  if (!socket || !socket.connected) {
    console.warn('[Socket] Cannot send message - not connected. Message will be sent via API only.');
    return; // Graceful fallback - API will handle it
  }

  console.log('[Socket] 📤 Sending message:', {
    conversationId: data.conversationId,
    text: data.text.substring(0, 30)
  });

  socket.emit('sendMessage', {
    ...data,
    timestamp: data.timestamp || new Date()
  });
}

/**
 * Subscribe to a conversation room
 */
export function subscribeToConversation(conversationId: string) {
  if (!socket || !socket.connected) {
    console.warn('[Socket] Cannot subscribe to conversation - not connected');
    return;
  }

  console.log('[Socket] 📬 Subscribing to conversation:', conversationId);
  socket.emit('subscribeToConversation', conversationId);
}

/**
 * Unsubscribe from a conversation room
 */
export function unsubscribeFromConversation(conversationId: string) {
  if (!socket || !socket.connected) {
    return;
  }

  console.log('[Socket] 📭 Unsubscribing from conversation:', conversationId);
  socket.emit('unsubscribeFromConversation', conversationId);
}

/**
 * Subscribe to new messages
 */
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: any) => void
): () => void {
  if (!socket) {
    console.warn('[Socket] Cannot subscribe - socket not initialized. Messages will still work via API polling.');
    return () => {};
  }

  // Subscribe to conversation room
  subscribeToConversation(conversationId);

  const handler = (message: any) => {
    if (message.conversationId === conversationId) {
      console.log('[Socket] 📥 New message received:', message.text?.substring(0, 30));
      onMessage(message);
    }
  };

  socket.on('newMessage', handler);

  return () => {
    socket?.off('newMessage', handler);
    unsubscribeFromConversation(conversationId);
  };
}

/**
 * Subscribe to message sent confirmation
 */
export function subscribeToMessageSent(
  onMessageSent: (message: any) => void
): () => void {
  if (!socket) return () => {};

  socket.on('messageSent', onMessageSent);

  return () => {
    socket?.off('messageSent', onMessageSent);
  };
}

/**
 * Subscribe to message delivered status
 */
export function subscribeToMessageDelivered(
  onDelivered: (data: { messageId: string; conversationId: string }) => void
): () => void {
  if (!socket) return () => {};

  socket.on('messageDelivered', onDelivered);

  return () => {
    socket?.off('messageDelivered', onDelivered);
  };
}

/**
 * Subscribe to message read status
 */
export function subscribeToMessageRead(
  onRead: (data: { messageId: string; conversationId: string }) => void
): () => void {
  if (!socket) return () => {};

  socket.on('messageRead', onRead);

  return () => {
    socket?.off('messageRead', onRead);
  };
}

/**
 * Mark message as read
 */
export function markMessageAsRead(data: {
  conversationId: string;
  messageId: string;
  userId: string;
}) {
  if (!socket || !socket.connected) return;

  console.log('[Socket] 👁️ Marking as read:', data.messageId);
  socket.emit('markAsRead', data);
}

/**
 * Send typing indicator
 */
export function sendTypingIndicator(data: {
  conversationId: string;
  userId: string;
  recipientId: string;
}) {
  if (!socket || !socket.connected) return;

  socket.emit('typing', data);
}

/**
 * Stop typing indicator
 */
export function stopTypingIndicator(data: {
  conversationId: string;
  userId: string;
  recipientId: string;
}) {
  if (!socket || !socket.connected) return;

  socket.emit('stopTyping', data);
}

/**
 * Subscribe to typing indicators
 */
export function subscribeToTyping(
  conversationId: string,
  onTyping: (data: { userId: string }) => void,
  onStopTyping: (data: { userId: string }) => void
): () => void {
  if (!socket) return () => {};

  const typingHandler = (data: any) => {
    if (data.conversationId === conversationId) {
      onTyping(data);
    }
  };

  const stopTypingHandler = (data: any) => {
    if (data.conversationId === conversationId) {
      onStopTyping(data);
    }
  };

  socket.on('userTyping', typingHandler);
  socket.on('userStoppedTyping', stopTypingHandler);

  return () => {
    socket?.off('userTyping', typingHandler);
    socket?.off('userStoppedTyping', stopTypingHandler);
  };
}

export function subscribeToLiveStream(streamId: string, onUserJoined: (data: any) => void, onUserLeft: (data: any) => void, onLiveComment: (comment: any) => void) {
  if (!socket) {
    return () => {};
  }
  socket.emit('joinLiveStream', streamId);
  socket.on('userJoined', onUserJoined);
  socket.on('userLeft', onUserLeft);
  socket.on('newLiveComment', onLiveComment);
  return () => {
    if (!socket) return;
    socket.emit('leaveLiveStream', streamId);
    socket.off('userJoined', onUserJoined);
    socket.off('userLeft', onUserLeft);
    socket.off('newLiveComment', onLiveComment);
  };
}

export function sendLiveComment(streamId: string, comment: any) {
  if (!socket) return;
  socket.emit('sendLiveComment', { streamId, comment });
}

export default function SocketService() {
  return null;
}
