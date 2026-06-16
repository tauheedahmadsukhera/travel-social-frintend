const express = require('express');
const router = express.Router();
const highlightController = require('../controllers/highlightController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/highlights?userId=... (public — viewing highlights is unrestricted)
router.get('/', highlightController.getHighlightsByUser);

// GET /api/highlights/:id/stories (public — viewing highlight stories is unrestricted)
router.get('/:id/stories', highlightController.getHighlightStories);

// POST /api/highlights (JWT required)
router.post('/', verifyToken, highlightController.createHighlight);

// POST /api/highlights/:id/stories (JWT required)
router.post('/:id/stories', verifyToken, highlightController.addStoryToHighlight);

// DELETE /api/highlights/:id/stories/:storyId (JWT required)
router.delete('/:id/stories/:storyId', verifyToken, highlightController.removeStoryFromHighlight);

// PATCH /api/highlights/:id (JWT required)
router.patch('/:id', verifyToken, highlightController.updateHighlight);

// DELETE /api/highlights/:id (JWT required)
router.delete('/:id', verifyToken, highlightController.deleteHighlight);

module.exports = router;
