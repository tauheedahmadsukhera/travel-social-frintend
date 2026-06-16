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
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });

    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    // Build snapshot: prefer DB lookup, then client-supplied snapshot, then just storyId.
    // IMPORTANT: Stories expire after 24h (TTL). The snapshot saved here is the ONLY
    // permanent record of the story media. If we fail to save a snapshot with media
    // URLs, the highlight will appear empty once the Story document is garbage-collected.
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

    // If DB lookup didn't find it (expired or invalid ID), use the client-supplied snapshot.
    // This is the critical fallback — without it, the highlight will be empty.
    if (!storySnapshot && clientSnapshot) {
      storySnapshot = {
        id: String(clientSnapshot.storyId || clientSnapshot.id || storyId),
        storyId: String(clientSnapshot.storyId || clientSnapshot.id || storyId),
        userId: clientSnapshot.userId || null,
        userName: clientSnapshot.userName || null,
        userAvatar: clientSnapshot.userAvatar || null,
        imageUrl: clientSnapshot.imageUrl || null,
        videoUrl: clientSnapshot.videoUrl || null,
        mediaUrl: clientSnapshot.imageUrl || clientSnapshot.videoUrl || clientSnapshot.mediaUrl || null,
        mediaType: clientSnapshot.mediaType || (clientSnapshot.videoUrl ? 'video' : 'image'),
        createdAt: clientSnapshot.createdAt || new Date(),
      };
    }

    // Merge DB snapshot with client snapshot to fill any gaps (e.g. DB has media but
    // client has user info, or vice-versa).
    if (storySnapshot && clientSnapshot) {
      if (!storySnapshot.imageUrl && clientSnapshot.imageUrl) storySnapshot.imageUrl = clientSnapshot.imageUrl;
      if (!storySnapshot.videoUrl && clientSnapshot.videoUrl) storySnapshot.videoUrl = clientSnapshot.videoUrl;
      if (!storySnapshot.mediaUrl) storySnapshot.mediaUrl = storySnapshot.imageUrl || storySnapshot.videoUrl || clientSnapshot.mediaUrl || null;
      if (!storySnapshot.userId && clientSnapshot.userId) storySnapshot.userId = clientSnapshot.userId;
      if (!storySnapshot.userName && clientSnapshot.userName) storySnapshot.userName = clientSnapshot.userName;
      if (!storySnapshot.userAvatar && clientSnapshot.userAvatar) storySnapshot.userAvatar = clientSnapshot.userAvatar;
    }

    // Last-resort: if we still have no snapshot at all, create a minimal one so
    // the items array has something. The stories-array fallback (Story.find) will
    // only work for 24h until TTL kicks in, so this is still better than nothing.
    if (!storySnapshot) {
      storySnapshot = { id: storyId, storyId, mediaType: 'image', createdAt: new Date() };
    }
    
    // Add to items array if it doesn't already exist (compare as strings).
    const sid = String(storyId);
    if (!Array.isArray(highlight.items)) highlight.items = [];
    const isAlreadyInItems = highlight.items.some((item) => {
      if (!item) return false;
      if (typeof item === 'string') return item === sid;
      return String(item.id || item.storyId || '') === sid;
    });
    if (!isAlreadyInItems) {
      highlight.items.push(storySnapshot);
    } else {
      // Update existing snapshot if it was a bare storyId string (upgrade to full object).
      highlight.items = highlight.items.map((item) => {
        if (typeof item === 'string' && item === sid) return storySnapshot;
        if (item && typeof item === 'object' && String(item.id || item.storyId || '') === sid) {
          // Merge new snapshot into existing (keep existing fields, fill gaps).
          const merged = { ...item };
          if (!merged.imageUrl && storySnapshot.imageUrl) merged.imageUrl = storySnapshot.imageUrl;
          if (!merged.videoUrl && storySnapshot.videoUrl) merged.videoUrl = storySnapshot.videoUrl;
          if (!merged.mediaUrl) merged.mediaUrl = merged.imageUrl || merged.videoUrl || null;
          return merged;
        }
        return item;
      });
    }

    // Compatibility for stories array (string IDs).
    if (!Array.isArray(highlight.stories)) highlight.stories = [];
    const alreadyInStories = highlight.stories.some((id) => String(id) === sid);
    if (!alreadyInStories) {
      highlight.stories.push(sid);
    }

    // Mark items as modified so Mongoose saves Mixed-type changes.
    highlight.markModified('items');
    
    await highlight.save();
    res.json({ success: true, data: highlight });
  } catch (err) {
    console.error('❌ POST /highlights/:highlightId/stories error:', err);
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
    if (!Highlight) return res.status(500).json({ success: false, error: 'Highlight model not available' });
    
    const highlight = await Highlight.findById(highlightId);
    
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const items = Array.isArray(highlight.items) ? highlight.items : [];
    
    // Separate items into snapshot objects and bare string IDs.
    const snapshotItems = [];
    const bareStringIds = [];
    const seenIds = new Set();

    for (const it of items) {
      if (!it) continue;
      if (typeof it === 'string') {
        if (!seenIds.has(it)) { bareStringIds.push(it); seenIds.add(it); }
        continue;
      }
      if (typeof it === 'object') {
        const id = String(it.id || it.storyId || '').trim();
        if (!id) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        // Check if this snapshot has usable media
        if (it.mediaUrl || it.imageUrl || it.videoUrl) {
          snapshotItems.push({
            ...it,
            id,
            _id: id,
            imageUrl: it.imageUrl || null,
            videoUrl: it.videoUrl || null,
            mediaUrl: it.mediaUrl || it.imageUrl || it.videoUrl || null,
            mediaType: it.mediaType || (it.videoUrl ? 'video' : 'image'),
          });
        } else {
          // Object without media — treat like a bare ID for DB lookup
          bareStringIds.push(id);
        }
      }
    }

    // Also add any storyIds from the stories array that aren't covered yet.
    const storyIds = Array.isArray(highlight.stories) ? highlight.stories : [];
    for (const sid of storyIds) {
      const s = String(sid);
      if (s && !seenIds.has(s)) {
        bareStringIds.push(s);
        seenIds.add(s);
      }
    }

    // If there are bare IDs, try to look them up from the Story collection
    // (will only work if the story hasn't expired yet).
    let dbLookedUp = [];
    if (bareStringIds.length > 0) {
      try {
        const Story = mongoose.model('Story');
        const validIds = bareStringIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length > 0) {
          const foundStories = await Story.find({ _id: { $in: validIds } }).lean();
          dbLookedUp = foundStories.map(story => ({
            id: String(story._id),
            _id: String(story._id),
            storyId: String(story._id),
            userId: story.userId,
            userName: story.userName,
            userAvatar: story.userAvatar,
            imageUrl: story.image || null,
            videoUrl: story.video || null,
            mediaUrl: story.image || story.video || null,
            mediaType: story.video ? 'video' : 'image',
            createdAt: story.createdAt || null,
          }));

          // Best-effort: backfill these snapshots into the highlight's items array
          // so future reads don't need DB lookups (the Story will eventually expire).
          if (dbLookedUp.length > 0) {
            try {
              let needsSave = false;
              for (const snap of dbLookedUp) {
                const existsInItems = highlight.items.some((it) => {
                  if (typeof it === 'string') return it === snap.id;
                  if (it && typeof it === 'object') return String(it.id || it.storyId || '') === snap.id;
                  return false;
                });
                if (existsInItems) {
                  // Replace bare string or media-less object with full snapshot.
                  highlight.items = highlight.items.map((it) => {
                    if (typeof it === 'string' && it === snap.id) { needsSave = true; return snap; }
                    if (it && typeof it === 'object' && String(it.id || it.storyId || '') === snap.id && !it.mediaUrl && !it.imageUrl) {
                      needsSave = true;
                      return { ...it, ...snap };
                    }
                    return it;
                  });
                } else {
                  highlight.items.push(snap);
                  needsSave = true;
                }
              }
              if (needsSave) {
                highlight.markModified('items');
                highlight.save().catch(() => {}); // fire-and-forget
              }
            } catch { /* best effort */ }
          }
        }
      } catch { /* Story model not available or DB error */ }
    }

    // Combine snapshot items with DB-looked-up stories.
    const allStories = [...snapshotItems, ...dbLookedUp];

    // Sort to maintain original order if possible (by items array order).
    const idOrder = items.map((it) => {
      if (typeof it === 'string') return it;
      if (it && typeof it === 'object') return String(it.id || it.storyId || '');
      return '';
    });
    allStories.sort((a, b) => {
      const idxA = idOrder.indexOf(a.id);
      const idxB = idOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });

    res.json({ success: true, data: allStories });
  } catch (err) {
    console.error('❌ GET /highlights/:highlightId/stories error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
