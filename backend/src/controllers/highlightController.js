const mongoose = require('mongoose');
const Highlight = require('../models/Highlight');
const Story = require('../models/Story');

function safeDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function mediaKeyFrom(entry) {
  const seed = String(
    entry?.mediaUrl ||
    entry?.videoUrl ||
    entry?.video ||
    entry?.imageUrl ||
    entry?.image ||
    entry?.thumbnailUrl ||
    entry?.uri ||
    ''
  ).trim();
  if (!seed) return '';
  return `media_${Buffer.from(seed).toString('base64url').slice(0, 24)}`;
}

function normaliseStory(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const storyId = entry.trim();
    return storyId ? { storyId, id: storyId, imageUrl: '', videoUrl: '', mediaUrl: '', mediaType: 'image', createdAt: new Date() } : null;
  }

  const rawId = String(entry.storyId || entry.id || entry._id || '').trim();
  const storyId = rawId || mediaKeyFrom(entry);
  if (!storyId) return null;

  const imageUrl = entry.imageUrl || entry.image || entry.imageUri || entry.thumbnailUrl || '';
  const videoUrl = entry.videoUrl || entry.video || entry.videoUri || '';
  const mediaUrl = entry.mediaUrl || imageUrl || videoUrl || '';
  const mediaType = entry.mediaType || (videoUrl ? 'video' : 'image');

  return {
    id: storyId,
    storyId,
    userId: entry.userId || null,
    userName: entry.userName || entry.username || entry.displayName || null,
    userAvatar: entry.userAvatar || entry.avatar || entry.photoURL || null,
    imageUrl,
    videoUrl,
    thumbnailUrl: entry.thumbnailUrl || entry.thumbnail || null,
    mediaUrl,
    mediaType,
    createdAt: safeDate(entry.createdAt || entry.timestamp),
    locationData: entry.locationData || null,
    postMetadata: entry.postMetadata || null
  };
}

