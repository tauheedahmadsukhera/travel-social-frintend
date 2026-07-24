import * as FileSystem from 'expo-file-system';
import CryptoJS from 'crypto-js';

const CACHE_FOLDER = FileSystem.cacheDirectory + 'video_cache/';

/**
 * Ensures that the video cache folder exists in the filesystem.
 */
async function ensureCacheFolderExists() {
  const info = await FileSystem.getInfoAsync(CACHE_FOLDER);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
  }
}

/**
 * Returns a unique local path for a cached video URL.
 */
export function getLocalCachePath(url: string): string {
  const hash = CryptoJS.SHA1(url).toString();
  // Keep original extension if possible
  const ext = url.split('.').pop()?.split('?')[0] || 'mp4';
  return `${CACHE_FOLDER}${hash}.${ext}`;
}

/**
 * Safely resolves a remote video URL to a cached local file URI.
 * If the file is not cached yet, it returns the original URL and triggers a background download.
 */
export async function getCachedVideoUri(url: string): Promise<string> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return url;
  }

  try {
    await ensureCacheFolderExists();
    const localUri = getLocalCachePath(url);
    const fileInfo = await FileSystem.getInfoAsync(localUri);

    if (fileInfo.exists) {
      return localUri;
    }

    // Trigger background prefetch without blocking the current play action
    prefetchVideo(url).catch(() => {});
    return url;
  } catch (err) {
    console.warn('[videoCache] Failed resolving cached URI, using original:', err);
    return url;
  }
}

/**
 * Downloads a video to the local cache directory.
 */
export async function prefetchVideo(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return null;
  }

  try {
    await ensureCacheFolderExists();
    const localUri = getLocalCachePath(url);
    const fileInfo = await FileSystem.getInfoAsync(localUri);

    if (fileInfo.exists) {
      return localUri;
    }

    console.log(`[videoCache] 📥 Prefetching video: ${url}`);
    const downloadResult = await FileSystem.downloadAsync(url, localUri);
    console.log(`[videoCache] ✅ Prefetch finished: ${downloadResult.uri}`);
    return downloadResult.uri;
  } catch (err) {
    console.warn(`[videoCache] ❌ Failed to prefetch video ${url}:`, err);
    return null;
  }
}

/**
 * Pre-downloads a list of video URLs sequentially.
 */
export async function preloadVideos(urls: string[], limit: number = 3) {
  const targets = urls.filter(Boolean).slice(0, limit);
  for (const url of targets) {
    try {
      await prefetchVideo(url);
    } catch (err) {
      // Continue next prefetch even if one fails
    }
  }
}

/**
 * Clears the video cache directory.
 */
export async function clearVideoCache() {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FOLDER);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_FOLDER, { idempotent: true });
      console.log('[videoCache] Cache folder cleared successfully.');
    }
  } catch (err) {
    console.warn('[videoCache] Failed to clear video cache:', err);
  }
}
