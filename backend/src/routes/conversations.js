const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const logger = require('../utils/logger');

const { verifyToken } = require('../middleware/authMiddleware');
const { resolveUserIdentifiers } = require('../utils/userUtils');
const validate = require('../middleware/validateMiddleware');
const { sendMessageSchema, createConversationSchema } = require('../validations/messageValidation');

// Get the Conversation model (already defined in models/Conversation.js and required in index.js)


const findConversationByAnyId = async (id) => {
  if (!id) return null;
  return Conversation.findOne({
    $or: [
      { conversationId: String(id) },
      { _id: mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null }
    ]
  });
};

const isStrictLegacyPairConversationId = (value) => {
  const id = String(value || '');
  if (!id || id.startsWith('grp_')) return false;
  const parts = id.split('_');
  if (parts.length !== 2) return false;
  const [a, b] = parts;
  // Only treat as pair key for legacy Mongo-style IDs to avoid underscore ID collisions.
  return mongoose.Types.ObjectId.isValid(a) && mongoose.Types.ObjectId.isValid(b);
};

const normalizeParticipantIds = async (ids) => {
  const User = mongoose.model('User');
  const out = new Set();
  const rawIds = (Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean);
  
  const objectIds = rawIds.filter(id => mongoose.Types.ObjectId.isValid(id));
  const otherIds = rawIds.filter(id => !mongoose.Types.ObjectId.isValid(id));

  // Add valid ObjectIds directly
  objectIds.forEach(id => out.add(id));

  if (otherIds.length > 0) {
    const users = await User.find({
      $or: [{ firebaseUid: { $in: otherIds } }, { uid: { $in: otherIds } }]
    }).select('_id firebaseUid uid').lean();
    
    users.forEach(u => out.add(String(u._id)));
    // Keep track of IDs that weren't found as canonical IDs
    const foundAltIds = new Set([...users.map(u => String(u.firebaseUid)), ...users.map(u => String(u.uid))]);
    otherIds.forEach(id => { if (!foundAltIds.has(id)) out.add(id); });
  }

  return Array.from(out);
};

const resolveUserIdVariants = async (id) => {
  const result = await resolveUserIdentifiers(id);
  return result.candidates;
};

const findThreadConversations = async (conversation) => {
  const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
  if (participants.length !== 2) return [conversation];

  const aIds = await resolveUserIdVariants(participants[0]);
  const bIds = await resolveUserIdVariants(participants[1]);

  return Conversation.find({
    $and: [
      { participants: { $in: aIds } },
      { participants: { $in: bIds } },
      { $expr: { $eq: [{ $size: '$participants' }, 2] } }
    ]
  });
};

