import {
  SNAPCHAT_CLIENT_ID,
  SNAPCHAT_CLIENT_SECRET,
  TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET,
} from '@env';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithPopup } from 'firebase/auth';
import { Alert, Platform } from 'react-native';
import { auth } from '../config/firebase';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


// Read env with safe fallback to undefined (avoids accidental string "undefined")
const getEnv = (key: string, envValue?: string) => {
  if (envValue && envValue !== 'undefined') return envValue;
  const val = (process as any).env?.[key];
  return val && val !== 'undefined' ? val : undefined;
};

const requireAuth = () => {
  if (!auth) {
    throw new Error('Authentication service is not available');
  }
  return auth;
};

// Google Sign-In for native (will be configured)
let GoogleSignin: any = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
} catch (e) {
  console.log('Google Sign-In not configured for native');
}

// Important: Complete auth session for web browser
WebBrowser.maybeCompleteAuthSession();

/**
 * Google Sign-In using @react-native-google-signin for mobile and firebase for web
 * Works on iOS, Android, and Web
 */
export async function signInWithGoogle() {
  try {
    // For web
    if (Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');

      const result = await signInWithPopup(requireAuth(), provider);
      return {
        success: true,
        user: result.user,
      };
    }

    // For mobile (iOS/Android)
    if (GoogleSignin) {
      try {
        // Configure Google Sign-In
        GoogleSignin.configure({
          webClientId: '709095117662-2l84b3ua08t9icu8tpqtpchrmtdciep0.apps.googleusercontent.com',
          offlineAccess: true,
          iosClientId: '709095117662-k35juagf7ihkae81tfm9si43jkg7g177.apps.googleusercontent.com', // iOS Client ID from GoogleService-Info.plist
          forceCodeForRefreshToken: true, // Force refresh token
        });

        // Check if device supports Google Play Services (Android only)
        if (Platform.OS === 'android') {
          try {
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          } catch (playServicesError: any) {
            console.error('❌ Play Services Error:', playServicesError);
            return {
              success: false,
              error: 'Google Play Services not available. Please update Google Play Services.',
            };
          }
        }

        // Sign out first to ensure clean state
        try {
          await GoogleSignin.signOut();
        } catch (signOutError) {
          console.log('ℹ️ No previous session to sign out');
        }

        // Get user info - v16+ returns { data: { idToken, user } } or { type: 'cancelled' }
        const response = await GoogleSignin.signIn();

        // Check if sign in was cancelled
        if (response.type === 'cancelled') {
          return {
            success: false,
            error: 'Sign in cancelled by user',
          };
        }

        // v16+ uses response.data.idToken, older versions use response.idToken
        const idToken = response.data?.idToken || (response as any).idToken;

        console.log('✅ Google Sign-In Success');

        if (!idToken) {
          throw new Error('No ID token received from Google Sign-In');
        }

        // Create Firebase credential
        const googleCredential = GoogleAuthProvider.credential(idToken);

        // Sign in with Firebase
        const result = await signInWithCredential(requireAuth(), googleCredential);

        return {
          success: true,
          user: result.user,
        };
      } catch (configError: any) {
        console.error('❌ Google Sign-In Error:', configError);

        // Better error messages
        let errorMessage = 'Google Sign-In failed. Please try again.';

        // Check if it's Android SHA-1 certificate issue
        if (Platform.OS === 'android' && (configError.code === '10' || configError.message?.includes('DEVELOPER_ERROR'))) {
          console.warn('⚠️ Google Sign-In SHA-1 Warning: Certificate may need to be added in Firebase Console');
          console.warn('Steps: 1) cd android && ./gradlew signingReport');
          console.warn('       2) Copy SHA-1 fingerprint');
          console.warn('       3) Add to Firebase Console → Project Settings → Android app');

          errorMessage = 'Google Sign-In configuration error. Please contact support or try email sign-in.';
        } else if (configError.code === '12501') {
          errorMessage = 'Sign in cancelled';
        } else if (configError.code === '12500') {
          errorMessage = 'Google Sign-In error. Please try again.';
        } else if (configError.message?.includes('NETWORK_ERROR')) {
          errorMessage = 'Network error. Please check your internet connection.';
        }

        return {
          success: false,
          error: errorMessage,
        };
      }
    }

    // Fallback if package not available
    Alert.alert(
      'Setup Required',
      'Google Sign-In package not installed. Please use Email or Phone login for now.',
      [{ text: 'OK' }]
    );

    return {
      success: false,
      error: 'Google Sign-In package not configured',
    };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);

    // User canceled
    if (error.code === 'SIGN_IN_CANCELLED' || error.code === '-5') {
      return {
        success: false,
        error: 'Sign-in canceled',
      };
    }

    return {
      success: false,
      error: error.message || 'Google Sign-In failed',
    };
  }
}

