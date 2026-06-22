const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { verifyToken } = require('../src/middleware/authMiddleware');

const Message = require('../src/models/Message');

// Get all messages for a conversation with populated user data
router.get('/:conversationId/messages', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;

    // 1. SECURITY: Check if user is a participant in this conversation
    const Conversation = mongoose.model('Conversation');
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    const { candidates } = await resolveUserIdentifiers(userId);

    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    }).select('participants');

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation.participants) ? conversation.participants.map(String) : [];
    const isParticipant = candidates.some(uid => participants.includes(String(uid)));

    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not a participant in this conversation' });
    }

    // 2. Fetch messages
    const messages = await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 }).lean();

    // BATCH FETCH: Get all unique sender IDs
    const senderIds = Array.from(new Set(messages.map(m => String(m.senderId))));
    
    const User = mongoose.model('User');
    const senders = await User.find({
      $or: [
        { firebaseUid: { $in: senderIds } },
        { uid: { $in: senderIds } },
        { _id: { $in: senderIds.filter(id => mongoose.Types.isValidObjectId(id) || mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } }
      ]
    }).select('displayName name username avatar photoURL profilePicture email').lean().catch(() => []);

    const userCache = {};
    senders.forEach(u => {
      if (u._id) userCache[String(u._id)] = u;
      if (u.firebaseUid) userCache[String(u.firebaseUid)] = u;
      if (u.uid) userCache[String(u.uid)] = u;
    });

    const enrichedMessages = messages.map((message) => {
      const sender = userCache[String(message.senderId)];

      return {
        ...message,
        senderName: sender?.displayName || sender?.name || (sender?.email ? sender.email.split('@')[0] : (message.senderName || 'User')),
        senderAvatar: sender?.avatar || sender?.photoURL || message.senderAvatar || null
      };
    });

    res.json({ success: true, data: enrichedMessages });
  } catch (err) {
    console.error('[GET /messages] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit a message
router.patch('/:conversationId/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId; // Use userId from verified token
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    
    // Strict ownership check
    if (String(message.senderId) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only edit your own messages' });
    }
    
    message.text = text;
    message.editedAt = new Date();
    await message.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a message
router.delete('/:conversationId/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const userId = req.userId; // Use userId from verified token
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, error: 'Message not found' });
    
    // Strict ownership check
    if (String(message.senderId) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: You can only delete your own messages' });
    }
    
    await Message.deleteOne({ _id: req.params.messageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// TODO: Add endpoints for reactions and real-time features as needed

module.exports = router;
