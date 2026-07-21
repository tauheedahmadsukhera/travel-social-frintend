import { 
  SNAPCHAT_CLIENT_ID, 
  TIKTOK_CLIENT_KEY
} from '../config/environment';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform } from 'react-native';
import { GOOGLE_SIGN_IN_CONFIG } from '../config/environment';
import { DEFAULT_AVATAR_URL } from '@/lib/api';


// Read env with safe fallback to undefined (avoids accidental string "undefined")
// Safe environment variable getter
const getEnv = (key: string, envValue?: string) => {
  if (envValue && envValue !== 'undefined') return envValue;
  return undefined;
};

const requireAuth = async () => {
  const { auth } = await import('../config/firebase');
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
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');

      const authInstance = await requireAuth();
      const result = await signInWithPopup(authInstance, provider);
      return {
        success: true,
        user: result.user,
      };
    }

    // For mobile (iOS/Android)
    if (GoogleSignin) {
      try {
        // Expo Go on Android — use web-based OAuth (no SHA-1 needed)
        if (Platform.OS === 'android' && Constants.appOwnership === 'expo') {
          const { makeRedirectUri } = await import('expo-auth-session');
          const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
          const WebBrowserModule = await import('expo-web-browser');

          WebBrowserModule.maybeCompleteAuthSession();

          const webClientId = '709095117662-2l84b3ua08t9icu8tpqtpchrmtdciep0.apps.googleusercontent.com';

          const redirectUri = makeRedirectUri();

          // Open Google OAuth in browser
          const authUrl =
            `https://accounts.google.com/o/oauth2/v2/auth` +
            `?client_id=${webClientId}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=token` +
            `&scope=profile%20email`;

          const result = await WebBrowserModule.openAuthSessionAsync(authUrl, redirectUri);

          if (result.type !== 'success' || !result.url) {
            return { success: false, error: 'Google Sign-In cancelled' };
          }

          // Extract access_token from URL fragment
          const params = new URLSearchParams(result.url.split('#')[1] || result.url.split('?')[1] || '');
          const accessToken = params.get('access_token');

          if (!accessToken) {
            return { success: false, error: 'No access token received from Google' };
          }

          const authInstance = await requireAuth();
          const credential = GoogleAuthProvider.credential(null, accessToken);
          const firebaseResult = await signInWithCredential(authInstance, credential);
          return { success: true, user: firebaseResult.user };
        }

        const webClientId = GOOGLE_SIGN_IN_CONFIG.webClientId?.trim();
        const iosClientId = GOOGLE_SIGN_IN_CONFIG.iosClientId?.trim();
        if (!webClientId) {
          return {
            success: false,
            error:
              'Google Sign-In is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID). Set it in EAS env or .env and rebuild.',
          };
        }

        // Configure Google Sign-In (IDs from EAS / EXPO_PUBLIC_* or defaults in config/environment)
        GoogleSignin.configure({
          webClientId,
          offlineAccess: true,
          ...(iosClientId ? { iosClientId } : {}),
          forceCodeForRefreshToken: true,
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
        console.log('[DEBUG-AUTH] [1/5] Opening Google accounts selector...');
        const response = await GoogleSignin.signIn();
        console.log('[DEBUG-AUTH] [2/5] Google Sign-In UI closed. Response type:', response.type);

        // Check if sign in was cancelled
        if (response.type === 'cancelled') {
          return {
            success: false,
            error: 'Sign in cancelled by user',
          };
        }

        // v16+ uses response.data.idToken, older versions use response.idToken
        const idToken = response.data?.idToken || (response as any).idToken;

        console.log('[DEBUG-AUTH] [3/5] Google accounts resolved successfully. ID Token present:', !!idToken);

        if (!idToken) {
          throw new Error('No ID token received from Google Sign-In');
        }

        // Create Firebase credential
        const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
        const googleCredential = GoogleAuthProvider.credential(idToken);

        // Sign in with Firebase
        console.log('[DEBUG-AUTH] [4/5] Executing client-side signInWithCredential (Firebase Auth server query)...');
        const clientAuthStart = Date.now();
        const authInstance = await requireAuth();
        const result = await signInWithCredential(authInstance, googleCredential);
        console.log(`[DEBUG-AUTH] [5/5] Client-side Firebase Auth finished in ${Date.now() - clientAuthStart}ms.`);

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
          console.warn(
            '⚠️ Google Sign-In (DEVELOPER_ERROR): Android signing certificate does not match Google/Firebase OAuth for this package.'
          );
          console.warn(
            '1) Use a development build (expo run:android / EAS dev client), not Expo Go. 2) Run: npm run get-sha1 — add that SHA-1 to Firebase Android app + Google Cloud Console → Credentials → Android OAuth client for com.tauhee56.travesocial.'
          );
          console.warn(
            '3) Download fresh google-services.json from Firebase and replace client/android/app/google-services.json, then rebuild. 4) Release/EAS: add that keystore SHA-1 too.'
          );

          errorMessage =
            'Google Sign-In on Android: use a dev build (not Expo Go), add the SHA-1 from npm run get-sha1 to Firebase and Google Cloud OAuth, refresh google-services.json, reinstall. Or use email login.';
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
      const { OAuthProvider, signInWithCredential } = await import('firebase/auth');
      const { identityToken } = credential;
      if (!identityToken) {
        throw new Error('No identity token returned');
      }

      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: identityToken,
      });

      // Sign in with Firebase
      const authInstance = await requireAuth();
      const result = await signInWithCredential(authInstance, firebaseCredential);

      return {
        success: true,
        user: result.user,
      };
    }

    // For web
    if (Platform.OS === 'web') {
      const { OAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      const authInstance = await requireAuth();
      const result = await signInWithPopup(authInstance, provider);
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
    const TIKTOK_CLIENT_KEY_VAL = TIKTOK_CLIENT_KEY;

    console.log('🔑 TikTok credentials:', TIKTOK_CLIENT_KEY_VAL ? '✓ Key loaded' : '✗ Missing');

    if (!TIKTOK_CLIENT_KEY_VAL || TIKTOK_CLIENT_KEY_VAL === 'undefined') {
      throw new Error('TikTok credentials not configured');
    }

    // TikTok OAuth endpoints
    const discovery = {
      authorizationEndpoint: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenEndpoint: 'https://open.tiktokapis.com/v2/oauth/token',
    };

    // Redirect URI - must match TikTok Developer Console and must be HTTPS
    const redirectUri = 'https://travel-social-backend.onrender.com/api/auth/tiktok/callback';

    // Generate dynamic app redirect callback scheme (resolves exp:// or trave-social:// depending on environment)
    const appRedirectUri = makeRedirectUri({
      scheme: 'trave-social',
      path: 'oauth/redirect',
    });

    // Generate random state for CSRF protection (required by TikTok)
    const stateBytes = await ExpoCrypto.getRandomBytesAsync(16);
    const rawCsrf = Array.from(new Uint8Array(stateBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Package both CSRF token and dynamic app return URL in the state payload
    const stateObj = {
      csrf: rawCsrf,
      returnUrl: appRedirectUri,
    };
    const state = JSON.stringify(stateObj);

    console.log('TikTok Redirect URI (Web landing page):', redirectUri);
    console.log('TikTok App Return URL (Deep Link target):', appRedirectUri);

    // Open TikTok authorization URL with required state parameter
    const authUrl = `${discovery.authorizationEndpoint}?client_key=${TIKTOK_CLIENT_KEY_VAL}&scope=user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    console.log('TikTok Auth URL:', authUrl);

    // Open browser for authentication, listening for the dynamic callback target
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      appRedirectUri,
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

      // Exchange code for access token via Backend API (secure)
      console.log('🔐 Exchanging code via Backend API...');
      const { apiService } = await import('@/src/_services/apiService');
      const tokenData = await apiService.post('/auth/tiktok', {
        code: code,
        redirectUri: redirectUri,
      });

      if (!tokenData || !tokenData.success || !tokenData.openId) {
        throw new Error(tokenData?.error || 'Failed to get TikTok user data');
      }

      console.log('✅ TikTok user data received:', tokenData.displayName);

      // User data from Cloud Function (already includes user info)
      const tiktokUser = {
        open_id: tokenData.openId,
        union_id: tokenData.unionId,
        display_name: tokenData.displayName,
        avatar_url: tokenData.avatarUrl,
      };

      let firebaseUser;

      if (tokenData.customToken) {
        console.log('📱 Signing in TikTok user with Firebase custom token...');
        const { signInWithCustomToken } = await import('firebase/auth');
        const authInstance = await requireAuth();
        const signInResult = await signInWithCustomToken(authInstance, tokenData.customToken);
        firebaseUser = signInResult.user;
        console.log('✅ Signed in TikTok user via custom token');
      } else {
        // Backend must always return a customToken for secure sign-in.
        // Falling back to a deterministic password derived from a public ID is a
        // security vulnerability — reject instead of silently using weak credentials.
        throw new Error('TikTok sign-in failed: server did not return a secure authentication token. Please try again.');
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
    const SNAPCHAT_CLIENT_ID_VAL = SNAPCHAT_CLIENT_ID;

    console.log('🔑 Snapchat credentials loaded:', SNAPCHAT_CLIENT_ID_VAL ? '✓' : '✗');

    if (!SNAPCHAT_CLIENT_ID_VAL || SNAPCHAT_CLIENT_ID_VAL === 'undefined') {
      throw new Error('Snapchat credentials not configured');
    }

    // Build Snapchat OAuth URL (no prompt=consent for faster return visits)
    const snapAuthUrl = `${discovery.authorizationEndpoint}?client_id=${SNAPCHAT_CLIENT_ID_VAL}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=user.display_name%20user.bitmoji.avatar`;

    // Open browser for authentication
    const snapResult = await WebBrowser.openAuthSessionAsync(snapAuthUrl, redirectUri);
    if (snapResult.type === 'success' && snapResult.url) {
      // Extract authorization code from URL
      const url = new URL(snapResult.url);
      const code = url.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code via Express backend (always warm, no cold start)
      console.log('🔐 Exchanging Snapchat code via Backend API...');
      const { apiService } = await import('@/src/_services/apiService');
      const tokenData = await apiService.post('/auth/snapchat', {
        code: code,
        redirectUri: redirectUri,
      });

      if (!tokenData || !tokenData.success || (!tokenData.externalId && !tokenData.customToken)) {
        throw new Error(tokenData?.error || 'Failed to get Snapchat user data');
      }

      console.log('✅ Snapchat user data received:', tokenData.displayName);

      const snapchatUser = {
        external_id: tokenData.externalId,
        display_name: tokenData.displayName,
        avatar_url: tokenData.avatarUrl,
      };

      let firebaseUser;

      if (tokenData.customToken) {
        console.log('📱 Signing in Snapchat user with Firebase custom token...');
        const { signInWithCustomToken } = await import('firebase/auth');
        const authInstance = await requireAuth();
        const signInResult = await signInWithCustomToken(authInstance, tokenData.customToken);
        firebaseUser = signInResult.user;
        console.log('✅ Signed in Snapchat user via custom token');
      } else {
        // Backend must always return a customToken for secure sign-in.
        // A deterministic password derived from a public Snapchat external_id is a
        // security vulnerability — reject instead of silently using weak credentials.
        throw new Error('Snapchat sign-in failed: server did not return a secure authentication token. Please try again.');
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
      console.log('[DEBUG-AUTH] [6/9] handleSocialAuthResult started.');
      // Import dependencies dynamically
      const { apiService } = await import('@/src/_services/apiService');
      const storage = (await import('@/lib/storage')).default;

      // Sync with backend using the same endpoint as email/password login
      console.log('[DEBUG-AUTH] [7/9] Syncing social user with backend. Calling getIdToken...');

      // Get ID token for backend verification
      const idToken = await user.getIdToken?.() || '';

      console.log('[DEBUG-AUTH] [8/9] Sending POST request to /auth/login-firebase...');
      const backendSyncStart = Date.now();
      const response = await apiService.post('/auth/login-firebase', {
        idToken,
        firebaseUid: user.uid,
        email: user.email || `${user.uid}@social.trips.app`,
        displayName: userName,
        avatar: userAvatar,
        provider: user.providerData?.[0]?.providerId || 'social'
      });
      console.log(`[DEBUG-AUTH] [9/9] Backend sync completed in ${Date.now() - backendSyncStart}ms. Success:`, response.success);

      if (response.success) {
        console.log('✅ Backend sync successful, storing tokens...');

        // Store tokens directly in storage
        await storage.setItem('token', response.token);
        // Use backend ID preferably, fallback to firebase/sync ID
        const userIdToStore = response.user?.id || response.user?._id || user.uid;
        const firebaseUidToStore = response.user?.firebaseUid || user.uid;
        // iOS Fix: Store all avatar variants for fallback access
        const avatarToStore = response.user?.avatar || response.user?.photoURL || response.user?.profilePicture || userAvatar || '';
        await storage.setItem('userId', String(userIdToStore));
        await storage.setItem('uid', String(firebaseUidToStore));
        await storage.setItem('firebaseUid', String(firebaseUidToStore));
        await storage.setItem('userAvatar', avatarToStore);  // iOS Fix: Cache avatar in storage
        await storage.setItem('userEmail', user.email || '');

        // Force a small delay to ensure storage persistence
        await new Promise(resolve => setTimeout(resolve, 100));

        // Navigate to home
        safeNavigate('/(tabs)/home');
      } else {
        console.error('❌ Backend sync failed:', response);
        const detailedError = response.message || response.error || 'Failed to sync with server';
        const details = response.details ? JSON.stringify(response.details) : '';
        Alert.alert('Login Error', `${detailedError} ${details}`.trim());
      }
    } catch (error: any) {
      console.error('Error in handleSocialAuthResult:', error);
      Alert.alert('Error', 'Failed to complete login process');
    }
  } else {
    const msg = String(result?.error || '').toLowerCase();
    // User-backed-out is a normal flow; don't show an error dialog.
    if (msg.includes('cancel')) return;
    Alert.alert('Authentication Error', result.error);
  }
}