/**
 * Apple Sign-In using expo-apple-authentication
 * iOS only
 */
export async function signInWithApple() {
  try {
    // Check if Apple Sign-In is available (iOS 13+)
    if (Platform.OS === 'ios') {
      const AppleAuthentication = await import('expo-apple-authentication');
      const isAvailable = await AppleAuthentication.isAvailableAsync();

      if (!isAvailable) {
        Alert.alert('Apple Sign-In', 'Apple Sign-In is not available on this device');
        return {
          success: false,
          error: 'Apple Sign-In not available',
        };
      }

      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Create Firebase credential
      const { identityToken } = credential;
      if (!identityToken) {
        throw new Error('No identity token returned');
      }

      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: identityToken,
      });

      // Sign in with Firebase
      const result = await signInWithCredential(requireAuth(), firebaseCredential);

      return {
        success: true,
        user: result.user,
      };
    }

    // For web
    if (Platform.OS === 'web') {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const result = await signInWithPopup(requireAuth(), provider);
      return {
        success: true,
        user: result.user,
      };
    }

    // Android not supported
    Alert.alert(
      'iOS Only Feature',
      'Apple Sign-In is only available on iPhone and iPad. Please use Email, Phone, or Google login on Android.',
      [{ text: 'OK' }]
    );
    return {
      success: false,
      error: 'Apple Sign-In not available on Android',
    };
  } catch (error: any) {
    console.error('Apple Sign-In Error:', error);

    // User canceled
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return {
        success: false,
        error: 'Sign-in canceled',
      };
    }

    return {
      success: false,
      error: error.message || 'Apple Sign-In failed',
    };
  }
}

/**
 * TikTok Sign-In using expo-auth-session OAuth
 * TikTok uses OAuth 2.0 authentication
 */
