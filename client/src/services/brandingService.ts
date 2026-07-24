
import { apiService } from './apiService';

// Fetches the logo URL from backend
export async function fetchLogoUrl(): Promise<string | null> {
  try {
    const data = await apiService.get('/branding');
    // Handle different response shapes
    return data?.data?.logoUrl || data?.logoUrl || data?.url || null;
  } catch (error) {
    // Silently return null on error - branding is optional
    return null;
  }
}

export default fetchLogoUrl;
