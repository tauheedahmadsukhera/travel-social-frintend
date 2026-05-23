const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');

/**
 * @route   POST /api/moderation/report
 * @desc    Submit a report for a post, user, or comment
 * @access  Private
 */
router.post('/report', verifyToken, async (req, res, next) => {
  try {
    const { targetId, targetType, reason, details } = req.body;
    const reporterId = req.userId;

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const Report = mongoose.model('Report');
    const AdminLog = mongoose.model('AdminLog');

    const report = new Report({
      reporterId,
      targetId,
      targetType,
      reason,
      details,
      status: 'pending'
    });

    await report.save();

    // Log the event for admins
    const log = new AdminLog({
      action: 'REPORT_SUBMITTED',
      targetId: report._id,
      targetType: 'Report',
      details: { reporterId, targetId, targetType, reason },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: 'Report submitted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/moderation/reports
 * @desc    Get all reports (Admin only)
 * @access  Private/Admin
 */
router.get('/reports', verifyToken, async (req, res, next) => {
  try {
    // Basic admin check (this should be replaced with a proper role-based middleware)
    const User = mongoose.model('User');
    const currentUser = await User.findById(req.userId);
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin access required' });
    }

    const Report = mongoose.model('Report');
    const reports = await Report.find().sort({ createdAt: -1 }).limit(100);
    
    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/moderation/resolve
 * @desc    Resolve or dismiss a report
 * @access  Private/Admin
 */
router.post('/resolve', verifyToken, async (req, res, next) => {
  try {
    const { reportId, status, adminNote } = req.body;
    
    const User = mongoose.model('User');
    const currentUser = await User.findById(req.userId);
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const Report = mongoose.model('Report');
    const AdminLog = mongoose.model('AdminLog');

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

    report.status = status; // e.g., 'resolved', 'dismissed'
    report.adminNote = adminNote;
    await report.save();

    const log = new AdminLog({
      adminId: req.userId,
      action: `REPORT_${status.toUpperCase()}`,
      targetId: report._id,
      targetType: 'Report',
      details: { adminNote },
      ipAddress: req.ip
    });
    await log.save();

    res.json({ success: true, message: `Report ${status} successfully` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
