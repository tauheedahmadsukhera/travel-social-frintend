const mongoose = require('mongoose');
const Highlight = require('../models/Highlight');

// Helper – normalise an incoming story entry from the client
function normaliseStory(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { storyId: entry, imageUrl: '', mediaType: 'image', createdAt: new Date() };
  }
  return {
    storyId:   String(entry.storyId || entry.id || ''),
    imageUrl:  entry.imageUrl || entry.image || entry.imageUri || '',
    videoUrl:  entry.videoUrl || entry.videoUri || '',
    mediaType: entry.mediaType || (entry.videoUrl ? 'video' : 'image'),
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date()
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
  try {
    const { userId, title, coverImage, stories = [], storySnapshot, visibility } = req.body;
    const resolvedUserId = req.userId || userId;
    if (!resolvedUserId || !title) {
      return res.status(400).json({ success: false, error: 'userId and title required' });
    }

    let resolvedItems = [];
    let resolvedStoryIds = [];

    if (storySnapshot) {
      const s = normaliseStory(storySnapshot);
      if (s) {
        resolvedItems = [s];
        resolvedStoryIds = [s.storyId];
      }
    } else if (Array.isArray(stories) && stories.length > 0) {
      resolvedItems = stories.map(normaliseStory).filter(Boolean);
      resolvedStoryIds = resolvedItems.map(item => item.storyId).filter(Boolean);
    }

    const coverUrl = coverImage || (resolvedItems[0] && resolvedItems[0].imageUrl) || '';

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
  try {
    const { id } = req.params;
    const { storySnapshot, storyId: clientStoryId } = req.body;

    const highlight = await Highlight.findById(id);
    if (!highlight) return res.status(404).json({ success: false, error: 'Highlight not found' });

    let entry = storySnapshot ? normaliseStory(storySnapshot) : null;
    const storyId = clientStoryId || entry?.storyId || req.body.storyId || null;

    if (!storyId) return res.status(400).json({ success: false, error: 'storyId is required' });

    if (!entry) {
      try {
        const Story = mongoose.model('Story');
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
    if (!highlight.stories.includes(storyId)) {
      highlight.stories.push(storyId);
    }

    if (!highlight.coverImage && entry.imageUrl) {
      highlight.coverImage = entry.imageUrl;
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
    const highlight = await Highlight.findById(id);
    if (!highlight) {
      return res.status(404).json({ success: false, error: 'Highlight not found' });
    }

    const items = Array.isArray(highlight.items) ? highlight.items : [];
    const hasSnapshots = items.some((it) => it && typeof it === 'object' && (it.mediaUrl || it.imageUrl || it.videoUrl));

    if (hasSnapshots) {
      const normalized = items
        .map((it) => {
          if (!it) return null;
          if (typeof it === 'string') return null;
          const storyId = String(it.storyId || it.id || '').trim();
          if (!storyId) return null;
          return {
            ...it,
            id: storyId,
            _id: storyId,
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

    const Story = mongoose.model('Story');
    const storiesArray = await Story.find({
      _id: { $in: storyIds.filter(sid => mongoose.Types.ObjectId.isValid(sid)) }
    }).lean();

    const enrichedStories = storiesArray.map(story => ({
      ...story,
      id: String(story._id),
      imageUrl: story.image || null,
      videoUrl: story.video || null,
      mediaUrl: story.image || story.video || null,
      mediaType: story.video ? 'video' : 'image',
    }));

    enrichedStories.sort((a, b) => {
      const idxA = storyIds.indexOf(a.id);
      const idxB = storyIds.indexOf(b.id);
      return idxA - idxB;
    });

    res.json({ success: true, data: enrichedStories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
