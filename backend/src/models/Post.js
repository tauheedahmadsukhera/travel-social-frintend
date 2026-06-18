const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  userId: { type: String, ref: 'User', required: true },
  content: { type: String, required: true },
  caption: { type: String },
  imageUrl: String,
  mediaUrls: { type: [String], default: [] },
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  thumbnailUrl: String,
  aspectRatio: Number,
  location: String,
  locationData: {
    name: String,
    address: String,
    placeId: String,
    neighborhood: String,
    city: String,
    country: String,
    countryCode: String,
    continent: String,
    lat: Number,
    lon: Number,
    verified: Boolean
  },
  locationKeys: { type: [String], default: [] },
  category: String,
  hashtags: { type: [String], default: [] },
  mentions: { type: [String], default: [] },
  taggedUserIds: { type: [String], default: [] },
  likes: { type: [String], default: [] },
  likesCount: { type: Number, default: 0 },
  comments: { type: Array, default: [] }, // Array of comment objects (when stored in post)
  commentsCount: { type: Number, default: 0 }, // Cached count
  commentCount: { type: Number, default: 0 }, // Alias for frontend compatibility
  reactions: { type: Array, default: [] }, // Array of { userId, userName, userAvatar, emoji, createdAt }
  savedBy: { type: [String], default: [] }, // Array of user IDs who saved this post
  savesCount: { type: Number, default: 0 }, // Count of saves
  isPrivate: { type: Boolean, default: false }, // Privacy flag: true = private account post
  visibility: { type: String, default: 'Everyone' }, // Visibility setting: 'Everyone', 'Friends', 'Family', etc.
  allowedFollowers: { type: [String], default: [] }, // Array of follower IDs who can see this private post
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Feed / discovery: sort by createdAt + privacy filters hit these paths constantly.
PostSchema.index({ createdAt: -1 });
PostSchema.index({ isPrivate: 1, createdAt: -1 });
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ locationKeys: 1, createdAt: -1 });
PostSchema.index({ allowedFollowers: 1, createdAt: -1 });
PostSchema.index({ hashtags: 1, createdAt: -1 });
PostSchema.index({ category: 1, createdAt: -1 });
PostSchema.index({ visibility: 1, createdAt: -1 });
PostSchema.index({ savedBy: 1 });
PostSchema.index({ 
  location: 'text', 
  'locationData.name': 'text', 
  caption: 'text',
  hashtags: 'text' 
}, { 
  weights: { 
    location: 10, 
    'locationData.name': 10, 
    caption: 5, 
    hashtags: 2 
  },
  name: "PostSearchIndex" 
});


module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);
