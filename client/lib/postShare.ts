import Constants from 'expo-constants';
import { Share } from 'react-native';

function getEnvValue(key: string): string {
  const extra = (Constants as any)?.expoConfig?.extra;
  const fromExtra = extra && typeof extra === 'object' ? extra[key] : undefined;
  const fromEnv = (process as any)?.env ? (process as any).env[key] : undefined;
  const value = fromExtra || fromEnv;
  return typeof value === 'string' ? value : '';
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getPostId(post: any): string {
  const id = post?.id ?? post?._id ?? post?.postId;
  return id != null ? String(id) : '';
}

export function buildPostDeepLink(postId: string): string {
  const rawScheme = (Constants as any)?.expoConfig?.scheme;
  const scheme =
    typeof rawScheme === 'string'
      ? rawScheme
      : (Array.isArray(rawScheme) && typeof rawScheme[0] === 'string' ? rawScheme[0] : 'trave-social');
  return `${scheme}://post-detail?id=${encodeURIComponent(postId)}`;
}

export function buildPostWebLink(postId: string): string {
  const base = getEnvValue('EXPO_PUBLIC_WEB_BASE_URL');
  if (!base) return '';
  return `${normalizeBaseUrl(base)}/post-detail?id=${encodeURIComponent(postId)}`;
}

export function buildProfileDeepLink(userId: string): string {
  const rawScheme = (Constants as any)?.expoConfig?.scheme;
  const scheme =
    typeof rawScheme === 'string'
      ? rawScheme
      : (Array.isArray(rawScheme) && typeof rawScheme[0] === 'string' ? rawScheme[0] : 'trave-social');
  return `${scheme}://user-profile?id=${encodeURIComponent(userId)}`;
}

export function buildProfileWebLink(userId: string): string {
  const base = getEnvValue('EXPO_PUBLIC_WEB_BASE_URL');
  if (!base) return '';
  return `${normalizeBaseUrl(base)}/user-profile?id=${encodeURIComponent(userId)}`;
}

export async function shareProfile(input: { userId: string; name?: string; username?: string } | string): Promise<void> {
  const userId = typeof input === 'string' ? input : String(input?.userId || '');
  if (!userId) {
    await Share.share({ message: 'Check out this profile' });
    return;
  }

  const deepLink = buildProfileDeepLink(userId);
  const webLink = buildProfileWebLink(userId);
  const bestLink = webLink || deepLink;

  const name = typeof input === 'string' ? '' : (typeof input?.name === 'string' ? input.name.trim() : '');
  const username = typeof input === 'string' ? '' : (typeof input?.username === 'string' ? input.username.trim() : '');
  const label = name || username || 'this user';

  const message = `Check out ${label}'s profile on Trips!\n\n${bestLink}`;
  await Share.share({ message, url: bestLink, title: 'Share Profile' });
}

export async function sharePost(post: any): Promise<void> {
  const postId = getPostId(post);
  if (!postId) {
    await Share.share({ message: 'Check out this post' });
    return;
  }

  const deepLink = buildPostDeepLink(postId);
  const webLink = buildPostWebLink(postId);
  const bestLink = webLink || deepLink;

  let message = 'Check out this post';
  if (typeof post?.userName === 'string' && post.userName.trim()) {
    message += ` by ${post.userName.trim()}`;
  }

  const location = typeof post?.location === 'string' ? post.location : post?.location?.name;
  if (typeof location === 'string' && location.trim()) {
    message += ` at ${location.trim()}`;
  }

  if (typeof post?.caption === 'string' && post.caption.trim()) {
    message += `\n\n${post.caption.trim()}`;
  }

  message += `\n\n${bestLink}`;

  await Share.share({
    message,
    url: bestLink,
    title: 'Check out this post!'
  });
}
