const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');

// Load Section model
const Section = mongoose.models.Section || require('../src/models/Section');

// Use centralized Section model
const { verifyToken } = require('../src/middleware/authMiddleware');

// POST /api/sections - Create a new section (Requires Auth)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, coverImage, posts, postIds, visibility, collaborators } = req.body;
    const userId = req.userId; // Always use authenticated userId

    // Get max order for this user
    const lastSection = await Section.findOne({ userId: { $in: user.candidates } }).sort({ order: -1 });
    const nextOrder = (lastSection?.order || 0) + 1;

    const section = new Section({
      userId,
      name,
      order: nextOrder,
      coverImage: coverImage || null,
      postIds: postIds || posts || [], // Support both just in case
      visibility: visibility || 'private',
      collaborators: collaborators || [],
      allowedUsers: req.body.allowedUsers || [],
      allowedGroups: req.body.allowedGroups || []
    });
    await section.save();

    console.log('[POST /sections] Section created:', section._id, 'for user:', userId);
    res.status(201).json({ success: true, data: section });
  } catch (err) {
    console.error('[POST /sections] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/:userId/sections
router.get('/:userId/sections', async (req, res) => {
  try {
    const user = await resolveUserIdentifiers(req.params.userId);
    const requesterId = req.query.requesterId;
    const userCandidateStrings = (user.candidates || []).map(v => String(v));
    const userCandidateObjectIds = userCandidateStrings
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    // Find sections owned by the user OR where the user is a collaborator
    const sections = await Section.find({ 
      $or: [
        { userId: { $in: user.candidates } },
        { collaborators: { $in: user.candidates } },
        { collaborators: { $in: userCandidateStrings } },
        { collaborators: { $in: userCandidateObjectIds } },
        { 'collaborators.userId': { $in: userCandidateStrings } },
        { 'collaborators.userId': { $in: userCandidateObjectIds } }
      ]
    }).sort({ order: 1 });
    
    // Filter by visibility and collaborators
    const filteredSections = sections.filter(section => {
      // 1. Owner can see all
      if (user.candidates.includes(requesterId)) return true;
      // 2. Public is visible to all
      if (section.visibility === 'public') return true;
      // 3. Collaborators can see
      if (section.collaborators && section.collaborators.includes(requesterId)) return true;
      // 4. Allowed users can see (specific visibility)
      if (section.visibility === 'specific' && section.allowedUsers && section.allowedUsers.includes(requesterId)) return true;
      
      return false;
    });

    // 5. Populate collaborators with basic user info (BATCHED)
    const User = mongoose.models.User || mongoose.model('User');
    
    // Collect all unique collaborator IDs across all sections
    const allCollabIds = new Set();
    filteredSections.forEach(s => {
      if (Array.isArray(s.collaborators)) {
        s.collaborators.forEach(entry => {
          const id = entry && typeof entry === 'object'
            ? String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '')
            : String(entry || '');
          if (id) allCollabIds.add(id);
        });
      }
    });

    const collabIdsArray = Array.from(allCollabIds);
    const collabUsers = await User.find({ 
      $or: [
        { _id: { $in: collabIdsArray.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)) } },
        { uid: { $in: collabIdsArray } },
        { firebaseUid: { $in: collabIdsArray } }
      ]
    }, 'name displayName username avatar uid firebaseUid _id').lean();

    const collabCache = {};
    collabUsers.forEach(u => {
      if (u._id) collabCache[String(u._id)] = u;
      if (u.uid) collabCache[u.uid] = u;
      if (u.firebaseUid) collabCache[u.firebaseUid] = u;
    });

    const populatedSections = filteredSections.map((section) => {
      const s = section.toObject ? section.toObject() : section;
      if (Array.isArray(s.collaborators)) {
        s.collaborators = s.collaborators.map(entry => {
          const idStr = entry && typeof entry === 'object'
            ? String(entry.userId || entry._id || entry.id || entry.uid || entry.firebaseUid || '')
            : String(entry || '');
          const u = collabCache[idStr];
          return u ? { ...u, id: u._id } : entry;
        });
      }
      return s;
    });


    res.json({ success: true, data: populatedSections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sections - Get sections (Requires Auth)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { userId } = req.query;
    const authenticatedUserId = req.userId;
    
    if (userId) {
       const resolved = await resolveUserIdentifiers(userId);
       const authResolved = await resolveUserIdentifiers(authenticatedUserId);
       const isSelf = resolved.candidates.some(c => authResolved.candidates.map(String).includes(String(c)));
       
       if (!isSelf) {
         // If not self, only return public sections
         const sections = await Section.find({ userId: { $in: resolved.candidates }, visibility: 'public' }).sort({ order: 1 });
         return res.json({ success: true, data: sections });
       }
       
       const sections = await Section.find({ userId: { $in: resolved.candidates } }).sort({ order: 1 });
       return res.json({ success: true, data: sections });
    }
    
    // Default to own sections
    const sections = await Section.find({ userId: authenticatedUserId }).sort({ order: 1 });
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/sections/:sectionId - Update a specific section (Requires Auth)
router.patch('/:sectionId', verifyToken, async (req, res) => {
  try {
    const { name, coverImage, postIds, posts, order, visibility, collaborators } = req.body;
    const requesterId = req.userId;
    const { sectionId } = req.params;

    // Check ownership (only owner can edit)
    const existingSection = await Section.findById(sectionId);
    if (!existingSection) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    if (existingSection.userId !== requesterId) {
      const isCollaborator = existingSection.collaborators && existingSection.collaborators.includes(requesterId);
      if (isCollaborator) {
        // Collaborators can ONLY update postIds (add/remove posts)
        if (name !== undefined || visibility !== undefined || collaborators !== undefined || req.body.allowedUsers !== undefined || order !== undefined) {
          return res.status(403).json({ success: false, error: 'Unauthorized: Collaborators can only update posts' });
        }
      } else {
        return res.status(403).json({ success: false, error: 'Unauthorized: Only owner or collaborator can edit' });
      }
    }

    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (postIds !== undefined) updateData.postIds = postIds;
    else if (posts !== undefined) updateData.postIds = posts;
    if (order !== undefined) updateData.order = order;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (collaborators !== undefined) updateData.collaborators = collaborators;
    if (req.body.allowedUsers !== undefined) updateData.allowedUsers = req.body.allowedUsers;
    if (req.body.allowedGroups !== undefined) updateData.allowedGroups = req.body.allowedGroups;

    const section = await Section.findByIdAndUpdate(
      sectionId,
      updateData,
      { new: true }
    );

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    console.log('[PATCH /sections/:sectionId] Section updated:', sectionId);
    res.json({ success: true, data: section });
  } catch (err) {
    console.error('[PATCH /sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/:uid/sections/:sectionId - used by client (useCollectionLogic)
router.put('/:uid/sections/:sectionId', verifyToken, async (req, res) => {
  try {
    const { uid, sectionId } = req.params;
    const { name, postIds, coverImage, visibility, specificUsers, collaborators, addPostId, removePostId } = req.body;

    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const sectionUserId = String(section.userId);
    const requesterId = String(req.userId);
    const paramUid = String(uid);

    // Allow if JWT user matches uid param OR section owner
    const isOwner = sectionUserId === requesterId || sectionUserId === paramUid;
    const isCollaborator = Array.isArray(section.collaborators) &&
      section.collaborators.some(c => String(typeof c === 'object' ? (c.userId || c._id || c) : c) === requesterId);

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Safe add/remove helpers
    const safeAddPost = (id) => {
      const sid = String(id);
      const currentIds = section.postIds.map(String);
      if (!currentIds.includes(sid)) section.postIds.push(sid);
    };
    const safeRemovePost = (id) => {
      const sid = String(id);
      section.postIds = section.postIds.filter(p => String(p) !== sid);
    };

    if (isCollaborator && !isOwner) {
      if (addPostId) safeAddPost(addPostId);
      if (removePostId) safeRemovePost(removePostId);
    } else {
      if (name !== undefined) section.name = name;
      if (coverImage !== undefined) section.coverImage = coverImage;
      if (visibility !== undefined) section.visibility = visibility;
      if (Array.isArray(specificUsers)) section.specificUsers = specificUsers;
      if (Array.isArray(collaborators)) {
        section.collaborators = collaborators.map(id => String(id._id || id.userId || id));
      }
      if (Array.isArray(postIds)) section.postIds = postIds.map(String);
      if (addPostId) safeAddPost(addPostId);
      if (removePostId) safeRemovePost(removePostId);
    }

    section.updatedAt = new Date();
    await section.save();
    console.log('[PUT /users/:uid/sections/:sectionId] Updated section:', sectionId);
    res.json({ success: true, data: section });
  } catch (err) {
    console.error('[PUT /users/:uid/sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/sections/:sectionId - Delete a section (Requires Auth)
router.delete('/:sectionId', verifyToken, async (req, res) => {
  try {
    const { sectionId } = req.params;
    const requesterId = req.userId;

    const existingSection = await Section.findById(sectionId);
    if (!existingSection) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    if (existingSection.userId !== requesterId) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only owner can delete' });
    }

    const section = await Section.findByIdAndDelete(sectionId);

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    console.log('[DELETE /sections/:sectionId] Section deleted:', sectionId);
    res.json({ success: true, message: 'Section deleted successfully' });
  } catch (err) {
    console.error('[DELETE /sections/:sectionId] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE section order  
router.patch('/:userId/sections-order', async (req, res) => {
  try {
    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: 'sections array required' });
    }

    // Update all sections in a single operation
    const updatePromises = sections.map((section, index) =>
      Section.updateOne(
        { _id: section._id || section.id },
        { order: index, updatedAt: new Date() }
      )
    );

    await Promise.all(updatePromises);

    console.log('[PATCH /sections-order] Updated order for', sections.length, 'sections');
    res.json({ success: true, message: 'Section order updated successfully' });
  } catch (err) {
    console.error('[PATCH /sections-order] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
