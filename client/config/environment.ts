/**
 * Environment Configuration
 * Load all environment variables from .env file using Expo Constants
 * NEVER commit actual keys - use .env.local or environment secrets
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Expo only inlines EXPO_PUBLIC_* when accessed statically (process.env.EXPO_PUBLIC_FOO).
// Dynamic lookups like process.env[key] will be undefined in production bundles.
function getExpoPublicVar(key: string): string {
  switch (key) {
    case 'EXPO_PUBLIC_FIREBASE_API_KEY':
      return process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
    case 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN':
      return process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '';
    case 'EXPO_PUBLIC_FIREBASE_PROJECT_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '';
    case 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET':
      return process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';
    case 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '';
    case 'EXPO_PUBLIC_FIREBASE_APP_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '';
    case 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID':
      return process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '';
    case 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY':
      return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    case 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID':
      return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
    case 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID':
      return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
    case 'EXPO_PUBLIC_API_BASE_URL':
      return process.env.EXPO_PUBLIC_API_BASE_URL || '';
    case 'EXPO_PUBLIC_AGORA_APP_ID':
      return process.env.EXPO_PUBLIC_AGORA_APP_ID || '';
    case 'EXPO_PUBLIC_AGORA_TOKEN_URL':
      return process.env.EXPO_PUBLIC_AGORA_TOKEN_URL || '';
    default:
      return '';
  }
}

// Get environment variables (merge config.extra + process.env)
const env = { ...(process.env as any), ...(Constants.expoConfig?.extra as any) };

// Ensure keys are loaded from environment (fail loudly if missing in production)
const isDevelopment = process.env.NODE_ENV !== 'production';

/* eslint-disable expo/no-dynamic-env-var -- generic lookup; every call site passes a static key literal */
function getEnvVar(key: string, defaultValue?: string): string {
  const isPlaceholder = (val: unknown): boolean => {
    if (!val || typeof val !== 'string') {
      return true; // Treat undefined/null/non-string as placeholder so it falls back
    }
    const normalized = val.trim().toLowerCase();
    // treating empty string as a placeholder to allow fallback
    if (!normalized) {
      return true;
    }
    return (
      normalized === 'set_in_env' ||
      normalized === 'set_in_eas_env' ||
      normalized === 'set_google_maps_api_key_in_build_env' ||
      normalized.startsWith('set_') ||
      normalized.includes('placeholder') ||
      normalized.includes('your-')
    );
  };

  const configValue = env[key];
  // Prefer static EXPO_PUBLIC_* access for production safety.
  const processValue = key.startsWith('EXPO_PUBLIC_') ? getExpoPublicVar(key) : (process.env as any)[key];
  
  let value = '';
  if (!isPlaceholder(configValue)) {
    value = configValue as string;
  } else if (!isPlaceholder(processValue)) {
    value = processValue as string;
  }

  if (!value && !isDevelopment && defaultValue === undefined) {
    console.error(`❌ [environment] Critical variable missing: ${key}`);
    throw new Error(`Missing critical environment variable: ${key}`);
  }
  
  // In development, don't spam warnings for optional/empty vars.
  // Only warn when the app expects a non-empty value (no default provided).
  if (__DEV__ && defaultValue === undefined && isPlaceholder(value)) {
    console.warn(`⚠️ [environment] Variable ${key} has a placeholder value: "${value}"`);
  }

  return value || defaultValue || '';
}
/* eslint-enable expo/no-dynamic-env-var */

export const FIREBASE_CONFIG = {
  apiKey: getEnvVar('EXPO_PUBLIC_FIREBASE_API_KEY', ''),
  authDomain: getEnvVar('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', ''),
  projectId: getEnvVar('EXPO_PUBLIC_FIREBASE_PROJECT_ID', ''),
  storageBucket: getEnvVar('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', ''),
  messagingSenderId: getEnvVar('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', ''),
  appId: getEnvVar('EXPO_PUBLIC_FIREBASE_APP_ID', ''),
  measurementId: getEnvVar('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID', '')
} as const;

if (__DEV__) {
  console.log('🔥 [environment] Firebase Config initialized');
  console.log('🔥 [environment] Project ID:', FIREBASE_CONFIG.projectId || 'MISSING');
  console.log('🔥 [environment] API Key present:', !!FIREBASE_CONFIG.apiKey);
}

