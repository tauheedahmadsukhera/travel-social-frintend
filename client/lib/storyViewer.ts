/**
 * Normalize backend/Firebase story payloads for StoriesViewer and highlight UIs.
 * Handles nested shapes like { storyId, story: { ... } } and varied media field names.
 */

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)(\?|$)/i;

function isStoryLikeObject(o: any): boolean {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return !!(
    o.mediaUrl ||
    o.imageUrl ||
    o.image ||
    o.videoUrl ||
    o.video ||
    o.thumbnailUrl ||
    o.story ||
    o.storyId ||
    o.userId ||
    o.userName ||
    o._id ||
    o.id
  );
}

function firstHttpString(...candidates: any[]): string {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (lower === 'null' || lower === 'undefined') continue;
    if (t.startsWith('//')) return `https:${t}`;
    if (/^https?:\/\//i.test(t)) {
      return lower.startsWith('http://') ? `https://${t.slice(7)}` : t;
    }
  }
  return '';
}

export function flattenStoryPayload(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const nested = (raw as any).story;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { ...nested, ...raw };
  }
  return { ...(raw as any) };
}

/**
 * Pull the first "story list" array from varied API envelopes.
 */
export function extractStoryListFromResponseBody(body: any): any[] {
  if (!body) return [];
  if (Array.isArray(body)) {
    if (body.length === 0) return [];
    if (typeof body[0] === 'string') return body;
    if (isStoryLikeObject(body[0])) return body;
    return [];
  }
  if (typeof body !== 'object') return [];

  const directPaths = [
    ['data'],
    ['stories'],
    ['items'],
    ['results'],
    ['records'],
    ['payload'],
    ['data', 'stories'],
    ['data', 'items'],
    ['data', 'results'],
    ['data', 'records'],
    ['payload', 'stories'],
    ['payload', 'items'],
    ['response', 'stories'],
  ];
  for (const path of directPaths) {
    let cur: any = body;
    for (const key of path) {
      cur = cur?.[key];
    }
    if (Array.isArray(cur) && cur.length > 0) {
      if (typeof cur[0] === 'string') return cur;
      if (isStoryLikeObject(cur[0])) return cur;
    }
  }

  const queue: { v: any; depth: number }[] = [{ v: body, depth: 0 }];
  const seen = new Set<any>();
  while (queue.length) {
    const { v, depth } = queue.shift()!;
    if (depth > 6 || v == null) continue;
    if (typeof v !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);

    if (Array.isArray(v) && v.length > 0) {
      const first = v[0];
      if (typeof first === 'string') return v;
      if (isStoryLikeObject(first)) return v;
      continue;
    }

    for (const k of Object.keys(v)) {
      queue.push({ v: (v as any)[k], depth: depth + 1 });
    }
  }

  return [];
}

/**
 * If highlight/feed returns bare ids or stubs without media, hydrate via GET /stories/:id
 */
export async function hydrateStoryDocumentsIfNeeded(items: any[]): Promise<any[]> {
  if (!Array.isArray(items) || items.length === 0) return items;

  const { apiService } = await import('../src/_services/apiService');

  const needsFetch = (it: any): string | null => {
    if (typeof it === 'string') {
      const t = it.trim();
      return t ? t : null;
    }
    if (!it || typeof it !== 'object') return null;
    const flat = flattenStoryPayload(it);
    const hasMedia = !!(
      flat.mediaUrl ||
      flat.imageUrl ||
      flat.image ||
      flat.videoUrl ||
      flat.video
    );
    if (hasMedia) return null;
    const id = String(flat._id || flat.id || flat.storyId || (it as any).storyId || '').trim();
    return id || null;
  };

  const out = await Promise.all(
    items.map(async (it) => {
      const id = needsFetch(it);
      if (!id) return it;
      try {
        const res: any = await apiService.get(`/stories/${id}`);
        const doc =
          res?.data && typeof res.data === 'object'
            ? res.data
            : res && typeof res === 'object' && (res._id || res.id || res.mediaUrl || res.imageUrl)
              ? res
              : null;
        if (!doc) return typeof it === 'object' ? it : null;
        if (typeof it === 'string') return doc;
        return { ...flattenStoryPayload(it), ...doc };
      } catch {
        return typeof it === 'object' ? it : null;
      }
    })
  );

  return out.filter(Boolean) as any[];
}

const HIGHLIGHT_ARCHIVE_KEY = (highlightId: string) => `highlight_archive_${String(highlightId || '').trim()}`;

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // unsigned 32-bit
  return (h >>> 0).toString(16);
}

/**
 * Stable story key for caching/removal.
 * Prefer real ids, else derive from media url(s).
 */
export function getStableStoryKey(raw: any): string {
  const flat = flattenStoryPayload(raw);
  const directId = String(flat?._id || flat?.id || flat?.storyId || (raw as any)?.storyId || '').trim();
  if (directId) return directId;
  const media = pickStoryMedia(flat);
  const seed = String(media.videoUrl || media.imageUrl || flat?.mediaUrl || flat?.imageUrl || flat?.image || '').trim();
  if (seed) return `media_${djb2Hash(seed)}`;
  return '';
}

