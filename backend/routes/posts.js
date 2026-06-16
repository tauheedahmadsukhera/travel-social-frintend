const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { 
  enrichPostsWithUserData, 
  escapeRegExp, 
  formatLocationLabel 
} = require('../utils/postHelpers');
const { notificationQueue } = require('../services/queue');
const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');
const postService = require('../services/postService');
const logger = require('../src/utils/logger');
const cacheMiddleware = require('../src/middleware/cacheMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { logEvent } = require('../src/services/analyticsService');
const { createPostSchema, updatePostSchema } = require('../src/validations/postValidation');

// Helper to resolve post by both ObjectId and custom String ID
function resolvePostQuery(postId) {
  const cleanId = String(postId).split('-loop')[0];
  const or = [{ id: cleanId }];
  if (mongoose.Types.ObjectId.isValid(cleanId)) {
    or.unshift({ _id: new mongoose.Types.ObjectId(cleanId) });
  }
  return { $or: or };
}

// --- Basic CRUD ---

/**
 * GET / - Get all posts (generic list) (Requires Auth & Cached)
 */
router.get('/', verifyToken, cacheMiddleware(300), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');
    const viewerId = req.userId; // Use authenticated userId

    const enriched = await postService.getEnrichedPosts({}, { skip, limit, viewerId });
    
    // Log feed view for analytics
    logEvent('FEED_VIEWED', { count: enriched.length, skip, limit }, viewerId);
    
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Feed & Discovery Routes ---


/**
 * GET /feed - Optimized personalized feed
 * Uses a single database query with visibility filtering logic.
 */
router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    // SECURITY FIX: Never trust client-provided user IDs for feed personalization.
    // Use the verified token's userId if authenticated.
    const currentUserId = req.userId || null;
    let viewerVariants = [];
    
    if (currentUserId) {
      const { candidates } = await resolveUserIdentifiers(currentUserId);
      viewerVariants = candidates.map(id => String(id));
    }

    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');
    
    const Post = mongoose.model('Post');
    const Group = mongoose.model('Group');

    // 1. If viewer is logged in, find which groups they belong to
    let viewerGroups = [];
    if (viewerVariants.length > 0) {
      viewerGroups = await Group.find({ members: { $in: viewerVariants } }).lean();
    }

    const authorGroupTypes = {};
    const viewerGroupIds = [];
    viewerGroups.forEach(g => {
      viewerGroupIds.push(String(g._id));
      const authorId = String(g.userId);
      if (!authorGroupTypes[authorId]) authorGroupTypes[authorId] = new Set();
      authorGroupTypes[authorId].add(g.type);
    });

    const authorsWithFriendsGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('friends'));
    const authorsWithFamilyGroup = Object.keys(authorGroupTypes).filter(id => authorGroupTypes[id].has('family'));

    // 2. Construct optimized query
    const visibilityQuery = {
      $or: [
        { isPrivate: { $ne: true } }, 
        { visibility: 'Everyone' },   
        { userId: { $in: viewerVariants } }, 
        { allowedFollowers: { $in: [...viewerVariants, ...viewerGroupIds] } } 
      ]
    };

    if (viewerVariants.length > 0) {
      if (authorsWithFriendsGroup.length > 0) {
        visibilityQuery.$or.push({ 
          userId: { $in: authorsWithFriendsGroup }, 
          visibility: { $in: ['Friends', 'friends'] } 
        });
      }
      if (authorsWithFamilyGroup.length > 0) {
        visibilityQuery.$or.push({ 
          userId: { $in: authorsWithFamilyGroup }, 
          visibility: { $in: ['Family', 'family'] } 
        });
      }
    }

    // 3. Execute optimized fetch
    const finalPosts = await postService.getEnrichedPosts(visibilityQuery, { 
      skip, 
      limit, 
      viewerId: currentUserId 
    });

    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err);
  }
});

// GET /recommended - Randomized discovery feed
router.get('/recommended', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const Post = mongoose.model('Post');
    
    // Aggregation for random public posts
    const posts = await Post.aggregate([
      { 
        $match: { 
          $or: [
            { isPrivate: { $ne: true } },
            { visibility: 'Everyone' }
          ]
        } 
      },
      { $sample: { size: limit } },
      { $sort: { createdAt: -1 } }
    ]);

    const viewerId = req.userId || null;
    const finalPosts = await enrichPostsWithUserData(posts, viewerId);
    res.json({ success: true, data: finalPosts });
  } catch (err) {
    next(err);
  }
});

// --- Location Routes ---

