import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '@/src/_services/apiService';

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const value = typeof v === 'string' ? v.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
  }
  return Array.from(seen);
}

function isLikelyPlaceholderUser(user: any, candidate: string): boolean {
  if (!user || typeof user !== 'object') return false;

  const id = String(user?._id || '');
  const firebaseUid = String(user?.firebaseUid || '');
  const email = typeof user?.email === 'string' ? user.email.trim() : '';
  const displayName = typeof user?.displayName === 'string' ? user.displayName.trim() : '';
  const username = typeof user?.username === 'string' ? user.username.trim() : '';

  return (
    id === candidate &&
    firebaseUid === candidate &&
    email.length === 0 &&
    (displayName.length === 0 || displayName === 'User') &&
    username.startsWith('user_')
  );
}

function readUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    const payload = JSON.parse(json);
    const tokenUserId = payload?.userId;
    return tokenUserId ? String(tokenUserId) : null;
  } catch {
    return null;
  }
}

async function persistCanonicalIds(canonicalId: string, firebaseUid?: string | null) {
  const normalizedFirebaseUid = typeof firebaseUid === 'string' && firebaseUid.trim().length > 0
    ? firebaseUid.trim()
    : null;

  const ops: Array<[string, string]> = [
    ['userId', canonicalId],
    ['uid', normalizedFirebaseUid || canonicalId],
  ];

  if (normalizedFirebaseUid) {
    ops.push(['firebaseUid', normalizedFirebaseUid]);
  }

  await AsyncStorage.multiSet(ops);
}

/**
 * Resolve the most reliable user id for API calls.
 * Prefers Mongo id if available, and keeps AsyncStorage keys synchronized.
 */
export async function resolveCanonicalUserId(preferredId?: string | null): Promise<string | null> {
  const [storedUserId, storedUid, storedFirebaseUid, token] = await Promise.all([
    AsyncStorage.getItem('userId'),
    AsyncStorage.getItem('uid'),
    AsyncStorage.getItem('firebaseUid'),
    AsyncStorage.getItem('token'),
  ]);

  const tokenUserId = readUserIdFromToken(token);
  if (tokenUserId) {
    const firebaseUid = uniqueNonEmpty([storedFirebaseUid, storedUid, preferredId || null])[0] || null;
    await persistCanonicalIds(tokenUserId, firebaseUid);
    return tokenUserId;
  }

  const rawCandidates = uniqueNonEmpty([preferredId || null, storedUserId, storedUid, storedFirebaseUid]);
  const objectIdLike = rawCandidates.filter((c) => /^[a-fA-F0-9]{24}$/.test(c));
  const nonObjectId = rawCandidates.filter((c) => !/^[a-fA-F0-9]{24}$/.test(c));
  const candidates = [...objectIdLike, ...nonObjectId];
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    try {
      const res = await apiService.get(`/users/${encodeURIComponent(candidate)}`);
      if (res?.success && res?.data) {
        const user = res.data;
        if (isLikelyPlaceholderUser(user, candidate)) {
          continue;
        }
        const canonicalId = String(user?._id || user?.id || candidate);
        const firebaseUid = user?.firebaseUid || user?.uid || storedFirebaseUid || null;
        await persistCanonicalIds(canonicalId, firebaseUid ? String(firebaseUid) : null);
        return canonicalId;
      }
    } catch {
      // Try next candidate.
    }
  }

  const fallback = candidates[0];
  await persistCanonicalIds(fallback, storedFirebaseUid);
  return fallback;
}
