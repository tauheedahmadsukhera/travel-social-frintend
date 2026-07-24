import { apiService } from '@/src/services/apiService';

export interface PaginatedResult<T> {
  data: T[];
  cursor?: string | null;
  hasMore: boolean;
}

/**
 * Generic paginated query for Firestore
 */
export async function getPaginatedData<T>(
  endpoint: string,
  params: { limit?: number; cursor?: string | null; [key: string]: any } = {}
): Promise<PaginatedResult<T>> {
  try {
    const res = await apiService.get(endpoint, params);
    const data = (res?.data || res?.items || res || []) as T[];
    const cursor = res?.nextCursor || res?.cursor || null;
    const hasMore = !!res?.hasMore || !!cursor;

    return { data, cursor, hasMore };
  } catch (error) {
    console.error('Paginated fetch error:', error);
    return { data: [], cursor: null, hasMore: false };
  }
}

/**
 * Get paginated posts
 */
export async function getPaginatedPosts(
  pageSize: number = 20,
  cursor?: string | null
) {
  return getPaginatedData<any>('/feed', { limit: pageSize, cursor });
}

/**
 * Get paginated user posts
 */
export async function getPaginatedUserPosts(
  userId: string,
  pageSize: number = 20,
  cursor?: string | null
) {
  return getPaginatedData<any>(`/users/${userId}/posts`, { limit: pageSize, cursor });
}

/**
 * Get paginated notifications
 */
export async function getPaginatedNotifications(
  userId: string,
  pageSize: number = 20,
  cursor?: string | null
) {
  return getPaginatedData<any>(`/users/${userId}/notifications`, { limit: pageSize, cursor });
}

/**
 * Batch delete documents (for cleanup)
 */
export async function batchDelete(
  _collectionName: string,
  _constraints: any[] = [],
  _batchSize: number = 500
): Promise<number> {
  console.warn('batchDelete is deprecated in REST mode; no-op');
  return 0;
}
