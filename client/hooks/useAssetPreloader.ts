import { useEffect } from 'react';
import { Image as ExpoImage } from 'expo-image';

/**
 * Pre-fetches assets for a list of items to ensure smooth scrolling.
 * @param items List of objects containing media URLs
 * @param getUrls Function to extract URLs from an item
 * @param limit Number of items to pre-fetch ahead
 */
export function useAssetPreloader<T>(
  items: T[],
  getUrls: (item: T) => string[],
  limit: number = 5
) {
  useEffect(() => {
    if (!items || items.length === 0) return;

    // Prefetch first N items
    const urls = items.slice(0, limit).flatMap(getUrls).filter(Boolean);
    
    if (urls.length > 0) {
      ExpoImage.prefetch(urls);
    }
  }, [items, limit]);
}
