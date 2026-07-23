import { DEFAULT_AVATAR_URL } from '../api';

/**
 * Canonical “no profile pic” avatar used across the app.
 * Prefer this helper instead of ad-hoc placeholders / splash icons.
 */
export { DEFAULT_AVATAR_URL };

const BAD_AVATAR_MARKERS = [
  'avatardefault.webp',
  'avatardefault.png',
  'default-pic.jpg',
  'default/default-pic',
  'via.placeholder.com',
  'placeholder.com',
];

export function isMissingOrDefaultAvatar(url?: string | null): boolean {
  if (url == null) return true;
  const s = String(url).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'none' || lower === 'n/a' || lower === 'na') {
    return true;
  }
  return BAD_AVATAR_MARKERS.some((m) => lower.includes(m));
}

/** Always returns a usable https URL for Image/ExpoImage. */
export function resolveAvatarUrl(url?: string | null): string {
  if (isMissingOrDefaultAvatar(url)) return DEFAULT_AVATAR_URL;
  const s = String(url).trim();
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http://')) return `https://${s.slice(7)}`;
  return s;
}