export async function signInWithTikTok() {
  try {
    const { makeRedirectUri } = await import('expo-auth-session');
    const ExpoCrypto = await import('expo-crypto');
    // Warm up browser to reduce first-open latency
    try { await WebBrowser.warmUpAsync(); } catch { }

    // TikTok OAuth configuration from developer console (read from env for security)
    const TIKTOK_CLIENT_KEY_VAL = getEnv('TIKTOK_CLIENT_KEY', TIKTOK_CLIENT_KEY) || TIKTOK_CLIENT_KEY;
    const TIKTOK_CLIENT_SECRET_VAL = getEnv('TIKTOK_CLIENT_SECRET', TIKTOK_CLIENT_SECRET) || TIKTOK_CLIENT_SECRET;

    console.log('🔑 TikTok credentials:', TIKTOK_CLIENT_KEY_VAL ? '✓ Key loaded' : '✗ Missing');

    if (!TIKTOK_CLIENT_KEY_VAL || TIKTOK_CLIENT_KEY_VAL === 'undefined') {
      throw new Error('TikTok credentials not configured');
    }

    // TikTok OAuth endpoints
    const discovery = {
      authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token/',
    };

    // Redirect URI - must match TikTok Developer Console
    const redirectUri = makeRedirectUri({
      scheme: 'trave-social',
      path: 'oauth/redirect',
      preferLocalhost: false,
      isTripleSlashed: false, // Changed to false for better compatibility
    });

    // Generate random state for CSRF protection (required by TikTok)
    const stateBytes = await ExpoCrypto.getRandomBytesAsync(16);
    const state = Array.from(new Uint8Array(stateBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('TikTok Redirect URI:', redirectUri);
    console.log('TikTok State:', state);

    // Open TikTok authorization URL with required state parameter
    const authUrl = `${discovery.authorizationEndpoint}?client_key=${TIKTOK_CLIENT_KEY_VAL}&scope=user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    console.log('TikTok Auth URL:', authUrl);

    // Open browser for authentication with longer timeout
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      redirectUri,
      {
        showInRecents: true,
        createTask: true // Android only - open in new task
      }
    );

    console.log('TikTok OAuth Result:', JSON.stringify(result, null, 2));

    // Check if user dismissed
    if (result.type === 'dismiss' || result.type === 'cancel') {
      console.log('TikTok sign-in canceled by user');
      return {
        success: false,
        error: 'Sign in cancelled by user',
      };
    }

    if (result.type === 'success' && result.url) {
      // Extract authorization code from URL
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      console.log('TikTok OAuth Code:', code);
      console.log('TikTok OAuth Error:', error);

      if (error) {
        throw new Error(`TikTok OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for access token via Cloud Function (secure)
      console.log('🔐 Exchanging code via Cloud Function...');
      const cloudFunctionUrl = 'https://us-central1-travel-app-3da72.cloudfunctions.net/tiktokAuth';

      const tokenAbort = new AbortController();
      const tokenTimeout = setTimeout(() => tokenAbort.abort(), 15000);

      const tokenResponse = await fetch(cloudFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          redirectUri: redirectUri,
        }),
        signal: tokenAbort.signal,
      });

      clearTimeout(tokenTimeout);
      const tokenData = await tokenResponse.json();

      if (!tokenData.success || !tokenData.openId) {
        throw new Error(tokenData.error || 'Failed to get TikTok user data');
      }

      console.log('✅ TikTok user data received:', tokenData.displayName);

      // User data from Cloud Function (already includes user info)
      const tiktokUser = {
        open_id: tokenData.openId,
        union_id: tokenData.unionId,
        display_name: tokenData.displayName,
        avatar_url: tokenData.avatarUrl,
      };

      // Create custom token in Firebase (you'll need Cloud Function for this)
      // For now, use email/password with TikTok ID
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
      const { doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');

      // Use TikTok open_id as unique identifier
      const tiktokEmail = `tiktok_${tiktokUser.open_id}@trave-social.app`;
      // Use a deterministic password based on the user ID (not client secret which might change)
      const tiktokPassword = `TikTok${tiktokUser.open_id.substring(0, 16)}!@#`;

      let firebaseUser;

      try {
        // Try to sign in first
        console.log('📱 Trying to sign in existing TikTok user:', tiktokEmail);
        const signInResult = await signInWithEmailAndPassword(requireAuth(), tiktokEmail, tiktokPassword);
        firebaseUser = signInResult.user;
        console.log('✅ Signed in existing TikTok user');
      } catch (signInError: any) {
        console.log('⚠️ TikTok sign-in failed, error code:', signInError.code);
        if (signInError.code === 'auth/user-not-found') {
          // Create new account
          console.log('🆕 Creating new TikTok user...');
          const createResult = await createUserWithEmailAndPassword(requireAuth(), tiktokEmail, tiktokPassword);
          firebaseUser = createResult.user;
          console.log('✅ New TikTok user created');

          // No Firestore write - backend sync handled by handleSocialAuthResult
          console.log('✅ TikTok user auth ready');
        } else if (signInError.code === 'auth/wrong-password') {
          console.error('❌ TikTok password mismatch detected');
          throw new Error('Password mismatch with stored TikTok credentials');
        } else {
          console.error('❌ TikTok auth error:', signInError.code, signInError.message);
          throw signInError;
        }
      }

      console.log('✅ TikTok authentication successful for user:', firebaseUser?.uid);
      return {
        success: true,
        user: firebaseUser,
      };
    }

    // Other result type (locked, etc)
    return {
      success: false,
      error: 'Sign-in failed',
    };
  } catch (error: any) {
    console.error('TikTok Sign-In Error:', error);

    Alert.alert(
      'TikTok Login Error',
      error.message || 'Failed to sign in with TikTok. Please try again.',
      [{ text: 'OK' }]
    );

    return {
      success: false,
      error: error.message || 'TikTok Sign-In failed',
    };
  } finally {
    try { await WebBrowser.coolDownAsync(); } catch { }
  }
}

