import { apiService } from '../../src/_services/apiService';

/**
 * Create a new highlight
 */
export async function createHighlight(
  userId: string,
  name: string,
  coverImage: string,
  storyIds: string[] = [],
  visibility: string = 'Public'
) {
  try {
    const res = await apiService.post('/highlights', { 
      userId, 
      title: name, 
      coverImage, 
      // Send both shapes for backend compatibility.
      stories: storyIds,
      storyIds,
      visibility
    });
    
    // apiService already returns res.data or the data object based on its implementation
    const highlightData = res?.data || res;
    const highlightId = highlightData?._id || highlightData?.id;
    
    return { success: res.success !== false, highlightId, highlight: highlightData };
  } catch (error: any) {
    console.error('❌ createHighlight error:', error);
    return { success: false, error: error.message };
  }
}

export async function addStoryToHighlight(highlightId: string, storyId: string, storyObj?: any) {
  try {
    // Backend expects { storyId, storySnapshot: { storyId, imageUrl, videoUrl, mediaType, createdAt, ... } }
    // Send as much data as possible because the Story document may expire (24h TTL)
    // and this snapshot is the only permanent record.
    const snapshot = storyObj ? {
      storyId: storyObj.id || storyObj._id || storyId,
      id: storyObj.id || storyObj._id || storyId,
      userId: storyObj.userId || '',
      userName: storyObj.userName || '',
      userAvatar: storyObj.userAvatar || '',
      imageUrl: storyObj.imageUrl || '',
      videoUrl: storyObj.videoUrl || '',
      mediaUrl: storyObj.mediaUrl || storyObj.imageUrl || storyObj.videoUrl || '',
      mediaType: storyObj.mediaType || (storyObj.videoUrl ? 'video' : 'image'),
      createdAt: storyObj.createdAt || new Date(),
      locationData: storyObj.locationData || null,
    } : { storyId };

    const res = await apiService.post(`/highlights/${highlightId}/stories`, { 
      storyId,
      storySnapshot: snapshot 
    });
    return res;
  } catch (error: any) {
    console.error('❌ addStoryToHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a story from a highlight
 */
export async function removeStoryFromHighlight(highlightId: string, storyId: string) {
  try {
    const res = await apiService.delete(`/highlights/${highlightId}/stories/${storyId}`);
    return res;
  } catch (error: any) {
    console.error('❌ removeStoryFromHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update highlight details (name, cover image)
 */
export async function updateHighlight(
  highlightId: string,
  updates: { name?: string; coverImage?: string }
) {
  try {
    const res = await apiService.patch(`/highlights/${highlightId}`, { 
      title: updates.name, 
      coverImage: updates.coverImage 
    });
    return res;
  } catch (error: any) {
    console.error('❌ updateHighlight error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a highlight
 */
export async function deleteHighlight(highlightId: string, userId: string) {
  try {
    const res = await apiService.delete(`/highlights/${highlightId}`, { userId });
    return res;
  } catch (error: any) {
    console.error('❌ deleteHighlight error:', error);
    return { success: false, error: error.message };
  }
}