// Google Maps Configuration
// Prefer EXPO_PUBLIC_* (Expo inlines at bundle time). Only use legacy keys if explicitly set.
const EXPO_GOOGLE_MAPS_KEY = getEnvVar('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', '');
const LEGACY_GOOGLE_MAPS_KEY =
  EXPO_GOOGLE_MAPS_KEY ||
  String(env['GOOGLE_MAPS_API_KEY'] || process.env.GOOGLE_MAPS_API_KEY || '').trim() ||
  String(env['GOOGLE_MAP_API_KEY'] || process.env.GOOGLE_MAP_API_KEY || '').trim();

/** Web client (type 3) from Firebase `google-services.json` — required for native Google Sign-In + Firebase ID token. */
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '709095117662-2l84b3ua08t9icu8tpqtpchrmtdciep0.apps.googleusercontent.com';
/** iOS OAuth client from Firebase / GoogleService-Info.plist — used by @react-native-google-signin on iOS. */
const DEFAULT_GOOGLE_IOS_CLIENT_ID =
  '709095117662-k35juagf7ihkae81tfm9si43jkg7g177.apps.googleusercontent.com';

export const GOOGLE_SIGN_IN_CONFIG = {
  webClientId: getEnvVar('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', DEFAULT_GOOGLE_WEB_CLIENT_ID),
  iosClientId: getEnvVar('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', DEFAULT_GOOGLE_IOS_CLIENT_ID),
} as const;

export const GOOGLE_MAPS_CONFIG = {
  apiKey: LEGACY_GOOGLE_MAPS_KEY,
  provider: 'google' as const,
} as const;

// Agora Configuration (app ID is semi-public, but certificate is NOT)
export const AGORA_CONFIG = {
  appId: getEnvVar('EXPO_PUBLIC_AGORA_APP_ID', ''),
  // Certificate should NEVER be in frontend - request tokens from backend only
  tokenServerUrl: getEnvVar('EXPO_PUBLIC_AGORA_TOKEN_URL', ''),
} as const;

// App Configuration
export const APP_CONFIG = {
  name: 'Trips',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  postsPerHour: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_POSTS_PER_HOUR', '10'), 10),
  commentsPerHour: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_COMMENTS_PER_HOUR', '50'), 10),
  messagesPerMinute: parseInt(getEnvVar('EXPO_PUBLIC_RATE_LIMIT_MESSAGES_PER_MINUTE', '30'), 10),
} as const;

// Feature Flags
export const FEATURES = {
  liveStreaming: true,
  stories: true,
  highlights: true,
  mapView: true,
  passport: true,
  privateAccounts: true,
  verifiedLocations: true,
  offlineMode: false,
  analytics: true,
  pushNotifications: true,
} as const;

// API Configuration
export const API_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
} as const;

// Storage Configuration
export const STORAGE_CONFIG = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxVideoSize: 100 * 1024 * 1024, // 100MB
  imageQuality: 0.8,
  maxImageWidth: 1080,
  maxImageHeight: 1920,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/quicktime'],
} as const;

// Pagination Configuration
export const PAGINATION = {
  postsPerPage: 10,
  storiesPerPage: 20,
  commentsPerPage: 50,
  notificationsPerPage: 30,
  messagesPerPage: 50,
} as const;

// Default Assets (avatar derived from API base — avoid importing lib/api here; that caused a circular module graph and wrong API_BASE_URL in release)
export const DEFAULT_ASSETS = {
  get avatar() {
    const base = getAPIBaseURL().replace(/\/api\/?$/, '');
    return `${base}/assests/avatardefault.webp`;
  },
  placeholder: 'https://via.placeholder.com/600x600.png?text=No+Media',
} as const;

// Theme Configuration
export const THEME = {
  primaryColor: '#667eea',
  accentColor: '#764ba2',
  errorColor: '#e74c3c',
  successColor: '#2ecc71',
  warningColor: '#0A3D62',
  infoColor: '#3498db',
  backgroundColor: '#ffffff',
  textColor: '#000000',
  borderColor: '#ddd',
} as const;

