const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Helper to convert string to ObjectId safely
const toObjectId = (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
};

// GET /api/live-streams - Get all active streams
router.get('/', async (req, res) => {
  try {
    const LiveStream = mongoose.model('LiveStream');
    const streams = await LiveStream.find({ isActive: true }).sort({ createdAt: -1 }).lean();

    const normalized = streams.map(s => {
      const id = s?._id ? String(s._id) : (s?.id ? String(s.id) : undefined);
      const isActive = typeof s?.isActive === 'boolean' ? s.isActive : (typeof s?.isLive === 'boolean' ? s.isLive : true);
      const viewerCount = typeof s?.viewerCount === 'number' ? s.viewerCount : (Array.isArray(s?.viewers) ? s.viewers.length : 0);
      const roomId = (typeof s?.roomId === 'string' && s.roomId) ? s.roomId : ((typeof s?.channelName === 'string' && s.channelName) ? s.channelName : undefined);

      return {
        ...s,
        id,
        _id: s?._id,
        isActive,
        isLive: typeof s?.isLive === 'boolean' ? s.isLive : isActive,
        startedAt: s?.startedAt || s?.createdAt,
        viewerCount,
        roomId,
        channelName: roomId || s?.channelName,
      };
    });

    return res.status(200).json({ success: true, streams: normalized, data: normalized });
  } catch (err) {
    console.warn('[GET] /api/live-streams error:', err.message);
    return res.status(200).json({ success: true, streams: [], data: [] });
  }
});

// GET /api/live-streams/active - Alias for GET /
router.get('/active', async (req, res) => {
  return router.handle(req, res); // Redirect to main GET /
});

