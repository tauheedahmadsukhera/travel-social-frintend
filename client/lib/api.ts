import Constants from 'expo-constants';

import { getAPIBaseURL as getBaseUrl } from '../config/environment';

function normalizeApiBase(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function getAPIBaseURL(): string {
  return getBaseUrl();
}

export const API_BASE_URL = getAPIBaseURL();
export const BACKEND_URL = API_BASE_URL.replace(/\/api\/?$/, '');
export const DEFAULT_AVATAR_URL = `${BACKEND_URL}/assets/avatardefault.webp`;
export const CLOUDFRONT_DOMAIN = (Constants as any)?.expoConfig?.extra?.CLOUDFRONT_DOMAIN || '';

/**
 * Industrial CDN URL Resolver - Routes S3 URLs through CloudFront CDN for 3x faster media delivery
 */
export function getCdnUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (!CLOUDFRONT_DOMAIN) return url;
  if (url.includes('.amazonaws.com/')) {
    const s3Path = url.split('.amazonaws.com/')[1];
    return `https://${CLOUDFRONT_DOMAIN}/${s3Path}`;
  }
  return url;
}
