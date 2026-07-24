import type { Href } from 'expo-router';
import { router } from 'expo-router';

const DEFAULT_FALLBACK: Href = '/(tabs)/home';

/**
 * Prefer over `router.back()` so cold starts / deep links / modal roots
 * do not log "GO_BACK was not handled by any navigator".
 */
export function safeRouterBack(fallback: Href = DEFAULT_FALLBACK): void {
  const r = router as { canGoBack?: () => boolean; back: () => void; replace: (h: Href) => void; push: (h: Href) => void };
  try {
    if (typeof r.canGoBack === 'function' && r.canGoBack()) {
      r.back();
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    r.replace(fallback);
  } catch {
    r.push(fallback);
  }
}
