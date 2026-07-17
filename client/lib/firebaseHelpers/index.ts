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
  updatePost,
} from './core';

// Default categories
export const DEFAULT_CATEGORIES = [
  { name: "Adventure", image: "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop" },
  { name: "Mountain", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=150&h=150&fit=crop" },
  { name: "Surfing", image: "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=150&h=150&fit=crop" },
  { name: "Camping", image: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=150&h=150&fit=crop" },
  { name: "Ski", image: "https://images.unsplash.com/photo-1551698618-1ffdfe196404?w=150&h=150&fit=crop" },
  { name: "Road Trips", image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=150&h=150&fit=crop" },
  { name: "Waterfalls", image: "https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?w=150&h=150&fit=crop" },
  { name: "Cruise", image: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=150&h=150&fit=crop" },
  { name: "Trekking", image: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop" },
  { name: "Island", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop" },
  { name: "Diving", image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=150&h=150&fit=crop" },
  { name: "City Break", image: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=150&h=150&fit=crop" },
  { name: "Urban", image: "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=150&h=150&fit=crop" },
  { name: "Tropical", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop" },
  { name: "National Parks", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=150&h=150&fit=crop" },
  { name: "Hiking", image: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop" },
  { name: "Desert", image: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=150&h=150&fit=crop" },
  { name: "Jungle", image: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=150&h=150&fit=crop" },
  { name: "Extreme Sports", image: "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop" },
  { name: "Glamping", image: "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop" },
  { name: "Safari", image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=150&h=150&fit=crop" },
  { name: "Nature", image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=150&h=150&fit=crop" },
  { name: "Lakes", image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=150&h=150&fit=crop" },
  { name: "Beach", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop" },
  { name: "Food and Dining", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=150&h=150&fit=crop" },
  { name: "Luxury", image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=150&h=150&fit=crop" },
  { name: "Historical", image: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=150&h=150&fit=crop" },
  { name: "Cultural", image: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=150&h=150&fit=crop" },
  { name: "Digital Nomad", image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&h=150&fit=crop" },
  { name: "Solo Travel", image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=150&h=150&fit=crop" },
  { name: "Backpacking", image: "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop" },
  { name: "Architecture", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=150&h=150&fit=crop" },
  { name: "Museums", image: "https://images.unsplash.com/photo-1566121318599-7ab0e2b1736e?w=150&h=150&fit=crop" },
  { name: "Wellness", image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=150&h=150&fit=crop" },
  { name: "Art", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=150&h=150&fit=crop" },
  { name: "Wine Regions", image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=150&h=150&fit=crop" },
  { name: "Yoga", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=150&h=150&fit=crop" },
  { name: "Honeymoon", image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop" },
  { name: "Family Friendly", image: "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=150&h=150&fit=crop" },
  { name: "Travel", image: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=150&h=150&fit=crop" },
  { name: "Food", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=150&h=150&fit=crop" },
  { name: "Festivals", image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop" },
  { name: "Budget", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=150&h=150&fit=crop" },
  { name: "Romantic", image: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=150&h=150&fit=crop" },
  { name: "London", image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=150&h=150&fit=crop" },
  { name: "City Life", image: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=150&h=150&fit=crop" }
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
