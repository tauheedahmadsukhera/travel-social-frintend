
import AsyncStorage from '@/lib/storage';
import { apiService } from '@/src/services/apiService';

export async function deleteStory(storyId: string) {
  try {
    console.log('[deleteStory] Deleting story:', storyId);

    const userId = await AsyncStorage.getItem('userId');
    const res = await apiService.delete(`/stories/${storyId}`, { userId });

    console.log('[deleteStory] Response:', res);
    return res;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('[deleteStory] Story already deleted on server (404), returning success to update UI.');
      return { success: true, message: 'Already deleted' };
    }
    console.error('[deleteStory] Error:', error);
    return { success: false, error: error.message };
  }
}
