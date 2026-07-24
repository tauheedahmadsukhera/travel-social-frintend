import { apiService } from '@/src/services/apiService';

export async function getUserSectionsSorted(userId: string) {
  try {
    const res = await apiService.get(`/users/${userId}/sections`);
    // Backend already returns {success, data}, so just pass it through
    if (res && typeof res === 'object') {
      return res;
    }
    return { success: true, data: res || [] };
  } catch (error: any) {
    console.error('❌ getUserSectionsSorted error:', error);
    return { success: false, error: error.message, data: [] };
  }
}
