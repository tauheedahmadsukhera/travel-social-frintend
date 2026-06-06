console.log('📌 Loading highlights routes...');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { resolveUserIdentifiers } = require('../src/utils/userUtils');
const { verifyToken } = require('../src/middleware/authMiddleware');

// Use Highlight model (already loaded in server)
const getHighlight = () => {
  try {
    return mongoose.model('Highlight');
  } catch {
    return null;
  }
};

// Add a highlight (Requires Auth)
router.post('/highlights', verifyToken, async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    
    const { title, coverImage, items, stories, storyIds, visibility } = req.body;
    const userId = req.userId; // Always use authenticated userId
    
    // Support both 'stories' and 'storyIds' from frontend
    const storiesArray = stories || storyIds || [];
    
    const highlight = new Highlight({ 
      userId, 
      title, 
      coverImage: coverImage || null,
      items: items || [],
      stories: storiesArray,
      visibility: visibility || 'Public'
    });
    await highlight.save();
    
    const normalizedHighlight = {
      ...(highlight.toObject ? highlight.toObject() : highlight),
      id: String(highlight._id)
    };
    
    res.status(201).json({ success: true, data: normalizedHighlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a highlight for a specific user (Requires Auth)
router.post('/users/:userId/highlights', verifyToken, async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    
    const { title, coverImage, items, stories, storyIds, visibility } = req.body;
    const userId = req.userId; // Use authenticated userId
    
    // Support both 'stories' and 'storyIds' from frontend
    const storiesArray = stories || storyIds || [];
    
    // Create highlight with title, optional cover image, and visibility
    const highlight = new Highlight({ 
      userId, 
      title, 
      coverImage: coverImage || null,
      items: items || [],
      stories: storiesArray,
      visibility: visibility || 'Public'
    });
    
    await highlight.save();
    
    const normalizedHighlight = {
      ...(highlight.toObject ? highlight.toObject() : highlight),
      id: String(highlight._id)
    };
    
    res.status(201).json({ success: true, data: normalizedHighlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all highlights for a user
router.get('/users/:userId/highlights', async (req, res) => {
  try {
    const Highlight = getHighlight();
    if (!Highlight) return res.json({ success: true, data: [] });
    
    const user = await resolveUserIdentifiers(req.params.userId);
    const highlights = await Highlight.find({ userId: { $in: user.candidates } }).lean();

    // Self-heal: delete empty highlights (no items/stories) so they don't show on profile.
    const emptyIds = (Array.isArray(highlights) ? highlights : [])
      .filter((h) => {
        const itemsLen = Array.isArray(h?.items) ? h.items.length : 0;
        const storiesLen = Array.isArray(h?.stories) ? h.stories.length : 0;
        return (itemsLen + storiesLen) <= 0;
      })
      .map((h) => h?._id)
      .filter(Boolean);

    if (emptyIds.length > 0) {
      try {
        await Highlight.deleteMany({ _id: { $in: emptyIds } });
      } catch {
        // best-effort cleanup
      }
    }
    
    // Normalize _id to id for client compatibility
    const normalizedHighlights = (Array.isArray(highlights) ? highlights : [])
      .filter((h) => {
        const itemsLen = Array.isArray(h?.items) ? h.items.length : 0;
        const storiesLen = Array.isArray(h?.stories) ? h.stories.length : 0;
        return (itemsLen + storiesLen) > 0;
      })
      .map(h => ({
        ...h,
        id: String(h._id)
      }));
    
    res.json({ success: true, data: normalizedHighlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/highlights - Get highlights (Requires Auth)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { userId } = req.query;
    const authenticatedUserId = req.userId;
    
    let highlights = [];
    if (userId) {
      // If filtering by userId, check if self or public
      const user = await resolveUserIdentifiers(userId);
      const authUser = await resolveUserIdentifiers(authenticatedUserId);
      const isSelf = user.candidates.some(c => authUser.candidates.map(String).includes(String(c)));
      
      if (!isSelf) {
        highlights = await Highlight.find({ userId: { $in: user.candidates }, visibility: 'Public' }).lean();
      } else {
        highlights = await Highlight.find({ userId: { $in: user.candidates } }).lean();
      }
    } else {
      // Default to own highlights
      highlights = await Highlight.find({ userId: authenticatedUserId }).lean();
    }
    
    const normalizedHighlights = highlights.map(h => ({
      ...h,
      id: String(h._id)
    }));
    
    res.json({ success: true, data: normalizedHighlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit a highlight (Requires Auth)
router.patch('/highlights/:highlightId', verifyToken, async (req, res) => {
  try {
    const authenticatedUserId = req.userId;
    const { title, items, coverImage } = req.body;
    const highlight = await Highlight.findById(req.params.highlightId);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });
    
    // Ownership check
    if (String(highlight.userId) !== String(authenticatedUserId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (title) highlight.title = title;
    if (items) highlight.items = items;
    if (typeof coverImage === 'string') highlight.coverImage = coverImage;
    await highlight.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a story to an existing highlight (Requires Auth)
router.post('/highlights/:highlightId/stories', verifyToken, async (req, res) => {
  try {
    const { highlightId } = req.params;
    const authenticatedUserId = req.userId;

    // Accept both { storyId } and { storySnapshot: { storyId, ... } } from the client
    const clientSnapshot = req.body.storySnapshot || null;
    const storyId = req.body.storyId || clientSnapshot?.storyId || clientSnapshot?.id || null;
    
    if (!storyId) return res.status(400).json({ success: false, error: 'storyId is required' });

    const Highlight = getHighlight();
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    // Build snapshot: prefer DB lookup, then client-supplied snapshot, then just storyId
    let storySnapshot = null;
    try {
      const Story = mongoose.model('Story');
      const st = mongoose.Types.ObjectId.isValid(storyId) ? await Story.findById(storyId).lean() : null;
      if (st) {
        storySnapshot = {
          id: String(st._id),
          storyId: String(st._id),
          userId: st.userId,
          userName: st.userName,
          userAvatar: st.userAvatar,
          imageUrl: st.image || null,
          videoUrl: st.video || null,
          thumbnailUrl: st.thumbnail || null,
          mediaUrl: st.image || st.video || null,
          mediaType: st.video ? 'video' : 'image',
          createdAt: st.createdAt || new Date(),
          expiresAt: st.expiresAt || null,
          locationData: st.locationData || null,
        };
      }
    } catch {
      storySnapshot = null;
    }

    // If DB lookup didn't find it, use the client-supplied snapshot
    if (!storySnapshot && clientSnapshot) {
      storySnapshot = {
        id: String(clientSnapshot.storyId || clientSnapshot.id || storyId),
        storyId: String(clientSnapshot.storyId || clientSnapshot.id || storyId),
        imageUrl: clientSnapshot.imageUrl || null,
        videoUrl: clientSnapshot.videoUrl || null,
        mediaUrl: clientSnapshot.imageUrl || clientSnapshot.videoUrl || null,
        mediaType: clientSnapshot.mediaType || (clientSnapshot.videoUrl ? 'video' : 'image'),
        createdAt: clientSnapshot.createdAt || new Date(),
      };
    }
    
    // Add to items array if it doesn't exist
    const isAlreadyInItems = highlight.items?.some(item => (item?.id === storyId || item?.storyId === storyId || item === storyId));
    if (!isAlreadyInItems) {
      if (!highlight.items) highlight.items = [];
      highlight.items.push(storySnapshot || storyId);
    }

    // Compatibility for stories array
    if (!highlight.stories.includes(storyId)) {
      highlight.stories.push(storyId);
    }
    
    await highlight.save();
    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Remove a story from a highlight (Requires Auth)
router.delete('/highlights/:highlightId/stories/:storyId', verifyToken, async (req, res) => {
  try {
    const { highlightId, storyId } = req.params;
    const authenticatedUserId = req.userId;
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });

    const highlight = await Highlight.findById(highlightId);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    // Remove from stories array (string ids)
    highlight.stories = Array.isArray(highlight.stories)
      ? highlight.stories.filter((id) => String(id) !== String(storyId))
      : [];

    // Remove from items array (can be string or object)
    highlight.items = Array.isArray(highlight.items)
      ? highlight.items.filter((it) => {
          if (typeof it === 'string') return String(it) !== String(storyId);
          if (it && typeof it === 'object') return String(it.id || it.storyId || '') !== String(storyId);
          return true;
        })
      : [];

    // If highlight is now empty, delete it (Instagram-like)
    const remaining = (highlight.items?.length || 0) + (highlight.stories?.length || 0);
    if (remaining <= 0) {
      await Highlight.findByIdAndDelete(highlightId);
      return res.json({ success: true, deletedHighlight: true });
    }

    await highlight.save();
    return res.json({ success: true, data: highlight, deletedHighlight: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback remove (POST /api/highlights/:highlightId/stories/remove)
router.post('/highlights/:highlightId/stories/remove', async (req, res) => {
  try {
    const { highlightId } = req.params;
    const { storyId } = req.body;
    if (!storyId) return res.status(400).json({ success: false, error: 'storyId is required' });

    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });

    const highlight = await Highlight.findById(highlightId);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    highlight.stories = Array.isArray(highlight.stories)
      ? highlight.stories.filter((id) => String(id) !== String(storyId))
      : [];

    highlight.items = Array.isArray(highlight.items)
      ? highlight.items.filter((it) => {
          if (typeof it === 'string') return String(it) !== String(storyId);
          if (it && typeof it === 'object') return String(it.id || it.storyId || '') !== String(storyId);
          return true;
        })
      : [];

    const remaining = (highlight.items?.length || 0) + (highlight.stories?.length || 0);
    if (remaining <= 0) {
      await Highlight.findByIdAndDelete(highlightId);
      return res.json({ success: true, deletedHighlight: true });
    }

    await highlight.save();
    return res.json({ success: true, data: highlight, deletedHighlight: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a highlight (Requires Auth)
router.delete('/highlights/:highlightId', verifyToken, async (req, res) => {
  try {
    const { highlightId } = req.params;
    const Highlight = getHighlight();
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    const authenticatedUserId = req.userId;

    const hl = await Highlight.findById(highlightId);
    if (!hl) return res.status(404).json({ success: false, error: 'Highlight not found' });
    
    // Ownership check
    if (String(hl.userId) !== String(authenticatedUserId)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    await Highlight.findByIdAndDelete(highlightId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get stories for a highlight
router.get('/highlights/:highlightId/stories', async (req, res) => {
  try {
    const { highlightId } = req.params;
    const Highlight = getHighlight();
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    // Prefer items snapshots (survives story expiry). Fallback to stories ids.
    const items = Array.isArray(highlight.items) ? highlight.items : [];
    const hasSnapshots = items.some((it) => it && typeof it === 'object' && (it.mediaUrl || it.imageUrl || it.videoUrl));
    if (hasSnapshots) {
      const normalized = items
        .map((it) => {
          if (!it) return null;
          if (typeof it === 'string') return null;
          const id = String(it.id || it.storyId || '').trim();
          if (!id) return null;
          return {
            ...it,
            id,
            _id: id,
            imageUrl: it.imageUrl || null,
            videoUrl: it.videoUrl || null,
            mediaUrl: it.mediaUrl || it.imageUrl || it.videoUrl || null,
            mediaType: it.mediaType || (it.videoUrl ? 'video' : 'image'),
          };
        })
        .filter(Boolean);
      return res.json({ success: true, data: normalized });
    }

    const storyIds = highlight.stories || [];

    if (!storyIds || storyIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch the actual Story documents using the IDs
    const Story = mongoose.model('Story');
    const storiesArray = await Story.find({
      _id: { $in: storyIds.filter(id => mongoose.Types.ObjectId.isValid(id)) }
    }).lean();

    // Reconstruct with image/video urls which ProfileViewer expects
    const enrichedStories = storiesArray.map(story => ({
      ...story,
      id: String(story._id),
      imageUrl: story.image || null,
      videoUrl: story.video || null,
      mediaUrl: story.image || story.video || null,
      mediaType: story.video ? 'video' : 'image',
    }));

    // Sort to maintain original order if possible
    enrichedStories.sort((a, b) => {
      const idxA = storyIds.indexOf(a.id);
      const idxB = storyIds.indexOf(b.id);
      return idxA - idxB;
    });

    res.json({ success: true, data: enrichedStories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
