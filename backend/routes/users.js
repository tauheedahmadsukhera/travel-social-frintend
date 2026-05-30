const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { verifyToken, optionalAuth } = require('../src/middleware/authMiddleware');
const { enrichPostsWithUserData } = require('../utils/postHelpers');
const postService = require('../services/postService');
const logger = require('../src/utils/logger');
const cacheMiddleware = require('../src/middleware/cacheMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { logEvent } = require('../src/services/analyticsService');
const { updateProfileSchema } = require('../src/validations/userValidation');

// Use centralized User model (already loaded by auth.js or server initialization)
let User;
try {
  User = mongoose.model('User');
} catch {
  // Fallback with same schema as auth.js for consistency
  const userSchema = new mongoose.Schema({
    firebaseUid: { type: String, sparse: true },
    email: { type: String, unique: true, required: true },
    displayName: String,
    avatar: String,
    bio: String,
    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });
  User = mongoose.model('User', userSchema);
}

// GET /api/users/search - Search for users (Requires Auth & Cached)
router.get('/search', verifyToken, cacheMiddleware(60), async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const requesterUserId = req.userId;

    if (!q || q.trim().length === 0) {
      console.log('[GET /search] Empty query, returning empty results');
      return res.json({ success: true, data: [] });
    }

    // Search by displayName, email, bio, or username
    // Sanitize q to prevent ReDoS/Injection
    const safeQ = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(safeQ, 'i');

    console.log('[GET /search] Searching for:', q, 'requester:', requesterUserId);
    
    // Log search event
    logEvent('USER_SEARCH', { query: q, limit }, requesterUserId);

    // Build query to exclude current user
    const searchQuery = {
      $or: [
        { displayName: searchRegex },
        { email: searchRegex },
        { bio: searchRegex },
        { username: searchRegex }
      ]
    };

    // Exclude current user from search results
    if (requesterUserId) {
      searchQuery.$and = [
        { _id: { $ne: mongoose.Types.ObjectId.isValid(requesterUserId) ? new mongoose.Types.ObjectId(requesterUserId) : null } },
        { firebaseUid: { $ne: requesterUserId } }
      ];
    }

    const users = await User.find(searchQuery)
      .limit(parseInt(limit) || 20)
      .select('_id firebaseUid displayName avatar bio followersCount followingCount isPrivate')
      .exec();

    console.log('[GET /search] Found', users.length, 'users (excluding self)');

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId/passport - Get passport data
router.get('/:userId/passport', async (req, res) => {
  try {
    const { userId } = req.params;
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Passport = mongoose.model('Passport');

    const resolved = await resolveUserIdentifiers(userId);
    
    // Also add ObjectId variants for Passport userId matching just in case
    const objectIdCandidates = resolved.candidates
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
      
    let passport = await Passport.findOne({ 
      $or: [
        { userId: { $in: resolved.candidates } },
        { userId: { $in: objectIdCandidates } }
      ]
    });
    
    if (!passport) {
      return res.json({ success: true, data: { ticketCount: 0, stamps: [] } });
    }

    const passportObj = passport.toObject();
    const normalizeKey = (val) => String(val || '').trim().toLowerCase();

    // PERFORMANCE UPGRADE: Use Aggregation to count posts per stamp in ONE DB hit
    // Instead of looping through all posts in JS, we let MongoDB handle the matching
    const stampCounts = await Post.aggregate([
      { $match: { userId: { $in: resolved.candidates } } },
      { $unwind: "$locationKeys" },
      { $group: { _id: { $toLower: "$locationKeys" }, count: { $sum: 1 } } }
    ]);

    const stampCountMap = {};
    stampCounts.forEach(sc => { stampCountMap[sc._id] = sc.count; });

    passportObj.stamps = passportObj.stamps.map((stamp) => {
      const nameKey = normalizeKey(stamp.name);
      const codeKey = stamp.countryCode ? normalizeKey(stamp.countryCode) : null;
      
      // Count is either from nameKey or countryCode key
      const postCount = (stampCountMap[nameKey] || 0) + (codeKey ? (stampCountMap[codeKey] || 0) : 0);
      
      return { ...stamp, postCount };
    });

    res.json({ success: true, data: passportObj });
  } catch (err) {
    console.error('[GET /api/users/:userId/passport] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId/passport-tickets
router.get('/:userId/passport-tickets', async (req, res) => {
  try {
    const { userId } = req.params;
    const Passport = mongoose.model('Passport');
    const resolved = await resolveUserIdentifiers(userId);
    const objectIdCandidates = resolved.candidates
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
      
    let passport = await Passport.findOne({ 
      $or: [
        { userId: { $in: resolved.candidates } },
        { userId: { $in: objectIdCandidates } }
      ]
    });
    const count = passport?.stamps?.length ?? passport?.ticketCount ?? 0;
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/:userId/passport/locations - Add location to passport
router.post('/:userId/passport/locations', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ownership check
    const authenticatedUserId = req.userId;
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const targetResolved = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c =>
      targetResolved.candidates.map(String).includes(String(c))
    );
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot update another user passport' });
    }

    const { type, name, countryCode, lat, lon } = req.body;
    const Passport = mongoose.model('Passport');

    const objectIdCandidates = targetResolved.candidates
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
      
    let passport = await Passport.findOne({ 
      $or: [
        { userId: { $in: targetResolved.candidates } },
        { userId: { $in: objectIdCandidates } }
      ]
    });

    if (!passport) {
      passport = new Passport({ userId: targetResolved.canonicalId, stamps: [] });
    }

    // Check if stamp already exists
    const existingIndex = passport.stamps.findIndex(s => 
      s.name.toLowerCase() === name.toLowerCase() && s.type === type
    );

    if (existingIndex > -1) {
      passport.stamps[existingIndex].count += 1;
      passport.stamps[existingIndex].visitHistory.push({ lat, lon, visitedAt: new Date() });
    } else {
      passport.stamps.push({
        type,
        name,
        countryCode,
        lat,
        lon,
        count: 1,
        visitHistory: [{ lat, lon, visitedAt: new Date() }]
      });
    }

    passport.ticketCount = passport.stamps.length;
    await passport.save();
    res.json({ success: true, data: passport });
  } catch (err) {
    console.error('[POST /api/users/:userId/passport/locations] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// PUT/PATCH /api/users/:userId/push-token - Save push token
router.put('/:userId/push-token', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ownership check
    const authenticatedUserId = req.userId;
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const targetResolved = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c =>
      targetResolved.candidates.map(String).includes(String(c))
    );
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot update another user push token' });
    }

    const { pushToken } = req.body;
    const User = mongoose.model('User');

    await User.findOneAndUpdate(
      { 
        $or: [
          { _id: { $in: targetResolved.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)) } },
          { firebaseUid: { $in: targetResolved.candidates } },
          { uid: { $in: targetResolved.candidates } }
        ]
      },
      { pushToken, pushTokenUpdatedAt: new Date() },
      { upsert: false }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/users/:userId/push-token] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// GET /api/users/:userId/notifications - Get notifications for a user (Requires Auth)
router.get('/:userId/notifications', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;
    
    // Ownership check
    const userResolved = await resolveUserIdentifiers(userId);
    const authResolved = await resolveUserIdentifiers(authenticatedUserId);
    const isSelf = userResolved.candidates.some(c => authResolved.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only see your own notifications' });
    }

    const Notification = mongoose.model('Notification');
    const user = await resolveUserIdentifiers(userId);
    const notifications = await Notification.find({ 
      recipientId: { $in: user.candidates } 
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('[GET /api/users/:userId/notifications] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId/passport/stamps/:stampId - Remove stamp from passport
router.delete('/:userId/passport/stamps/:stampId', verifyToken, async (req, res) => {
  try {
    const { userId, stampId } = req.params;
    
    // Ownership check
    const authenticatedUserId = req.userId;
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const targetResolved = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c =>
      targetResolved.candidates.map(String).includes(String(c))
    );
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot update another user passport' });
    }

    const Passport = mongoose.model('Passport');

    let passport = await Passport.findOne({ userId: { $in: targetResolved.candidates } });
    if (passport) {
      passport.stamps = passport.stamps.filter(s => s._id.toString() !== stampId);
      passport.ticketCount = passport.stamps.length;
      await passport.save();
    }
    res.json({ success: true, data: passport });
  } catch (err) {
    console.error('[DELETE /api/users/:userId/passport/stamps/:stampId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// GET /api/users/:userId/conversations/archived - Get archived conversations for the authenticated user
router.get('/:userId/conversations/archived', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const userIdFromToken = req.userId;
    const firebaseUidFromToken = req.user?.firebaseUid;
    const idsToMatch = [String(userIdFromToken)];
    if (firebaseUidFromToken) idsToMatch.push(String(firebaseUidFromToken));

    if (!userIdFromToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized', data: [] });
    }

    // Always return the authenticated user's archived list.
    // The URL param can be out-of-sync (e.g., client stores firebase uid while token uses Mongo _id).
    if (userId && !idsToMatch.includes(String(userId))) {
      console.warn('[GET /users/:userId/conversations/archived] userId param mismatch:', {
        paramUserId: String(userId),
        tokenUserId: String(userIdFromToken),
        tokenFirebaseUid: firebaseUidFromToken ? String(firebaseUidFromToken) : null
      });
    }

    const Conversation = mongoose.model('Conversation');

    const conversations = await Conversation.find({
      archivedBy: { $in: idsToMatch },
      deletedBy: { $nin: idsToMatch }
    }).sort({ lastMessageAt: -1 });

    const User = mongoose.model('User');

    const enriched = await Promise.all(conversations.map(async (conversation) => {
      const convObj = conversation.toObject ? conversation.toObject() : conversation;
      const participants = Array.isArray(convObj?.participants) ? convObj.participants.map(String) : [];
      const otherParticipantId = participants.find(p => !idsToMatch.includes(String(p)));

      let otherUser = null;
      if (otherParticipantId) {
        otherUser = await User.findOne({
          $or: [
            { firebaseUid: otherParticipantId },
            { uid: otherParticipantId },
            { _id: mongoose.Types.ObjectId.isValid(otherParticipantId) ? new mongoose.Types.ObjectId(otherParticipantId) : null }
          ]
        });
      }

      const resolvedOtherUserId = otherUser?._id ? String(otherUser._id) : otherParticipantId;

      return {
        ...convObj,
        id: convObj.id || convObj._id,
        isArchived: true,
        otherUser: otherParticipantId ? {
          id: resolvedOtherUserId,
          displayName: otherUser?.displayName || otherUser?.name || 'User',
          name: otherUser?.displayName || otherUser?.name || 'User',
          avatar: otherUser?.avatar || otherUser?.photoURL || null
        } : null
      };
    }));

    return res.json({ success: true, data: enriched || [] });
  } catch (err) {
    console.error('[GET /users/:userId/conversations/archived] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:userId/aggregated - Get full profile data in ONE call (optimized for performance)
router.get('/:userId/aggregated', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    // SECURITY FIX: Never trust query parameters for permission checks. Use verified JWT token.
    const requesterUserId = req.userId || null;

    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Follow = mongoose.model('Follow');
    const Passport = mongoose.model('Passport');

    // 1. Resolve User
    const query = {
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    };

    const user = await User.findOne(query).lean();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // 2. Resolve requester variants for follow check
    let requesterResolved = null;
    if (requesterUserId) {
      const { resolveUserIdentifiers } = require('../src/utils/userUtils');
      requesterResolved = await resolveUserIdentifiers(requesterUserId);
    }

    const targetResolved = {
      canonicalId: String(user._id),
      candidates: [String(user._id), user.firebaseUid, user.uid].filter(Boolean)
    };

    // 3. Parallel fetching of stats and permissions
    const promises = [
      // Post count
      Post.countDocuments({ userId: { $in: targetResolved.candidates } }),
      // Passport data
      Passport.findOne({ 
        $or: [
          { userId: { $in: targetResolved.candidates } },
          { userId: { $in: targetResolved.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)).map(c => new mongoose.Types.ObjectId(c)) } }
        ]
      }).select('ticketCount stamps').lean(),
    ];

    // Optional follow status check
    if (requesterResolved && requesterResolved.canonicalId !== targetResolved.canonicalId) {
      promises.push(Follow.findOne({
        followerId: { $in: requesterResolved.candidates.map(String) },
        followingId: { $in: targetResolved.candidates.map(String) }
      }).lean());
      // Check for pending request
      const FollowRequest = mongoose.model('FollowRequest');
      promises.push(FollowRequest.findOne({
        senderId: { $in: requesterResolved.candidates.map(String) },
        receiverId: { $in: targetResolved.candidates.map(String) },
        status: 'pending'
      }).lean());
    } else {
      promises.push(Promise.resolve(null)); // dummy follow
      promises.push(Promise.resolve(null)); // dummy request
    }

    const [postCount, passportData, followDoc, followReqDoc] = await Promise.all(promises);

    const isFollowing = !!followDoc;
    const followRequestPending = !!followReqDoc;
    const isOwnProfile = requesterResolved?.canonicalId === targetResolved.canonicalId;
    const isApprovedFollower = isFollowing || isOwnProfile;
    const canViewPrivateProfile = !user.isPrivate || isApprovedFollower;

    // Build response
    const responseData = {
      ...user,
      postsCount: postCount || 0,
      followersCount: user.followersCount || 0,
      followingCount: user.followingCount || 0,
      passportCount: passportData?.stamps?.length ?? passportData?.ticketCount ?? 0,
      isFollowing,
      followRequestPending,
      isApprovedFollower,
      canViewPrivateProfile,
      hasAccess: canViewPrivateProfile
    };

    // Strip sensitive info if private and no access
    if (user.isPrivate && !isApprovedFollower) {
      const publicFields = ['_id', 'firebaseUid', 'displayName', 'username', 'avatar', 'isPrivate', 'followersCount', 'followingCount'];
      const filtered = {};
      publicFields.forEach(f => { filtered[f] = responseData[f]; });
      filtered.postsCount = postCount || 0;
      filtered.hasAccess = false;
      return res.json({ success: true, data: filtered });
    }

    res.json({ success: true, data: responseData });

  } catch (err) {
    console.error('[GET /aggregated-profile] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId - Get user profile
router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    // SECURITY FIX: Use verified token ID instead of query string
    const requesterUserId = req.userId || null;

    const query = {
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    };

    let user = await User.findOne(query).lean();

    // If user exists in database
    if (user) {
      // Ensure all avatar fields are populated for consistency
      const avatarUrl = user.avatar || user.photoURL || user.profilePicture || null;
      user.avatar = avatarUrl;
      user.photoURL = avatarUrl;
      user.profilePicture = avatarUrl;
      
      const userObj = user;

      // If displayName is missing/placeholder, derive a readable one from email.
      // This avoids showing "User" in inbox for accounts that never set a name.
      try {
        const dn = typeof userObj.displayName === 'string' ? userObj.displayName.trim() : '';
        const isPlaceholder = !dn || dn.toLowerCase() === 'user' || dn.toLowerCase() === 'unknown';
        const email = typeof userObj.email === 'string' ? userObj.email.trim() : '';
        if (isPlaceholder && email && email.includes('@')) {
          userObj.displayName = email.split('@')[0] || userObj.displayName;
        }
      } catch { }

      // Check if profile is private
      if (userObj.isPrivate && requesterUserId) {
        const targetResolved = await resolveUserIdentifiers(userId);
        const requesterResolved = await resolveUserIdentifiers(requesterUserId);
        const isSelf = targetResolved.canonicalId === requesterResolved.canonicalId;

        if (!isSelf) {
          // Check if requester is following
          const Follow = mongoose.model('Follow');
          const isFollowing = await Follow.findOne({
            followerId: { $in: requesterResolved.candidates.map(String) },
            followingId: { $in: targetResolved.candidates.map(String) }
          });

          if (!isFollowing) {
            // Return limited profile info for private accounts
            return res.json({
              success: true,
              data: {
                _id: userObj._id,
                firebaseUid: userObj.firebaseUid,
                displayName: userObj.displayName || 'User',
                username: userObj.username,
                avatar: userObj.avatar,
                isPrivate: true,
                followersCount: userObj.followersCount || 0,
                followingCount: userObj.followingCount || 0,
                // Hide sensitive info
                bio: null,
                email: null,
                website: null,
                location: null,
                phone: null,
                interests: null
              },
              isPrivate: true,
              hasAccess: false
            });
          }
        }
      }

      // Return full profile if not private or has access
      res.json({ success: true, data: userObj, isPrivate: userObj.isPrivate || false, hasAccess: true });
    } else {
      // Return placeholder if not in database
      res.json({
        success: true,
        data: {
          _id: userId,
          firebaseUid: userId,
          email: '',
          username: 'user_' + userId.slice(-6),
          displayName: 'User',
          avatar: null,
          bio: '',
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          isPrivate: false
        }
      });
    }
  } catch (err) {
    console.error('[GET /users/:userId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT/PATCH /api/users/:userId - Update user profile (requires auth)
router.put('/:userId', verifyToken, validate(updateProfileSchema), async (req, res) => {
  handleUpdateUser(req, res, req.userId);
});

router.patch('/:userId', verifyToken, validate(updateProfileSchema), async (req, res) => {
  handleUpdateUser(req, res, req.userId);
});

async function handleUpdateUser(req, res, authenticatedUserId) {
  try {
    const { userId } = req.params;
    const body = req.body;

    // Ownership check — the authenticated user can only update their own profile
    if (authenticatedUserId) {
      const resolved = await resolveUserIdentifiers(authenticatedUserId);
      const targetResolved = await resolveUserIdentifiers(userId);
      const isSelf = resolved.candidates.some(c =>
        targetResolved.candidates.map(String).includes(String(c))
      );
      if (!isSelf) {
        return res.status(403).json({ success: false, error: 'Forbidden: cannot update another user profile' });
      }
    }

    // Build partial update object to avoid overwriting fields with undefined
    const updateData = {};
    const allowedFields = [
      'displayName', 'avatar', 'photoURL', 'profilePicture',
      'bio', 'location', 'website', 'phoneNumber',
      'isPrivate', 'lastKnownLocation', 'pushToken'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    // Synchronize avatar-related fields
    const avatarValue = updateData.avatar || updateData.photoURL || updateData.profilePicture;
    if (avatarValue) {
      updateData.avatar = avatarValue;
      updateData.photoURL = avatarValue;
      updateData.profilePicture = avatarValue;
    }

    updateData.updatedAt = new Date();

    const query = {
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    };

    console.log('[PUT /users/:userId] Updating user:', userId, 'with:', Object.keys(updateData));

    // Get old user to compare location
    const oldUser = await User.findOne(query).select('lastKnownLocation pushToken').lean();

    const user = await User.findOneAndUpdate(
      query,
      { $set: updateData },
      { new: true, upsert: true }
    );

    // TRIGGER: Location Change Notification
    if (updateData.lastKnownLocation && user && user.pushToken) {
      const oldCity = oldUser?.lastKnownLocation?.city || '';
      const newCity = updateData.lastKnownLocation.city || '';
      const oldCountry = oldUser?.lastKnownLocation?.country || '';
      const newCountry = updateData.lastKnownLocation.country || '';

      // If city or country changed, or first time setting location
      if ((newCity && newCity !== oldCity) || (newCountry && newCountry !== oldCountry)) {
        const { notificationQueue } = require('../services/queue');
        const welcomeMessage = newCity 
          ? `Welcome to ${newCity}! 🌍 See what others are posting here.`
          : `You've arrived in ${newCountry}! ✈️ Check out local stories.`;

        notificationQueue.add('location_change', {
          userId: user._id,
          title: 'New Location! 📍',
          body: welcomeMessage,
          data: { 
            type: 'location_change', 
            city: newCity, 
            country: newCountry,
            screen: 'home' 
          }
        }).catch(() => {});
      }
    }

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('[PUT /users/:userId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/users/:userId/posts - Get user's posts (with privacy check)
router.get('/:userId/posts', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      skip: skipRaw,
      limit: limitRaw,
    } = req.query;

    // SECURITY FIX: Use verified token ID instead of query string
    const requesterUserId = req.userId || null;

    const skip = Number.isFinite(Number(skipRaw)) ? Math.max(0, Number(skipRaw)) : 0;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(100, Math.max(1, Number(limitRaw))) : 20;

    // Get posts collection
    const Post = mongoose.model('Post');
    const Follow = mongoose.model('Follow');
    const User = mongoose.model('User');

    // Check if user is private
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });

    // If user is private, check if requester has permission to see posts
    if (targetUser?.isPrivate) {
      // Resolve both users to get all ID variants
      const target = await resolveUserIdentifiers(userId);
      const requester = requesterUserId ? await resolveUserIdentifiers(requesterUserId) : null;

      if (requester) {
        // Allow if: requester is the user themselves (checked via canonical ID)
        const isSelf = requester.canonicalId === target.canonicalId;

        if (isSelf) {
          // allowed
        } else {
          // Check if requester follows this user (search using any variant)
          const follows = await Follow.findOne({
            followerId: { $in: requester.candidates },
            followingId: { $in: target.candidates }
          });

          if (!follows) {
            // Requester doesn't follow and isn't the user, deny access
            return res.json({ success: true, data: [] });
          }
        }
      } else {
        // No requester ID provided and user is private, deny access
        return res.json({ success: true, data: [] });
      }
    }

    // Find posts by userId (could be MongoDB ObjectId or Firebase UID)
    const resolved = await resolveUserIdentifiers(userId);
    const postsQuery = {
      userId: { $in: resolved.candidates.map(String) }
    };

    const enriched = await postService.getEnrichedPosts(postsQuery, {
      skip,
      limit,
      viewerId: requesterUserId
    });
    const normalized = (Array.isArray(enriched) ? enriched : []).map((p) => {
      const id = p._id ? String(p._id) : (p.id ? String(p.id) : undefined);
      return {
        ...p,
        id,
        _id: p._id,
      };
    });

    res.json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:userId/tagged-posts - Get posts where user is tagged
router.get('/:userId/tagged-posts', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      skip: skipRaw,
      limit: limitRaw,
    } = req.query;

    // SECURITY FIX: Use verified token ID instead of query string
    const requesterUserId = req.userId || null;

    const skip = Number.isFinite(Number(skipRaw)) ? Math.max(0, Number(skipRaw)) : 0;
    const limit = Number.isFinite(Number(limitRaw)) ? Math.min(100, Math.max(1, Number(limitRaw))) : 20;

    const Post = mongoose.model('Post');
    const User = mongoose.model('User');
    const Follow = mongoose.model('Follow');

    // Resolve target user identifiers
    const target = await resolveUserIdentifiers(userId);

    // Initial check for private profile
    const targetUser = await User.findOne({
      $or: [
        { _id: { $in: target.candidates.filter(c => mongoose.Types.ObjectId.isValid(c)) } },
        { firebaseUid: { $in: target.candidates } },
        { uid: { $in: target.candidates } }
      ]
    });
    if (targetUser?.isPrivate && requesterUserId) {
      const requester = await resolveUserIdentifiers(requesterUserId);
      const isSelf = requester.canonicalId === target.canonicalId;

      if (!isSelf) {
        // Check if requester follows this user
        const follows = await Follow.findOne({
          followerId: { $in: requester.candidates },
          followingId: { $in: target.candidates }
        });
        if (!follows) {
          return res.json({ success: true, data: [] });
        }
      }
    }

    // Query for posts where the user is tagged
    const query = {
      taggedUserIds: { $in: target.candidates.map(String) }
    };

    const posts = await Post.find(query)
      .populate('userId', 'displayName name avatar profilePicture photoURL isPrivate')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const enriched = await enrichPostsWithUserData(posts, requesterUserId);
    const normalized = (Array.isArray(enriched) ? enriched : []).map((p) => {
      const id = p._id ? String(p._id) : (p.id ? String(p.id) : undefined);
      return {
        ...p,
        id,
      };
    });

    res.json({ success: true, data: normalized });
  } catch (err) {
    console.error('[GET /:userId/tagged-posts] Error:', err.message);
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:userId/sections - Get user sections (with privacy check)
router.get('/:userId/sections', async (req, res) => {
  try {
    const { userId } = req.params;
    const { requesterUserId } = req.query;

    const Section = mongoose.model('Section');
    const User = mongoose.model('User');
    const Follow = mongoose.model('Follow');

    // Resolve the user document (handle both Firebase UID and MongoDB _id)
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    }).lean();

    // All possible userId strings stored in sections for this user
    const userIdVariants = [userId];
    if (targetUser) {
      if (targetUser.firebaseUid) userIdVariants.push(String(targetUser.firebaseUid));
      if (targetUser._id) userIdVariants.push(String(targetUser._id));
      if (targetUser.uid) userIdVariants.push(String(targetUser.uid));
    }
    const uniqueVariants = [...new Set(userIdVariants)];

    // If user is private, check access permission
    if (targetUser?.isPrivate) {
      const requester = requesterUserId ? await resolveUserIdentifiers(requesterUserId) : null;
      const target = await resolveUserIdentifiers(userId);

      if (requester) {
        const isSelf = requester.canonicalId === target.canonicalId;
        if (!isSelf) {
          const follows = await Follow.findOne({
            followerId: { $in: requester.candidates },
            followingId: { $in: target.candidates }
          });
          if (!follows) return res.json({ success: true, data: [] });
        }
      } else {
        return res.json({ success: true, data: [] });
      }
    }

    const queryVariants = [...uniqueVariants];
    if (targetUser && targetUser._id) {
      queryVariants.push(targetUser._id);
    }

    const collaboratorStringVariants = queryVariants.map(v => String(v));
    const collaboratorObjectIdVariants = collaboratorStringVariants
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    // Query sections using all known userId variants and collaborators
    const sections = await Section
      .find({ 
        $or: [
          { userId: { $in: uniqueVariants } },
          { collaborators: { $in: queryVariants } },
          { collaborators: { $in: collaboratorStringVariants } },
          { collaborators: { $in: collaboratorObjectIdVariants } },
          { 'collaborators.userId': { $in: collaboratorStringVariants } },
          { 'collaborators.userId': { $in: collaboratorObjectIdVariants } }
        ]
      })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // Populate collaborators with basic user info (same logic as sections.js)
    const populatedSections = await Promise.all(sections.map(async (section) => {
      const s = section;
      if (s.collaborators && s.collaborators.length > 0) {
        const collabIds = s.collaborators
          .map(entry => {
            if (entry && typeof entry === 'object') {
              return String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '');
            }
            return String(entry || '');
          })
          .filter(Boolean);
        const collabUsers = await User.find({ 
          $or: [
            { _id: { $in: collabIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } },
            { uid: { $in: collabIds } },
            { firebaseUid: { $in: collabIds } }
          ]
        }, 'name displayName username avatar uid firebaseUid _id').lean();

        s.collaborators = s.collaborators.map(entry => {
          const idStr = entry && typeof entry === 'object'
            ? String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '')
            : String(entry || '');
          const u = collabUsers.find(user => String(user._id) === idStr || user.uid === idStr || user.firebaseUid === idStr);
          return u ? { ...u, id: String(u._id), _id: String(u._id) } : entry;
        });
      }
      return s;
    }));

    res.json({ success: true, data: populatedSections || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:userId/highlights - Get user highlights (with privacy check)
router.get('/:userId/highlights', async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterUserId = typeof req.query?.requesterUserId === 'string'
      ? req.query.requesterUserId
      : (typeof req.query?.viewerId === 'string' ? req.query.viewerId : null);

    const Highlight = mongoose.model('Highlight');
    const User = mongoose.model('User');
    const Follow = mongoose.model('Follow');

    // Check if user is private
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });

    // If user is private, check access permission
    if (targetUser?.isPrivate && requesterUserId) {
      const targetResolved = await resolveUserIdentifiers(userId);
      const requesterResolved = await resolveUserIdentifiers(requesterUserId);
      const isSelf = targetResolved.canonicalId === requesterResolved.canonicalId;

      if (!isSelf) {
        const follows = await Follow.findOne({
          followerId: { $in: requesterResolved.candidates.map(String) },
          followingId: { $in: targetResolved.candidates.map(String) }
        });

        if (!follows) {
          return res.json({ success: true, data: [] });
        }
      }
    } else if (targetUser?.isPrivate && !requesterUserId) {
      return res.json({ success: true, data: [] });
    }

    const highlights = await Highlight
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: highlights || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// GET /api/users/:userId/stories - Get user stories (with privacy check)
router.get('/:userId/stories', async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterUserId = typeof req.query?.requesterUserId === 'string'
      ? req.query.requesterUserId
      : (typeof req.query?.viewerId === 'string' ? req.query.viewerId : null);

    const Story = mongoose.model('Story');
    const User = mongoose.model('User');
    const Follow = mongoose.model('Follow');

    // Check if user is private
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });

    // If user is private, check access permission
    if (targetUser?.isPrivate && requesterUserId) {
      const targetResolved = await resolveUserIdentifiers(userId);
      const requesterResolved = await resolveUserIdentifiers(requesterUserId);
      const isSelf = targetResolved.canonicalId === requesterResolved.canonicalId;

      if (!isSelf) {
        const follows = await Follow.findOne({
          followerId: { $in: requesterResolved.candidates.map(String) },
          followingId: { $in: targetResolved.candidates.map(String) }
        });

        if (!follows) {
          return res.json({ success: true, data: [] });
        }
      }
    } else if (targetUser?.isPrivate && !requesterUserId) {
      return res.json({ success: true, data: [] });
    }

    const stories = await Story
      .find({
        userId: userId,
        expiresAt: { $gt: new Date() }
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: stories || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: [] });
  }
});

// POST /api/users/:userId/follow - Follow user
router.post('/:userId/follow', async (req, res) => {
  try {
    res.json({ success: true, message: 'Followed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId/follow - Unfollow user
router.delete('/:userId/follow', async (req, res) => {
  try {
    res.json({ success: true, message: 'Unfollowed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:userId/privacy - Update user privacy (Requires Auth)
router.patch('/:userId/privacy', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isPrivate } = req.body;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only change your own privacy' });
    }

    console.log('[PATCH /privacy] Received:', { userId, isPrivate });

    if (isPrivate === undefined) {
      return res.status(400).json({ success: false, error: 'isPrivate is required' });
    }

    const query = { $or: [{ firebaseUid: userId }, { uid: userId }] };

    if (mongoose.Types.ObjectId.isValid(userId)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(userId) });
    }

    console.log('[PATCH /privacy] Query:', query);

    const user = await User.findOneAndUpdate(
      query,
      { $set: { isPrivate, updatedAt: new Date() } },
      { new: true }
    );

    console.log('[PATCH /privacy] Result:', { userFound: !!user, isPrivate: user?.isPrivate });

    if (!user) {
      console.error('[PATCH /privacy] User not found with query:', query);
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log('[PATCH /privacy] ✅ Privacy updated for user:', userId);
    return res.json({ success: true, data: { isPrivate: user.isPrivate } });
  } catch (err) {
    console.error('[PATCH] /:userId/privacy error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/:userId/sections - Create a new section (Requires Auth)
router.post('/:userId/sections', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { name, postIds, coverImage, visibility, collaborators, allowedUsers, allowedGroups } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Section name required' });
    }

    const Section = mongoose.model('Section');
    const User = mongoose.model('User');

    // Resolve canonical userId (prefer MongoDB _id string for consistency)
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    });
    const canonicalUserId = targetUser ? String(targetUser._id) : userId;

    // Get max order for this user (check all variants)
    const userIdVariants = [...new Set([userId, canonicalUserId])];
    const lastSection = await Section
      .findOne({ userId: { $in: userIdVariants } }).sort({ order: -1 });
    const nextOrder = (lastSection?.order || 0) + 1;

    const sectionData = {
      userId: canonicalUserId,
      name,
      postIds: postIds || [],
      coverImage: coverImage || null,
      visibility: visibility || 'private',
      collaborators: collaborators || [],
      allowedUsers: allowedUsers || [],
      allowedGroups: allowedGroups || [],
      order: nextOrder,
      createdAt: new Date()
    };

    const result = await Section.create(sectionData);

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:userId/sections/:sectionId - Update a section (Requires Auth)
router.put('/:userId/sections/:sectionId', verifyToken, async (req, res) => {
  try {
    const { userId, sectionId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { name, postIds, coverImage, visibility, collaborators, allowedUsers, allowedGroups, addPostId, removePostId } = req.body;

    const Section = mongoose.model('Section');
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');

    const user = await resolveUserIdentifiers(userId);
    const userIdCandidates = [...user.candidates];
    
    // Make sure canonical id as object id is included
    let hasObjectId = false;
    let canonicalObj = null;
    try { canonicalObj = new mongoose.Types.ObjectId(user.canonicalId); } catch(e){}
    for(const c of userIdCandidates) {
      if(String(c) === String(canonicalObj)) hasObjectId = true;
    }
    if(canonicalObj && !hasObjectId) userIdCandidates.push(canonicalObj);

    // Build update fields — only update what's provided
    const updateFields = { updatedAt: new Date() };
    if (name !== undefined) updateFields.name = name;
    if (Array.isArray(postIds)) updateFields.postIds = postIds;
    if (coverImage !== undefined) updateFields.coverImage = coverImage;
    if (visibility !== undefined) updateFields.visibility = visibility;
    if (Array.isArray(collaborators)) updateFields.collaborators = collaborators;
    if (Array.isArray(allowedUsers)) updateFields.allowedUsers = allowedUsers;
    if (Array.isArray(allowedGroups)) updateFields.allowedGroups = allowedGroups;

    // Try to match by ObjectId first, then by name
    const sectionCandidates = [sectionId];
    try { sectionCandidates.push(new mongoose.Types.ObjectId(sectionId)); } catch {}

    const filter = { 
      $or: [
        { userId: { $in: userIdCandidates } },
        { collaborators: { $in: userIdCandidates } }
      ],
      $and: [
        { $or: [{ _id: { $in: sectionCandidates } }, { name: sectionId }] }
      ]
    };

    const updateOp = { $set: updateFields };
    // addPostId / removePostId — atomic array ops (works even without full postIds)
    if (addPostId) updateOp.$addToSet = { postIds: addPostId };
    if (removePostId) updateOp.$pull = { postIds: removePostId };

    const result = await Section.findOneAndUpdate(
      filter,
      updateOp,
      { new: true }
    );

    if (!result) {
      console.log('[PUT /users/:userId/sections/:sectionId] 404 - filter:', filter);
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[PUT /:userId/sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId/sections/:sectionId - Delete a section (Requires Auth)
router.delete('/:userId/sections/:sectionId', verifyToken, async (req, res) => {
  try {
    const { userId, sectionId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { migrateToSectionId } = req.body || {};

    const Section = mongoose.model('Section');
    const { resolveUserIdentifiers } = require('../src/utils/userUtils');

    const user = await resolveUserIdentifiers(userId);
    const userIdCandidates = [...user.candidates];
    
    // Make sure canonical id as object id is included
    let hasObjectId = false;
    let canonicalObj = null;
    try { canonicalObj = new mongoose.Types.ObjectId(user.canonicalId); } catch(e){}
    for(const c of userIdCandidates) {
      if(String(c) === String(canonicalObj)) hasObjectId = true;
    }
    if(canonicalObj && !hasObjectId) userIdCandidates.push(canonicalObj);

    const sectionCandidates = [sectionId];
    try { sectionCandidates.push(new mongoose.Types.ObjectId(sectionId)); } catch {}

    const filter = { 
      userId: { $in: userIdCandidates }, 
      $or: [{ _id: { $in: sectionCandidates } }, { name: sectionId }] 
    };

    const section = await Section.findOne(filter);
    if (!section) {
      console.log('[DELETE /users/:userId/sections/:sectionId] 404 - filter:', filter);
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    // Verify ownership (userId from candidates means they own it)
    // No strict check against `userId` directly needed since the filter did it with candidates.

    // Migrate posts first if requested
    if (migrateToSectionId && Array.isArray(section.postIds) && section.postIds.length > 0) {
      try {
        const targetId = new mongoose.Types.ObjectId(migrateToSectionId);
        await Section.updateOne(
          { _id: targetId },
          { $addToSet: { postIds: { $each: section.postIds } }, $set: { updatedAt: new Date() } }
        );
      } catch (e) {
        console.warn('Migrate failed:', e.message);
      }
    } else if (!migrateToSectionId && Array.isArray(section.postIds) && section.postIds.length > 0) {
      // If not migrating, only unsave posts that are not present in any other collection.
      try {
        const remainingSections = await Section.find({
          userId: { $in: userIdCandidates },
          _id: { $ne: section._id }
        }).select('postIds');

        const retainedPostIds = new Set();
        remainingSections.forEach((s) => {
          const ids = Array.isArray(s.postIds) ? s.postIds : [];
          ids.forEach((id) => retainedPostIds.add(String(id)));
        });

        const Post = mongoose.model('Post');
        const removablePostIds = section.postIds
          .map((id) => String(id))
          .filter((id) => !retainedPostIds.has(id));

        const postObjIds = removablePostIds.map(id => {
          try { return new mongoose.Types.ObjectId(id); } catch(e) { return id; }
        });
        const postsToUnsave = await Post.find({ _id: { $in: postObjIds } });
        for (const post of postsToUnsave) {
          const originalLen = post.savedBy.length;
          // Filter out any ID that matches any of the user's known ID variants
          post.savedBy = post.savedBy.filter(id => !userIdCandidates.includes(String(id)));
          if (post.savedBy.length !== originalLen) {
            post.savesCount = post.savedBy.length;
            await post.save();
          }
        }
      } catch (e) {
        console.warn('Unsave posts failed during section deletion:', e.message);
      }
    }

    await Section.deleteOne(filter);
    res.json({ success: true, data: { deletedId: sectionId } });
  } catch (err) {
    console.error('[DELETE /:userId/sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:userId/sections-order - Update section order
router.patch('/:userId/sections-order', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sections } = req.body;

    if (!Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: 'sections array required' });
    }

    const Section = mongoose.model('Section');

    // Update order for each section
    const updatePromises = sections.map(async (section, index) => {
      return Section.updateOne(
        { _id: new mongoose.Types.ObjectId(section._id), userId },
        { $set: { order: index, updatedAt: new Date() } }
      );
    });

    await Promise.all(updatePromises);

    console.log(`✅ Section order updated for user ${userId}`);
    res.json({ success: true, message: 'Section order updated' });
  } catch (err) {
    console.error('[PATCH /:userId/sections-order] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/:userId/saved - Save a post (Requires Auth)
router.post('/:userId/saved', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, error: 'postId required' });
    }

    const Post = mongoose.model('Post');
    const resolvedUser = await resolveUserIdentifiers(userId);
    const userIdCandidates = [...new Set(resolvedUser.candidates.map(String))];
    const canonicalUserId = String(resolvedUser.canonicalId || userId);
    const cleanPostId = String(postId).split('-loop')[0];
    const post = await Post.findOne({
      $or: [
        { id: cleanPostId },
        ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
      ]
    });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Check if already saved
    if (Array.isArray(post.savedBy) && post.savedBy.some((id) => userIdCandidates.includes(String(id)))) {
      return res.json({ success: true, message: 'Post already saved' });
    }

    // Add user to savedBy array
    post.savedBy.push(canonicalUserId);
    post.savesCount = post.savedBy.length;
    await post.save();

    console.log(`✅ Post ${postId} saved by user ${userId}`);
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('[POST /:userId/saved] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId/saved/:postId - Unsave a post (Requires Auth)
router.delete('/:userId/saved/:postId', verifyToken, async (req, res) => {
  try {
    const { userId, postId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const Post = mongoose.model('Post');
    const resolvedUser = await resolveUserIdentifiers(userId);
    const userIdCandidates = new Set(resolvedUser.candidates.map(String));
    const cleanPostId = String(postId).split('-loop')[0];
    const post = await Post.findOne({
      $or: [
        { id: cleanPostId },
        ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
      ]
    });
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    // Remove user from savedBy array
    post.savedBy = (Array.isArray(post.savedBy) ? post.savedBy : []).filter(id => !userIdCandidates.has(String(id)));
    post.savesCount = post.savedBy.length;
    await post.save();

    console.log(`✅ Post ${postId} unsaved by user ${userId}`);
    res.json({ success: true, data: post });
  } catch (err) {
    console.error('[DELETE /:userId/saved/:postId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId/saved - Get all saved posts for a user (Requires Auth)
router.get('/:userId/saved', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;

    // Ownership check
    const resolved = await resolveUserIdentifiers(authenticatedUserId);
    const target = await resolveUserIdentifiers(userId);
    const isSelf = resolved.candidates.some(c => target.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { limit = 20, skip = 0 } = req.query;

    const Post = mongoose.model('Post');
    const Section = mongoose.model('Section');
    const User = mongoose.model('User');

    // 1. Resolve user ID variants
    const targetUser = await User.findOne({
      $or: [
        { firebaseUid: userId },
        { uid: userId },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null }
      ]
    }).lean();

    const queryVariants = [userId];
    if (targetUser) {
      if (targetUser.firebaseUid) queryVariants.push(String(targetUser.firebaseUid));
      if (targetUser._id) queryVariants.push(String(targetUser._id));
      if (targetUser.uid) queryVariants.push(String(targetUser.uid));
    }
    const uniqueVariants = [...new Set(queryVariants)];
    const queryVariantsWithObj = [...uniqueVariants];
    if (targetUser && targetUser._id) {
       queryVariantsWithObj.push(targetUser._id);
    }

    const collaboratorStringVariants = queryVariantsWithObj.map(v => String(v));
    const collaboratorObjectIdVariants = collaboratorStringVariants
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    // 2. Find all sections where the user is an owner or collaborator
    const sections = await Section.find({
      $or: [
        { userId: { $in: uniqueVariants } },
        { collaborators: { $in: queryVariantsWithObj } },
        { collaborators: { $in: collaboratorStringVariants } },
        { collaborators: { $in: collaboratorObjectIdVariants } },
        { 'collaborators.userId': { $in: collaboratorStringVariants } },
        { 'collaborators.userId': { $in: collaboratorObjectIdVariants } }
      ]
    }).lean();

    // 3. Extract all postIds from those sections
    let collPostIds = [];
    sections.forEach(s => {
      if (Array.isArray(s.postIds)) {
        s.postIds.forEach((pid) => {
          if (pid && typeof pid === 'object') {
            const nextId = String(pid._id || pid.id || pid.postId || '');
            if (nextId) collPostIds.push(nextId);
          } else if (pid) {
            collPostIds.push(String(pid));
          }
        });
      }
    });

    const validColPostIds = collPostIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
    const stringColPostIds = collPostIds.map(id => String(id));

    const postQuery = {
      $or: [
        { savedBy: { $in: uniqueVariants } },
        { _id: { $in: [...validColPostIds, ...stringColPostIds, ...collPostIds] } }
      ]
    };

    // Find posts where this user is in savedBy array OR part of their collections
    const savedPosts = await Post.find(postQuery)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .exec();

    const totalSavedCount = await Post.countDocuments(postQuery);

    // Enrich posts with user data
    const viewerId = req.query.viewerId || req.query.requesterUserId || null;
    const enrichedPosts = await enrichPostsWithUserData(savedPosts, viewerId);

    console.log(`✅ Retrieved ${enrichedPosts.length} saved posts for user ${userId}`);
    res.json({
      success: true,
      data: enrichedPosts,
      pagination: {
        total: totalSavedCount,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + parseInt(limit) < totalSavedCount
      }
    });
  } catch (err) {
    console.error('[GET /:userId/saved] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId/blocked - Get blocked users for a user (with details)
router.get('/:userId/blocked', async (req, res) => {
  try {
    const { userId } = req.params;

    const query = { $or: [{ firebaseUid: userId }, { uid: userId }] };
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(userId) });
    }

    const user = await User.findOne(query).select('blockedUsers');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const blockedIds = user.blockedUsers || [];
    if (blockedIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch details for all blocked users
    const blockedDetails = await User.find({
      $or: [
        { _id: { $in: blockedIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } },
        { firebaseUid: { $in: blockedIds } },
        { uid: { $in: blockedIds } }
      ]
    }).select('_id firebaseUid uid displayName username avatar photoURL profilePicture');

    res.json({ success: true, data: blockedDetails });
  } catch (err) {
    console.error('[GET /:userId/blocked] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:userId/block/:targetId - Block a user
router.put('/:userId/block/:targetId', async (req, res) => {
  try {
    const { userId, targetId } = req.params;

    const query = { $or: [{ firebaseUid: userId }, { uid: userId }] };
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(userId) });
    }

    // Add targetId to blockedUsers array, using $addToSet to prevent duplicates
    const user = await User.findOneAndUpdate(
      query,
      { $addToSet: { blockedUsers: targetId }, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'User blocked successfully', data: user.blockedUsers });
  } catch (err) {
    console.error('[PUT /:userId/block/:targetId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId/block/:targetId - Unblock a user
router.delete('/:userId/block/:targetId', async (req, res) => {
  try {
    const { userId, targetId } = req.params;

    const query = { $or: [{ firebaseUid: userId }, { uid: userId }] };
    if (mongoose.Types.ObjectId.isValid(userId)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(userId) });
    }

    // Remove targetId from blockedUsers array
    const user = await User.findOneAndUpdate(
      query,
      { $pull: { blockedUsers: targetId }, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'User unblocked successfully', data: user.blockedUsers });
  } catch (err) {
    console.error('[DELETE /:userId/block/:targetId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:userId/push-token - Save expo push token
router.put('/:userId/push-token', async (req, res) => {
  try {
    const { userId } = req.params;
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({ success: false, error: 'pushToken is required' });
    }

    const User = mongoose.model('User');
    const resolved = await resolveUserIdentifiers(userId);

    const user = await User.findOneAndUpdate(
      { 
        $or: [
          { _id: { $in: resolved.candidates.filter(id => mongoose.Types.ObjectId.isValid(id)) } },
          { firebaseUid: { $in: resolved.candidates } },
          { uid: { $in: resolved.candidates } }
        ]
      },
      { pushToken, updatedAt: new Date() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`✅ Push token updated for user: ${userId}`);
    res.json({ success: true, message: 'Push token updated' });
  } catch (err) {
    console.error('[PUT /:userId/push-token] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/:userId - Delete user account
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Comment = mongoose.model('Comment');
    const Follow = mongoose.model('Follow');
    const Passport = mongoose.model('Passport');

    const query = {
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null },
        { firebaseUid: userId },
        { uid: userId }
      ].filter(q => q._id !== null || q.firebaseUid || q.uid)
    };

    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { resolveUserIdentifiers } = require('../src/utils/userUtils');
    const userCandidates = await resolveUserIdentifiers(userId);
    const candidateStrings = userCandidates.candidates.map(String);

    // Delete associated data
    await Promise.all([
      Post.deleteMany({ userId: { $in: candidateStrings } }),
      Comment.deleteMany({ userId: { $in: candidateStrings } }),
      Follow.deleteMany({ followerId: { $in: candidateStrings } }),
      Follow.deleteMany({ followingId: { $in: candidateStrings } }),
      Passport.deleteMany({ userId: { $in: candidateStrings } })
    ]);

    // Finally delete the user
    await User.deleteOne({ _id: user._id });

    console.log('[DELETE /users/:userId] Successfully deleted user and their data:', userId);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    console.error('[DELETE /users/:userId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

