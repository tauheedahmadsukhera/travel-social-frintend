const cache = require('../utils/redis');

/**
 * Cache middleware for Express routes
 * @param {number} ttl - Time to live in seconds
 */
const cacheMiddleware = (ttl = 3600) => {
  return async (req, res, next) => {
    // Skip caching if neither Redis nor local fallback is available, or it's not a GET request
    if ((!cache.redis && !cache.hasFallback) || req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl || req.url}`;
    
    try {
      const cachedData = await cache.get(key);
      if (cachedData) {
        return res.json(cachedData);
      }

      // Override res.json to capture and cache the response
      const originalJson = res.json;
      res.json = (data) => {
        if (res.statusCode === 200) {
          cache.set(key, data, ttl);
        }
        return originalJson.call(res, data);
      };

      next();
    } catch (err) {
      next();
    }
  };
};

module.exports = cacheMiddleware;
