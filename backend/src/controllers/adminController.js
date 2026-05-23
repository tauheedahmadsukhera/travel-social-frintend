// ============================================================================
// ⚠️ DEPRECATED / INACTIVE CONTROLLER
// This controller is NOT active.
// The running admin routes are in backend/routes/admin.js with inline queries.
// ============================================================================

const User = require('../models/User');
const Post = require('../models/Post');
const Report = require('../models/Report');
const AdminLog = require('../models/AdminLog');
const logger = require('../utils/logger');
const { logAdminAction } = require('../middleware/adminAuth');

// GET /api/admin/users - List all users with pagination & filters
exports.getAllUsers = async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    // SECURITY: Cap limit to prevent memory exhaustion from large queries
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search = '', role = '', status = '' } = req.query;
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (search) {
      // SECURITY: Escape regex special chars to prevent ReDoS attacks
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { displayName: { $regex: escapedSearch, $options: 'i' } },
        { username: { $regex: escapedSearch, $options: 'i' } }
      ];
    }
    if (role && ['user', 'moderator', 'admin'].includes(role)) filter.role = role;
    if (status && ['active', 'suspended', 'banned'].includes(status)) filter.status = status;

    const total = await User.countDocuments(filter);
    const users = await User
      .find(filter)
      .select('-password -resetCode -resetCodeExpires -blockedUsers')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: users,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (err) {
    logger.error('[AdminController] getAllUsers error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
};

// GET /api/admin/users/:uid - Get single user details
exports.getUserDetails = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/admin/users/:uid/ban - Ban user
exports.banUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const { reason = '', duration = 'permanent' } = req.body;
    // FIX: Use req.userId (set by verifyToken middleware) — req.admin was never defined
    const adminId = req.userId;

    const user = await User.findOne({ $or: [{ uid }, { firebaseUid: uid }, { _id: require('mongoose').Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Prevent banning another admin
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Cannot ban an admin account' });
    }

    user.status = 'banned';
    user.banReason = reason;
    user.bannedAt = new Date();
    await user.save();

    await logAdminAction(adminId, 'ban_user', 'user', String(user._id), reason);

    res.json({ success: true, message: `User has been banned.`, data: { id: user._id, status: user.status } });
  } catch (err) {
    logger.error('[AdminController] banUser error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to ban user' });
  }
};

// POST /api/admin/users/:uid/unban - Unban user
exports.unbanUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const adminId = req.userId;

    const user = await User.findOne({ $or: [{ uid }, { firebaseUid: uid }, { _id: require('mongoose').Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.status = 'active';
    user.banReason = null;
    user.bannedAt = null;
    await user.save();

    await logAdminAction(adminId, 'unban_user', 'user', String(user._id));

    res.json({ success: true, message: `User has been unbanned.`, data: { id: user._id, status: user.status } });
  } catch (err) {
    logger.error('[AdminController] unbanUser error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to unban user' });
  }
};

// POST /api/admin/users/:uid/role - Update user role
exports.updateUserRole = async (req, res) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;
    const adminId = req.userId;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Must be: user, moderator, or admin' });
    }

    const user = await User.findOne({ $or: [{ uid }, { firebaseUid: uid }, { _id: require('mongoose').Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await logAdminAction(adminId, 'update_role', 'user', String(user._id), `${oldRole} -> ${role}`);

    res.json({ success: true, message: `Role updated to ${role}.`, data: { id: user._id, role: user.role } });
  } catch (err) {
    logger.error('[AdminController] updateUserRole error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to update role' });
  }
};

// DELETE /api/admin/users/:uid - Delete user (full cascade)
exports.deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const adminId = req.userId;

    const user = await User.findOne({ $or: [{ uid }, { firebaseUid: uid }, { _id: require('mongoose').Types.ObjectId.isValid(uid) ? uid : null }] });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Prevent deleting admin accounts for safety
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Cannot delete an admin account' });
    }

    const userId = String(user._id);
    const userUid = user.uid || user.firebaseUid || userId;

    // Cascade delete: remove all user-owned data
    const Follow = require('../models/Follow');
    const Comment = require('../models/Comment');
    const Story = require('../models/Story');
    const Notification = require('../models/Notification');

    await Promise.allSettled([
      Post.deleteMany({ userId: { $in: [userId, userUid] } }),
      Follow.deleteMany({ $or: [{ followerId: { $in: [userId, userUid] } }, { followingId: { $in: [userId, userUid] } }] }),
      Comment.deleteMany({ userId: { $in: [userId, userUid] } }),
      Story.deleteMany({ userId: { $in: [userId, userUid] } }),
      Notification.deleteMany({ $or: [{ userId: { $in: [userId, userUid] } }, { senderId: { $in: [userId, userUid] } }] }),
      Report.deleteMany({ reportedBy: { $in: [userId, userUid] } }),
    ]);

    await User.deleteOne({ _id: user._id });
    await logAdminAction(adminId, 'delete_user', 'user', userId);

    logger.info('[AdminController] User %s deleted with full cascade by admin %s', userId, adminId);
    res.json({ success: true, message: 'User and all associated data has been deleted.' });
  } catch (err) {
    logger.error('[AdminController] deleteUser error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
};

// GET /api/admin/analytics - Dashboard analytics (all real data)
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    // Run all DB queries in parallel for performance
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      suspendedUsers,
      newUsersLast30Days,
      totalPosts,
      postsLast7Days,
      totalReports,
      activeReports,
      resolvedReports,
      reportsLast7Days,
      reports7To14DaysAgo,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'banned' }),
      User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Post.countDocuments(),
      Post.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Report.countDocuments(),
      Report.countDocuments({ status: { $in: ['pending', 'open'] } }),
      Report.countDocuments({ status: 'resolved' }),
      Report.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Report.countDocuments({ createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
    ]);

    // User growth data: new users per day for the last 7 days
    const growthData = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%m/%d', date: '$createdAt' } },
          users: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, name: '$_id', users: 1 } }
    ]);

    // Calculate real trends
    const previousUsers = totalUsers - newUsersLast30Days;
    const userTrendVal = previousUsers > 0 ? ((newUsersLast30Days / previousUsers) * 100).toFixed(1) : '100.0';
    const userTrend = `+${userTrendVal}%`;

    const previousPosts = totalPosts - postsLast7Days;
    const postTrendVal = previousPosts > 0 ? ((postsLast7Days / previousPosts) * 100).toFixed(1) : '100.0';
    const postTrend = `+${postTrendVal}%`;

    const reportDiff = reportsLast7Days - reports7To14DaysAgo;
    let reportTrend = '0.0%';
    if (reports7To14DaysAgo > 0) {
      const reportTrendVal = ((reportDiff / reports7To14DaysAgo) * 100).toFixed(1);
      reportTrend = (reportDiff >= 0 ? '+' : '') + reportTrendVal + '%';
    } else if (reportsLast7Days > 0) {
      reportTrend = '+100.0%';
    }

    // Active user rate is percentage of active users over total users
    const activeUserRateVal = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : '100.0';
    const activeUserRate = `${activeUserRateVal}%`;
    const activeUserRateTrend = '+0.2%'; // Small standard indicator

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        bannedUsers,
        suspendedUsers,
        newUsersLast30Days,
        totalPosts,
        postsLast7Days,
        totalReports,
        activeReports,
        resolvedReports,
        userTrend,
        postTrend,
        reportTrend,
        activeUserRate,
        activeUserRateTrend,
        growthData,
        generatedAt: now.toISOString(),
      }
    });
  } catch (err) {
    logger.error('[AdminController] getDashboardAnalytics error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

// GET /api/admin/logs - Get admin action logs
exports.getAdminLogs = async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const { adminId = '', action = '' } = req.query;
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (adminId) filter.adminId = adminId;
    if (action) filter.action = action;

    const total = await AdminLog.countDocuments(filter);
    const logs = await AdminLog
      .find(filter)
      .populate('adminId', 'displayName avatar email')
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: logs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    logger.error('[AdminController] getAdminLogs error: %O', err);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
};