/**
 * Snapchat Sign-In using expo-auth-session OAuth
 * Snapchat uses Snap Kit for authentication
 */
export async function signInWithSnapchat() {
  try {
    const { makeRedirectUri } = await import('expo-auth-session');
    // Warm up browser to reduce first-open latency
    try { await WebBrowser.warmUpAsync(); } catch { }

    // Snapchat OAuth configuration
    const discovery = {
      authorizationEndpoint: 'https://accounts.snapchat.com/accounts/oauth2/auth',
      tokenEndpoint: 'https://accounts.snapchat.com/accounts/oauth2/token',
    };

    const redirectUri = makeRedirectUri({
      scheme: 'trave-social',
      path: 'auth/callback'
    });

    // Snapchat client credentials (read from env for security)
    const SNAPCHAT_CLIENT_ID_VAL = getEnv('SNAPCHAT_CLIENT_ID', SNAPCHAT_CLIENT_ID) || SNAPCHAT_CLIENT_ID;
    const SNAPCHAT_CLIENT_SECRET_VAL = getEnv('SNAPCHAT_CLIENT_SECRET', SNAPCHAT_CLIENT_SECRET) || SNAPCHAT_CLIENT_SECRET;

    console.log('🔑 Snapchat credentials loaded:', SNAPCHAT_CLIENT_ID_VAL ? '✓' : '✗');

    if (!SNAPCHAT_CLIENT_ID_VAL || !SNAPCHAT_CLIENT_SECRET_VAL) {
      throw new Error('Snapchat credentials not configured');
    }

    // Build Snapchat OAuth URL
    const snapAuthUrl = `${discovery.authorizationEndpoint}?client_id=${SNAPCHAT_CLIENT_ID_VAL}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=user.display_name%20user.bitmoji.avatar&prompt=consent`;

    // Open browser for authentication
    const snapResult = await WebBrowser.openAuthSessionAsync(snapAuthUrl, redirectUri);
    if (snapResult.type === 'success' && snapResult.url) {
      // Extract authorization code from URL
      const url = new URL(snapResult.url);
      const code = url.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code received');
      }
      // Exchange code for access token
      // Add timeout to token exchange
      const tokenAbort = new AbortController();
      const tokenTimeout = setTimeout(() => tokenAbort.abort(), 12000);
      const tokenResponse = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: SNAPCHAT_CLIENT_ID_VAL,
          client_secret: SNAPCHAT_CLIENT_SECRET_VAL,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
        signal: tokenAbort.signal,
      });
      clearTimeout(tokenTimeout);
      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        throw new Error('Failed to get access token');
      }
      // Get user info from Snapchat (Bitmoji, display name)
      // Add timeout to user info fetch
      const userAbort = new AbortController();
      const userTimeout = setTimeout(() => userAbort.abort(), 12000);
      const userResponse = await fetch('https://kit.snapchat.com/v1/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: userAbort.signal,
      });
      clearTimeout(userTimeout);
      const userData = await userResponse.json();
      if (!userData.data) {
        throw new Error('Failed to get user info');
      }
      // Create Firebase user (similar to TikTok logic)
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
      const { doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      const snapchatEmail = `snapchat_${userData.data.me.external_id}@trave-social.app`;
      // Use a deterministic password based on the user ID (not client secret which might change)
      const snapchatPassword = `Snapchat${userData.data.me.external_id.substring(0, 16)}!@#`;
      let firebaseUser;
      try {
        console.log('📸 Trying to sign in existing Snapchat user:', snapchatEmail);
        const signInResult = await signInWithEmailAndPassword(requireAuth(), snapchatEmail, snapchatPassword);
        firebaseUser = signInResult.user;
        console.log('✅ Signed in existing Snapchat user');
      } catch (signInError) {
        const errorAny = signInError as any;
        console.log('⚠️ Snapchat sign-in failed, error code:', errorAny.code);
        if (errorAny.code === 'auth/user-not-found') {
          console.log('🆕 Creating new Snapchat user...');
          const createResult = await createUserWithEmailAndPassword(requireAuth(), snapchatEmail, snapchatPassword);
          firebaseUser = createResult.user;
          console.log('✅ New Snapchat user created');

          // No Firestore write - backend sync handled by handleSocialAuthResult
          console.log('✅ Snapchat user auth ready');
        } else if (errorAny.code === 'auth/wrong-password') {
          console.error('❌ Snapchat password mismatch detected');
          throw new Error('Password mismatch with stored Snapchat credentials');
        } else {
          console.error('❌ Snapchat auth error:', errorAny.code, errorAny.message);
          throw signInError;
        }
      }

      console.log('✅ Snapchat authentication successful for user:', firebaseUser?.uid);
      return {
        success: true,
        user: firebaseUser,
      };
    } else if (snapResult.type === 'cancel' || snapResult.type === 'dismiss') {
      // User explicitly canceled
      console.log('Snapchat sign-in canceled by user');
      return {
        success: false,
        error: 'Sign-in canceled',
      };
    }

    // Other result type
    return {
      success: false,
      error: 'Sign-in failed',
    };
  } catch (error: any) {
    console.error('Snapchat Sign-In Error:', error);

    return {
      success: false,
      error: error.message || 'Snapchat Sign-In failed',
    };
  } finally {
    try { await WebBrowser.coolDownAsync(); } catch { }
  }
}