// Validation Rules
export const VALIDATION = {
  minPasswordLength: 6,
  maxPasswordLength: 128,
  minUsernameLength: 3,
  maxUsernameLength: 30,
  maxBioLength: 150,
  maxCaptionLength: 2200,
  maxCommentLength: 500,
  emailRegex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  usernameRegex: /^[a-zA-Z0-9_]{3,30}$/,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  networkError: 'Network error. Please check your connection.',
  authError: 'Authentication failed. Please login again.',
  permissionError: 'Permission denied. Please enable required permissions.',
  uploadError: 'Failed to upload media. Please try again.',
  genericError: 'Something went wrong. Please try again.',
  invalidEmail: 'Please enter a valid email address.',
  invalidPassword: 'Password must be at least 6 characters long.',
  invalidUsername: 'Username must be 3-30 characters and contain only letters, numbers, and underscores.',
  userNotFound: 'User not found.',
  postNotFound: 'Post not found.',
  unauthorized: 'You are not authorized to perform this action.',
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  postCreated: 'Post created successfully!',
  postUpdated: 'Post updated successfully!',
  postDeleted: 'Post deleted successfully!',
  profileUpdated: 'Profile updated successfully!',
  followSuccess: 'Followed successfully!',
  unfollowSuccess: 'Unfollowed successfully!',
  commentAdded: 'Comment added successfully!',
  messageSent: 'Message sent successfully!',
} as const;

// Cache Keys
export const CACHE_KEYS = {
  userProfile: (userId: string) => `user_profile_${userId}`,
  posts: (userId: string) => `posts_${userId}`,
  stories: (userId: string) => `stories_${userId}`,
  feed: (userId: string) => `feed_${userId}`,
  notifications: (userId: string) => `notifications_${userId}`,
} as const;

// Storage Keys
export const STORAGE_KEYS = {
  authToken: '@auth_token',
  userData: '@user_data',
  theme: '@theme',
  language: '@language',
  offlineQueue: '@offline_queue',
} as const;

// API Base URL Helper
export function getAPIBaseURL(): string {
  const prodUrl = 'https://travel-social-backend.onrender.com/api';
  const localIp = 'http://10.36.246.154:5000/api';
  // Avoid runtime crashes in release when env resolution fails.
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL || getEnvVar('EXPO_PUBLIC_API_BASE_URL', '');
  const normalizedEnvUrl = String(envUrl || '').trim().toLowerCase();
  const envLooksLocal = /(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalizedEnvUrl);

  // Derive Metro host IP for Expo Go/dev-client to avoid stale hardcoded LAN IP.
  const hostUri = String((Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost || '');
  const hostIp = hostUri.includes(':') ? hostUri.split(':')[0] : hostUri;
  const derivedLocalUrl = hostIp ? `http://${hostIp}:5000/api` : '';

  if (__DEV__) {
    console.log('📡 [environment] EXPO_PUBLIC_API_BASE_URL from env:', envUrl || 'Not set');
    if (derivedLocalUrl && envLooksLocal && envUrl && String(envUrl).trim() !== derivedLocalUrl) {
      console.log('📡 [environment] Detected stale local env URL, using derived host URL instead:', derivedLocalUrl);
      return derivedLocalUrl;
    }
    if (envUrl) {
      console.log('📡 [environment] Using env URL in dev:', envUrl);
      return envUrl;
    }
    if (derivedLocalUrl) {
      console.log('📡 [environment] Using derived local URL in dev:', derivedLocalUrl);
      return derivedLocalUrl;
    }
    if (envLooksLocal) {
      console.log('📡 [environment] Using fallback local env URL in dev:', envUrl);
      return envUrl;
    }
    console.log('📡 [environment] Falling back to hardcoded local IP in dev:', localIp);
    return localIp || prodUrl;
  }

  // Production safety: never allow a local/LAN URL to ship by accident.
  if (envLooksLocal) return prodUrl;

  return envUrl || prodUrl;
}

export default {
  FIREBASE_CONFIG,
  GOOGLE_SIGN_IN_CONFIG,
  GOOGLE_MAPS_CONFIG,
  AGORA_CONFIG,
  APP_CONFIG,
  FEATURES,
  API_CONFIG,
  STORAGE_CONFIG,
  PAGINATION,
  DEFAULT_ASSETS,
  THEME,
  VALIDATION,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  CACHE_KEYS,
  STORAGE_KEYS,
};

