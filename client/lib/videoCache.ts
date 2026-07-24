import * as FileSystem from 'expo-file-system';
import CryptoJS from 'crypto-js';

const CACHE_FOLDER = FileSystem.cacheDirectory + 'video_cache/';
const MAX_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB hard limit

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ensureCacheFolderExists() {
  const info = await FileSystem.getInfoAsync(CACHE_FOLDER);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
  }
}

export function getLocalCachePath(url: string): string {
  const hash = CryptoJS.SHA1(url).toString();
  const ext = url.split('.').pop()?.split('?')[0] || 'mp4';
  return `${CACHE_FOLDER}${hash}.${ext}`;
}

// ─── LRU Eviction ───────────────────────────────────────────────────────────

/**
 * Deletes oldest cached files when total size exceeds MAX_CACHE_BYTES.
 * Keeps 80% headroom after eviction to avoid constant thrashing.
 */
async function evictIfNeeded() {
  try {
    const dirInfo = await FileSystem.readDirectoryAsync(CACHE_FOLDER);
    const fileInfos: { uri: string; size: number; modificationTime: number }[] = [];

    for (const name of dirInfo) {
      const uri = CACHE_FOLDER + name;
      const info = await FileSystem.getInfoAsync(uri, { size: true, md5: false });
      if (info.exists && !info.isDirectory) {
        fileInfos.push({
          uri,
          size: (info as any).size || 0,
          modificationTime: (info as any).modificationTime || 0,
        });
      }
    }

    const totalBytes = fileInfos.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes <= MAX_CACHE_BYTES) return;

    fileInfos.sort((a, b) => a.modificationTime - b.modificationTime); // oldest first
    let currentBytes = totalBytes;
    for (const file of fileInfos) {
      if (currentBytes <= MAX_CACHE_BYTES * 0.8) break;
      await FileSystem.deleteAsync(file.uri, { idempotent: true });
      currentBytes -= file.size;
      if (__DEV__) {
        console.log(`[videoCache] 🗑️ Evicted: ${file.uri} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      }
    }
  } catch {
    // Non-critical — eviction failure must not block playback
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolves a remote URL to a cached local file URI.
 * Returns the original URL immediately; caching happens in the background.
 */
export async function getCachedVideoUri(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return url;
  try {
    await ensureCacheFolderExists();
    const localUri = getLocalCachePath(url);
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) return localUri;
    prefetchVideo(url).catch(() => {});
    return url;
  } catch {
    return url;
  }
}

/**
 * Downloads a video file to local cache and respects the 200 MB size limit.
 */
export async function prefetchVideo(url: string): Promise<string | null> {
  if (!url || !url.startsWith('http')) return null;
  try {
    await ensureCacheFolderExists();
    const localUri = getLocalCachePath(url);
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) return localUri;

    await evictIfNeeded();
    if (__DEV__) console.log(`[videoCache] 📥 Prefetching: ${url}`);
    const result = await FileSystem.downloadAsync(url, localUri);
    if (__DEV__) console.log(`[videoCache] ✅ Cached: ${result.uri}`);
    return result.uri;
  } catch (err) {
    if (__DEV__) console.warn(`[videoCache] ❌ Prefetch failed ${url}:`, err);
    return null;
  }
}

/**
 * Silently pre-downloads the first N video URLs from a list.
 */
export async function preloadVideos(urls: string[], limit = 3) {
  for (const url of urls.filter(Boolean).slice(0, limit)) {
    await prefetchVideo(url).catch(() => {});
  }
}

/**
 * Deletes the entire video cache directory.
 */
export async function clearVideoCache() {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_FOLDER);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_FOLDER, { idempotent: true });
      if (__DEV__) console.log('[videoCache] Cache cleared.');
    }
  } catch (err) {
    if (__DEV__) console.warn('[videoCache] Failed to clear cache:', err);
  }
}