// Get conversations for user with populated participant data
router.get('/', verifyToken, async (req, res) => {
  try {
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const userId = userIdFromToken;

    // Pagination support (P1 fix: prevent loading ALL conversations at once)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = Math.max(0, parseInt(req.query.skip) || 0);

    logger.info('[GET] /conversations - Fetching for userId: %s (skip=%d, limit=%d)', userId, skip, limit);

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatchSet = new Set([String(userId)]);
    if (firebaseUidFromToken) idsToMatchSet.add(String(firebaseUidFromToken));

    try {
      const resolved = await resolveUserIdVariants(String(userId));
      for (const rid of (resolved || [])) {
        if (rid) idsToMatchSet.add(String(rid));
      }
    } catch (e) {
      logger.warn('[GET] /conversations - resolveUserIdVariants failed: %s', e?.message || e);
    }

    const idsToMatch = Array.from(idsToMatchSet);
    const objectIdsToMatch = idsToMatch.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

    const conversations = await Conversation.find({
      $or: [
        { participants: { $in: idsToMatch } },
        { participants: { $in: objectIdsToMatch } }
      ],
      deletedBy: { $nin: idsToMatch }
    }).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean();
    
    logger.info('[GET] /conversations - Found %d conversations for user: %s', conversations.length, userId);

    // Populate participant data
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const conversationIdStrArray = conversations.map(c => String(c.conversationId || c._id));
    
    // 1. Fetch only unread candidates to avoid loading the entire message history into memory
    const groupConvoIds = conversations.filter(c => c.isGroup).map(c => String(c.conversationId || c._id));
    const directConvoIds = conversations.filter(c => !c.isGroup).map(c => String(c.conversationId || c._id));

    const allUnreadCandidates = await Message.find({
      $or: [
        { conversationId: { $in: directConvoIds }, recipientId: { $in: idsToMatch }, read: { $ne: true } },
        { conversationId: { $in: groupConvoIds }, readBy: { $nin: idsToMatch } }
      ]
    }).select('conversationId senderId recipientId read readBy timestamp createdAt text mediaUrl videoUrl sharedPost').lean().catch(() => []);
    
    const unreadMap = {};
    allUnreadCandidates.forEach(m => {
      const cid = String(m.conversationId);
      if (!unreadMap[cid]) unreadMap[cid] = [];
      unreadMap[cid].push(m);
    });

    // 2. Pre-fetch all other participants to avoid N+1 queries
    const otherParticipantIds = new Set();
    conversations.forEach(c => {
      if (!c.isGroup) {
        const participants = Array.isArray(c.participants) ? c.participants.map(String) : [];
        const otherId = participants.find(p => !idsToMatch.includes(String(p)));
        if (otherId) otherParticipantIds.add(otherId);
      }
    });

    const otherUsersList = await User.find({
      $or: [
        { _id: { $in: Array.from(otherParticipantIds).filter(id => mongoose.Types.ObjectId.isValid(id)) } },
        { firebaseUid: { $in: Array.from(otherParticipantIds) } },
        { uid: { $in: Array.from(otherParticipantIds) } }
      ]
    }).select('_id firebaseUid uid displayName name avatar profilePicture photoURL email').lean().catch(() => []);

    const userCache = {};
    otherUsersList.forEach(u => {
      if (u._id) userCache[String(u._id)] = u;
      if (u.firebaseUid) userCache[String(u.firebaseUid)] = u;
      if (u.uid) userCache[String(u.uid)] = u;
    });

    const enrichedConversations = conversations.map((conversation) => {
      const convObj = conversation.toObject ? conversation.toObject() : conversation;

      const archivedBy = Array.isArray(convObj?.archivedBy) ? convObj.archivedBy.map(String) : [];
      const isArchived = archivedBy.some((id) => idsToMatch.includes(String(id)));

      const participants = Array.isArray(convObj?.participants) ? convObj.participants.map(String) : [];
      const isGroup = !!convObj?.isGroup;

      let lastCleared = 0;
      const clearedMap = convObj?.clearedBy || {};
      for (const uid of idsToMatch) {
        const timeVal = clearedMap instanceof Map ? clearedMap.get(uid) : clearedMap[uid];
        if (timeVal) {
          const t = new Date(timeVal).getTime();
          if (t > lastCleared) lastCleared = t;
        }
      }

      const conversationIdStr = String(convObj.conversationId || convObj._id);
      const candidates = unreadMap[conversationIdStr] || [];

      const visibleMsgs = candidates.filter(m => {
        const mTime = new Date(m.timestamp || m.createdAt || 0).getTime();
        return mTime > lastCleared;
      });

      const unreadCount = visibleMsgs.reduce((acc, m) => {
        if (isGroup) {
          const readBy = Array.isArray(m?.readBy) ? m.readBy.map(String) : [];
          const readByMe = idsToMatch.some((id) => readBy.includes(String(id)));
          return readByMe ? acc : acc + 1;
        }

        const recipientId = String(m?.recipientId || '');
        const isForMe = recipientId && idsToMatch.includes(recipientId);
        const isRead = m?.read === true;
        return (!isRead && isForMe) ? acc + 1 : acc;
      }, 0);

      // Fallback: If lastMessage is empty but not cleared, try to get it from Message collection
      if (!convObj.lastMessage && lastCleared === 0) {
        if (candidates.length > 0) {
          const m = candidates[candidates.length - 1];
          let preview = m.text || '';
          if (!preview) {
             if (m.mediaUrl || m.mediaType === 'image') preview = '[Photo]';
             else if (m.videoUrl || m.mediaType === 'video') preview = '[Video]';
             else if (m.sharedPost || m.postId) preview = '[Shared Post]';
          }
          convObj.lastMessage = preview;
        }
      }

      if (lastCleared > 0) {
        const lastMsgTime = new Date(convObj.lastMessageAt || 0).getTime();
        if (lastMsgTime <= lastCleared) {
          convObj.lastMessage = '';
        }
      }

      if (isGroup) {
        return {
          ...convObj,
          isArchived,
          unreadCount,
          group: {
            id: String(convObj?._id || convObj?.conversationId || ''),
            name: convObj?.groupName || 'Group Chat',
            avatar: convObj?.groupAvatar || null,
            memberCount: participants.length,
          }
        };
      }

      const otherParticipantId = participants.find(p => !idsToMatch.includes(String(p)));
      const otherUser = otherParticipantId ? userCache[otherParticipantId] : null;

      return {
        ...convObj,
        isArchived,
        unreadCount,
        otherUserId: otherParticipantId || '',
        otherUser: otherUser ? {
          id: String(otherUser._id || ''),
          name: otherUser.displayName || otherUser.name || (otherUser.email ? otherUser.email.split('@')[0] : 'User'),
          displayName: otherUser.displayName || otherUser.name || (otherUser.email ? otherUser.email.split('@')[0] : 'User'),
          avatar: otherUser.avatar || otherUser.profilePicture || otherUser.photoURL || null
        } : null
      };
    });


    logger.info('[GET] /conversations - Returning %d enriched conversations', enrichedConversations.length);
    res.json({ success: true, data: enrichedConversations || [], pagination: { skip, limit, count: enrichedConversations.length, hasMore: conversations.length === limit } });
  } catch (err) {
    logger.error('[GET /conversations] Error: %s', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

// Resolve messages by participants (fallback strategy)
router.get('/resolve/messages', verifyToken, async (req, res) => {
  try {
    const actorId = req.userId;
    const { otherUserId } = req.query;
    
    if (!otherUserId) {
      return res.status(400).json({ success: false, error: 'Missing otherUserId' });
    }

    const actorVariants = await resolveUserIdVariants(actorId);
    
    // Find conversation between these two
    const convo = await Conversation.findOne({
      isGroup: { $ne: true },
      participants: { $all: [...actorVariants, String(otherUserId)], $size: 2 }
    }).populate('messages');

    if (!convo) {
      return res.json({ success: true, messages: [] });
    }

    // Sort messages newest first
    const sorted = (convo.messages || []).sort((a, b) => {
      const ta = a.timestamp || a.createdAt || 0;
      const tb = b.timestamp || b.createdAt || 0;
      return new Date(tb).getTime() - new Date(ta).getTime();
    });

    res.json({ success: true, messages: sorted, conversationId: convo.conversationId || String(convo._id) });
  } catch (error) {
    logger.error('Error in /resolve/messages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resolve or create a canonical direct conversation for authenticated user and target user.
router.post('/resolve', verifyToken, async (req, res) => {
  try {
    const actorIdRaw = String(req.userId || '');
    const targetIdRaw = String(req.body?.otherUserId || req.body?.targetUserId || '').trim();

    if (!actorIdRaw || !targetIdRaw) {
      return res.status(400).json({ success: false, error: 'otherUserId required' });
    }

    const User = mongoose.model('User');

    let actorId = actorIdRaw;
    if (!mongoose.Types.ObjectId.isValid(actorId)) {
      const actor = await User.findOne({ $or: [{ firebaseUid: actorId }, { uid: actorId }] }).select('_id');
      if (actor?._id) actorId = String(actor._id);
    }

    let targetId = targetIdRaw;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      const target = await User.findOne({ $or: [{ firebaseUid: targetId }, { uid: targetId }] }).select('_id');
      if (target?._id) targetId = String(target._id);
    }

    const actorVariants = await resolveUserIdVariants(actorId);
    const targetVariants = await resolveUserIdVariants(targetId);

    let conversation = await Conversation.findOne({
      $and: [
        { isGroup: { $ne: true } },
        { participants: { $in: actorVariants } },
        { participants: { $in: targetVariants } },
        { $expr: { $eq: [{ $size: '$participants' }, 2] } }
      ]
    }).sort({ updatedAt: -1, lastMessageAt: -1 });

    if (!conversation) {
      const participants = [String(actorId), String(targetId)].sort();
      conversation = new Conversation({
        conversationId: `${participants[0]}_${participants[1]}`,
        participants,
        isGroup: false,
        messages: [],
        lastMessage: '',
        lastMessageAt: new Date(),
      });
      await conversation.save();
    }

    return res.json({
      success: true,
      conversationId: String(conversation.conversationId || conversation._id),
      data: conversation,
    });
  } catch (err) {
    logger.error('[POST] /conversations/resolve - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get conversation details by conversationId or _id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const convo = conversation.toObject ? conversation.toObject() : conversation;
    return res.json({
      success: true,
      data: {
        ...convo,
        memberCount: participants.length,
      }
    });
  } catch (err) {
    logger.error('[GET] /conversations/:id - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Create group conversation
router.post('/group', verifyToken, validate(createConversationSchema), async (req, res) => {
  try {
    const creatorId = String(req.userId || '');
    if (!creatorId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { name, avatar, description, memberIds } = req.body || {};
    const groupName = String(name || '').trim();
    if (!groupName) {
      return res.status(400).json({ success: false, error: 'Group name required' });
    }

    const normalized = await normalizeParticipantIds([creatorId, ...(Array.isArray(memberIds) ? memberIds : [])]);
    if (normalized.length < 2) {
      return res.status(400).json({ success: false, error: 'At least 2 participants required' });
    }

    const baseId = new mongoose.Types.ObjectId();
    const conversationId = `grp_${String(baseId)}`;
    const conversation = new Conversation({
      _id: baseId,
      conversationId,
      participants: normalized,
      isGroup: true,
      groupName,
      groupAvatar: typeof avatar === 'string' ? avatar.trim() : '',
      groupDescription: typeof description === 'string' ? description.trim() : '',
      groupAdminIds: [creatorId],
      messages: [],
      lastMessage: '',
      lastMessageAt: new Date(),
    });

    await conversation.save();
    return res.json({ success: true, data: conversation, conversationId });
  } catch (err) {
    logger.error('[POST] /conversations/group - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Update group members (admin only)
router.patch('/:id/group-members', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const actorId = String(req.userId || '');
    const { addMemberIds = [], removeMemberIds = [] } = req.body || {};

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (!conversation.isGroup) {
      return res.status(400).json({ success: false, error: 'Not a group conversation' });
    }

    const adminIds = Array.isArray(conversation.groupAdminIds) ? conversation.groupAdminIds.map(String) : [];
    if (!adminIds.includes(actorId)) {
      return res.status(403).json({ success: false, error: 'Only group admins can manage members' });
    }

    const addIds = await normalizeParticipantIds(addMemberIds);
    const removeIds = Array.isArray(removeMemberIds) ? removeMemberIds.map((x) => String(x)) : [];

    const next = new Set((conversation.participants || []).map(String));
    addIds.forEach((x) => next.add(String(x)));
    removeIds.forEach((x) => {
      if (!adminIds.includes(String(x))) next.delete(String(x));
    });

    if (next.size < 2) {
      return res.status(400).json({ success: false, error: 'Group must keep at least 2 participants' });
    }

    conversation.participants = Array.from(next);
    conversation.updatedAt = new Date();
    await conversation.save();

    return res.json({ success: true, data: conversation });
  } catch (err) {
    logger.error('[PATCH] /conversations/:id/group-members - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Archive conversation for authenticated user (soft archive)
router.post('/:id/archive', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      {
        $addToSet: { archivedBy: { $each: idsToMatch } },
        $pull: { deletedBy: { $in: idsToMatch } }
      }
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error('[POST] /conversations/:id/archive - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Unarchive conversation for authenticated user
router.post('/:id/unarchive', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      { $pull: { archivedBy: { $in: idsToMatch } } }
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error('[POST] /conversations/:id/unarchive - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Delete conversation for authenticated user (soft delete / hide from inbox)
router.post('/:id/delete', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const conversation = await findConversationByAnyId(id);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participants = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
    const allowed = idsToMatch.some(uid => participants.includes(String(uid)));
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const threadConvos = await findThreadConversations(conversation);
    const convoIds = Array.isArray(threadConvos) && threadConvos.length > 0
      ? threadConvos.map(c => c._id)
      : [conversation._id];

    await Conversation.updateMany(
      { _id: { $in: convoIds } },
      {
        $addToSet: { deletedBy: { $each: idsToMatch } },
        $pull: { archivedBy: { $in: idsToMatch } }
      }
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error('[POST] /conversations/:id/delete - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Clear messages for authenticated user (soft clear history)
router.post('/:id/clear', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = String(req.userId || '');
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversation = await findConversationByAnyId(id);
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

    // Use current time as the clear timestamp
    const now = new Date();
    
    // Support all variants of the user's ID
    const variants = await resolveUserIdVariants(userId);
    const convoIds = (await findThreadConversations(conversation)).map(c => c._id);

    // Update all matching duplicate conversations (legacy support)
    const update = { $set: {} };
    for (const vid of variants) {
      update.$set[`clearedBy.${vid}`] = now;
    }
    
    await Conversation.updateMany({ _id: { $in: convoIds } }, update);

    return res.json({ success: true, clearedAt: now });
  } catch (err) {
    logger.error('[POST] /conversations/:id/clear - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get messages for a conversation
router.get('/:id/messages', verifyToken, async (req, res) => {
  try {
    const conversationId = req.params.id;

    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const User = mongoose.model('User');

    let convos = [];

    // Smart lookup for pair conversations (A_B)
    if (conversationId.includes('_') && !conversationId.startsWith('grp_')) {
      const [p1, p2] = conversationId.split('_');
      const p1Ids = await resolveUserIdVariants(p1);
      const p2Ids = await resolveUserIdVariants(p2);
      
      logger.info(`[GET] /messages - Smart lookup for pair: ${p1} and ${p2}`);
      
      convos = await Conversation.find({
        $and: [
          { isGroup: { $ne: true } },
          { participants: { $in: p1Ids } },
          { participants: { $in: p2Ids } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ lastMessageAt: -1 });
    } else {
      // Try to find by string ID first, then by MongoDB ObjectId
      const single = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });
      if (single) convos = [single];
    }

    if (!convos || convos.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Privacy: only participants can read (for all merged convos)
    const allowed = convos.some(c => {
      const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
      return idsToMatch.some(id => participants.includes(String(id)));
    });

    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Merge messages across all possible IDs for these conversations
    const convoIdsArray = [];
    convos.forEach(c => {
      if (c.conversationId) convoIdsArray.push(String(c.conversationId));
      if (c._id) convoIdsArray.push(String(c._id));
    });
    
    // Pagination
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    // Optimization: Fetch only required messages sorted from DB
    const queryLimit = limit === 0 ? 1000 : skip + limit + 20;

    // Optimized message query: try direct conversationId matches first (fast path)
    let rawMsgs = await Message.find({ conversationId: { $in: convoIdsArray } })
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(queryLimit)
      .maxTimeMS(5000) // SAFETY: Never hang for more than 5 seconds
      .lean();

    // FAIL-SAFE: If no messages found by ID, and this is a DM, try matching by participants directly
    if (rawMsgs.length === 0 && convos.length > 0 && !convos[0].isGroup) {
      const participants = convos[0].participants || [];
      if (participants.length === 2) {
        const p1 = String(participants[0]);
        const p2 = String(participants[1]);
        rawMsgs = await Message.find({
          $or: [
            { senderId: p1, recipientId: p2 },
            { senderId: p2, recipientId: p1 }
          ]
        })
        .sort({ timestamp: -1, createdAt: -1 })
        .limit(queryLimit)
        .maxTimeMS(5000)
        .lean();
      }
    }

    logger.info('[GET] /:id/messages - Final count: %d for convoIds: %j', rawMsgs.length, convoIdsArray);

    const merged = [];
    const seen = new Set();
    
    // rawMsgs are descending (newest first). Filter out cleared ones.
    for (const m of rawMsgs) {
      const mid = String(m._id || m.id);
      if (seen.has(mid)) continue;
      seen.add(mid);

      const mTime = new Date(m.timestamp || m.createdAt || 0).getTime();
      let lastCleared = 0;
      for (const c of convos) {
        const clearedMap = c.clearedBy;
        if (clearedMap) {
          for (const uid of idsToMatch) {
            const timeVal = clearedMap instanceof Map ? clearedMap.get(uid) : clearedMap[uid];
            if (timeVal) {
              const t = new Date(timeVal).getTime();
              if (t > lastCleared) lastCleared = t;
            }
          }
        }
      }

      if (mTime > lastCleared) {
        merged.push(m);
      }
    }

    // Now 'merged' has the newest messages up to queryLimit.
    // We need to apply skip and limit, then reverse to return chronological order (oldest first).
    const pagedDesc = merged.slice(skip, skip + limit);
    const result = pagedDesc.reverse();

    res.json({ 
      success: true, 
      messages: result,
      pagination: {
        total: merged.length + skip, // estimate
        limit: limit,
        skip: skip,
        hasMore: pagedDesc.length === limit
      }
    });
  } catch (err) {
    logger.error('[GET] /:id/messages - Error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Mark all messages as read for the authenticated user in a conversation
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const conversationId = req.params.id;

    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    const User = mongoose.model('User');

    let convos = [];

    if (isStrictLegacyPairConversationId(conversationId)) {
      const parts = conversationId.split('_');
      const a = parts[0];
      const b = parts[1];
      const aIds = await resolveUserIdVariants(a);
      const bIds = await resolveUserIdVariants(b);
      convos = await Conversation.find({
        $and: [
          { isGroup: { $ne: true } },
          { participants: { $in: aIds } },
          { participants: { $in: bIds } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ lastMessageAt: -1 });
    } else {
      const single = await Conversation.findOne({
        $or: [
          { conversationId: conversationId },
          { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
        ]
      });

      // If we found a conversation, expand to all legacy duplicates for this participant pair
      if (single && Array.isArray(single?.participants) && single.participants.length === 2) {
        const p0 = String(single.participants[0]);
        const p1 = String(single.participants[1]);
        const p0Ids = await resolveUserIdVariants(p0);
        const p1Ids = await resolveUserIdVariants(p1);
        convos = await Conversation.find({
          $and: [
            { participants: { $in: p0Ids } },
            { participants: { $in: p1Ids } }
          ]
        }).sort({ lastMessageAt: -1 });
      } else if (single) {
        convos = [single];
      }
    }

    if (!convos || convos.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const allowed = convos.some(c => {
      const participants = Array.isArray(c?.participants) ? c.participants.map(String) : [];
      return idsToMatch.some(id => participants.includes(String(id)));
    });

    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const isGroup = convos.some((c) => !!c?.isGroup);
    let markedCount = 0;
    for (const c of convos) {
      let changed = false;
      const msgs = await Message.find({ conversationId: String(c.conversationId || c._id) });
      
      for (const m of msgs) {
        if (isGroup || c?.isGroup) {
          const senderId = String(m?.senderId || '');
          const isFromSelf = idsToMatch.includes(senderId);
          if (isFromSelf) continue;

          if (!Array.isArray(m.readBy)) m.readBy = [];
          const alreadyRead = idsToMatch.some((id) => m.readBy.includes(String(id)));
          if (!alreadyRead) {
            m.readBy.push(String(userIdFromToken));
            markedCount += 1;
            changed = true;
            await m.save();
          }
          continue;
        }

        const recipientId = m?.recipientId != null ? String(m.recipientId) : '';
        const isForMe = recipientId && idsToMatch.some(id => String(id) === recipientId);
        if (isForMe && m?.read === false) {
          m.read = true;
          markedCount += 1;
          changed = true;
          await m.save();
        }
      }
      if (changed) {
        c.updatedAt = new Date();
        await c.save();
      }
    }

    return res.json({ success: true, markedCount });
  } catch (err) {
    logger.error('[PATCH] /:id/read - Error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Send a message in a conversation (POST /:id/messages)
router.post('/:id/messages', verifyToken, validate(sendMessageSchema), async (req, res) => {
  try {
    const conversationId = req.params.id;
    const { senderId, sender, text, recipientId, replyTo, read } = req.body;
    
    // Sender must be the authenticated user
    const actualSenderId = String(req.userId || senderId || sender || '');
    
    // Check if there is ANY content (text OR media OR shared stuff)
    const hasContent = text || req.body.mediaUrl || req.body.audioUrl || req.body.videoUrl || req.body.sharedPost || req.body.sharedStory;
    
    if (!actualSenderId || !hasContent) {
      return res.status(400).json({ success: false, error: 'Message must contain text, media, or shared content' });
    }

    // Normalize recipientId to Mongo _id string where possible
    const User = mongoose.model('User');
    let normalizedRecipientId = recipientId ? String(recipientId) : null;
    if (normalizedRecipientId && !mongoose.Types.ObjectId.isValid(normalizedRecipientId)) {
      const found = await User.findOne({ $or: [{ firebaseUid: normalizedRecipientId }, { uid: normalizedRecipientId }] }).select('_id');
      if (found?._id) {
        normalizedRecipientId = String(found._id);
      }
    }

    // Also normalize sender if somehow a firebase uid was passed
    let normalizedSenderId = String(actualSenderId);
    if (!mongoose.Types.ObjectId.isValid(normalizedSenderId)) {
      const foundSender = await User.findOne({ $or: [{ firebaseUid: normalizedSenderId }, { uid: normalizedSenderId }] }).select('_id');
      if (foundSender?._id) {
        normalizedSenderId = String(foundSender._id);
      }
    }

    // Try to find by string ID first, then by MongoDB ObjectId, then by direct-message participant pair
    let convo = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null },
        // Only match non-group 1:1 chats when using participant fallback.
        normalizedRecipientId
          ? {
              $and: [
                { isGroup: { $ne: true } },
                { participants: { $all: [normalizedSenderId, normalizedRecipientId] } },
                { $expr: { $eq: [{ $size: '$participants' }, 2] } }
              ]
            }
          : null
      ].filter(Boolean)
    });

    // Always calculate standardConversationId for consistency
    const participants = [normalizedSenderId, normalizedRecipientId].filter(Boolean);
    const sortedParticipants = participants.sort();
    const standardConversationId = sortedParticipants.length >= 2 
      ? `${sortedParticipants[0]}_${sortedParticipants[1]}`
      : null;

    if (!convo) {
      logger.info('[POST] /:id/messages - Conversation not found, creating new one:', conversationId);
      if (participants.length < 2) {
        logger.error('[POST] ERROR: Cannot create conversation without 2 participants! Got:', participants);
        return res.status(400).json({ success: false, error: 'Requires both senderId and recipientId' });
      }
      logger.info('[POST] Creating conversation with participants:', sortedParticipants, 'conversationId:', standardConversationId);
      convo = new Conversation({
        conversationId: standardConversationId,
        participants: sortedParticipants
      });
    }

    const isGroupConversation = !!convo?.isGroup;

    // If sender had previously hidden/archived this conversation, revive it on new outgoing message.
    const senderVariants = await resolveUserIdVariants(String(normalizedSenderId));
    const senderSet = new Set([String(normalizedSenderId), ...senderVariants.map(String)]);
    convo.deletedBy = (Array.isArray(convo.deletedBy) ? convo.deletedBy : []).filter((id) => !senderSet.has(String(id)));
    convo.archivedBy = (Array.isArray(convo.archivedBy) ? convo.archivedBy : []).filter((id) => !senderSet.has(String(id)));

    // Also revive for recipient so new incoming messages reappear in inbox.
    if (normalizedRecipientId) {
      const recipientVariants = await resolveUserIdVariants(String(normalizedRecipientId));
      const recipientSet = new Set([String(normalizedRecipientId), ...recipientVariants.map(String)]);
      convo.deletedBy = (Array.isArray(convo.deletedBy) ? convo.deletedBy : []).filter((id) => !recipientSet.has(String(id)));
      convo.archivedBy = (Array.isArray(convo.archivedBy) ? convo.archivedBy : []).filter((id) => !recipientSet.has(String(id)));
    }

    if (!isGroupConversation && !normalizedRecipientId) {
      return res.status(400).json({ success: false, error: 'Requires recipientId' });
    }
    
    // Create the message in the standalone Message collection
    const storyPointerMatch = String(text || '').match(/story:\/\/([A-Za-z0-9_-]+)/i);
    const storyIdFromText = storyPointerMatch?.[1] || null;

    const { 
      mediaType, 
      mediaUrl, 
      audioUrl, 
      audioDuration, 
      videoUrl, 
      thumbnailUrl, 
      sharedPost, 
      sharedStory,
      tempId 
    } = req.body;

    const messageData = { 
      conversationId: String(convo.conversationId || standardConversationId || convo._id),
      senderId: normalizedSenderId, 
      text,
      mediaType: mediaType || (storyIdFromText ? 'story' : 'text'),
      mediaUrl,
      audioUrl,
      audioDuration,
      videoUrl,
      thumbnailUrl,
      sharedPost,
      sharedStory,
      tempId, // Echo back to client for perfect deduplication
      read: read || false,
      readBy: [normalizedSenderId],
      timestamp: new Date(),
      createdAt: new Date()
    };

    if (storyIdFromText) {
      messageData.mediaType = 'story';
      messageData.sharedStory = {
        storyId: storyIdFromText,
        id: storyIdFromText,
        userId: normalizedSenderId,
      };
    }
    
    // Add recipientId if provided
    if (normalizedRecipientId) {
      messageData.recipientId = normalizedRecipientId;
    }
    
    // Add replyTo if replying to a message
    if (replyTo) {
      messageData.replyTo = replyTo;
    }
    
    // Add an ID to the message for easier deletion/editing
    messageData.id = new mongoose.Types.ObjectId().toString();

    const newMessage = new Message(messageData);
    await newMessage.save();
    const message = newMessage.toObject(); // for sending back in response
    
    // Determine preview text
    let previewText = text || '';
    if (!previewText) {
      if (storyIdFromText) previewText = '[Story]';
      else if (messageData.mediaUrl || messageData.mediaType === 'image') previewText = '[Photo]';
      else if (messageData.videoUrl || messageData.mediaType === 'video') previewText = '[Video]';
      else if (messageData.sharedPost || messageData.postId) previewText = '[Shared Post]';
      else if (messageData.mediaUrl) previewText = '[Media]';
    }

    // Atomic update using findOneAndUpdate to prevent lost updates during high concurrency
    const updatedConvo = await Conversation.findOneAndUpdate(
      { _id: convo._id },
      {
        $set: {
          lastMessage: previewText,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
          deletedBy: convo.deletedBy || [],
          archivedBy: convo.archivedBy || []
        }
      },
      { new: true }
    );
    
    if (!updatedConvo) {
       await convo.save();
    }

    // Best-effort: create notification for recipient
    try {
      if (!isGroupConversation && normalizedRecipientId && normalizedRecipientId !== normalizedSenderId) {
        const User = mongoose.model('User');
        const senderUser = await User.findOne({ 
          $or: [
            { _id: mongoose.Types.ObjectId.isValid(normalizedSenderId) ? new mongoose.Types.ObjectId(normalizedSenderId) : null },
            { firebaseUid: normalizedSenderId },
            { uid: normalizedSenderId }
          ]
        }).select('displayName name avatar').lean();

        const senderName = senderUser?.displayName || senderUser?.name || 'Someone';
        const convId = String(convo.conversationId || conversationId);

        // Trigger real-time push notification
        const { notificationQueue } = require('../services/queue');
        notificationQueue.add('message', {
          userId: normalizedRecipientId,
          senderId: normalizedSenderId,
          title: senderName,
          body: text || 'Sent you a message',
          data: { 
            type: 'message', 
            conversationId: convId, 
            senderId: normalizedSenderId,
            screen: 'dm'
          }
        }).catch(() => {});
      }
    } catch (e) {
      logger.warn('[POST] /:id/messages - Notification skipped:', e.message);
    }

    logger.info('[POST] /:id/messages - Message saved successfully!');
    logger.info('[POST] Conversation state after save:', {
      conversationId: convo.conversationId,
      participants: convo.participants,
      messageCount: convo.messages?.length,
      lastMessage: convo.lastMessage
    });

    // Emit message to recipient via Socket.IO for real-time delivery
    try {
      const io = req.app.get('io');
      logger.info('[Socket] IO instance available?', !!io);

      if (!io) {
        logger.error('[Socket] ❌ IO instance not found on req.app');
      } else {
        // Use the actual conversationId from the saved conversation (not the route param)
        const actualConversationId = convo.conversationId;
        logger.info('[Socket] 📡 Emitting newMessage to conversationId:', actualConversationId);
        logger.info('[Socket] 📡 Message data:', {
          messageId: message.id,
          senderId: normalizedSenderId,
          recipientId: normalizedRecipientId,
          text: message.text?.substring(0, 30)
        });

        // Emit to conversation room
        const socketPayload = {
          ...message,
          createdAt: typeof message.createdAt?.getTime === 'function' ? message.createdAt.getTime() : (message.createdAt || Date.now()),
          timestamp: typeof message.timestamp?.getTime === 'function' ? message.timestamp.getTime() : (message.timestamp || Date.now()),
          conversationId: actualConversationId
        };
        
        io.to(actualConversationId).emit('newMessage', socketPayload);
        logger.info('[Socket] ✅ Emitted message to conversation room:', actualConversationId);

        if (isGroupConversation) {
          const members = Array.isArray(convo?.participants) ? convo.participants.map(String) : [];
          const recipients = members.filter((m) => m !== normalizedSenderId);
          for (const memberId of recipients) {
            io.to(`user_${memberId}`).emit('newMessage', {
              ...message,
              conversationId: actualConversationId
            });
          }
          logger.info('[Socket] ✅ Emitted group message to members:', recipients.length);
        } else if (normalizedRecipientId) {
          // Also emit to recipient's personal room
          io.to(`user_${normalizedRecipientId}`).emit('newMessage', {
            ...message,
            conversationId: actualConversationId
          });
          logger.info('[Socket] ✅ Emitted to recipient room:', `user_${normalizedRecipientId}`);
        }

        // Also emit to sender's personal room ONLY if they are not in the conversation room
        // or for multi-device sync
        io.to(`user_${normalizedSenderId}`).emit('newMessage', {
          ...message,
          tempId, // Crucial for client-side optimistic UI matching
          conversationId: actualConversationId
        });
        logger.info('[Socket] ✅ Emitted to sender room:', `user_${normalizedSenderId}`);

        logger.info('[Socket] ✅✅✅ All emits complete!');
      }
    } catch (socketError) {
      logger.error('[Socket] ❌ Error emitting message:', socketError);
      logger.error('[Socket] ❌ Error stack:', socketError.stack);
      // Don't fail the request if socket emit fails
    }

    res.json({ success: true, message });
  } catch (err) {
    logger.error('[POST] /:id/messages - Error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get or create conversation
router.post('/get-or-create', verifyToken, async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;

    const User = mongoose.model('User');
    const normalizeToMongo = async (id) => {
      const raw = String(id || '');
      if (!raw) return null;
      if (mongoose.Types.ObjectId.isValid(raw)) return raw;
      const found = await User.findOne({ $or: [{ firebaseUid: raw }, { uid: raw }] }).select('_id');
      return found?._id ? String(found._id) : raw;
    };

    const a = await normalizeToMongo(userId1);
    const b = await normalizeToMongo(userId2);
    if (!a || !b) {
      return res.status(400).json({ success: false, error: 'userId1 and userId2 required' });
    }

    const ids = [a, b].map(String).sort();
    const conversationId = `${ids[0]}_${ids[1]}`;

    const matches = await Conversation.find({
      $or: [
        { conversationId: conversationId },
        {
          $and: [
            { participants: { $all: ids } },
            { $expr: { $eq: [{ $size: '$participants' }, 2] } },
            { isGroup: { $ne: true } }
          ]
        }
      ]
    }).sort({ lastMessageAt: -1 });

    let conversation = matches?.[0] || null;
    if (!conversation) {
      conversation = new Conversation({
        conversationId,
        participants: ids
      });
      await conversation.save();
    }

    res.json({ success: true, id: conversation._id, conversationId });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// Get conversations for user (route param version) — JWT required, self-only access
router.get('/users/:userId', verifyToken, async (req, res) => {
  try {
    // IDOR guard: users may only fetch their own conversation list
    const requestedId = req.params.userId;
    const callerCandidates = await resolveUserIdentifiers(req.userId).then(r => r.candidates);
    if (!callerCandidates.includes(requestedId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const userId = req.params.userId;
    const conversations = await Conversation.find({ participants: userId }).sort({ lastMessageAt: -1 });

    // Populate participant data
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const enrichedConversations = await Promise.all(conversations.map(async (conversation) => {
      const convObj = conversation.toObject ? conversation.toObject() : conversation;

      // Get other participant (not current user)
      const otherParticipantId = convObj.participants.find(p => p !== userId);

      if (otherParticipantId) {
        const otherUser = await usersCollection.findOne({
          $or: [
            { firebaseUid: otherParticipantId },
            { uid: otherParticipantId },
            { _id: mongoose.Types.ObjectId.isValid(otherParticipantId) ? new mongoose.Types.ObjectId(otherParticipantId) : null }
          ]
        });

        return {
          ...convObj,
          otherParticipant: {
            id: otherParticipantId,
            name: otherUser?.displayName || otherUser?.name || 'User',
            avatar: otherUser?.avatar || otherUser?.photoURL || null
          }
        };
      }

      return convObj;
    }));

    res.json({ success: true, data: enrichedConversations });
  } catch (err) {
    logger.error('[GET /conversations/users/:userId] Error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// PATCH /:conversationId/messages/:messageId - Edit message
router.patch('/:conversationId/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const userId = String(req.userId || '');
    const { text } = req.body;
    const { conversationId, messageId } = req.params;

    logger.info('[PATCH] /:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId,
      text: text?.substring(0, 30)
    });

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      logger.info('[PATCH] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      logger.info('[PATCH] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      logger.info('[PATCH] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only edit your own messages' });
    }

    // Update message
    message.text = text;
    message.editedAt = new Date();
    await message.save();

    logger.info('[PATCH] Message updated:', messageId);
    res.json({ success: true, data: message });
  } catch (err) {
    logger.error('[PATCH] /:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// DELETE /:conversationId/messages/:messageId - Delete message
router.delete('/:conversationId/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const userId = String(req.userId || '');
    const { conversationId, messageId } = req.params;

    logger.info('[DELETE] /:conversationId/messages/:messageId - Request:', {
      conversationId,
      messageId,
      userId
    });

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      logger.info('[DELETE] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      logger.info('[DELETE] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check authorization
    if (message.senderId !== userId) {
      logger.info('[DELETE] Unauthorized - senderId:', message.senderId, 'userId:', userId);
      return res.status(403).json({ success: false, error: 'Unauthorized - you can only delete your own messages' });
    }

    // Delete message from collection
    await Message.deleteOne({ _id: message._id });

    logger.info('[DELETE] Message deleted:', messageId);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) {
    logger.error('[DELETE] /:conversationId/messages/:messageId error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:conversationId/messages/:messageId/reactions - React to message
router.post('/:conversationId/messages/:messageId/reactions', verifyToken, async (req, res) => {
  try {
    const userId = String(req.userId || '');
    const { reaction, emoji } = req.body;
    const { conversationId, messageId } = req.params;

    // Accept both 'reaction' and 'emoji' for compatibility
    const actualReaction = reaction || emoji;

    logger.info('[POST] /:conversationId/messages/:messageId/reactions - Request:', {
      conversationId,
      messageId,
      userId,
      reaction: actualReaction
    });

    if (!userId || !actualReaction) {
      return res.status(400).json({ success: false, error: 'userId and reaction/emoji required' });
    }

    // Find conversation
    const conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    if (!conversation) {
      logger.info('[POST] Conversation not found:', conversationId);
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    // Find message in Message collection
    const message = await Message.findOne({ $or: [{ id: messageId }, { _id: mongoose.Types.ObjectId.isValid(messageId) ? messageId : null }] });
    if (!message) {
      logger.info('[POST] Message not found:', messageId);
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Initialize reactions object if not exists
    if (!message.reactions) {
      message.reactions = {};
    }

    // Initialize reaction array if not exists
    if (!message.reactions.get(actualReaction) && !message.reactions[actualReaction]) {
      if (message.reactions instanceof Map) {
        message.reactions.set(actualReaction, []);
      } else {
        message.reactions[actualReaction] = [];
      }
    }

    // Toggle reaction (Instagram style - add if not present, remove if present)
    const reactionsArray = message.reactions instanceof Map ? message.reactions.get(actualReaction) : message.reactions[actualReaction];
    const userIndex = reactionsArray.indexOf(userId);
    
    if (userIndex === -1) {
      reactionsArray.push(userId);
      logger.info('[POST] Added reaction:', actualReaction, 'from user:', userId);
    } else {
      reactionsArray.splice(userIndex, 1);
      logger.info('[POST] Removed reaction:', actualReaction, 'from user:', userId);

      // Remove empty reaction arrays
      if (reactionsArray.length === 0) {
        if (message.reactions instanceof Map) {
          message.reactions.delete(actualReaction);
        } else {
          delete message.reactions[actualReaction];
        }
      }
    }

    // Save message
    message.markModified('reactions');
    await message.save();

    logger.info('[POST] Reactions updated for message:', messageId);
    res.json({ success: true, data: { reactions: message.reactions } });
  } catch (err) {
    logger.error('[POST] /:conversationId/messages/:messageId/reactions error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// ===== MEDIA UPLOAD ROUTES =====

// POST /upload-media - Upload image/video/audio to message
router.post('/upload-media', verifyToken, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    const { file, mediaType } = req.body; // file is base64 or URL

    if (!file) {
      return res.status(400).json({ success: false, error: 'File required' });
    }

    // Upload to Cloudinary
    const uploadOptions = {
      resource_type: mediaType === 'audio' ? 'auto' : 'auto',
      folder: 'messages'
    };

    if (mediaType === 'video') {
      uploadOptions.video_sampling = 5; // For faster uploads
    }

    const result = await cloudinary.uploader.upload(file, uploadOptions);

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      mediaType,
      duration: result.duration || null
    });
  } catch (err) {
    logger.error('[POST] /upload-media error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /:conversationId/messages/media - Send media message
router.post('/:conversationId/messages/media', verifyToken, validate(sendMessageSchema), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { 
      senderId, 
      recipientId, 
      mediaUrl, 
      mediaType, 
      audioUrl, 
      audioDuration, 
      text, 
      thumbnailUrl, 
      sharedPost, 
      sharedStory,
      tempId 
    } = req.body;

    const actualSenderId = String(req.userId || senderId || '');

    const effectiveMediaUrl = mediaUrl
      || sharedPost?.imageUrl
      || sharedPost?.thumbnailUrl
      || sharedStory?.mediaUrl
      || null;

    if (!actualSenderId || !mediaType) {
      return res.status(400).json({ success: false, error: 'senderId and mediaType required' });
    }

    // Normalize IDs to Mongo _id strings where possible (same strategy as text route).
    const User = mongoose.model('User');
    let normalizedSenderId = String(actualSenderId);
    if (!mongoose.Types.ObjectId.isValid(normalizedSenderId)) {
      const foundSender = await User.findOne({ $or: [{ firebaseUid: normalizedSenderId }, { uid: normalizedSenderId }] }).select('_id');
      if (foundSender?._id) normalizedSenderId = String(foundSender._id);
    }

    let normalizedRecipientId = recipientId ? String(recipientId) : null;
    if (normalizedRecipientId && !mongoose.Types.ObjectId.isValid(normalizedRecipientId)) {
      const foundRecipient = await User.findOne({ $or: [{ firebaseUid: normalizedRecipientId }, { uid: normalizedRecipientId }] }).select('_id');
      if (foundRecipient?._id) normalizedRecipientId = String(foundRecipient._id);
    }

    if (!effectiveMediaUrl && mediaType !== 'post' && mediaType !== 'story') {
      return res.status(400).json({ success: false, error: 'mediaUrl required for this mediaType' });
    }

    let conversation = await Conversation.findOne({
      $or: [
        { conversationId: conversationId },
        { _id: mongoose.Types.ObjectId.isValid(conversationId) ? new mongoose.Types.ObjectId(conversationId) : null }
      ]
    });

    // Fallback: for direct chats, try finding by participants pair
    if (!conversation && normalizedRecipientId) {
      conversation = await Conversation.findOne({
        $and: [
          { participants: { $all: [String(normalizedSenderId), String(normalizedRecipientId)] } },
          { isGroup: { $ne: true } },
          { $expr: { $eq: [{ $size: '$participants' }, 2] } }
        ]
      }).sort({ updatedAt: -1 });
    }

    if (!conversation && normalizedRecipientId) {
      // Align with text route behavior: create DM conversation if missing
      const participants = [String(normalizedSenderId), String(normalizedRecipientId)].sort();
      conversation = new Conversation({
        conversationId: `${participants[0]}_${participants[1]}`,
        participants,
        messages: [],
      });
    }

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found for media message' });
    }

    if (!Array.isArray(conversation.messages)) {
      conversation.messages = [];
    }

    // If sender had previously hidden/archived this conversation, revive it on new outgoing media.
    const senderVariants = await resolveUserIdVariants(String(normalizedSenderId));
    const senderSet = new Set([String(normalizedSenderId), ...senderVariants.map(String)]);
    conversation.deletedBy = (Array.isArray(conversation.deletedBy) ? conversation.deletedBy : []).filter((id) => !senderSet.has(String(id)));
    conversation.archivedBy = (Array.isArray(conversation.archivedBy) ? conversation.archivedBy : []).filter((id) => !senderSet.has(String(id)));

    // Also revive for recipient so new incoming messages reappear in inbox.
    if (normalizedRecipientId) {
      const recipientVariants = await resolveUserIdVariants(String(normalizedRecipientId));
      const recipientSet = new Set([String(normalizedRecipientId), ...recipientVariants.map(String)]);
      conversation.deletedBy = (Array.isArray(conversation.deletedBy) ? conversation.deletedBy : []).filter((id) => !recipientSet.has(String(id)));
      conversation.archivedBy = (Array.isArray(conversation.archivedBy) ? conversation.archivedBy : []).filter((id) => !recipientSet.has(String(id)));
    }

    // Create media message in standalone collection
    const Message = mongoose.model('Message');
    const messageData = {
      conversationId: String(conversation.conversationId || conversation._id),
      senderId: normalizedSenderId,
      recipientId: normalizedRecipientId,
      text: text || '',
      mediaType,
      mediaUrl: effectiveMediaUrl,
      audioUrl,
      audioDuration,
      thumbnailUrl,
      sharedPost,
      sharedStory,
      tempId,
      timestamp: new Date(),
      createdAt: new Date(),
      read: false,
      delivered: false,
      readBy: [normalizedSenderId]
    };

    const newMessage = new Message(messageData);
    await newMessage.save();
    const message = newMessage.toObject();

    // Update conversation metadata
    conversation.lastMessage = mediaType === 'story' ? (text || '[STORY]') : (text || `[${mediaType.toUpperCase()}]`);
    conversation.lastMessageAt = new Date();
    conversation.updatedAt = new Date();
    
    // Also keep in embedded array for legacy support if needed, but the Message collection is the source of truth now
    if (!Array.isArray(conversation.messages)) conversation.messages = [];
    conversation.messages.push(message);
    conversation.markModified('messages');
    
    await conversation.save();

    logger.info('[POST] Media message saved:', message.id);

    // Emit message to all participants via Socket.IO for real-time delivery
    try {
      const io = req.app.get('io');
      if (io) {
        const actualConversationId = conversation.conversationId;
        const isGroupConversation = !!conversation?.isGroup;
        
        // Emit to conversation room
        const socketPayload = {
          ...message,
          createdAt: typeof message.createdAt?.getTime === 'function' ? message.createdAt.getTime() : (message.createdAt || Date.now()),
          timestamp: typeof message.timestamp?.getTime === 'function' ? message.timestamp.getTime() : (message.timestamp || Date.now()),
          conversationId: actualConversationId
        };
        
        io.to(actualConversationId).emit('newMessage', socketPayload);
        logger.info('[Socket] ✅ Emitted media message to conversation room:', actualConversationId);

        // For groups, emit to all members' personal rooms
        if (isGroupConversation) {
          const members = Array.isArray(conversation?.participants) ? conversation.participants.map(String) : [];
          const recipients = members.filter((m) => m !== normalizedSenderId);
          for (const memberId of recipients) {
            io.to(`user_${memberId}`).emit('newMessage', {
              ...message,
              conversationId: actualConversationId
            });
          }
          logger.info('[Socket] ✅ Emitted media message to group members:', recipients.length);
        } else if (normalizedRecipientId) {
          // For 1:1, emit to recipient's personal room
          io.to(`user_${normalizedRecipientId}`).emit('newMessage', {
            ...message,
            conversationId: actualConversationId
          });
          logger.info('[Socket] ✅ Emitted media message to recipient room:', `user_${normalizedRecipientId}`);
        }

        // Emit to sender's personal room for multi-device sync
        io.to(`user_${normalizedSenderId}`).emit('newMessage', {
          ...message,
          tempId,
          conversationId: actualConversationId
        });
        logger.info('[Socket] ✅ Emitted media message to sender room:', `user_${normalizedSenderId}`);
      }
    } catch (socketError) {
      logger.warn('[Socket] ⚠️ Warning emitting media message:', socketError.message);
      // Don't fail the request if socket emit fails
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    logger.error('[POST] /messages/media error:', err.message);
    logger.error('[POST] /messages/media stack:', err.stack);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /stories - Create story
router.post('/stories', verifyToken, async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { userId, mediaUrl, mediaType, caption, userName, userAvatar, locationData, postMetadata, visibility, allowedFollowers, isPrivate } = req.body;

    if (!userId || !mediaUrl) {
      return res.status(400).json({ success: false, error: 'userId and mediaUrl required' });
    }

    const story = await Story.create({
      userId,
      image: mediaType === 'image' ? mediaUrl : null,
      video: mediaType === 'video' ? mediaUrl : null,
      caption,
      userName,
      userAvatar,
      locationData,
      postMetadata,
      visibility,
      allowedFollowers,
      isPrivate: isPrivate || visibility !== 'Everyone',
      views: [],
      likes: [],
      comments: [],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    logger.info('[POST] Story created:', story._id);
    res.status(201).json({ success: true, data: story });
  } catch (err) {
    logger.error('[POST] /stories error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// GET /stories/user/:userId - Get user stories (JWT required)
router.get('/stories/user/:userId', verifyToken, async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { userId } = req.params;

    const stories = await Story.find({
      userId,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    res.json({ success: true, data: stories });
  } catch (err) {
    logger.error('[GET] /stories/user/:userId error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// GET /stories/feed - Get all active stories feed (JWT required)
router.get('/stories/feed', verifyToken, async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const stories = await Story.find({
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).limit(100);

    res.json({ success: true, data: stories });
  } catch (err) {
    logger.error('[GET] /stories/feed error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

// POST /stories/:storyId/view - Mark story as viewed (JWT required, userId from token)
router.post('/stories/:storyId/view', verifyToken, async (req, res) => {
  try {
    const Story = mongoose.model('Story');
    const { storyId } = req.params;
    // Use verified identity from JWT — never trust body-supplied userId
    const userId = req.userId;

    const story = await Story.findByIdAndUpdate(
      storyId,
      { $addToSet: { views: userId } },
      { new: true }
    );

    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    res.json({ success: true, data: story });
  } catch (err) {
    logger.error('[POST] /stories/:storyId/view error:', err.message);
    res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
