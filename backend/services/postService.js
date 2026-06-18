const mongoose = require('mongoose');

/**
 * Optimized Aggregation Pipeline for Posts
 * Handles:
 * 1. Visibility filtering
 * 2. Sorting & Pagination
 * 3. Author data lookup
 * 4. Like status for viewer
 * 5. Saved status for viewer
 * 6. Comment count lookup
 */
async function getEnrichedPosts(query, { skip = 0, limit = 20, sort = { createdAt: -1 }, viewerId = null }) {
  const Post = mongoose.model('Post');
  
  // Use indexed query directly for high-performance retrieval
  const posts = await Post.find(query)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  
  // Final pass in JS for complex formatting (media URLs, stats, likes, comments, etc.)
  const { enrichPostsWithUserData } = require('../utils/postHelpers');
  return await enrichPostsWithUserData(posts, viewerId);
}

module.exports = {
  getEnrichedPosts
};