// GET /hashtags - Search for unique hashtags
router.get('/hashtags', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().replace(/^#/, ''); // Remove leading # if present
    const limit = Math.min(parseInt(req.query.limit || '20'), 50);
    const Post = mongoose.model('Post');

    // Use aggregation to find unique hashtags and their counts
    const results = await Post.aggregate([
      { $unwind: '$hashtags' }, // Split hashtags array into individual rows
      { 
        $match: { 
          hashtags: new RegExp('^' + escapeRegExp(q), 'i'), // Match starts with query
          $or: [{ isPrivate: { $ne: true } }, { visibility: 'Everyone' }] // Only public
        } 
      },
      { $group: { _id: { $toLower: '$hashtags' }, count: { $sum: 1 }, original: { $first: '$hashtags' } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    const data = results.map(r => ({
      name: r.original || r._id,
      count: r.count
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /hashtags] Error:', err);
    res.json({ success: false, error: err.message, data: [] });
  }
});

// GET /hashtags/posts - Get all posts for a specific hashtag (No looping)
router.get('/hashtags/posts', async (req, res) => {
  try {
    const tag = (req.query.hashtag || '').trim().replace(/^#/, '');
    if (!tag) return res.json({ success: true, data: [] });

    const limit = Math.min(parseInt(req.query.limit || '50'), 100);
    const skip = parseInt(req.query.skip || '0');
    const Post = mongoose.model('Post');

    const query = {
      hashtags: new RegExp('^' + escapeRegExp(tag) + '$', 'i'), // Match exact hashtag
      $or: [{ isPrivate: { $ne: true } }, { visibility: 'Everyone' }]
    };

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate')
      .lean();

    const viewerId = req.query.viewerId || null;
    const enriched = await enrichPostsWithUserData(posts, viewerId);
    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /locations/suggest - Autocomplete for locations
router.get('/locations/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const limit = Math.min(parseInt(req.query.limit || '10'), 25);
    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(q), 'i');

    const results = await Post.aggregate([
      { $match: { $or: [{ location: regex }, { 'locationData.name': regex }] } },
      { $group: { _id: { $ifNull: ['$locationData.name', '$location'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    const data = results.map(r => ({
      name: formatLocationLabel(r._id),
      count: r.count
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// GET /by-location - Get posts filtered by location name or keys
router.get('/by-location', optionalAuth, async (req, res) => {
  try {
    const location = (req.query.location || '').trim();
    const limit = Math.min(parseInt(req.query.limit || '20'), 100);
    const skip = parseInt(req.query.skip || '0');
    // SECURITY FIX: Use verified token ID
    const viewerId = req.userId || null;

    if (!location) {
      return res.json({ success: true, data: [] });
    }

    const Post = mongoose.model('Post');
    
    const { countries, continents } = require('countries-list');
    
    // Split search query into parts (e.g. "Paris, France" -> ["paris", "france"])
    const parts = location.split(',').map(p => p.trim()).filter(p => p.length > 2);
    const normalizedLocs = parts.map(p => p.toLowerCase());
    if (location.length > 2 && !normalizedLocs.includes(location.toLowerCase())) {
      normalizedLocs.push(location.toLowerCase());
    }

    const conditions = [];

    // Process each search term
    normalizedLocs.forEach(loc => {
      const regex = new RegExp(escapeRegExp(loc), 'i');
      
      // 1. Direct matches (String based)
      conditions.push({ locationKeys: { $in: [loc] } });
      conditions.push({ location: regex });
      conditions.push({ 'locationData.name': regex });
      conditions.push({ 'locationData.address': regex });
      conditions.push({ 'locationData.city': regex });
      conditions.push({ 'locationData.country': regex });
      conditions.push({ 'locationData.continent': regex });

      // 2. Continent detection dynamically
      let targetContinentName = null;
      let targetContinentCode = null;
      for (const [code, name] of Object.entries(continents)) {
        if (name.toLowerCase() === loc || (loc === 'americas' && (name.toLowerCase() === 'north america' || name.toLowerCase() === 'south america'))) {
          targetContinentName = name;
          targetContinentCode = code;
          break;
        }
      }

      if (loc === 'america' || loc === 'americas') {
        targetContinentName = 'Americas';
      }

      if (targetContinentCode || targetContinentName === 'Americas') {
        if (targetContinentName === 'Americas') {
          conditions.push({ 'locationData.continent': { $in: ['North America', 'South America'] } });
          
          const codes = Object.entries(countries)
            .filter(([_, info]) => info.continent === 'NA' || info.continent === 'SA')
            .map(([code]) => code);
          const codesLower = codes.map(c => c.toLowerCase());
          conditions.push({ 'locationData.countryCode': { $in: [...codes, ...codesLower] } });
          
          Object.entries(countries)
            .filter(([_, info]) => info.continent === 'NA' || info.continent === 'SA')
            .forEach(([_, info]) => {
              const nameRegex = new RegExp(escapeRegExp(info.name), 'i');
              conditions.push({ 'locationData.country': nameRegex });
            });
        } else {
          conditions.push({ 'locationData.continent': new RegExp(escapeRegExp(targetContinentName), 'i') });
          
          const codes = Object.entries(countries)
            .filter(([_, info]) => info.continent === targetContinentCode)
            .map(([code]) => code);
          const codesLower = codes.map(c => c.toLowerCase());
          conditions.push({ 'locationData.countryCode': { $in: [...codes, ...codesLower] } });
          
          Object.entries(countries)
            .filter(([_, info]) => info.continent === targetContinentCode)
            .forEach(([_, info]) => {
              const nameRegex = new RegExp(escapeRegExp(info.name), 'i');
              conditions.push({ 'locationData.country': nameRegex });
            });
        }
      }

      // 3. Country detection dynamically
      let targetCountryName = null;
      let targetCountryCode = null;
      if (loc.length === 2) {
        const codeUpper = loc.toUpperCase();
        if (countries[codeUpper]) {
          targetCountryName = countries[codeUpper].name;
          targetCountryCode = codeUpper;
        }
      } else {
        const { countryNameToCode } = require('../src/utils/geoResolver');
        const code = countryNameToCode[loc];
        if (code && countries[code]) {
          targetCountryName = countries[code].name;
          targetCountryCode = code;
        }
      }

      if (targetCountryCode) {
        conditions.push({ 'locationData.countryCode': { $in: [targetCountryCode, targetCountryCode.toLowerCase()] } });
        conditions.push({ 'locationData.country': new RegExp(escapeRegExp(targetCountryName), 'i') });
        conditions.push({ locationKeys: { $in: [targetCountryName.toLowerCase(), targetCountryCode.toLowerCase()] } });
        
        // Also support common country aliases in search
        const countryAliases = {
          'US': ['usa', 'us', 'america', 'united states of america'],
          'GB': ['uk', 'gb', 'great britain', 'united kingdom'],
          'AE': ['united arab emirates', 'dubai', 'abu dhabi', 'uae'],
          'PK': ['pk', 'islamabad', 'karachi', 'lahore', 'pakistan']
        };
        const aliases = countryAliases[targetCountryCode] || [];
        aliases.forEach(alias => {
          const aRegex = new RegExp(escapeRegExp(alias), 'i');
          conditions.push({ location: aRegex });
          conditions.push({ 'locationData.address': aRegex });
          conditions.push({ locationKeys: { $in: [alias.toLowerCase()] } });
        });
      }
    });

    const query = {
      $and: [
        { $or: conditions.length > 0 ? conditions : [{ location: new RegExp(escapeRegExp(location), 'i') }] },
        { 
          $or: [
            { isPrivate: { $ne: true } },
            { visibility: 'Everyone' },
            { visibility: { $exists: false } },
            { visibility: null }
          ] 
        }
      ]
    };

    logger.info(`[Search] Location: "${location}", Query Conditions: ${conditions.length}`);

    // PERFORMANCE UPGRADE: Use Aggregation Pipeline to handle Search + Author + Stats + SavedStatus in ONE DB Roundtrip
    const viewerVariants = viewerId ? [String(viewerId)] : [];
    if (viewerId) {
      try {
        const { candidates } = await require('../src/utils/userUtils').resolveUserIdentifiers(viewerId);
        candidates.forEach(id => { if (!viewerVariants.includes(String(id))) viewerVariants.push(String(id)); });
      } catch (e) {}
    }
    const viewerStrings = viewerVariants.map(String);

    const aggregatePipeline = [
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      
      // Lookup Comment count
      {
        $lookup: {
          from: 'comments',
          let: { pId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$postId', '$$pId'] } } },
            { $count: 'count' }
          ],
          as: 'commentData'
        }
      },

      // Lookup Saved Status
      {
        $lookup: {
          from: 'savedposts',
          let: { pId: '$_id' },
          pipeline: [
            { 
              $match: { 
                $expr: { 
                  $and: [
                    { $eq: ['$postId', '$$pId'] },
                    { $in: ['$userId', viewerStrings] }
                  ]
                } 
              } 
            },
            { $limit: 1 }
          ],
          as: 'savedStatus'
        }
      },

      // Project final fields to match enrichPostsWithUserData output
      {
        $addFields: {
          commentCount: { 
            $add: [
              { $ifNull: [{ $arrayElemAt: ['$commentData.count', 0] }, 0] },
              { $size: { $ifNull: ['$comments', []] } } // Legacy inline
            ]
          },
          isSaved: { $gt: [{ $size: '$savedStatus' }, 0] },
          likeCount: { 
            $cond: { 
              if: { $isArray: '$likes' }, 
              then: { $size: '$likes' }, 
              else: { $ifNull: ['$likesCount', 0] } 
            }
          },
          isLiked: {
            $cond: {
              if: { $isArray: '$likes' },
              then: { $anyElementTrue: { $map: { input: '$likes', as: 'l', in: { $in: [{ $toString: '$$l' }, viewerStrings] } } } },
              else: false
            }
          }
        }
      }
    ];

    const posts = await Post.aggregate(aggregatePipeline);
    const enriched = await enrichPostsWithUserData(posts, viewerId);

    logger.info(`[Search] Found ${enriched.length} posts for "${location}" (Optimized & Enriched)`);
    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('[GET /by-location] Error: %s', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /location-count - Get total number of unique locations
router.get('/location-count', async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const count = await Post.distinct('locationData.name').then(arr => arr.length);
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.json({ success: true, data: { count: 0 } });
  }
});

// GET /locations/meta - Get metadata for a location (visit counts, etc.)
router.get('/locations/meta', async (req, res) => {
  try {
    const location = (req.query.location || '').trim();
    if (!location) return res.status(400).json({ success: false, error: 'location required' });

    const Post = mongoose.model('Post');
    const regex = new RegExp(escapeRegExp(location), 'i');

    const query = {
      $or: [
        { locationKeys: { $in: [location.toLowerCase(), location] } },
        { location: regex },
        { 'locationData.name': regex }
      ]
    };

    const count = await Post.countDocuments(query);
    const verifiedCount = await Post.countDocuments({ ...query, 'locationData.verified': true });

    res.json({
      success: true,
      data: {
        location,
        visits: count,
        postCount: count,
        verifiedVisits: verifiedCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Post CRUD & Actions ---

// POST / - Create post
router.post('/', verifyToken, validate(createPostSchema), async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    // Whitelist fields to prevent mass assignment vulnerability
    const allowed = [
      'content', 'caption', 'imageUrl', 'mediaUrls', 'mediaType', 'thumbnailUrl',
      'aspectRatio', 'location', 'locationData', 'locationKeys', 'category',
      'hashtags', 'mentions', 'taggedUserIds', 'isPrivate', 'visibility', 'allowedFollowers'
    ];
    const postData = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) postData[f] = req.body[f]; });
    // Always use authenticated userId from token, NEVER trust body.userId
    postData.userId = req.userId;

    // Resolve structured geographical details
    if (postData.location || postData.locationData) {
      try {
        const { resolveGeographicalData } = require('../src/utils/geoResolver');
        postData.locationData = resolveGeographicalData(postData.location, postData.locationData);
      } catch (err) {
        console.warn('[CreatePost] Failed to resolve geo data:', err.message);
      }
    }

    const post = new Post(postData);
    await post.save();
    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /:postId - Detail
router.get('/:postId', optionalAuth, async (req, res) => {
  try {
    // SECURITY FIX: Never trust client-provided headers/queries for user identity
    const viewerId = req.userId || null;
    const query = resolvePostQuery(req.params.postId);

    const enriched = await postService.getEnrichedPosts(query, { limit: 1, viewerId });

    if (!enriched || enriched.length === 0) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, data: enriched[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH / :postId - Edit (requires auth + ownership)
router.patch('/:postId', verifyToken, validate(updatePostSchema), async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Ownership check: allow if userId matches any known variant
    const { candidates } = await resolveUserIdentifiers(req.userId);
    const postOwner = String(post.userId || '');
    const isOwner = candidates.map(String).includes(postOwner);
    if (!isOwner) return res.status(403).json({ success: false, error: 'Forbidden: not your post' });

    // Whitelist editable fields
    const editable = ['content', 'caption', 'mediaUrls', 'mediaType', 'location', 'locationData', 'locationKeys',
      'category', 'hashtags', 'mentions', 'taggedUserIds', 'isPrivate', 'visibility',
      'allowedFollowers', 'thumbnailUrl', 'aspectRatio'];
    const updateData = { updatedAt: new Date() };
    editable.forEach(f => { if (req.body[f] !== undefined) updateData[f] = req.body[f]; });

    const updated = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $set: updateData },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId - Delete (requires auth + ownership)
router.delete('/:postId', verifyToken, async (req, res) => {
  try {
    const Post = mongoose.model('Post');
    const post = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    // Ownership check
    const { candidates } = await resolveUserIdentifiers(req.userId);
    const postOwner = String(post.userId || '');
    const isOwner = candidates.map(String).includes(postOwner);
    if (!isOwner) return res.status(403).json({ success: false, error: 'Forbidden: not your post' });

    await Post.deleteOne(resolvePostQuery(req.params.postId));
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:postId/react - Add/Update Emoji Reaction
router.post('/:postId/react', verifyToken, async (req, res) => {
  try {
    const { userName, userAvatar, emoji } = req.body;
    const userId = req.userId;
    const Post = mongoose.model('Post');
    await Post.updateOne(
      resolvePostQuery(req.params.postId),
      { $pull: { reactions: { userId: String(userId) } } }
    );
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { 
        $push: { 
          reactions: { 
            userId: String(userId), 
            userName: userName || 'User', 
            userAvatar: userAvatar || '', 
            emoji: emoji || '❤️', 
            createdAt: new Date() 
          } 
        } 
      },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:postId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { userName } = req.body;
    const Post = mongoose.model('Post');
    
    // 1. Resolve all user ID variants
    const { canonicalId, candidates } = await resolveUserIdentifiers(userId);
    
    // 2. Check if already liked using any known variant
    const existingPost = await Post.findOne(resolvePostQuery(req.params.postId));
    if (!existingPost) return res.status(404).json({ success: false, error: 'Post not found' });

    // Use candidates to check if ANY of the user's IDs are in the likes array
    const alreadyLiked = Array.isArray(existingPost.likes) && existingPost.likes.some(l => {
      const lid = String(l?._id || l?.id || l || '');
      return candidates.includes(lid);
    });
    
    if (alreadyLiked) {
      // If already liked, just return success without incrementing
      return res.json({ success: true, data: existingPost, message: 'Already liked' });
    }

    // 3. Add canonicalId to ensure consistency in the database
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $addToSet: { likes: canonicalId }, $inc: { likesCount: 1 } },
      { new: true }
    );

    if (post && String(post.userId) !== String(canonicalId)) {
      const User = mongoose.model('User');
      const sender = await User.findById(canonicalId).select('displayName name').lean();
      const senderName = sender?.displayName || sender?.name || 'Someone';

      notificationQueue.add('postLike', {
        userId: post.userId,
        senderId: canonicalId,
        title: 'New Like! ❤️',
        body: `${senderName} liked your post`,
        data: { postId: post._id, type: 'LIKE', screen: 'home' }
      }).catch(() => {});
    }

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:postId/like - Unlike
router.delete('/:postId/like', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { candidates } = await resolveUserIdentifiers(userId);
    const Post = mongoose.model('Post');
    
    // Pull any known ID variant from the likes array
    const post = await Post.findOneAndUpdate(
      resolvePostQuery(req.params.postId),
      { $pull: { likes: { $in: candidates } }, $inc: { likesCount: -1 } },
      { new: true }
    );
    
    if (post && post.likesCount < 0) {
      post.likesCount = 0;
      await post.save();
    }
    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:postId/comments - Get comments for a specific post
router.get('/:postId/comments', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const viewerId = req.userId || null;
    
    const Post = mongoose.model('Post');
    const Comment = mongoose.model('Comment');
    
    // Resolve post
    const post = await Post.findOne(resolvePostQuery(postId)).lean();

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Fetch comments
    const comments = await Comment.find({ 
      postId: { $in: [String(post._id), String(post.id)].filter(Boolean) } 
    }).sort({ createdAt: -1 }).lean();

    // Enrich comments with author data
    const User = mongoose.model('User');
    const enriched = await Promise.all(comments.map(async (c) => {
      const author = await User.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(c.userId) ? new mongoose.Types.ObjectId(c.userId) : null },
          { firebaseUid: c.userId },
          { uid: c.userId }
        ].filter(q => q._id !== null || q.firebaseUid || q.uid)
      }).select('displayName name avatar photoURL profilePicture').lean();

      return {
        ...c,
        userName: author?.displayName || author?.name || 'Anonymous',
        userAvatar: author?.avatar || author?.photoURL || author?.profilePicture || null
      };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

