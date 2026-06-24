let Section;
try {
  Section = require('../models/Section');
} catch (e) {
  try {
    const mongoose = require('mongoose');
    Section = mongoose.model('Section');
  } catch (e2) {
    console.error('Failed to load Section model:', e2.message);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isOwner(section, uid) {
  return String(section.userId) === String(uid);
}

function isCollaborator(section, uid) {
  if (!section.collaborators || !section.collaborators.length) return false;
  return section.collaborators.some(c => {
    // Handle both string array and object array formats
    if (typeof c === 'string') return String(c) === String(uid);
    return String(c.userId || c) === String(uid);
  });
}

// ─── GET /api/sections?userId=... ───────────────────────────────────────────
exports.getSectionsByUser = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const sections = await Section.find({ userId }).sort({ createdAt: 1 });
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/users/:uid/sections ───────────────────────────────────────────
exports.getUserSections = async (req, res) => {
  try {
    const { uid } = req.params;
    // Return own + collections where user is collaborator
    const sections = await Section.find({
      $or: [
        { userId: uid },
        { 'collaborators.userId': uid },
      ],
    }).sort({ createdAt: 1 });
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/users/:uid/sections ──────────────────────────────────────────
exports.createSection = async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, postIds, coverImage, visibility, specificUsers, collaborators } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'Section name required' });

    const section = new Section({
      userId: uid,
      name,
      postIds: Array.isArray(postIds) ? postIds : [],
      coverImage: coverImage || undefined,
      visibility: visibility || 'private',
      specificUsers: Array.isArray(specificUsers) ? specificUsers : [],
      collaborators: Array.isArray(collaborators)
        ? collaborators.map(id => ({ userId: id }))
        : [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await section.save();
    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── PUT /api/users/:uid/sections/:sectionId ────────────────────────────────
// Only owner can edit name/visibility/collaborators/cover
// Collaborator can only add to postIds
exports.updateSection = async (req, res) => {
  try {
    const { uid, sectionId } = req.params;
    const { name, postIds, coverImage, visibility, specificUsers, collaborators, addPostId, removePostId } = req.body;

    const section = await Section.findOne({ _id: sectionId });
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const owns = isOwner(section, uid);
    const collab = isCollaborator(section, uid);

    if (!owns && !collab) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Helper: safely add/remove a postId from the string array
    const safeAddPost = (id) => {
      const sid = String(id);
      if (!section.postIds.includes(sid)) section.postIds.push(sid);
    };
    const safeRemovePost = (id) => {
      const sid = String(id);
      section.postIds = section.postIds.filter(p => String(p) !== sid);
    };

    // Collaborators can only add/remove posts
    if (collab && !owns) {
      if (addPostId) safeAddPost(addPostId);
      if (removePostId) safeRemovePost(removePostId);
    } else {
      // Owner: full update
      if (name !== undefined) section.name = name;
      if (coverImage !== undefined) section.coverImage = coverImage;
      if (visibility !== undefined) section.visibility = visibility;
      if (Array.isArray(specificUsers)) section.specificUsers = specificUsers;
      if (Array.isArray(collaborators)) {
        // Store as plain strings to match the schema
        section.collaborators = collaborators.map(id => String(id._id || id.userId || id));
      }
      if (Array.isArray(postIds)) section.postIds = postIds.map(String);
      if (addPostId) safeAddPost(addPostId);
      if (removePostId) safeRemovePost(removePostId);
    }

    section.updatedAt = new Date();
    await section.save();
    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE /api/users/:uid/sections/:sectionId ─────────────────────────────
// Optional: body.migrateToSectionId — move posts before delete
exports.deleteSection = async (req, res) => {
  try {
    const { uid, sectionId } = req.params;
    const { migrateToSectionId } = req.body || {};

    const section = await Section.findOne({ _id: sectionId });
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    if (!isOwner(section, uid)) {
      return res.status(403).json({ success: false, error: 'Only the owner can delete a collection' });
    }

    // Migrate posts to another section if requested
    if (migrateToSectionId && section.postIds.length > 0) {
      const target = await Section.findById(migrateToSectionId);
      if (target) {
        const merged = [...new Set([...target.postIds, ...section.postIds])];
        target.postIds = merged;
        target.updatedAt = new Date();
        await target.save();
      }
    }

    await Section.findByIdAndDelete(sectionId);
    res.json({ success: true, data: { deletedId: sectionId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/users/:uid/sections/:sectionId/collaborators ─────────────────
exports.addCollaborator = async (req, res) => {
  try {
    const { uid, sectionId } = req.params;
    const { collaboratorId } = req.body;

    if (!collaboratorId) return res.status(400).json({ success: false, error: 'collaboratorId required' });

    const section = await Section.findOne({ _id: sectionId });
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    if (!isOwner(section, uid)) {
      return res.status(403).json({ success: false, error: 'Only the owner can add collaborators' });
    }

    const alreadyIn = section.collaborators.some(c => c.userId === collaboratorId);
    if (!alreadyIn) {
      section.collaborators.push({ userId: collaboratorId });
      section.updatedAt = new Date();
      await section.save();
    }

    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE /api/users/:uid/sections/:sectionId/collaborators/:collabId ─────
exports.removeCollaborator = async (req, res) => {
  try {
    const { uid, sectionId, collabId } = req.params;

    const section = await Section.findOne({ _id: sectionId });
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    if (!isOwner(section, uid)) {
      return res.status(403).json({ success: false, error: 'Only the owner can remove collaborators' });
    }

    section.collaborators = section.collaborators.filter(c => c.userId !== collabId);
    section.updatedAt = new Date();
    await section.save();

    res.json({ success: true, data: section });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
