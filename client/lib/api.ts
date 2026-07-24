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
