const express = require('express');
const router = express.Router();
const Story = require('../src/models/Story');
const mongoose = require('mongoose');

const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');

/**
 * GET /api/stories/active
 * Get all active stories (Public)
 */
router.get('/active', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const Post = mongoose.model('Post'); // Some stories might be posts? No, usually Story.
    const Story = mongoose.model('Story');
    
    // Simple fetch of all non-expired stories
    const stories = await Story.find({ expiresAt: { $gt: now } }).sort({ createdAt: -1 }).limit(100).lean();
    
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stories
 * Get stories (Public/Auth compatible)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.query;
    const requesterUserId = req.userId || null; // Use authenticated userId if available
    const limit = Math.min(parseInt(req.query.limit || '50'), 100);
    
    // Build initial match query
    const matchQuery = { expiresAt: { $gt: new Date() } };
    if (userId) matchQuery.userId = userId;

    const pipeline = [
      { $match: matchQuery },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      // 1. Join with Users collection to get author details and privacy status
      {
        $lookup: {
          from: 'users',
          let: { storyAuthorId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$firebaseUid', '$$storyAuthorId'] },
                    { $eq: ['$uid', '$$storyAuthorId'] },
                    { $eq: [{ $toString: '$_id' }, '$$storyAuthorId'] }
                  ]
                }
              }
            },
            { $project: { displayName: 1, name: 1, avatar: 1, photoURL: 1, profilePicture: 1, isPrivate: 1 } }
          ],
          as: 'author'
        }
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      
      // 2. Join with Follows collection IF requesterUserId is provided
      ...(requesterUserId ? [
        {
          $lookup: {
            from: 'follows',
            let: { authorId: '$userId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$followerId', requesterUserId] },
                      { $eq: ['$followingId', '$$authorId'] }
                    ]
                  }
                }
              }
            ],
            as: 'followStatus'
          }
        },
        { $addFields: { isFollowing: { $gt: [{ $size: '$followStatus' }, 0] } } }
      ] : [
        { $addFields: { isFollowing: false } }
      ]),

      // 3. Privacy Filtering Logic
      {
        $match: {
          $or: [
            { 'author.isPrivate': { $ne: true } }, // Author is public
            { userId: requesterUserId },           // Own story
            { isFollowing: true }                  // Requester follows author
          ]
        }
      },

      // 4. Format final output
      {
        $addFields: {
          // Map author fields to flat structure for backward compatibility
          userName: { $ifNull: ['$author.displayName', { $ifNull: ['$author.name', { $ifNull: ['$userName', 'Anonymous'] }] }] },
          userAvatar: { $ifNull: ['$author.avatar', { $ifNull: ['$author.photoURL', { $ifNull: ['$author.profilePicture', '$userAvatar'] }] }] },
        }
      },
      {
        $unset: ['followStatus', 'isFollowing', 'author']
      }
    ];

    const stories = await mongoose.model('Story').aggregate(pipeline);
    res.json({ success: true, data: stories });
  } catch (err) {
    console.error('[GET /api/stories] Aggregation Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch stories' });
  }
});

/**
 * POST /api/stories
 * Create a new story (Requires Auth)
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { userName, mediaUrl, mediaType, caption, locationData, thumbnailUrl, thumbnail } = req.body;
    const userId = req.userId; // Always use authenticated userId

    if (!userId || !mediaUrl) {
      return res.status(400).json({ success: false, error: 'userId and mediaUrl required' });
    }

    // Fetch user data from database
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });

    // Resolve structured geographical details
    let resolvedLocationData = locationData || null;
    if (caption || locationData) {
      try {
        const { resolveGeographicalData } = require('../src/utils/geoResolver');
        resolvedLocationData = resolveGeographicalData(caption, locationData);
      } catch (err) {
        console.warn('[CreateStory] Failed to resolve geo data:', err.message);
      }
    }

    const storyData = {
      userId,
      userName: user?.displayName || user?.name || userName || 'Anonymous',
      userAvatar: user?.avatar || user?.photoURL || null,
      caption: caption || '',
      locationData: resolvedLocationData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };

    if (mediaType === 'video') {
      storyData.video = mediaUrl;
      storyData.thumbnail = thumbnailUrl || thumbnail || null;
    } else {
      storyData.image = mediaUrl;
    }

    const story = new Story(storyData);
    await story.save();

    console.log('[POST /stories] Story created:', story._id, 'for user:', user?.displayName || userName);

    // BACKGROUND TRIGGER: Notify followers about new story
    (async () => {
      try {
        const Follow = mongoose.model('Follow');
        const { notificationQueue } = require('../services/queue');
        
        // Find all followers
        const followers = await Follow.find({ followingId: userId }).select('followerId').lean();
        const followerIds = followers.map(f => f.followerId);

        if (followerIds.length > 0) {
          const senderName = user?.displayName || user?.name || userName || 'Someone';
          
          // Add to queue for each follower (queue handles the actual push)
          // For very large follower counts, this should be a bulk job, but for now this is fine
          for (const fid of followerIds) {
            notificationQueue.add('newStory', {
              userId: fid,
              senderId: userId,
              title: 'New Story! 📸',
              body: `${senderName} posted a new story`,
              data: { type: 'story', storyId: String(story._id), screen: 'home' }
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[POST /stories] Follower notification failed:', err.message);
      }
    })();

    res.status(201).json({ success: true, data: story });
  } catch (err) {
    console.error('[POST /stories] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stories/:storyId
 * Get a single story by ID
 * Returns story data enriched with user info, or expired flag if unavailable
 */