/**
 * Helper to handle social auth result
 */
export async function handleSocialAuthResult(result: any, router: any) {
  if (result.success) {
    const user = result.user;
    const defaultAvatar = DEFAULT_AVATAR_URL;
    const userAvatar = user.photoURL || defaultAvatar;
    const userName = user.displayName || user.email?.split('@')[0] || 'User';

    console.log('handleSocialAuthResult - User:', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName
    });

    const safeNavigate = (path: string) => {
      try {
        router.replace(path);
      } catch (error: any) {
        if (error.message?.includes('Attempted to navigate before mounting')) {
          console.log('Waiting for root layout to mount...');
          setTimeout(() => safeNavigate(path), 100);
        } else {
          throw error;
        }
      }
    };

    try {
      // Import dependencies dynamically
      const { apiService } = await import('@/src/_services/apiService');
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;

      // Sync with backend using the same endpoint as email/password login
      console.log('🔄 Syncing social user with backend...');

      const response = await apiService.post('/auth/login-firebase', {
        firebaseUid: user.uid,
        email: user.email,
        displayName: userName,
        avatar: userAvatar,
        provider: user.providerData?.[0]?.providerId || 'social'
      });

      if (response.success) {
        console.log('✅ Backend sync successful, storing tokens...');

        // Store tokens directly in AsyncStorage
        await AsyncStorage.setItem('token', response.token);
        // Use backend ID preferably, fallback to firebase/sync ID
        const userIdToStore = response.user?.id || response.user?._id || user.uid;
        const firebaseUidToStore = response.user?.firebaseUid || user.uid;
        // iOS Fix: Store all avatar variants for fallback access
        const avatarToStore = response.user?.avatar || response.user?.photoURL || response.user?.profilePicture || userAvatar || '';
        await AsyncStorage.setItem('userId', String(userIdToStore));
        await AsyncStorage.setItem('uid', String(firebaseUidToStore));
        await AsyncStorage.setItem('firebaseUid', String(firebaseUidToStore));
        await AsyncStorage.setItem('userAvatar', avatarToStore);  // iOS Fix: Cache avatar in storage
        await AsyncStorage.setItem('userEmail', user.email || '');

        // Force a small delay to ensure storage persistence
        await new Promise(resolve => setTimeout(resolve, 100));

        // Navigate to home
        safeNavigate('/(tabs)/home');
      } else {
        console.error('❌ Backend sync failed:', response.error);
        Alert.alert('Login Error', 'Failed to sync with server. Please try again.');
      }
    } catch (error: any) {
      console.error('Error in handleSocialAuthResult:', error);
      Alert.alert('Error', 'Failed to complete login process');
    }
  } else {
    Alert.alert('Authentication Error', result.error);
  }
}
