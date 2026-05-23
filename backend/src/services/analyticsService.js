const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Log an event for analytics and auditing
 */
const logEvent = async (event, data = {}, userId = 'SYSTEM') => {
  try {
    const AdminLog = mongoose.model('AdminLog');
    
    const log = new AdminLog({
      adminId: mongoose.Types.ObjectId.isValid(userId) ? userId : undefined,
      action: event,
      targetId: data.targetId || null,
      targetType: data.targetType || 'Analytics',
      details: data,
      createdAt: new Date()
    });
    
    await log.save();
    
    logger.info('📊 [Analytics] %s: %j', event, { userId, ...data });
    
    // Future: Add Mixpanel / Amplitude integration here
    // mixpanel.track(event, { distinct_id: userId, ...data });
    
  } catch (err) {
    logger.error('❌ Analytics Error: %s', err.message);
  }
};

module.exports = { logEvent };