router.get('/:storyId', async (req, res) => {
  try {
    const { storyId } = req.params;

    if (!storyId || !mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ success: false, error: 'Invalid storyId' });
    }

    const story = await Story.findById(storyId);

    if (!story) {
      return res.json({ success: false, expired: true, error: 'Story not found or has been deleted' });
    }

    // Check if story has expired
    if (story.expiresAt && new Date(story.expiresAt) < new Date()) {
      const storyObj = story.toObject ? story.toObject() : story;
      return res.json({
        success: false,
        expired: true,
        error: 'Story has expired',
        data: {
          id: storyObj._id,
          userId: storyObj.userId,
          userName: storyObj.userName,
          userAvatar: storyObj.userAvatar,
        }
      });
    }

    // Enrich with user data
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({
      $or: [
        { firebaseUid: story.userId },
        { uid: story.userId },
        { _id: mongoose.Types.ObjectId.isValid(story.userId) ? new mongoose.Types.ObjectId(story.userId) : null }
      ]
    });

    const storyObj = story.toObject ? story.toObject() : story;
    const enriched = {
      ...storyObj,
      id: String(storyObj._id),
      imageUrl: storyObj.image || null,
      videoUrl: storyObj.video || null,
      mediaUrl: storyObj.image || storyObj.video || null,
      mediaType: storyObj.video ? 'video' : 'image',
      userName: user?.displayName || user?.name || storyObj.userName || 'Anonymous',
      userAvatar: user?.avatar || user?.photoURL || storyObj.userAvatar || null,
    };

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('[GET /stories/:storyId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/stories/:storyId
 * Delete a story (Requires Auth)
 */
router.delete('/:storyId', verifyToken, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.userId; // Use authenticated userId

    if (!storyId) {
      return res.status(400).json({ success: false, error: 'storyId required' });
    }

    // Find the story
    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Verify ownership (if userId provided)
    if (userId && story.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to delete this story' });
    }

    // Delete the story
    await Story.findByIdAndDelete(storyId);

    console.log('[DELETE /stories/:storyId] Story deleted:', storyId);
    res.json({ success: true, message: 'Story deleted successfully' });
  } catch (err) {
    console.error('[DELETE /stories/:storyId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stories/:storyId/like
 * Like a story (Requires Auth)
 */
router.post('/:storyId/like', verifyToken, async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' });
    }

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Initialize likes array if it doesn't exist
    if (!story.likes) {
      story.likes = [];
    }

    // Toggle like
    const likeIndex = story.likes.indexOf(userId);
    if (likeIndex > -1) {
      // Unlike
      story.likes.splice(likeIndex, 1);
    } else {
      // Like
      story.likes.push(userId);
    }

    await story.save();

    // Best-effort: notify story owner on like
    try {
      const ownerId = story.userId ? String(story.userId) : null;
      const isLike = likeIndex === -1;
      if (isLike && ownerId && ownerId !== String(userId)) {
        const { notificationQueue } = require('../services/queue');
        const senderName = user?.displayName || user?.name || 'Someone';
        
        notificationQueue.add('storyLike', {
          userId: ownerId,
          senderId: userId,
          title: '❤️ Story Like',
          body: `${senderName} liked your story`,
          data: { 
            type: 'story', 
            storyId: String(storyId), 
            screen: 'home' 
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[POST /stories/:storyId/like] Notification skipped:', e.message);
    }

    console.log('[POST /stories/:storyId/like] Story liked/unliked:', storyId, 'by:', userId);
    res.json({ success: true, data: { likes: story.likes, likesCount: story.likes.length } });
  } catch (err) {
    console.error('[POST /stories/:storyId/like] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stories/:storyId/comments
 * Add a comment to a story (Requires Auth)
 */
router.post('/:storyId/comments', verifyToken, async (req, res) => {
  try {
    const { storyId } = req.params;
    const { userName, text } = req.body;
    const userId = req.userId;

    if (!userId || !text) {
      return res.status(400).json({ success: false, error: 'userId and text required' });
    }

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Initialize comments array if it doesn't exist
    if (!story.comments) {
      story.comments = [];
    }

    // Fetch user data for comment
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });

    const comment = {
      _id: new mongoose.Types.ObjectId(),
      userId,
      userName: user?.displayName || user?.name || userName || 'Anonymous',
      userAvatar: user?.avatar || user?.photoURL || null,
      text,
      createdAt: new Date()
    };

    story.comments.push(comment);
    await story.save();

    // Best-effort: notify story owner on comment
    try {
      const ownerId = story.userId ? String(story.userId) : null;
      if (ownerId && ownerId !== String(userId)) {
        const { notificationQueue } = require('../services/queue');
        const senderName = user?.displayName || user?.name || userName || 'Someone';

        notificationQueue.add('storyComment', {
          userId: ownerId,
          senderId: userId,
          title: '💬 Story Comment',
          body: `${senderName} replied to your story: ${text.substring(0, 50)}`,
          data: { 
            type: 'story', 
            storyId: String(storyId), 
            screen: 'home' 
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[POST /stories/:storyId/comments] Notification skipped:', e.message);
    }

    console.log('[POST /stories/:storyId/comments] Comment added to story:', storyId);
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    console.error('[POST /stories/:storyId/comments] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stories/:storyId/comments
 * Get comments for a story
 */
router.get('/:storyId/comments', async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Story.findById(storyId);
    if (!story) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    res.json({ success: true, data: story.comments || [] });
  } catch (err) {
    console.error('[GET /stories/:storyId/comments] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
