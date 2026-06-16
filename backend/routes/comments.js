const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { notificationQueue } = require('../services/queue');
const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { createCommentSchema } = require('../src/validations/commentValidation');


const Comment = require('../src/models/Comment');

// Helper to convert string to ObjectId safely
const toObjectId = (id) => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return null;
};

// --- Post Comments ---

// GET /api/posts/:postId/comments - Get all comments for a post (with visibility check)
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const postId = cleanPostId;
    const viewerId = req.userId || null;
    
    // 1. Resolve Post (Handle both ObjectId and String ID)
    const Post = mongoose.model('Post');
    const postQuery = {
      $or: [
        { id: postId },
        { _id: mongoose.Types.ObjectId.isValid(postId) ? new mongoose.Types.ObjectId(postId) : null }
      ].filter(q => q._id !== null || q.id)
    };

    let postObj = await Post.findOne(postQuery).lean();
    
    if (!postObj) {
      // It might be a deleted story that still exists in a Highlight snapshot.
      // We will skip visibility check and just return the comments from the collection.
    } else {
      // 2. SECURITY: Check visibility for private posts
      // We manually fetch the owner because Post.userId is a String (not a ref)
      const User = mongoose.model('User');
      const postOwnerId = postObj.userId;
      const postOwner = await User.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(postOwnerId) ? new mongoose.Types.ObjectId(postOwnerId) : null },
          { firebaseUid: postOwnerId },
          { uid: postOwnerId }
        ].filter(q => q._id !== null || q.firebaseUid || q.uid)
      }).select('isPrivate firebaseUid uid _id').lean();

      if (postOwner?.isPrivate || postObj.isPrivate) {
        if (!viewerId) {
          return res.status(403).json({ success: false, error: 'Private content: Please log in to view comments', data: [] });
        }

        const { resolveUserIdentifiers } = require('../src/utils/userUtils');
        const viewer = await resolveUserIdentifiers(viewerId);
        
        const isSelf = viewer.candidates.some(c => 
          [String(postOwner?._id), postOwner?.firebaseUid, postOwner?.uid].filter(Boolean).includes(String(c))
        );

        if (!isSelf) {
          const Follow = mongoose.model('Follow');
          const isFollowing = await Follow.findOne({
            followerId: { $in: viewer.candidates },
            followingId: { $in: [String(postOwner?._id), postOwner?.firebaseUid, postOwner?.uid].filter(Boolean) }
          }).lean();

          if (!isFollowing) {
            return res.status(403).json({ success: false, error: 'Private content: You must follow this user to view comments', data: [] });
          }
        }
      }
    }
    
    // 2. Fetch comments from dedicated collection using aggregation for author data
    const postIdCandidates = [postId];
    if (postObj?.id) postIdCandidates.push(String(postObj.id));
    if (postObj?._id) postIdCandidates.push(String(postObj._id));
    
    const enrichedComments = await Comment.aggregate([
      { $match: { postId: { $in: postIdCandidates } } },
      { $sort: { createdAt: -1 } },
      // Author Lookup
      {
        $lookup: {
          from: 'users',
          let: { authorId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$authorId'] },
                    { $eq: ['$firebaseUid', '$$authorId'] },
                    { $eq: ['$uid', '$$authorId'] },
                    // Support case where userId is stored as string in Comment but ObjectId in User
                    { $eq: [{ $toString: "$_id" }, { $toString: "$$authorId" }] }
                  ]
                }
              }
            },
            { $project: { displayName: 1, name: 1, avatar: 1, photoURL: 1, profilePicture: 1 } }
          ],
          as: 'author'
        }
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          userName: { $ifNull: ['$author.displayName', { $ifNull: ['$author.name', '$userName'] }] },
          userAvatar: { $ifNull: ['$author.avatar', { $ifNull: ['$author.photoURL', { $ifNull: ['$author.profilePicture', '$userAvatar'] }] }] }
        }
      },
      { $project: { author: 0 } }
    ]);

    console.log(`[GET comments] Found ${enrichedComments.length} collection comments.`);

    // 3. Attempt to extract inline comments (Legacy fallback)
    const inlineComments = Array.isArray(postObj?.comments) ? postObj.comments : 
                         (Array.isArray(postObj?.post_comments) ? postObj.post_comments : 
                         (Array.isArray(postObj?.replies) ? postObj.replies : []));

    if (inlineComments.length > 0) {
      // Merge logic if there are inline comments
      const commentMap = new Map();
      inlineComments.forEach((c, index) => {
        const id = String(c._id || c.id || `legacy-${index}`);
        commentMap.set(id, {
          ...c,
          _id: id,
          id: id,
          text: c.text || c.content || c.message || c.comment || ""
        });
      });
      enrichedComments.forEach(c => commentMap.set(String(c._id), c));
      
      const finalComments = Array.from(commentMap.values())
        .filter(c => (c.text || "").trim().length > 0)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      
      return res.json({ success: true, data: finalComments });
    }

    res.json({ success: true, data: enrichedComments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments/:commentId/like - Like a comment
router.post('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const { commentId } = req.params;
    const postId = cleanPostId;
    
    // 1. Try finding in Comment collection first
    let comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (comment) {
      if (!comment.likes) comment.likes = [];
      if (!comment.likes.includes(userId)) {
        comment.likes.push(userId);
        comment.likesCount = comment.likes.length;
        await comment.save();
      }
      return res.json({ success: true, likesCount: comment.likesCount });
    }

    // 2. Fallback: Try finding and updating in Post document (Legacy inline comments)
    const Post = mongoose.model('Post');
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Look for legacy fields
    const fields = ['comments', 'post_comments', 'replies'];
    let updated = false;
    let newLikesCount = 0;

    for (const field of fields) {
      if (Array.isArray(post[field])) {
        const idx = post[field].findIndex(c => String(c._id || c.id) === String(commentId));
        if (idx > -1) {
          const c = post[field][idx];
          if (!c.likes) c.likes = [];
          if (!c.likes.includes(userId)) {
            c.likes.push(userId);
            c.likesCount = c.likes.length;
          }
          newLikesCount = c.likesCount;
          post.markModified(field);
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      await post.save();
      return res.json({ success: true, likesCount: newLikesCount });
    }

    res.status(404).json({ success: false, error: 'Comment not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/like - Unlike a comment
router.delete('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const { commentId } = req.params;
    const postId = cleanPostId;

    // 1. Try Comment collection
    let comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

    if (comment) {
      if (comment.likes) {
        comment.likes = comment.likes.filter(id => String(id) !== String(userId));
        comment.likesCount = comment.likes.length;
        await comment.save();
      }
      return res.json({ success: true, likesCount: comment.likesCount });
    }

    // 2. Try Post document (Legacy)
    const Post = mongoose.model('Post');
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const fields = ['comments', 'post_comments', 'replies'];
    let updated = false;
    let newLikesCount = 0;

    for (const field of fields) {
      if (Array.isArray(post[field])) {
        const idx = post[field].findIndex(c => String(c._id || c.id) === String(commentId));
        if (idx > -1) {
          const c = post[field][idx];
          if (c.likes) {
            c.likes = c.likes.filter(id => String(id) !== String(userId));
            c.likesCount = c.likes.length;
          }
          newLikesCount = c.likesCount;
          post.markModified(field);
          updated = true;
          break;
        }
      }
    }

    if (updated) {
      await post.save();
      return res.json({ success: true, likesCount: newLikesCount });
    }

    res.status(404).json({ success: false, error: 'Comment not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/posts/:postId/comments - Add a comment to a post
router.post('/:postId/comments', verifyToken, validate(createCommentSchema), async (req, res) => {
  try {
    const { text, userName, userAvatar } = req.body;
    const userId = req.userId; // Securely take from token
    if (!text) return res.status(400).json({ success: false, error: 'Missing comment text' });

    const cleanPostId = String(req.params.postId).split('-loop')[0];
    const newComment = new Comment({
      postId: cleanPostId,
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {},
      replies: []
    });
    await newComment.save();

    try {
      const Post = mongoose.model('Post');
      const post = await Post.findOne({
        $or: [
          { id: cleanPostId },
          ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
        ]
      });
      if (post) {
        post.commentsCount = (post.commentsCount || 0) + 1;
        post.commentCount = (post.commentCount || 0) + 1;
        await post.save();
      }
      
      if (post && String(post.userId) !== String(userId)) {
        const User = mongoose.model('User');
        const sender = await User.findById(userId).select('displayName name').lean();
        const senderName = sender?.displayName || sender?.name || 'Someone';

        notificationQueue.add('postComment', {
          userId: post.userId,
          senderId: userId,
          title: 'New Comment! 💬',
          body: `${senderName} commented: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
          data: { postId: post._id, type: 'COMMENT', screen: 'home' }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.status(201).json({ success: true, id: newComment._id, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/posts/:postId/comments/:commentId - Edit a comment
router.patch('/:postId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const { text } = req.body;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);
    
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    
    // Check if any of the user's ID candidates matches the comment author's ID
    const isAuthor = candidates.some(id => String(id) === String(comment.userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.text = text;
    comment.editedAt = new Date();
    await comment.save();
    res.json({ success: true, data: comment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId - Delete a comment
router.delete('/:postId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    
    // Check if any of the user's ID candidates matches the comment author's ID
    const isAuthor = candidates.some(id => String(id) === String(comment.userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    await Comment.deleteOne({ _id: req.params.commentId });

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: -1, commentCount: -1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// --- Comment Reactions & Likes ---

// POST /api/posts/:postId/comments/:commentId/like - Like a comment
router.post('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;
    
    // Find comment by multiple ID variants
    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (!comment.likes) comment.likes = [];
    if (comment.likes.includes(userId)) {
      return res.json({ success: true, likesCount: comment.likes.length, message: 'Already liked' });
    }

    comment.likes.push(userId);
    comment.likesCount = comment.likes.length;
    await comment.save();
    res.json({ success: true, likesCount: comment.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// DELETE /api/posts/:postId/comments/:commentId/like - Unlike a comment
router.delete('/:postId/comments/:commentId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId } = req.params;

    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    if (comment.likes) {
      comment.likes = comment.likes.filter(id => String(id) !== String(userId));
      comment.likesCount = comment.likes.length;
      await comment.save();
    }
    res.json({ success: true, likesCount: comment.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// POST /api/posts/:postId/comments/:commentId/replies/:replyId/like - Like a reply
router.post('/:postId/comments/:commentId/replies/:replyId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId, replyId } = req.params;
    
    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });
    
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id || r.id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reply = comment.replies[replyIndex];
    if (!reply.likes) reply.likes = [];
    
    if (!reply.likes.includes(userId)) {
      reply.likes.push(userId);
      reply.likesCount = reply.likes.length;
      comment.markModified('replies');
      await comment.save();
    }

    res.json({ success: true, likesCount: reply.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId/like - Unlike a reply
router.delete('/:postId/comments/:commentId/replies/:replyId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { commentId, replyId } = req.params;

    const comment = await Comment.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(commentId) ? new mongoose.Types.ObjectId(commentId) : null },
        { id: commentId }
      ].filter(q => q._id !== null || q.id)
    });

    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id || r.id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    const reply = comment.replies[replyIndex];
    if (reply.likes) {
      const originalCount = reply.likes.length;
      reply.likes = reply.likes.filter(id => String(id) !== String(userId));
      reply.likesCount = reply.likes.length;
      
      if (originalCount !== reply.likes.length) {
        comment.markModified('replies');
        await comment.save();
      }
    }

    res.json({ success: true, likesCount: reply.likesCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// --- Comment Replies ---

// POST /api/posts/:postId/comments/:commentId/replies - Add reply
router.post('/:postId/comments/:commentId/replies', verifyToken, async (req, res) => {
  try {
    const { text, userName, userAvatar } = req.body;
    const userId = req.userId;
    const { commentId } = req.params;

    const reply = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      userName: userName || 'Anonymous',
      userAvatar: userAvatar || null,
      text,
      createdAt: new Date(),
      likes: [],
      likesCount: 0,
      reactions: {}
    };

    const result = await Comment.findByIdAndUpdate(
      commentId,
      { $push: { replies: reply }, $set: { updatedAt: new Date() } },
      { new: true }
    );

    if (!result) return res.status(404).json({ success: false, error: 'Comment not found' });

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: 1, commentCount: 1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.status(201).json({ success: true, id: reply._id, data: reply });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/posts/:postId/comments/:commentId/replies/:replyId - Delete reply
router.delete('/:postId/comments/:commentId/replies/:replyId', verifyToken, async (req, res) => {
  try {
    const { commentId, replyId, postId } = req.params;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const reply = comment.replies.find(r => String(r._id) === String(replyId));
    if (!reply) return res.status(404).json({ success: false, error: 'Reply not found' });

    // Check ownership
    const isAuthor = candidates.some(id => String(id) === String(reply.userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.replies = comment.replies.filter(r => String(r._id) !== String(replyId));
    await comment.save();

    // Update post count
    try {
      const Post = mongoose.model('Post');
      await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: -1, commentCount: -1 } });
    } catch (e) {
      console.warn('Post count update failed:', e.message);
    }

    res.json({ success: true, message: 'Reply deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/posts/:postId/comments/:commentId/replies/:replyId - Edit reply
router.patch('/:postId/comments/:commentId/replies/:replyId', verifyToken, async (req, res) => {
  try {
    const { commentId, replyId } = req.params;
    const { text } = req.body;
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const replyIndex = comment.replies.findIndex(r => String(r._id) === String(replyId));
    if (replyIndex === -1) return res.status(404).json({ success: false, error: 'Reply not found' });

    // Check ownership
    const isAuthor = candidates.some(id => String(id) === String(comment.replies[replyIndex].userId));
    if (!isAuthor) return res.status(403).json({ success: false, error: 'Unauthorized' });

    comment.replies[replyIndex].text = text;
    comment.replies[replyIndex].editedAt = new Date();
    comment.markModified('replies');
    await comment.save();

    res.json({ success: true, data: comment.replies[replyIndex] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
