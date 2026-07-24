import AsyncStorage from '@/lib/storage';
import { apiService } from '@/src/services/apiService';

function uniqueNonEmpty(values: (string | null | undefined)[]): string[] {
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

function base64Decode(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const str = String(input).replace(/=+$/, '');
  let output = '';
  if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
  }
  for (
    let bc = 0, bs = 0, r1 = 0, r2 = 0, idx = 0;
    idx < str.length;
  ) {
    const char = str.charAt(idx++);
    const charIndex = chars.indexOf(char);
    if (charIndex === -1) continue;
    r2 = charIndex;
    r1 = bc % 4 ? r1 * 64 + r2 : r2;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (r1 >> ((-2 * bc) & 6)));
    }
  }
  return output;
}

function readUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = base64Decode(padded);
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

  const ops: [string, string][] = [
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
 * ENFORCES MongoDB _id from JWT token as the Universal Identity.
 */
export async function resolveCanonicalUserId(preferredId?: string | null): Promise<string | null> {
  const [storedUserId, token] = await Promise.all([
    AsyncStorage.getItem('userId'),
    AsyncStorage.getItem('token'),
  ]);

  // 1. Extract from Token (Highest Authority)
  const tokenUserId = readUserIdFromToken(token);
  if (tokenUserId) {
    if (storedUserId !== tokenUserId) {
      await AsyncStorage.setItem('userId', tokenUserId);
      // Deprecated keys for backward compatibility, pointing to the same MongoDB ID
      await AsyncStorage.setItem('uid', tokenUserId);
    }
    return tokenUserId;
  }

  // 2. Fallback to stored userId
  if (storedUserId) return storedUserId;

  // 3. Last resort: preferredId (if it's a MongoDB ID)
  if (preferredId && /^[a-fA-F0-9]{24}$/.test(preferredId)) {
    await AsyncStorage.setItem('userId', preferredId);
    return preferredId;
  }

  return preferredId || null;
}

/**
 * Direct getter for the unified MongoDB userId.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  return resolveCanonicalUserId();
}
