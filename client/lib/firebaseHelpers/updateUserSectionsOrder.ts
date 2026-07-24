import { apiService } from '@/src/services/apiService';

export async function updateUserSectionsOrder(userId: string, sections: any[]) {
  try {
    const res = await apiService.patch(`/users/${userId}/sections-order`, { sections });
    return res;
  } catch (error: any) {
    console.error('❌ Error updating section order:', error);
    return { success: false, error: error.message };
  }
}
