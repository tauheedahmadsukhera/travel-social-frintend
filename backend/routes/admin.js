const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const logger = require('../src/utils/logger');

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper for Cloudinary Upload
async function uploadToCloudinary(fileBuffer, folder) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * @route   POST /api/admin/login
 * @desc    Admin login with role verification
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const User = mongoose.model('User');
    const bcrypt = require('bcryptjs');
    const { generateToken } = require('../src/middleware/authMiddleware');

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Role verification
    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied: Not an administrator' });
    }

    const token = generateToken(user._id, user.email);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get dashboard statistics
 * @access  Private/Admin
 */
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    const Report = mongoose.model('Report');

    // Admin check
    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const [totalUsers, totalPosts, activeReports, engagementData] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
      // Aggregate for growth chart (last 7 days)
      User.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Format engagement data for chart
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayName = labels[d.getDay()];
      const dayData = engagementData.find(item => item._id === dateStr);
      return { name: dayName, users: dayData ? dayData.count : 0, posts: 0 }; // We can add post growth too if needed
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalPosts,
        activeReports,
        growthData: last7Days
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get all users with filtering and pagination
 * @access  Private/Admin
 */
router.get('/users', verifyToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '' } = req.query;
    const User = mongoose.model('User');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const query = {};
    if (search) {
      query.$or = [
        { displayName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }
    if (role) query.role = role;
    if (status) query.status = status;

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    // Map uid for frontend compatibility
    const mappedUsers = users.map(u => ({
      ...u.toObject(),
      uid: u.firebaseUid || u._id.toString()
    }));

    res.json({ success: true, data: mappedUsers, total });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/ban
 */
router.post('/users/:id/ban', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    // Find by _id OR firebaseUid for maximum compatibility
    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'suspended'; // Sync with frontend status name
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_SUSPENDED',
      targetId: targetUser._id,
      targetType: 'User',
      details: { reason },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User suspended successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/unban
 */
router.post('/users/:id/unban', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    targetUser.status = 'active';
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'USER_ACTIVATED',
      targetId: targetUser._id,
      targetType: 'User',
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User activated successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/users/:id/role
 */
router.post('/users/:id/role', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const targetUser = await User.findOne({ 
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
        { firebaseUid: id },
        { uid: id }
      ]
    });

    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });

    const oldRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'ROLE_UPDATE',
      targetId: targetUser._id,
      targetType: 'User',
      details: { oldRole, newRole: role },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'User role updated' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/logs
 */
router.get('/logs', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { page = 1, limit = 50 } = req.query;
    const logs = await AdminLog.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('adminId', 'displayName email');

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/admin/reports
 */
router.get('/reports', verifyToken, async (req, res, next) => {
  try {
    const User = mongoose.model('User');
    const Report = mongoose.model('Report');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const { status = 'pending' } = req.query;
    const reports = await Report.find({ status })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/admin/reports/:id/resolve
 */
router.post('/reports/:id/resolve', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const User = mongoose.model('User');
    const Report = mongoose.model('Report');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await User.findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    report.status = status; // 'resolved' or 'dismissed'
    report.adminNote = note;
    report.resolvedAt = new Date();
    report.resolvedBy = req.userId;
    await report.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REPORT_RESOLVED',
      targetId: id,
      targetType: 'Report',
      details: { status, note },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: `Report ${status}` });
  } catch (err) {
    next(err);
  }
});

/**
 * CATEGORIES MANAGEMENT
 */
router.get('/categories', verifyToken, async (req, res, next) => {
  try {
    const Category = mongoose.model('Category');
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/categories - Create with DIRECT IMAGE UPLOAD
router.post('/categories', verifyToken, upload.single('image'), async (req, res, next) => {
  try {
    const { name } = req.body;
    const Category = mongoose.model('Category');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    let imageUrl = req.body.image; // Fallback to URL if provided
    
    // If a file is uploaded, use it
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, 'admin/categories');
    }

    if (!name || !imageUrl) {
      return res.status(400).json({ success: false, error: 'Name and image are required' });
    }

    const category = new Category({ name, image: imageUrl });
    await category.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'CATEGORY_ADDED',
      targetId: category._id,
      targetType: 'Category',
      details: { name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const Category = mongoose.model('Category');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'CATEGORY_DELETED',
      targetId: id,
      targetType: 'Category',
      details: { name: category.name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * REGIONS MANAGEMENT
 */
router.get('/regions', verifyToken, async (req, res, next) => {
  try {
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    res.json({ success: true, data: regions });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/regions - Create with DIRECT IMAGE UPLOAD
router.post('/regions', verifyToken, upload.single('image'), async (req, res, next) => {
  try {
    const { name, countryCode, type } = req.body;
    const Region = mongoose.model('Region');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    let imageUrl = req.body.image;
    
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file.buffer, 'admin/regions');
    }

    if (!name || !imageUrl) {
      return res.status(400).json({ success: false, error: 'Name and image are required' });
    }

    const region = new Region({ name, image: imageUrl, countryCode, type });
    await region.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REGION_ADDED',
      targetId: region._id,
      targetType: 'Region',
      details: { name, type },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, data: region });
  } catch (err) {
    next(err);
  }
});

router.delete('/regions/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const Region = mongoose.model('Region');
    const AdminLog = mongoose.model('AdminLog');

    const adminUser = await mongoose.model('User').findById(req.userId);
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ success: false, error: 'Unauthorized' });

    const region = await Region.findByIdAndDelete(id);
    if (!region) return res.status(404).json({ success: false, error: 'Region not found' });

    const log = new AdminLog({
      adminId: req.userId,
      action: 'REGION_DELETED',
      targetId: id,
      targetType: 'Region',
      details: { name: region.name },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Region deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
