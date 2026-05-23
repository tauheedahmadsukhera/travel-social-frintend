/**
 * Real-time DM handlers (Socket.IO).
 * Security: JWT handshake, sender identity from token, conversation membership checks.
 */
const jwt = require('jsonwebtoken');
const { getJwtSecretOrNull } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { sendMessageSchema } = require('../validations/messageValidation');

function registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser }) {
  const connectedUsers = new Map();
  const lastEventAtBySocket = new Map();

  const now = () => Date.now();

  // Helper to broadcast status changes to active chat participants only (avoids O(N) broadcast storm)
  async function broadcastUserStatus(userId, status) {
    try {
      const Conversation = mongoose.model('Conversation');
      // Retrieve conversation participants
      const userConversations = await Conversation.find({ participants: userId }, 'participants').lean();
      const contactIds = new Set();
      for (const convo of userConversations) {
        for (const p of convo.participants) {
          const pStr = String(p);
          if (pStr !== String(userId)) {
            contactIds.add(pStr);
          }
        }
      }

      const updatePayload = {
        userId,
        status,
        lastSeen: status === 'offline' ? new Date() : undefined
      };

      // Emit userStatusUpdate to each active chat participant's room
      for (const contactId of contactIds) {
        io.to(`user_${contactId}`).emit('userStatusUpdate', updatePayload);
      }

      // Sync status across user's own connected devices
      io.to(`user_${userId}`).emit('userStatusUpdate', updatePayload);
      
      logger.debug('[Socket] Broadcasted status update "%s" for user %s to %d contacts', status, userId, contactIds.size);
    } catch (err) {
      logger.error('[Socket] Failed to broadcast user status for %s: %s', userId, err.message);
    }
  }
  const clampText = (v, max) => {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    return s.length > max ? s.slice(0, max) : s;
  };

  /**
   * Performance monitoring wrapper for socket events
   */
  function trackEvent(socket, eventName, handler) {
    return async (...args) => {
      const start = now();
      try {
        await handler(...args);
        const duration = now() - start;
        if (duration > 100) { // Log slow events (>100ms)
          logger.warn('⏱️ Slow Socket Event [%s]: %dms (socket: %s, user: %s)', 
            eventName, duration, socket.id, socket.data?.authUserId || 'anonymous');
        }
      } catch (err) {
        logger.error('❌ Socket Event Error [%s]: %s', eventName, err.message, { stack: err.stack });
        socket.emit('error', { message: 'Internal server error' });
      }
    };
  }

  function allowEvent(socketId, key, minGapMs) {
    const t = now();
    const bucket = lastEventAtBySocket.get(socketId) || {};
    const last = bucket[key] || 0;
    if (t - last < minGapMs) return false;
    bucket[key] = t;
    lastEventAtBySocket.set(socketId, bucket);
    return true;
  }

  const findConversation = async (conversationId) => {
    if (!conversationId) return null;
    const Conversation = mongoose.model('Conversation');
    return Conversation.findOne({
      $or: [
        { conversationId: String(conversationId) },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
      ],
    });
  };

  /**
   * Optimized User Identity Resolver
   * Prefers MongoDB _id as the source of truth.
   */
  async function resolveUserIdVariants(userId) {
    if (!userId) return [];
    const id = String(userId).trim();
    const User = mongoose.model('User');
    const out = new Set([id]);
    
    try {
      let user;
      if (mongoose.Types.ObjectId.isValid(id)) {
        user = await User.findById(id).select('_id firebaseUid uid');
      } else {
        user = await User.findOne({ $or: [{ firebaseUid: id }, { uid: id }] }).select('_id firebaseUid uid');
      }

      if (user) {
        if (user._id) out.add(String(user._id));
        if (user.firebaseUid) out.add(user.firebaseUid);
        if (user.uid) out.add(user.uid);
      }
    } catch (e) {
      logger.debug('Failed to resolve user variants for %s: %s', id, e.message);
    }
    return Array.from(out);
  }

  async function isConversationMember(convo, authUserId) {
    if (!convo || !authUserId) return false;
    const variants = await resolveUserIdVariants(authUserId);
    const parts = (convo.participants || []).map(String);
    return variants.some((v) => parts.includes(v));
  }

  async function assertMessagingAllowed(convo, authUserId, recipientId) {
    if (!(await isConversationMember(convo, authUserId))) return false;
    const recipVars = await resolveUserIdVariants(recipientId);
    const parts = (convo.participants || []).map(String);
    return recipVars.some((v) => parts.includes(v));
  }

  const jwtSecret = getJwtSecretOrNull();
  if (jwtSecret) {
    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
          logger.warn('🔌 Unauthorized socket attempt: Missing token (socket: %s)', socket.id);
          return next(new Error('Unauthorized'));
        }
        const decoded = jwt.verify(String(token), jwtSecret);
        const uid = String(decoded.userId || '').trim();
        if (!uid) return next(new Error('Unauthorized'));
        socket.data.authUserId = uid;
        socket.data.authEmail = decoded.email;
        return next();
      } catch (err) {
        logger.error('🔌 Socket JWT Verification Failed: %s', err.message);
        return next(new Error('Unauthorized'));
      }
    });
    logger.info('✅ Socket.IO JWT handshake enabled');
  } else {
    logger.warn('⚠️ Socket.IO JWT handshake disabled (JWT_SECRET unset) — not safe for production');
  }

  io.on('connection', (socket) => {
    logger.info('🔌 Socket connected: %s (remote: %s)', socket.id, socket.handshake.address);

    socket.on('join', trackEvent(socket, 'join', async (claimedUserId) => {
      const authId = socket.data.authUserId;
      if (jwtSecret) {
        if (!authId) {
          socket.emit('socketAuthError', { code: 'UNAUTHORIZED', message: 'Missing valid session' });
          return;
        }
        if (claimedUserId != null && String(claimedUserId) !== String(authId)) {
          logger.warn('👤 User Mismatch: Socket %s tried to join as %s but token says %s', socket.id, claimedUserId, authId);
          socket.emit('socketAuthError', { code: 'USER_MISMATCH', message: 'Token does not match join user' });
          return;
        }
        connectedUsers.set(authId, socket.id);
        socket.userId = authId;
        
        const variants = await resolveUserIdVariants(authId);
        for (const v of variants) {
          socket.join(`user_${v}`);
        }
        
        logger.info(`👤 User ${authId} joined (variants: ${variants.join(', ')}) with socket ${socket.id}`);
        socket.emit('connected', { userId: authId, socketId: socket.id });
        
        broadcastUserStatus(authId, 'online');

        const User = mongoose.model('User');
        User.updateOne({ _id: toObjectId(authId) }, { isOnline: true, lastSeen: new Date() }).catch(() => {});
        return;
      }
      
      if (claimedUserId) {
        connectedUsers.set(String(claimedUserId), socket.id);
        socket.userId = String(claimedUserId);
        
        const variants = await resolveUserIdVariants(claimedUserId);
        for (const v of variants) {
          socket.join(`user_${v}`);
        }
        socket.emit('connected', { userId: claimedUserId, socketId: socket.id });
        broadcastUserStatus(String(claimedUserId), 'online');

        const User = mongoose.model('User');
        User.updateOne(
          { $or: [{ firebaseUid: String(claimedUserId) }, { uid: String(claimedUserId) }, { _id: toObjectId(claimedUserId) }] },
          { isOnline: true, lastSeen: new Date() }
        ).catch(() => {});
      }
    }));

    socket.on('requestUserStatus', (targetUserId) => {
      const isOnline = connectedUsers.has(String(targetUserId));
      socket.emit('userStatusUpdate', { 
        userId: targetUserId, 
        status: isOnline ? 'online' : 'offline',
        lastSeen: isOnline ? null : new Date()
      });
    });

    socket.on('subscribeToConversation', trackEvent(socket, 'subscribeToConversation', async (conversationId) => {
      if (!conversationId) return;
      const authId = jwtSecret ? socket.data.authUserId : socket.userId;
      if (jwtSecret && !authId) return;

      const convo = await findConversation(conversationId);
      if (!convo || (jwtSecret && !(await isConversationMember(convo, authId)))) {
        logger.warn('🚫 Forbidden subscription attempt: User %s to Conversation %s', authId, conversationId);
        socket.emit('socketAuthError', { code: 'FORBIDDEN', message: 'Cannot subscribe to this thread' });
        return;
      }
      const roomId = convo.conversationId || String(conversationId);
      socket.join(roomId);
      socket.join(String(conversationId));
      logger.info(`📬 Socket ${socket.id} subscribed to conversation: ${roomId}`);
    }));

    socket.on('unsubscribeFromConversation', (conversationId) => {
      if (conversationId) {
        socket.leave(conversationId);
        logger.info(`📭 Socket ${socket.id} unsubscribed from conversation: ${conversationId}`);
      }
    });

    socket.on('sendMessage', trackEvent(socket, 'sendMessage', async (data) => {
      if (!allowEvent(socket.id, 'sendMessage', 250)) {
        return socket.emit('messageError', { error: 'Too many messages. Slow down.' });
      }
      const validation = sendMessageSchema.safeParse({ body: data });
      if (!validation.success) {
        return socket.emit('messageError', { error: 'Invalid message payload', details: validation.error.format() });
      }

      let { conversationId, senderId, recipientId, text, timestamp } = data || {};
      const authId = jwtSecret ? socket.data.authUserId : senderId;
      if (jwtSecret && !authId) {
        return socket.emit('messageError', { error: 'Unauthorized' });
      }
      if (jwtSecret) senderId = authId;

      const convo = await findConversation(conversationId);
      if (!convo) {
        return socket.emit('messageError', { error: 'Conversation not found' });
      }
      if (jwtSecret && !(await assertMessagingAllowed(convo, authId, recipientId))) {
        logger.warn('🚫 Forbidden sendMessage: User %s to Recipient %s in Convo %s', authId, recipientId, conversationId);
        return socket.emit('messageError', { error: 'Forbidden' });
      }

      const messageId = new mongoose.Types.ObjectId();
      const message = {
        id: messageId.toString(),
        senderId,
        recipientId,
        text,
        timestamp: timestamp || new Date(),
        read: false,
        delivered: false,
      };

      const actualConversationId = convo.conversationId || String(convo._id);
      convo.messages.push(message);
      convo.lastMessage = text;
      convo.lastMessageAt = new Date();
      await convo.save();

      try {
        const Message = mongoose.model('Message');
        await Message.create({
          _id: messageId,
          id: messageId.toString(),
          conversationId: actualConversationId,
          senderId,
          recipientId,
          text,
          timestamp: message.timestamp,
          read: false,
          delivered: false,
        });
      } catch (e) {
        logger.warn('⚠️ Message collection write failed: %s', e.message);
      }

      io.to(actualConversationId).emit('newMessage', { ...message, conversationId: actualConversationId });

      const recipVariants = await resolveUserIdVariants(recipientId);
      for (const rv of recipVariants) {
        if (String(rv) !== String(senderId)) {
          io.to(`user_${rv}`).emit('newMessage', { ...message, conversationId: actualConversationId });
        }
      }
      
      socket.emit('messageSent', { ...message, conversationId: actualConversationId });

      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        message.delivered = true;
        await convo.save();
        socket.emit('messageDelivered', { messageId: message.id, conversationId: actualConversationId });
      } else {
        try {
          const User = mongoose.model('User');
          const senderUser = mongoose.Types.ObjectId.isValid(String(senderId))
            ? await User.findOne({ _id: toObjectId(senderId) })
            : null;
          const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
          const preview = typeof text === 'string' ? text.trim().slice(0, 120) : 'Sent you a message';
          sendExpoPushToUser(recipientId, {
            title: `💌 ${senderName}`,
            body: preview || 'Sent you a message',
            data: {
              type: 'message',
              senderId: String(senderId),
              recipientId: String(recipientId),
              conversationId: String(actualConversationId),
            },
          }).catch(() => {});
        } catch (e) {
          logger.warn('⚠️ Message push skipped: %s', e.message);
        }
      }
    }));

    socket.on('markAsRead', trackEvent(socket, 'markAsRead', async (data) => {
      if (!allowEvent(socket.id, 'markAsRead', 150)) return;
      const { conversationId, messageId, userId } = data || {};
      const authId = jwtSecret ? socket.data.authUserId : userId;
      if (jwtSecret && !authId) return;

      const convo = await findConversation(conversationId);
      if (convo) {
        if (jwtSecret && !(await isConversationMember(convo, authId))) return;

        const message = convo.messages.find((m) => m.id === messageId);
        if (!message) return;

        if (jwtSecret) {
          const variants = await resolveUserIdVariants(authId);
          if (!variants.includes(String(message.recipientId))) return;
        } else if (message.recipientId !== userId) {
          return;
        }

        message.read = true;
        await convo.save();

        const senderSocketId = connectedUsers.get(message.senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messageRead', { messageId, conversationId });
        }
      }
    }));

    socket.on('typing', trackEvent(socket, 'typing', async (data) => {
      const { conversationId, userId, recipientId } = data || {};
      if (!allowEvent(socket.id, 'typing', 250)) return;
      const authId = jwtSecret ? socket.data.authUserId : userId;
      if (jwtSecret && authId) {
        const variants = await resolveUserIdVariants(authId);
        if (!variants.includes(String(userId))) return;
        const convo = await findConversation(conversationId);
        if (!convo || !(await isConversationMember(convo, authId))) return;
      }
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userTyping', { conversationId, userId });
      }
    }));

    socket.on('stopTyping', trackEvent(socket, 'stopTyping', async (data) => {
      const { conversationId, userId, recipientId } = data || {};
      if (!allowEvent(socket.id, 'stopTyping', 250)) return;
      const authId = jwtSecret ? socket.data.authUserId : userId;
      if (jwtSecret && authId) {
        const variants = await resolveUserIdVariants(authId);
        if (!variants.includes(String(userId))) return;
        const convo = await findConversation(conversationId);
        if (!convo || !(await isConversationMember(convo, authId))) return;
      }
      const recipientSocketId = connectedUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('userStoppedTyping', { conversationId, userId });
      }
    }));

    socket.on('sendMediaMessage', trackEvent(socket, 'sendMediaMessage', async (data) => {
      if (!allowEvent(socket.id, 'sendMediaMessage', 400)) {
        return socket.emit('messageError', { error: 'Too many messages. Slow down.' });
      }
      let {
        conversationId,
        senderId,
        recipientId,
        mediaUrl,
        mediaType,
        audioUrl,
        audioDuration,
        text,
        thumbnailUrl,
        tempId,
      } = data || {};

      if (!conversationId || !recipientId) {
        return socket.emit('messageError', { error: 'Invalid message payload' });
      }
      text = clampText(text || '', 4000);
      mediaType = clampText(String(mediaType || ''), 20);
      mediaUrl = clampText(String(mediaUrl || ''), 2000);
      audioUrl = clampText(String(audioUrl || ''), 2000);
      thumbnailUrl = clampText(String(thumbnailUrl || ''), 2000);
      
      if (!mediaType || (!mediaUrl && !audioUrl)) {
        return socket.emit('messageError', { error: 'Invalid media payload' });
      }
      const authId = jwtSecret ? socket.data.authUserId : senderId;
      if (jwtSecret && !authId) {
        return socket.emit('messageError', { error: 'Unauthorized' });
      }
      if (jwtSecret) senderId = authId;

      const convo = await findConversation(conversationId);
      if (!convo) {
        return socket.emit('messageError', { error: 'Conversation not found' });
      }
      if (jwtSecret && !(await assertMessagingAllowed(convo, authId, recipientId))) {
        logger.warn('🚫 Forbidden sendMediaMessage: User %s to Recipient %s in Convo %s', authId, recipientId, conversationId);
        return socket.emit('messageError', { error: 'Forbidden' });
      }

      const messageId = new mongoose.Types.ObjectId();
      const message = {
        id: messageId.toString(),
        senderId,
        recipientId,
        text: text || '',
        mediaType,
        mediaUrl,
        audioUrl,
        audioDuration,
        thumbnailUrl,
        timestamp: new Date(),
        read: false,
        delivered: false,
        readBy: [senderId],
        tempId,
      };

      const actualConversationId = convo.conversationId || String(convo._id);
      convo.messages.push(message);
      convo.lastMessage = `[${mediaType?.toUpperCase()}]`;
      convo.lastMessageAt = new Date();
      await convo.save();

      try {
        const Message = mongoose.model('Message');
        await Message.create({
          _id: messageId,
          id: messageId.toString(),
          conversationId: actualConversationId,
          senderId,
          recipientId,
          text: text || '',
          mediaType,
          mediaUrl,
          audioUrl,
          audioDuration,
          thumbnailUrl,
          timestamp: message.timestamp,
          read: false,
          delivered: false,
          readBy: [senderId],
          tempId,
        });
      } catch (e) {
        logger.warn('⚠️ Media Message collection write failed: %s', e.message);
      }

      const emitPayload = { ...message, conversationId: actualConversationId };
      io.to(actualConversationId).emit('newMessage', emitPayload);
      
      const recipVariantsMedia = await resolveUserIdVariants(recipientId);
      for (const rv of recipVariantsMedia) {
        if (String(rv) !== String(senderId)) {
          io.to(`user_${rv}`).emit('newMessage', emitPayload);
        }
      }

      socket.emit('newMediaMessage', emitPayload); 

      try {
        const recipientSocketId = connectedUsers.get(recipientId);
        if (!recipientSocketId) {
          const User = mongoose.model('User');
          const senderUser = mongoose.Types.ObjectId.isValid(String(senderId))
            ? await User.findOne({ _id: toObjectId(senderId) })
            : null;
          const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
          const kind = String(mediaType || '').toLowerCase();
          const body =
            kind === 'audio'
              ? 'Sent you a voice message'
              : kind === 'video'
                ? 'Sent you a video'
                : 'Sent you a photo';

          sendExpoPushToUser(recipientId, {
            title: `💌 ${senderName}`,
            body,
            data: {
              type: 'message',
              senderId: String(senderId),
              recipientId: String(recipientId),
              conversationId: String(actualConversationId),
            },
          }).catch(() => {});
        }
      } catch (e) {
        logger.warn('⚠️ Media push skipped: %s', e.message);
      }
    }));

    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        logger.info(`👋 User ${socket.userId} disconnected (socket: ${socket.id})`);
        broadcastUserStatus(socket.userId, 'offline');

        const User = mongoose.model('User');
        User.updateOne({ _id: toObjectId(socket.userId) }, { isOnline: false, lastSeen: new Date() }).catch(() => {});
      }
      lastEventAtBySocket.delete(socket.id);
    });
  });

  logger.info('✅ Socket.IO event handlers registered with performance monitoring');
}

module.exports = { registerMessagingSocket };
