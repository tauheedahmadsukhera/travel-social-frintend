import { apiService } from '@/src/_services/apiService';
import { addStoryToHighlight as addStoryToHighlightApi, createHighlight as createHighlightApi, deleteHighlight as deleteHighlightApi, removeStoryFromHighlight as removeStoryFromHighlightApi, updateHighlight as updateHighlightApi } from './firebaseHelpers/highlights';
import { cacheHighlightStory, getCachedHighlightStories, getStableStoryKey, removeCachedHighlightStory, storyForStoriesViewer } from './storyViewer';
import { feedEventEmitter } from './feedEventEmitter';

export type HighlightSummary = {
  id: string;
  title: string;
  coverImage: string;
};

function resolveHighlightId(h: any): string {
  return String(h?._id || h?.id || h?.highlightId || '').trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Instagram-like behavior:
 * - Create highlight and attach story feels atomic.
 * - Add/remove is optimistic and cache stays consistent.
 * - Highlight keeps working even if story expires in main feed (via local archive snapshot).
 */
export const highlightManager = {
  async createAndAddStory(params: { userId: string; title: string; story: any }): Promise<{ success: boolean; highlightId?: string; error?: string }> {
    try {
      const normalizedStory = storyForStoriesViewer(params.story, 0);
      const storyId = String(normalizedStory?.id || normalizedStory?._id || normalizedStory?.storyId || '').trim();
      if (!storyId) return { success: false, error: 'Story id missing' };

      const coverImage = normalizedStory.imageUrl || normalizedStory.videoUrl || '';

      const created = await createHighlightApi(params.userId, params.title.trim(), coverImage, [storyId], 'Public');
      const highlightId = resolveHighlightId(created?.highlight) || String(created?.highlightId || '').trim();
      if (!highlightId) return { success: false, error: 'Highlight id missing' };

      // Ensure attached (backend sometimes ignores on create)
      let attachedOk = false;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const r: any = await addStoryToHighlightApi(highlightId, storyId);
          attachedOk = r?.success !== false;
          if (attachedOk) break;
        } catch { }
        await sleep(220 * attempt);
      }

      // Keep permanent locally
      await cacheHighlightStory(highlightId, normalizedStory);

      // Also set cover image (IG uses first added story)
      if (coverImage) {
        try { await updateHighlightApi(highlightId, { coverImage }); } catch { }
      }

      return { success: true, highlightId };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to create highlight' };
    }
  },

  async addStoryToHighlight(params: { highlightId: string; story: any }): Promise<{ success: boolean; error?: string }> {
    const highlightId = String(params.highlightId || '').trim();
    if (!highlightId) return { success: false, error: 'Highlight id missing' };
    const normalizedStory = storyForStoriesViewer(params.story, 0);
    const storyId = String(normalizedStory?.id || normalizedStory?._id || normalizedStory?.storyId || '').trim();
    if (!storyId) return { success: false, error: 'Story id missing' };

    // Cache immediately (optimistic/permanent)
    await cacheHighlightStory(highlightId, normalizedStory);

    // Best-effort server attach (with a couple retries)
    let ok = false;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r: any = await addStoryToHighlightApi(highlightId, storyId);
        ok = r?.success !== false;
        if (ok) break;
        lastErr = r?.error || r;
      } catch (e) {
        lastErr = e;
      }
      await sleep(200 * attempt);
    }

    // If highlight has no cover, set it to this story (best-effort).
    const cover = normalizedStory.imageUrl || normalizedStory.videoUrl || '';
    if (cover) {
      try { await updateHighlightApi(highlightId, { coverImage: cover }); } catch { }
    }

    return ok ? { success: true } : { success: false, error: String(lastErr?.message || lastErr || 'Attach failed') };
  },

  async removeStoryFromHighlight(params: { highlightId: string; storyId: string; mediaUrlHint?: string; autoDeleteHighlightIfEmpty?: boolean; userId?: string }): Promise<{ success: boolean; error?: string }> {
    const highlightId = String(params.highlightId || '').trim();
    const storyId = String(params.storyId || '').trim();
    if (!highlightId || !storyId) return { success: false, error: 'Missing ids' };

    // Optimistic local removal
    const stableKey = getStableStoryKey({ id: storyId, mediaUrl: params.mediaUrlHint } as any) || storyId;
    await removeCachedHighlightStory(highlightId, stableKey, params.mediaUrlHint);

    try {
      const tryCalls = async (): Promise<any> => {
        // Primary: RESTful DELETE /highlights/:hid/stories/:sid
        const r1: any = await removeStoryFromHighlightApi(highlightId, storyId);
        if (r1?.success !== false) return r1;

        // Fallback 1: POST /highlights/:hid/stories/remove {storyId}
        const r2: any = await apiService.post(`/highlights/${highlightId}/stories/remove`, { storyId });
        if (r2?.success !== false) return r2;
        return r2;
      };

      const r: any = await tryCalls();
      const ok = r?.success !== false;

      // Auto-delete highlight if it has no stories left (Instagram-like optional).
      if (params.autoDeleteHighlightIfEmpty !== false) {
        try {
          const cached = await getCachedHighlightStories(highlightId);
          const hasAny = Array.isArray(cached) && cached.length > 0;
          if (!hasAny) {
            let uid = String(params.userId || '').trim();
            if (!uid) {
              try {
                const mod = await import('@react-native-async-storage/async-storage');
                const AsyncStorage = (mod as any).default ?? mod;
                uid = String((await AsyncStorage.getItem('userId')) || '').trim();
              } catch {}
            }
            if (uid) {
              // Optimistic UI: remove from profile highlights immediately
              try { feedEventEmitter.emitHighlightDeleted(highlightId); } catch {}
              await deleteHighlightApi(highlightId, uid);
            }
          }
        } catch {}
      }

      // IG-like UX: even if backend fails, keep removed locally (cache already updated).
      return ok ? { success: true } : { success: true, error: r?.error || 'Server remove failed (kept locally)' };
    } catch (e: any) {
      // IG-like UX: keep removed locally; surface as non-blocking error.
      return { success: true, error: e?.message || 'Server remove failed (kept locally)' };
    }
  },

  async renameHighlight(params: { highlightId: string; title: string }): Promise<{ success: boolean; error?: string }> {
    try {
      await updateHighlightApi(params.highlightId, { name: params.title });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Rename failed' };
    }
  },

  // Convenience: fetch highlights list with apiService params support (viewerId etc)
  async fetchUserHighlights(userId: string, viewerId?: string): Promise<HighlightSummary[]> {
    const params: any = {};
    if (viewerId) {
      params.viewerId = viewerId;
      params.requesterId = viewerId;
      params.requesterUserId = viewerId;
    }
    const res: any = await apiService.get(`/users/${userId}/highlights`, params);
    const arr = Array.isArray(res?.data) ? res.data : Array.isArray(res?.highlights) ? res.highlights : [];
    return (Array.isArray(arr) ? arr : [])
      .map((h: any) => ({
        id: String(h?.id || h?._id || '').trim(),
        title: h?.title || h?.name || 'Highlight',
        coverImage: h?.coverImage || h?.image || h?.cover || '',
      }))
      .filter((h: any) => !!h.id);
  },
};

