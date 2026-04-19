// Export all helpers from individual modules
export * from './archive';
export * from './comments';
export * from './conversation';
export { deleteStory } from './deleteStory';
export * from './follow';
export * from './highlights';
export * from './live';
export * from './messages';
export * from './notification';
export * from './passport';
export * from './post';
export { updateUserSectionsOrder } from './updateUserSectionsOrder';
export * from './getUserSectionsSorted';
export * from './user';

import firebaseHelpersDefault from './core';

export default firebaseHelpersDefault;

// Named exports that live only in `core` (avoid duplicating `export *` modules above).
export {
  signInUser,
  signUpUser,
  getCurrentUser,
  getCurrentUserSync,
  getCurrentUid,
  getPassportTickets,
  uploadImage,
  deleteImage,
  getCategories,
  addUserSection,
  updateUserSection,
  deleteUserSection,
  getLocationVisitCount,
  getAllPosts,
  createPost,
  getFeedPosts,
  deletePost,
  likeComment,
  unlikeComment,
  getActiveStories,
  createStory,
  addLikedStatusToPosts,
  getRegions,
  fetchMessages,
  toggleUserPrivacy,
} from './core';

// Default categories
export const DEFAULT_CATEGORIES = [
  { name: 'Travel', image: 'https://via.placeholder.com/80x80?text=Travel' },
  { name: 'Food', image: 'https://via.placeholder.com/80x80?text=Food' },
  { name: 'Adventure', image: 'https://via.placeholder.com/80x80?text=Adventure' },
  { name: 'Culture', image: 'https://via.placeholder.com/80x80?text=Culture' },
  { name: 'Nature', image: 'https://via.placeholder.com/80x80?text=Nature' },
  { name: 'Nightlife', image: 'https://via.placeholder.com/80x80?text=Nightlife' }
];

// Ensure default categories exist
export async function ensureDefaultCategories() {
  try {
    // Categories are now hardcoded, no backend call needed
    return { success: true, data: DEFAULT_CATEGORIES };
  } catch (error) {
    console.error('Error ensuring categories:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
