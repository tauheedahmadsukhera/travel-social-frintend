import io, { Socket } from 'socket.io-client';
import { getAPIBaseURL } from '../../config/environment';
import AsyncStorage from '@/lib/storage';
import { Platform } from 'react-native';

let socket: Socket | null = null;
let currentUserId: string | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 15;

/**
 * Professional Socket.IO Service for Real-time Messaging
 * Hardened for production environments with token refresh and platform tracking.
 */
export async function initializeSocket(userId: string): Promise<Socket> {
  // If already connected for the same user, just return existing socket
  if (socket && socket.connected && currentUserId === userId) {
    return socket;
  }

  // Cleanup old state if switching users or forced re-init
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const API_BASE = getAPIBaseURL();
  const SOCKET_URL = API_BASE.replace('/api', '');
  const token = await AsyncStorage.getItem('token');

  console.log('[Socket] 🔄 Initializing connection for user:', userId);

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { 
      token: token || '',
      platform: Platform.OS,
      version: '1.2.0-industrial',
    },
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
  });

  currentUserId = userId;

  // Connection events
  socket.on('connect', () => {
    console.log('[Socket] ✅ Connected (ID: %s)', socket?.id);
    reconnectAttempts = 0;
    socket?.emit('join', userId);
  });

  socket.on('connect_error', async (error) => {
    console.warn('[Socket] ⚠️ Connection error:', error.message);
    reconnectAttempts++;

    // Critical: If auth failed, try to refresh the token for the next attempt
    if (error.message === 'Unauthorized' || error.message.includes('auth')) {
      console.log('[Socket] 🔑 Auth error detected, refreshing token metadata...');
      const newToken = await AsyncStorage.getItem('token');
      if (socket && newToken) {
        socket.auth = { ...socket.auth, token: newToken };
      }
    }

    if (reconnectAttempts === 5) {
      console.log('[Socket] 📉 Switching to polling fallback...');
      if (socket) socket.io.opts.transports = ['polling', 'websocket'];
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] ❌ Disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server kicked us, try to reconnect manually
      socket?.connect();
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('[Socket] 🔄 Reconnect attempt #%d', attempt);
  });

  socket.on('socketAuthError', (payload) => {
    console.error('[Socket] 🚫 Auth Rejected:', payload?.message || payload);
    // You could trigger a logout here if the token is permanently invalid
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
    const mConvoId = String(message.conversationId || '');
    const targetId = String(conversationId || '');
    
    if (mConvoId === targetId || targetId.includes(mConvoId) || mConvoId.includes(targetId)) {
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

/**
 * Subscribe to user status updates (online/offline)
 */
export function subscribeToUserStatus(
  onStatusUpdate: (data: { userId: string; status: 'online' | 'offline'; lastSeen?: string }) => void
): () => void {
  if (!socket) return () => {};

  const handler = (data: any) => {
    onStatusUpdate(data);
  };

  socket.on('userStatusUpdate', handler);

  return () => {
    socket?.off('userStatusUpdate', handler);
  };
}

/**
 * Explicitly request a user's current status
 */
export function requestUserStatus(userId: string) {
  if (!socket || !socket.connected) return;
  socket.emit('requestUserStatus', userId);
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