// GET /api/live-streams/:streamId - Get single live stream detail
router.get('/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findById(streamId);
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    const id = stream?._id ? String(stream._id) : (stream?.id ? String(stream.id) : undefined);
    const isActive = typeof stream?.isActive === 'boolean' ? stream.isActive : (typeof stream?.isLive === 'boolean' ? stream.isLive : true);
    const viewerCount = typeof stream?.viewerCount === 'number' ? stream.viewerCount : (Array.isArray(stream?.viewers) ? stream.viewers.length : 0);
    const roomId = (typeof stream?.roomId === 'string' && stream.roomId) ? stream.roomId : ((typeof stream?.channelName === 'string' && stream.channelName) ? stream.channelName : undefined);

    const streamObj = stream.toObject ? stream.toObject() : stream;

    return res.json({
      success: true,
      data: {
        ...streamObj,
        id,
        _id: streamObj?._id,
        isActive,
        isLive: typeof streamObj?.isLive === 'boolean' ? streamObj.isLive : isActive,
        startedAt: streamObj?.startedAt || streamObj?.createdAt,
        viewerCount,
        roomId,
        channelName: roomId || streamObj?.channelName,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams - Start new live stream
router.post('/', async (req, res) => {
  try {
    const { userId, title, roomId, channelName, userName, userAvatar } = req.body;
    if (!userId || !title) return res.status(400).json({ success: false, error: 'userId and title required' });

    const LiveStream = mongoose.model('LiveStream');
    const resolvedRoomId = (typeof roomId === 'string' && roomId) ? roomId : ((typeof channelName === 'string' && channelName) ? channelName : null);

    const newStream = {
      userId,
      title,
      roomId: resolvedRoomId,
      channelName: resolvedRoomId,
      userName: typeof userName === 'string' ? userName : null,
      userAvatar: typeof userAvatar === 'string' ? userAvatar : null,
      isActive: true,
      isLive: true,
      viewers: [],
      viewerCount: 0,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const savedStream = await new LiveStream(newStream).save();

    // Best-effort: notify followers
    try {
      const Follow = mongoose.model('Follow');
      const Notification = mongoose.model('Notification');
      const follows = await Follow.find({ followingId: String(userId) }).lean();
      const followerIds = follows.map(f => String(f.followerId)).filter(Boolean);
      if (followerIds.length > 0) {
        const docs = followerIds
          .filter(fid => fid !== String(userId))
          .map(fid => ({
            recipientId: String(fid),
            senderId: String(userId),
            type: 'live',
            streamId: String(savedStream._id),
            message: 'started a live stream',
            read: false,
            createdAt: new Date()
          }));
        if (docs.length > 0) await Notification.insertMany(docs);
      }
    } catch (e) {
      console.warn('[POST] /api/live-streams - Live notifications skipped:', e.message);
    }

    res.status(201).json({ success: true, id: savedStream._id, data: { ...newStream, id: String(savedStream._id) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/join - User joins stream
router.post('/:streamId/join', async (req, res) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    const viewers = Array.isArray(stream.viewers) ? stream.viewers : [];
    const updatedViewers = viewers.includes(userId) ? viewers : [...viewers, userId];

    const result = await LiveStream.findOneAndUpdate(
      { _id: toObjectId(streamId) },
      { $set: { viewers: updatedViewers, viewerCount: updatedViewers.length, updatedAt: new Date() } },
      { new: true }
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/live-streams/:streamId/end - End live stream
router.patch('/:streamId/end', async (req, res) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    if (stream.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Only stream owner can end the stream' });
    }

    const result = await LiveStream.findOneAndUpdate(
      { _id: streamId },
      { $set: { isActive: false, endedAt: new Date() } },
      { new: true }
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/agora-token - Generate Agora token
router.post('/:streamId/agora-token', async (req, res) => {
  try {
    const { userId, role } = req.body;
    const { streamId } = req.params;
    if (!userId || !role) return res.status(400).json({ success: false, error: 'userId and role required' });

    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    const agoraAppId = process.env.AGORA_APP_ID || 'demo-app-id';
    const token = Buffer.from(JSON.stringify({ appId: agoraAppId, channelName: streamId, userId, role, timestamp: Math.floor(Date.now() / 1000) })).toString('base64');

    if (role === 'subscriber') {
      const viewers = stream.viewers || [];
      if (!viewers.includes(userId)) {
        viewers.push(userId);
        await LiveStream.updateOne({ _id: toObjectId(streamId) }, { $set: { viewers, viewerCount: viewers.length } });
      }
    }
    res.json({ success: true, token, agoraAppId, channelName: streamId, userId, role });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/leave - User leaves stream
router.post('/:streamId/leave', async (req, res) => {
  try {
    const { userId } = req.body;
    const { streamId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    const LiveStream = mongoose.model('LiveStream');
    const stream = await LiveStream.findOne({ _id: toObjectId(streamId) });
    if (!stream) return res.status(404).json({ success: false, error: 'Stream not found' });

    const viewers = stream.viewers || [];
    const updatedViewers = viewers.filter(v => v !== userId);

    const updated = await LiveStream.findOneAndUpdate(
      { _id: toObjectId(streamId) },
      { $set: { viewers: updatedViewers, viewerCount: updatedViewers.length } },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Comment Endpoints for Live Streams ---

// GET /api/live-streams/:streamId/comments - Get all comments
router.get('/:streamId/comments', async (req, res) => {
  try {
    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const comments = await LiveStreamComment.find({ streamId: req.params.streamId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/comments - Add comment
router.post('/:streamId/comments', async (req, res) => {
  try {
    const { userId, text, userName, userAvatar } = req.body;
    if (!userId || !text) return res.status(400).json({ success: false, error: 'userId and text required' });

    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const newComment = {
      streamId: req.params.streamId,
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {}
    };
    const result = await LiveStreamComment.create(newComment);
    return res.status(201).json({ success: true, id: result._id, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/live-streams/:streamId/comments/:commentId - Edit comment
router.patch('/:streamId/comments/:commentId', async (req, res) => {
  try {
    const { userId, text } = req.body;
    const { streamId, commentId } = req.params;
    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const comment = await LiveStreamComment.findOne({ _id: toObjectId(commentId), streamId });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (comment.userId !== userId) return res.status(403).json({ success: false, error: 'Unauthorized' });

    const updated = await LiveStreamComment.findOneAndUpdate({ _id: toObjectId(commentId) }, { $set: { text, editedAt: new Date() } }, { new: true });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/live-streams/:streamId/comments/:commentId - Delete comment
router.delete('/:streamId/comments/:commentId', async (req, res) => {
  try {
    const { userId } = req.body;
    const { streamId, commentId } = req.params;
    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const comment = await LiveStreamComment.findOne({ _id: toObjectId(commentId), streamId });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (comment.userId !== userId) return res.status(403).json({ success: false, error: 'Unauthorized' });

    await LiveStreamComment.deleteOne({ _id: toObjectId(commentId) });
    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/comments/:commentId/like - Like comment
router.post('/:streamId/comments/:commentId/like', async (req, res) => {
  try {
    const { userId } = req.body;
    const { commentId } = req.params;
    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const comment = await LiveStreamComment.findOne({ _id: toObjectId(commentId) });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const likes = comment.likes || [];
    if (likes.includes(userId)) return res.status(400).json({ success: false, error: 'Already liked' });

    likes.push(userId);
    const updated = await LiveStreamComment.findOneAndUpdate({ _id: toObjectId(commentId) }, { $set: { likes, likesCount: likes.length } }, { new: true });
    res.json({ success: true, data: { likes: updated.likes, likesCount: updated.likesCount } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/live-streams/:streamId/comments/:commentId/reactions - React to comment
router.post('/:streamId/comments/:commentId/reactions', async (req, res) => {
  try {
    const { userId, reaction } = req.body;
    const { commentId } = req.params;
    const LiveStreamComment = mongoose.model('LiveStreamComment');
    const comment = await LiveStreamComment.findOne({ _id: toObjectId(commentId) });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const reactions = comment.reactions || {};
    reactions[reaction] = reactions[reaction] || [];
    if (!reactions[reaction].includes(userId)) reactions[reaction].push(userId);

    const updated = await LiveStreamComment.findOneAndUpdate({ _id: toObjectId(commentId) }, { $set: { reactions } }, { new: true });
    res.json({ success: true, data: { reactions: updated.reactions } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
