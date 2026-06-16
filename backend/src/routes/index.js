const express = require('express');
const router = express.Router();

// Import all routes
const messageRoutes = require('../../routes/messages');
const postRoutes = require('../../routes/posts'); // Restored full featured posts
const commentRoutes = require('../../routes/comments'); // Restored full featured comments
const livestreamRoutes = require('../../routes/livestream');
const notificationRoutes = require('../../routes/notification');
const savedRoutes = require('../../routes/saved');
const sectionRoutes = require('../../routes/sections');
const storyRoutes = require('../../routes/stories'); // Restored full featured stories
const userRoutes = require('../../routes/users');   // Restored full featured users
const categoriesRoutes = require('../../routes/categories');
const brandingRoutes = require('./branding');
const presenceRoutes = require('./presence');
const adminRoutes = require('../../routes/admin');
const locationRoutes = require('../../routes/locations');
const moderationRoutes = require('../../routes/moderation');
const gdprRoutes = require('../../routes/gdpr');

// Note: Conversations route was moved from root/routes to src/routes
const conversationRoutes = require('./conversations');

// Register routes
router.use('/conversations', messageRoutes);
router.use('/conversations', conversationRoutes);
router.use('/posts', commentRoutes);
router.use('/posts', postRoutes);
router.use('/live-streams', livestreamRoutes);
router.use('/notifications', notificationRoutes);
router.use('/stories', storyRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoriesRoutes);
router.use('/branding', brandingRoutes);
router.use('/presence', presenceRoutes);
router.use('/admin', adminRoutes);
router.use('/locations', locationRoutes);
router.use('/moderation', moderationRoutes);
router.use('/gdpr', gdprRoutes);

// Register newly restored routes
router.use('/auth', require('./auth'));
router.use('/upload', require('./upload'));
router.use('/groups', require('./groups'));
router.use('/passport', require('./passport'));
router.use('/public', require('./public'));
router.use('/follow', require('./follow'));
router.use('/highlights', require('./highlight'));
router.use('/media', require('./media'));
router.get('/all-regions', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const Region = mongoose.model('Region');
    const regions = await Region.find().sort({ name: 1 });
    const mapped = regions.map(r => ({
      id: r._id, 
      name: r.name, 
      image: r.image,
      section: r.type || 'country', 
      countryCode: r.countryCode,
      order: r.order || 0,
      regionKey: r.regionKey
    }));
    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch regions' });
  }
});



// Health check endpoints for frontend wakeup service
router.get('/status', (req, res) => res.json({ status: 'online', timestamp: new Date() }));
router.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

module.exports = router;
