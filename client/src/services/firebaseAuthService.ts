import AsyncStorage from '@/lib/storage';
import { apiService } from './apiService';

/**
 * Register with email and password
 * Backend only (no Firebase)
 */
export async function registerWithEmailPassword(email: string, password: string, displayName?: string) {
  try {
    console.log('[Auth] Registering:', email);
    
    // Send to backend for account creation
    const response = await apiService.post('/auth/register', {
      email,
      password,
      displayName: displayName || email.split('@')[0],
    });
    
    console.log('[Auth] Backend response:', response);
    
    if (response.success) {
      // Store JWT token from backend
      const canonicalUserId = String(response.user?.id || response.user?._id || '');
      const firebaseUid = String(response.user?.firebaseUid || response.user?.uid || canonicalUserId);
      await AsyncStorage.multiSet([
        ['token', response.token],
        ['userId', canonicalUserId],
        ['uid', firebaseUid],
        ['firebaseUid', firebaseUid],
        ['userEmail', response.user.email],
      ]);
      console.log('[Auth] ✅ Registration successful');
      return { success: true, user: response.user };
    } else {
      return { success: false, error: response.error };
    }
  } catch (error: any) {
    console.error('[Auth] Registration error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with email and password
 * Backend only (no Firebase)
 */
export async function signInWithEmailPassword(email: string, password: string) {
  try {
    console.log('[Auth] Signing in:', email);
    
    // Send to backend for verification
    const response = await apiService.post('/auth/login', {
      email,
      password,
    });
    
    console.log('[Auth] Backend response:', response);
    
    if (response.success) {
      // Store JWT token from backend
      const canonicalUserId = String(response.user?.id || response.user?._id || '');
      const firebaseUid = String(response.user?.firebaseUid || response.user?.uid || canonicalUserId);
      await AsyncStorage.multiSet([
        ['token', response.token],
        ['userId', canonicalUserId],
        ['uid', firebaseUid],
        ['firebaseUid', firebaseUid],
        ['userEmail', response.user.email],
      ]);
      console.log('[Auth] ✅ Sign in successful');
      return { success: true, user: response.user };
    } else {
      return { success: false, error: response.error };
    }
  } catch (error: any) {
    console.error('[Auth] Sign in error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Logout user
 */
export async function logoutUser() {
  try {
    console.log('[Auth] Logging out');
    
    // Notify backend
    await apiService.post('/auth/logout', {});
    
    // Clear AsyncStorage
    await AsyncStorage.multiRemove(['token', 'userId', 'uid', 'firebaseUid', 'userEmail']);
    
    console.log('[Auth] ✅ Logout successful');
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] Logout error:', error.message);
    // Still clear local storage even if backend call fails
    await AsyncStorage.multiRemove(['token', 'userId', 'uid', 'firebaseUid', 'userEmail']);
    return { success: true };
  }
}

/**
 * Get current user from AsyncStorage
 */
export async function getCurrentUser() {
  try {
    const token = await AsyncStorage.getItem('token');
    const userId = await AsyncStorage.getItem('userId');
    const userEmail = await AsyncStorage.getItem('userEmail');
    
    if (token && userId) {
      return { 
        success: true, 
        user: { id: userId, email: userEmail || '' } 
      };
    } else {
      return { success: false, error: 'No user logged in' };
    }
  } catch (error: any) {
    console.error('[Auth] Get current user error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verify token is still valid
 */
export async function verifyToken() {
  try {
    const token = await AsyncStorage.getItem('token');
    
    if (!token) {
      return { success: false, error: 'No token' };
    }
    
    const response = await apiService.post('/auth/verify', {});
    
    if (response.success) {
      console.log('[Auth] ✅ Token verified');
      return { success: true };
    } else {
      // Token expired, clear it
      await AsyncStorage.multiRemove(['token', 'userId', 'uid', 'firebaseUid', 'userEmail']);
      return { success: false, error: 'Token expired' };
    }
  } catch (error: any) {
    console.error('[Auth] Verify token error:', error.message);
    return { success: false, error: error.message };
  }
}