export async function getCachedHighlightStories(highlightId: string): Promise<any[]> {
  const id = String(highlightId || '').trim();
  if (!id) return [];
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = (mod as any).default ?? mod;
    const raw = await AsyncStorage.getItem(HIGHLIGHT_ARCHIVE_KEY(id));
    const arr = safeJsonParse<any[]>(raw, []);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function cacheHighlightStory(highlightId: string, story: any): Promise<void> {
  const hid = String(highlightId || '').trim();
  if (!hid) return;
  if (!story) return;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = (mod as any).default ?? mod;

    const normalized = storyForStoriesViewer(story, 0);
    const sid = getStableStoryKey(normalized) || getStableStoryKey(story);
    if (!sid) return;

    const minimal = {
      id: sid,
      _id: sid,
      userId: normalized.userId,
      userName: normalized.userName,
      userAvatar: normalized.userAvatar,
      imageUrl: normalized.imageUrl,
      videoUrl: normalized.videoUrl,
      mediaType: normalized.mediaType,
      createdAt: normalized.createdAt,
      locationData: (normalized as any)?.locationData,
      location: (normalized as any)?.location,
      // keep original media too for matching/removal
      mediaUrl: (normalized as any)?.mediaUrl,
    };

    const existing = await getCachedHighlightStories(hid);
    const next = [
      minimal,
      ...existing.filter((s: any) => String(s?.id || s?._id || s?.storyId || '').trim() !== sid),
    ];
    // Keep it bounded.
    const bounded = next.slice(0, 250);
    await AsyncStorage.setItem(HIGHLIGHT_ARCHIVE_KEY(hid), JSON.stringify(bounded));
  } catch {
    // ignore
  }
}

export async function removeCachedHighlightStory(highlightId: string, storyIdOrKey: string, mediaUrlHint?: string): Promise<void> {
  const hid = String(highlightId || '').trim();
  const sid = String(storyIdOrKey || '').trim();
  if (!hid || !sid) return;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = (mod as any).default ?? mod;
    const existing = await getCachedHighlightStories(hid);
    const mediaHint = String(mediaUrlHint || '').trim();
    const next = (Array.isArray(existing) ? existing : []).filter((s: any) => {
      const id = String(s?.id || s?._id || s?.storyId || '').trim();
      if (id && id === sid) return false;
      if (mediaHint) {
        const seed = String(s?.videoUrl || s?.imageUrl || s?.mediaUrl || '').trim();
        if (seed && seed === mediaHint) return false;
      }
      return true;
    });
    await AsyncStorage.setItem(HIGHLIGHT_ARCHIVE_KEY(hid), JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function clearCachedHighlight(highlightId: string): Promise<void> {
  const hid = String(highlightId || '').trim();
  if (!hid) return;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const AsyncStorage = (mod as any).default ?? mod;
    await AsyncStorage.removeItem(HIGHLIGHT_ARCHIVE_KEY(hid));
  } catch {
    // ignore
  }
}

export function pickStoryId(flat: any, raw: any, index: number): string {
  const id = String(
    flat?._id ||
      flat?.id ||
      flat?.storyId ||
      raw?.storyId ||
      ''
  ).trim();
  if (id) return id;
  return `story-${index}`;
}

/**
 * Pick displayable image + optional video URL from a flattened story object.
 */
export function pickStoryMedia(flat: any): { imageUrl: string; videoUrl?: string; mediaType: 'image' | 'video' } {
  const typeRaw = String(flat?.mediaType || flat?.type || '').toLowerCase();
  const mime = String(flat?.mimeType || '').toLowerCase();

  const videoDirect = firstHttpString(flat?.videoUrl, flat?.video, flat?.movieUrl);
  const mediaUrl = firstHttpString(flat?.mediaUrl, flat?.url, flat?.src, flat?.uri);
  const imageDirect = firstHttpString(
    flat?.imageUrl,
    flat?.image,
    flat?.thumbnailUrl,
    flat?.thumbUrl,
    flat?.coverImage,
    flat?.photoURL,
    flat?.photo,
    typeof flat?.content === 'object' ? flat?.content?.url : undefined,
    Array.isArray(flat?.media) ? flat?.media?.[0]?.url : undefined,
    flat?.file?.url
  );

  const looksVideo =
    typeRaw.includes('video') ||
    mime.includes('video') ||
    !!videoDirect ||
    VIDEO_EXT.test(String(mediaUrl || imageDirect || ''));

  if (looksVideo) {
    const video = firstHttpString(videoDirect, mediaUrl, imageDirect) || '';
    const thumb = firstHttpString(
      flat?.thumbnailUrl,
      flat?.thumbUrl,
      flat?.imageUrl,
      flat?.image,
      flat?.coverImage
    );
    return {
      imageUrl: thumb || '',
      videoUrl: video || undefined,
      mediaType: 'video',
    };
  }

  const image = firstHttpString(imageDirect, mediaUrl) || '';
  return { imageUrl: image, videoUrl: undefined, mediaType: 'image' };
}

/**
 * Shape expected by StoriesViewer (extends with common API fields).
 */
export function storyForStoriesViewer(raw: any, index: number): any {
  const flat = flattenStoryPayload(raw);
  const media = pickStoryMedia(flat);
  const id = pickStoryId(flat, raw, index);

  return {
    ...flat,
    id,
    userId: String(flat.userId || flat.authorId || flat.uid || ''),
    userName: String(flat.userName || flat.username || flat.displayName || flat.name || 'User'),
    userAvatar: String(flat.userAvatar || flat.avatar || flat.photoURL || ''),
    imageUrl: media.imageUrl,
    videoUrl: media.videoUrl,
    mediaType: media.mediaType,
    createdAt: flat.createdAt ?? flat.timestamp ?? Date.now(),
  };
}
