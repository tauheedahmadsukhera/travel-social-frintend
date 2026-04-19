/**
 * DEPRECATED: Use `client/hooks/useOffline.ts` caching helpers.
 * Kept as a thin compatibility layer.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type { CacheEntry as _DeprecatedCacheEntry } from '../hooks/useOffline';
export { getCachedData, setCachedData, fetchWithCache } from '../hooks/useOffline';
import { setCachedData as _setCachedData } from '../hooks/useOffline';

export interface CacheOptions {
  ttl?: number;
}

export async function cacheData(key: string, data: any, options: CacheOptions = {}) {
  return _setCachedData(key, data, options);
}

export async function clearCache(key: string) {
  // Best-effort: `useOffline` stores under `cache_${key}`.
  // Consumers should migrate to `getCachedData/setCachedData` directly.
  try {
    await AsyncStorage.removeItem(`cache_${key}`);
  } catch { }
}

export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => String(k).startsWith('cache_'));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch { }
}

export async function getCacheInfo(): Promise<{ count: number; keys: string[] }> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => String(k).startsWith('cache_'));
    return { count: cacheKeys.length, keys: cacheKeys.map((k) => String(k).replace(/^cache_/, '')) };
  } catch {
    return { count: 0, keys: [] };
  }
}