// GET /api/highlights?userId=...
exports.getHighlightsByUser = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const highlights = await Highlight.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: highlights });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/highlights
exports.createHighlight = async (req, res) => {
  console.log('[createHighlight] Request body:', req.body);
  try {
    const { userId, title, coverImage, stories = [], storyIds = [], items = [], storySnapshot, storySnapshots = [], visibility } = req.body;
    const resolvedUserId = req.userId || userId;
    if (!resolvedUserId || !title) {
      console.warn('[createHighlight] Validation failed: userId or title missing.', { resolvedUserId, title });
      return res.status(400).json({ success: false, error: 'userId and title required' });
    }

    let resolvedItems = [];
    let resolvedStoryIds = [];

    const incomingStories = [];
    if (storySnapshot) incomingStories.push(storySnapshot);
    if (Array.isArray(storySnapshots)) incomingStories.push(...storySnapshots);
    if (Array.isArray(items)) incomingStories.push(...items);
    if (Array.isArray(stories)) incomingStories.push(...stories);
    if (Array.isArray(storyIds)) incomingStories.push(...storyIds);

    if (incomingStories.length > 0) {
      const seen = new Set();
      resolvedItems = incomingStories
        .map(normaliseStory)
        .filter(Boolean)
        .filter((item) => {
          if (seen.has(item.storyId)) return false;
          seen.add(item.storyId);
          return true;
        });
      resolvedStoryIds = resolvedItems.map(item => item.storyId).filter(Boolean);
    }

    const firstItem = resolvedItems[0];
    const coverUrl = coverImage || firstItem?.thumbnailUrl || firstItem?.imageUrl || firstItem?.videoUrl || firstItem?.mediaUrl || '';

    const highlight = new Highlight({
      userId: resolvedUserId,
      title,
      coverImage: coverUrl,
      stories: resolvedStoryIds,
      items: resolvedItems,
      visibility: visibility || 'Public',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await highlight.save();
    res.status(201).json({ success: true, data: highlight, id: highlight._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/highlights/:id/stories
exports.addStoryToHighlight = async (req, res) => {
  console.log('[addStoryToHighlight] Request body:', req.body, 'params:', req.params);
  try {
    const { id } = req.params;
    const { storySnapshot, storyId: clientStoryId } = req.body;


    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid highlight ID format' });
    }

    const highlight = await Highlight.findById(id);
    if (!highlight) {
      console.warn(`[addStoryToHighlight] Highlight not found for ID: ${id}`);
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    let entry = storySnapshot ? normaliseStory(storySnapshot) : null;
    const storyId = String(clientStoryId || entry?.storyId || req.body.storyId || '').trim();

    if (!storyId) {
      console.warn('[addStoryToHighlight] Validation failed: storyId is required. Request body:', req.body);
      return res.status(400).json({ success: false, error: 'storyId is required' });
    }

    if (!entry) {
      try {
        const st = mongoose.Types.ObjectId.isValid(storyId) ? await Story.findById(storyId).lean() : null;
        if (st) {
          entry = {
            storyId: String(st._id),
            imageUrl: st.image || null,
            videoUrl: st.video || null,
            mediaType: st.video ? 'video' : 'image',
            createdAt: st.createdAt || new Date()
          };
        }
      } catch (err) {
        // ignore
      }
    }

    if (!entry) {
      entry = {
        storyId,
        imageUrl: '',
        mediaType: 'image',
        createdAt: new Date()
      };
    }

    if (!highlight.items) highlight.items = [];
    const isAlreadyInItems = highlight.items.some(item => {
      const itemId = typeof item === 'string' ? item : (item?.storyId || item?.id);
      return String(itemId) === String(storyId);
    });

    if (!isAlreadyInItems) {
      highlight.items.push(entry);
    }

    if (!highlight.stories) highlight.stories = [];
    if (!highlight.stories.some(s => String(s) === String(storyId))) {
      highlight.stories.push(storyId);
    }

    if (!highlight.coverImage) {
      highlight.coverImage = entry.thumbnailUrl || entry.imageUrl || entry.videoUrl || entry.mediaUrl || '';
    }

    highlight.updatedAt = new Date();
    await highlight.save();

    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/highlights/:id/stories/:storyId
exports.removeStoryFromHighlight = async (req, res) => {
  try {
    const { id, storyId } = req.params;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    if (highlight.stories) {
      highlight.stories = highlight.stories.filter(s => String(s) !== String(storyId));
    }

    if (highlight.items) {
      highlight.items = highlight.items.filter(item => {
        const itemId = typeof item === 'string' ? item : (item?.storyId || item?.id);
        return String(itemId) !== String(storyId);
      });
    }

    const remaining = (highlight.items?.length || 0) + (highlight.stories?.length || 0);
    if (remaining <= 0) {
      await Highlight.deleteOne({ _id: id });
      return res.json({ success: true, deletedHighlight: true });
    }

    highlight.updatedAt = new Date();
    await highlight.save();

    res.json({ success: true, data: highlight, deletedHighlight: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PATCH /api/highlights/:id
exports.updateHighlight = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, coverImage } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    if (title !== undefined) highlight.title = title;
    if (coverImage !== undefined) highlight.coverImage = coverImage;
    highlight.updatedAt = new Date();

    await highlight.save();
    res.json({ success: true, data: highlight });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/highlights/:id
exports.deleteHighlight = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    if (userId && highlight.userId !== String(userId)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await Highlight.deleteOne({ _id: id });
    res.json({ success: true, message: 'Highlight deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/highlights/:id/stories
exports.getHighlightStories = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid highlight ID format' });
    }

    const highlight = await Highlight.findById(id);
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
        const sid = it.trim();
        if (sid && !seenIds.has(sid)) {
          bareStringIds.push(sid);
          seenIds.add(sid);
        }
        continue;
      }
      if (typeof it === 'object') {
        const storyId = String(it.storyId || it.id || '').trim();
        if (!storyId) continue;
        if (seenIds.has(storyId)) continue;
        seenIds.add(storyId);
        // Check if this snapshot has usable media
        if (it.mediaUrl || it.imageUrl || it.videoUrl) {
          snapshotItems.push({
            ...it,
            id: storyId,
            _id: storyId,
            imageUrl: it.imageUrl || null,
            videoUrl: it.videoUrl || null,
            mediaUrl: it.mediaUrl || it.imageUrl || it.videoUrl || null,
            mediaType: it.mediaType || (it.videoUrl ? 'video' : 'image'),
            postMetadata: it.postMetadata || null,
          });
        } else {
          // Object without media — treat like a bare ID for DB lookup
          bareStringIds.push(storyId);
        }
      }
    }

    // Also add any storyIds from the stories array that aren't covered yet.
    const storyIds = Array.isArray(highlight.stories) ? highlight.stories : [];
    for (const sid of storyIds) {
      const s = String(sid).trim();
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
        const validIds = bareStringIds.filter(sid => mongoose.Types.ObjectId.isValid(sid));
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
            postMetadata: story.postMetadata || null,
          }));

          // Best-effort: backfill these snapshots into the highlight's items array
          // so future reads don't need DB lookups (the Story will eventually expire).
          if (dbLookedUp.length > 0) {
            try {
              let needsSave = false;
              for (const snap of dbLookedUp) {
                const existsInItems = highlight.items.some((it) => {
                  if (typeof it === 'string') return String(it).trim() === snap.id;
                  if (it && typeof it === 'object') return String(it.id || it.storyId || '') === snap.id;
                  return false;
                });
                if (existsInItems) {
                  // Replace bare string or media-less object with full snapshot.
                  highlight.items = highlight.items.map((it) => {
                    if (typeof it === 'string' && String(it).trim() === snap.id) { needsSave = true; return snap; }
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
                await highlight.save();
              }
            } catch (err) {
              console.warn('[getHighlightStories] Backfill failed:', err.message);
            }
          }
        }
      } catch (err) {
        console.warn('[getHighlightStories] Story collection query failed:', err.message);
      }
    }

    // Combine snapshot items with DB-looked-up stories.
    const allStories = [...snapshotItems, ...dbLookedUp];

    // Sort to maintain original order if possible (by items array order).
    const idOrder = items.map((it) => {
      if (typeof it === 'string') return String(it).trim();
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
    res.status(500).json({ success: false, error: err.message });
  }
};
