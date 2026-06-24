const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  userId: String,
  userName: String,
  userAvatar: String,
  image: String,
  video: String,
  thumbnail: String,
  caption: String,
  locationData: Object,
  postMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
  isPostShare: Boolean,
  visibility: String,
  allowedFollowers: [String],
  isPrivate: Boolean,
  views: [String],
  likes: [String],
  comments: [Object],
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), index: { expires: 0 } }
});

storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ createdAt: -1 });

module.exports = mongoose.models.Story || mongoose.model('Story', storySchema);
