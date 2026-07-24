// Passport ticket helpers
import { apiService } from '@/src/services/apiService';

export interface Stamp {
  _id: string;
  type: 'country' | 'city' | 'place';
  name: string;
  countryCode?: string;
  parentCountry?: string;
  parentCity?: string;
  lat: number;
  lon: number;
  count: number;
  visitHistory: { visitedAt: string | number; lat: number; lon: number }[];
  postCount?: number;
  createdAt: string | number;
}

export async function getPassportData(userId: string) {
  try {
    const res = await apiService.get(`/users/${userId}/passport`);
    return res.data || { stamps: [], ticketCount: 0 };
  } catch (error: any) {
    console.error('❌ [Passport] Error fetching passport:', error);
    return { stamps: [], ticketCount: 0 };
  }
}

export async function addPassportStamp(userId: string, data: {
  type: 'country' | 'city' | 'place';
  name: string;
  countryCode?: string;
  parentCountry?: string;
  parentCity?: string;
  lat: number;
  lon: number;
}) {
  try {
    return await apiService.post(`/users/${userId}/passport/locations`, data);
  } catch (error: any) {
    console.error('❌ [Passport] Error adding stamp:', error);
    return { success: false, error: error.message || 'Network request failed' };
  }
}

export async function deletePassportStamp(userId: string, stampId: string) {
  try {
    return await apiService.delete(`/users/${userId}/passport/stamps/${stampId}`);
  } catch (error: any) {
    console.error('❌ [Passport] Error deleting stamp:', error);
    return { success: false, error: error.message || 'Network request failed' };
  }
}
