const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

console.log('📌 Loading saved posts route...');

// Saved post schema
const savedPostSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  postId: { type: String, required: true },
  savedAt: { type: Date, default: Date.now }
});

savedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });
savedPostSchema.index({ userId: 1, savedAt: -1 });

const SavedPost = mongoose.models.SavedPost || mongoose.model('SavedPost', savedPostSchema);

const { verifyToken } = require('../src/middleware/authMiddleware');
const validate = require('../src/middleware/validateMiddleware');
const { savePostSchema } = require('../src/validations/savedValidation');

// Save a post (Requires Auth)
router.post('/:userId/saved', verifyToken, validate(savePostSchema), async (req, res) => {
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

    const cleanPostId = String(postId).split('-loop')[0];
    // Check if already saved
    const existing = await SavedPost.findOne({ userId: { $in: resolved.candidates }, postId: cleanPostId });
    if (existing) {
      return res.json({ success: true, message: 'Already saved' });
    }
    
    const savedPost = new SavedPost({ userId: resolved.canonicalId, postId: cleanPostId });
    await savedPost.save();

    // Keep Post.savedBy in sync for newer APIs
    const Post = mongoose.model('Post');
    const targetPost = await Post.findOne({
      $or: [
        { id: cleanPostId },
        ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
      ]
    });
    if (targetPost) {
      const alreadyInSavedBy = Array.isArray(targetPost.savedBy)
        && targetPost.savedBy.some((id) => resolved.candidates.includes(String(id)));
      if (!alreadyInSavedBy) {
        targetPost.savedBy = Array.isArray(targetPost.savedBy) ? targetPost.savedBy : [];
        targetPost.savedBy.push(resolved.canonicalId);
        targetPost.savesCount = targetPost.savedBy.length;
        await targetPost.save();
      }
    }
    
    res.json({ success: true, data: savedPost });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unsave a post (Requires Auth)
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

    const cleanPostId = String(postId).split('-loop')[0];
    await SavedPost.deleteMany({ userId: { $in: resolved.candidates }, postId: cleanPostId });

    const Post = mongoose.model('Post');
    const targetPost = await Post.findOne({
      $or: [
        { id: cleanPostId },
        ...(mongoose.Types.ObjectId.isValid(cleanPostId) ? [{ _id: cleanPostId }] : [])
      ]
    });
    if (targetPost) {
      targetPost.savedBy = (Array.isArray(targetPost.savedBy) ? targetPost.savedBy : []).filter((id) => !resolved.candidates.includes(String(id)));
      targetPost.savesCount = targetPost.savedBy.length;
      await targetPost.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get saved posts for user (Requires Auth)
router.get('/:userId/saved', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const authenticatedUserId = req.userId;
    
    const resolved = await resolveUserIdentifiers(userId);
    const authResolved = await resolveUserIdentifiers(authenticatedUserId);
    const isSelf = resolved.candidates.some(c => authResolved.candidates.map(String).includes(String(c)));
    
    if (!isSelf) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const idCandidates = [...new Set(resolved.candidates.map((v) => String(v)))];
    const idObjectCandidates = idCandidates
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const savedPosts = await SavedPost.find({ userId: { $in: idCandidates } }).sort({ savedAt: -1 });
    const legacyPostIds = savedPosts.map((s) => String(s.postId)).filter(Boolean);

    // Include collection posts where user is owner/collaborator
    const Section = mongoose.model('Section');
    const sections = await Section.find({
      $or: [
        { userId: { $in: idCandidates } },
        { userId: { $in: idObjectCandidates } },
        { collaborators: { $in: idCandidates } },
        { collaborators: { $in: idObjectCandidates } },
        { 'collaborators.userId': { $in: idCandidates } },
        { 'collaborators.userId': { $in: idObjectCandidates } },
      ]
    }).lean();

    const sectionPostIds = [];
    (Array.isArray(sections) ? sections : []).forEach((s) => {
      const ids = Array.isArray(s?.postIds) ? s.postIds : [];
      ids.forEach((pid) => {
        const nextId = pid && typeof pid === 'object'
          ? String(pid._id || pid.id || pid.postId || '')
          : String(pid || '');
        if (nextId) sectionPostIds.push(nextId);
      });
    });

    const allPostIds = [...new Set([...legacyPostIds, ...sectionPostIds])];
    const objectPostIds = allPostIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const skip = parseInt(String(req.query.skip || '0'), 10) || 0;

    const postService = require('../services/postService');
    
    const query = {
      $or: [
        { savedBy: { $in: idCandidates } },
        { _id: { $in: objectPostIds } },
        { id: { $in: allPostIds } }
      ]
    };

    const enrichedPosts = await postService.getEnrichedPosts(query, { 
      skip, 
      limit, 
      viewerId: userId 
    });
    
    res.json({ success: true, data: enrichedPosts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
