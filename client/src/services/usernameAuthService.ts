import { apiService } from '@/src/services/apiService';

/**
 * Sign up with username
 * Creates a hidden email using username@trave-social.internal
 */
export async function signUpWithUsername(username: string, name: string, avatar?: string) {
  try {
    if (!username || username.trim().length < 3) {
      return { success: false, error: 'Username must be at least 3 characters' };
    }

    const payload = {
      username: username.toLowerCase().trim(),
      name: name || username,
      avatar,
    };

    const res = await apiService.post('/auth/username/signup', payload);
    
    if (res && res.success === false) {
      return { success: false, error: res.error || 'Sign-up failed' };
    }
    
    return {
      success: true,
      user: res?.user,
      username: payload.username,
      internalEmail: res?.internalEmail,
      token: res?.token,
    };
  } catch (error: any) {
    console.error('Username Sign-Up Error:', error);
    const msg = error?.response?.data?.error || error?.message || 'Sign-up failed';
    return { success: false, error: msg };
  }
}

/**
 * Login with username & password
 * Finds the user and signs in securely with credentials
 */
export async function loginWithUsername(username: string, password?: string) {
  try {
    if (!username || username.trim().length < 3) {
      return { success: false, error: 'Please enter a valid username' };
    }
    if (!password) {
      return { success: false, error: 'Password is required' };
    }
    const res = await apiService.post('/auth/username/login', {
      username: username.toLowerCase().trim(),
      password,
    });
    
    if (res && res.success === false) {
      return { success: false, error: res.error || 'Login failed' };
    }
    
    if (!res || !res.token) {
       return { success: false, error: 'Invalid response from server' };
    }
    
    return { success: true, user: res.user, token: res.token };
  } catch (error: any) {
    console.error('Username Login Error:', error);
    const msg = error?.response?.data?.error || error?.message || 'Login failed';
    return { success: false, error: msg };
  }
}

/**
 * Check if username is available
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    if (!username || username.trim().length < 3) {
      return false;
    }
    const res = await apiService.get('/auth/username/check', {
      username: username.toLowerCase().trim(),
    });
    return !!res?.available;
  } catch (error) {
    console.error('Username check error:', error);
    return false;
  }
}

/**
 * Check if email is available
 */
export async function checkEmailAvailability(email: string): Promise<boolean> {
  try {
    if (!email || !email.includes('@')) {
      return false;
    }
    const res = await apiService.get('/auth/email/check', {
      email: email.toLowerCase().trim(),
    });
    return !!res?.available;
  } catch (error) {
    console.error('Email check error:', error);
    return false;
  }
}
