type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  inflight?: Promise<T>;
};

const cache = new Map<string, CacheEntry<any>>();

/**
 * Simple in-memory request cache with TTL and inflight deduplication.
 * Use for read-heavy queries to cut duplicate reads without hurting UX.
 */
export async function getCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);

  // Return cached value if not expired
  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    return existing.value as T;
  }

  // Deduplicate concurrent requests
  if (existing && existing.inflight) {
    return existing.inflight as Promise<T>;
  }

  const promise = (async () => {
    try {
      const result = await loader();
      cache.set(key, { value: result, expiresAt: now + ttlMs });
      return result;
    } finally {
      const current = cache.get(key);
      if (current) {
        delete current.inflight;
        cache.set(key, current);
      }
    }
  })();

  cache.set(key, { inflight: promise, expiresAt: now + ttlMs });
  return promise;
}

export function invalidate(keyPrefix: string) {
  for (const k of cache.keys()) {
    if (k.startsWith(keyPrefix)) cache.delete(k);
  }
}
