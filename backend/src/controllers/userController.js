const mongoose = require('mongoose');
const logger = require('../utils/logger');
const User = require('../models/User');
const Post = require('../models/Post');
const Highlight = require('../models/Highlight');
const Section = require('../models/Section');
const Story = require('../models/Story');
const Report = require('../models/Report');

// Create or update user (for social login or registration)
exports.createOrUpdateUser = async (req, res) => {
  try {
    const { uid, email, displayName, name, avatar, provider } = req.body;
    if (!uid || !email) return res.status(400).json({ error: 'uid and email required' });
    const update = {
      email,
      displayName,
      name,
      avatar,
      photoURL: avatar,
      provider,
      updatedAt: new Date(),
    };
    const user = await User.findOneAndUpdate(
      { uid },
      { $set: update, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    const { uid } = req.params;

    // Build query - check firebaseUid first, then uid field, then try ObjectId if valid
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    // Only add _id if it's a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const user = await User.findOne(query).select('-password -resetCode -resetCodeExpires');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    logger.error('[UserController] getUserProfile error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
};

// Update user profile
exports.updateUserProfile = async (req, res) => {
  try {
    const { uid } = req.params;
    const { displayName, name, bio, website, location, phone, interests, avatar, photoURL, isPrivate, lastKnownLocation } = req.body;

    // Build query - check firebaseUid first, then uid field, then try ObjectId if valid
    const query = { $or: [{ firebaseUid: uid }, { uid }] };

    // Only add _id if it's a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const updateData = { updatedAt: new Date() };
    const fields = [
      'displayName', 'name', 'bio', 'website', 'location',
      'phone', 'interests', 'avatar', 'photoURL',
      'isPrivate', 'lastKnownLocation'
    ];

    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Special handling for legacy field name consistency
        if (field === 'displayName' && !req.body.name) updateData.name = req.body.displayName;
        if (field === 'name' && !req.body.displayName) updateData.displayName = req.body.name;
        if (field === 'avatar' && !req.body.photoURL) updateData.photoURL = req.body.avatar;
        if (field === 'photoURL' && !req.body.avatar) updateData.avatar = req.body.photoURL;

        updateData[field] = req.body[field];
      }
    });

    const user = await User.findOneAndUpdate(query, { $set: updateData }, { new: true }).select('-password -resetCode -resetCodeExpires');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    logger.error('[UserController] updateUserProfile error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

// Get user posts
exports.getUserPosts = async (req, res) => {
  try {
    const { uid } = req.params;
    const userId = req.userId ? String(req.userId) : null;
    
    const pipeline = [
      { $match: { userId: uid } },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          isLiked: userId ? { $in: [userId, { $ifNull: ["$likes", []] }] } : false,
          id: "$_id"
        }
      },
      {
        $project: {
          likes: 0,
          comments: 0
        }
      }
    ];
    
    const posts = await Post.aggregate(pipeline);
    return res.json({ success: true, data: posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get user highlights
exports.getUserHighlights = async (req, res) => {
  try {
    const { uid } = req.params;
    const highlights = await Highlight.find({ userId: uid }).sort({ createdAt: -1 });
    return res.json({ success: true, data: highlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get user sections
exports.getUserSections = async (req, res) => {
  try {
    const { uid } = req.params;
    const sections = await Section.find({ userId: uid }).sort({ createdAt: -1 });
    return res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get user stories
exports.getUserStories = async (req, res) => {
  try {
    const { uid } = req.params;
    const stories = await Story.find({ userId: uid }).sort({ createdAt: -1 });
    return res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// List all users (ADMIN ONLY — requires admin role checked upstream)
exports.listUsers = async (req, res) => {
  try {
    // Secondary check: verify admin role even if route-level middleware missed it
    const adminUser = await User.findById(req.userId).select('role').lean();
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: admin access required' });
    }

    // Paginated — never dump the full table
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = Math.max(parseInt(req.query.skip) || 0, 0);
    const users = await User.find()
      .select('displayName name avatar photoURL username uid firebaseUid role createdAt')
      .limit(limit)
      .skip(skip)
      .lean();
    const total = await User.countDocuments();
    res.json({ success: true, data: users, total, limit, skip });
  } catch (err) {
    logger.error('[UserController] listUsers error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

// Create section
exports.createSection = async (req, res) => {
  try {
    const { uid } = req.params;
    const section = req.body;

    if (!section.name) {
      return res.status(400).json({ success: false, error: 'Section name required' });
    }

    const newSection = new Section({
      userId: uid,
      ...section,
      createdAt: new Date()
    });

    await newSection.save();
    return res.json({ success: true, data: newSection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update section
exports.updateSection = async (req, res) => {
  try {
    const { uid, sectionName } = req.params;
    const updateData = req.body;

    const section = await Section.findOneAndUpdate(
      { userId: uid, name: decodeURIComponent(sectionName) },
      { $set: { ...updateData, updatedAt: new Date() } },
      { new: true }
    );

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    return res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete section
exports.deleteSection = async (req, res) => {
  try {
    const { uid, sectionName } = req.params;

    const result = await Section.findOneAndDelete(
      { userId: uid, name: decodeURIComponent(sectionName) }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    return res.json({ success: true, message: 'Section deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Search users by name/username
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      $or: [
        { displayName: { $regex: escapedQ, $options: 'i' } },
        { name: { $regex: escapedQ, $options: 'i' } },
        { username: { $regex: escapedQ, $options: 'i' } },
      ]
    }).select('displayName name avatar photoURL username uid firebaseUid').limit(20);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Block a user
exports.blockUser = async (req, res) => {
  try {
    const { uid, targetUid } = req.params;
    if (uid === targetUid) return res.status(400).json({ success: false, error: "Cannot block yourself" });

    // Defense-in-depth ownership verification
    const authedUser = await User.findById(req.userId).select('role uid firebaseUid').lean();
    if (!authedUser) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (authedUser.role !== 'admin' && authedUser.uid !== uid && authedUser.firebaseUid !== uid && String(authedUser._id) !== uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only perform this action for your own account' });
    }

    const user = await User.findOneAndUpdate(
      { $or: [{ firebaseUid: uid }, { uid }] },
      { $addToSet: { blockedUsers: targetUid } },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user.blockedUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Unblock a user
exports.unblockUser = async (req, res) => {
  try {
    const { uid, targetUid } = req.params;

    // Defense-in-depth ownership verification
    const authedUser = await User.findById(req.userId).select('role uid firebaseUid').lean();
    if (!authedUser) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (authedUser.role !== 'admin' && authedUser.uid !== uid && authedUser.firebaseUid !== uid && String(authedUser._id) !== uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only perform this action for your own account' });
    }

    const user = await User.findOneAndUpdate(
      { $or: [{ firebaseUid: uid }, { uid }] },
      { $pull: { blockedUsers: targetUid } },
      { new: true }
    );

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user.blockedUsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get blocked users list
exports.getBlockedUsers = async (req, res) => {
  try {
    const { uid } = req.params;

    // Defense-in-depth ownership verification
    const authedUser = await User.findById(req.userId).select('role uid firebaseUid').lean();
    if (!authedUser) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (authedUser.role !== 'admin' && authedUser.uid !== uid && authedUser.firebaseUid !== uid && String(authedUser._id) !== uid) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only perform this action for your own account' });
    }

    const user = await User.findOne({ $or: [{ firebaseUid: uid }, { uid }] });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const blockedUsersData = await User.find({
      $or: [
        { uid: { $in: user.blockedUsers } },
        { firebaseUid: { $in: user.blockedUsers } }
      ]
    }, 'uid firebaseUid displayName name avatar photoURL username');

    res.json({ success: true, data: blockedUsersData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Report a user
exports.reportUser = async (req, res) => {
  try {
    const { uid } = req.params; // reported user
    const { reporterId, reason, details } = req.body;

    const report = new Report({
      reportedUserId: uid,
      reportedBy: reporterId,
      reason,
      description: details,
      createdAt: new Date()
    });

    await report.save();
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get profile shareable URL
exports.getProfileUrl = async (req, res) => {
  try {
    const { uid } = req.params;
    // For now, return a deep link or web link
    const profileUrl = `travesocial://profile/${uid}`;
    res.json({ success: true, data: { profileUrl } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update push token
exports.updatePushToken = async (req, res) => {
  try {
    const { uid } = req.params;
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({ success: false, error: 'pushToken is required' });
    }

    const query = { $or: [{ firebaseUid: uid }, { uid }] };
    if (mongoose.Types.ObjectId.isValid(uid)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(uid) });
    }

    const user = await User.findOneAndUpdate(
      query,
      { $set: { pushToken, pushTokenUpdatedAt: new Date(), updatedAt: new Date() } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'Push token updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get multiple user profiles at once (Bulk Fetch)
exports.getBulkProfiles = async (req, res) => {
  try {
    const { uids } = req.body;
    if (!Array.isArray(uids) || uids.length === 0) {
      return res.status(400).json({ success: false, error: 'uids array is required' });
    }

    // Limit bulk size to prevent abuse
    const limitedUids = uids.slice(0, 50);

    const users = await User.find({
      $or: [
        { firebaseUid: { $in: limitedUids } },
        { uid: { $in: limitedUids } }
      ]
    }).select('displayName name avatar photoURL username uid firebaseUid role');

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch bulk profiles' });
  }
};
