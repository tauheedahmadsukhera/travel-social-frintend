import AsyncStorage from '@/lib/storage';
import { getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Platform } from 'react-native';

// ⚠️ FIREBASE CONFIGURATION - AUTHENTICATION ONLY
// Firebase is ONLY used for social login authentication (Google, Apple, Snapchat, TikTok)
// All data operations (posts, stories, comments, etc.) should use Backend API
// Backend URL: https://travel-social-backend.onrender.com/api

// ✅ SECURE FIREBASE CONFIGURATION - Environment Variables
// Firebase is ONLY used for social login authentication (Google, Apple, Snapchat, TikTok)
// All data operations (posts, stories, comments, etc.) use Backend API
// Backend URL: https://travel-social-backend.onrender.com/api

import { FIREBASE_CONFIG } from './environment';
const firebaseConfig = FIREBASE_CONFIG;

// Initialize Firebase (prevent duplicate). Keep module load crash-safe.
let app: any = null;
let isFirstInit = false;
try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    isFirstInit = true;
  } else {
    app = getApps()[0];
  }
} catch (error: any) {
  console.error('Firebase app initialization failed:', error?.message || error);
}

// ✅ AUTHENTICATION ONLY - Initialize Firebase Auth with React Native persistence
let auth: Auth | null = null;
try {
  if (app && isFirstInit) {
    const { getReactNativePersistence } = require('firebase/auth');
    auth = initializeAuth(app, {
      persistence: Platform.OS === 'web'
        ? undefined
        : getReactNativePersistence(AsyncStorage),
    });
    console.log('✅ Firebase Auth initialized with React Native persistence');
  } else if (app) {
    auth = getAuth(app);
    console.log('✅ Using existing Firebase Auth instance');
  } else {
    console.warn('Firebase app not available, auth initialization skipped');
  }
} catch (error: any) {
  console.warn('Using existing Firebase Auth instance:', error?.message || error);
  if (app) {
    try {
      auth = getAuth(app);
    } catch (fallbackError: any) {
      console.error('Firebase Auth fallback failed:', fallbackError?.message || fallbackError);
    }
  }
}

// ❌ FIRESTORE & STORAGE DISABLED - Use Backend API instead
// DO NOT use db or storage - all data operations go through Backend API
// For migration compatibility, these are exported as null
export const db = null as any;
export const storage = null as any;

// ❌ FIRESTORE HELPERS DISABLED - Use Backend API for all data operations
export const serverTimestamp = null as any;
export const arrayUnion = null as any;
export const arrayRemove = null as any;
export const FieldValue = null as any;

// ✅ ONLY AUTH IS AVAILABLE
export { auth };

export default app;
