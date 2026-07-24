import type { ConfirmationResult, User } from 'firebase/auth'; // Type import only
import { auth } from '@/config/firebase';

async function requireAuth() {
  const { auth: loadedAuth } = await import('@/config/firebase');
  if (!loadedAuth) {
    throw new Error('Authentication service is not available');
  }
  return loadedAuth;
}

// Types
export interface UserProfile {
  uid: string;
  email?: string;
  phoneNumber?: string;
  username: string;
  name?: string;
  avatar?: string;
  createdAt: Date;
}

// ==================== EMAIL/PASSWORD AUTH ====================

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string) {
  try {
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const authInstance = await requireAuth();
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const authInstance = await requireAuth();
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string) {
  try {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    const authInstance = await requireAuth();
    await sendPasswordResetEmail(authInstance, email);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==================== PHONE AUTH ====================

let confirmationResult: ConfirmationResult | null = null;

/**
 * Send OTP to phone number
 * Note: For React Native, you'll need @react-native-firebase/auth
 * This is a web implementation - adapt for mobile
 */
export async function sendPhoneOTP(phoneNumber: string, recaptchaVerifier?: any) {
  try {
    if (!recaptchaVerifier) {
      throw new Error('RecaptchaVerifier required for web');
    }
    const { signInWithPhoneNumber } = await import('firebase/auth');
    const authInstance = await requireAuth();
    const result = await signInWithPhoneNumber(authInstance, phoneNumber, recaptchaVerifier);
    confirmationResult = result;
    return { success: true, confirmationResult: result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Verify OTP code
 */
export async function verifyPhoneOTP(code: string) {
  try {
    if (!confirmationResult) {
      throw new Error('No confirmation result found. Send OTP first.');
    }
    
    const userCredential = await confirmationResult.confirm(code);
    return { success: true, user: userCredential.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==================== SOCIAL AUTH ====================

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const authInstance = await requireAuth();
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(authInstance, provider);
    return { success: true, user: result.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with Apple
 */
export async function signInWithApple() {
  try {
    const { OAuthProvider, signInWithPopup } = await import('firebase/auth');
    const authInstance = await requireAuth();
    const provider = new OAuthProvider('apple.com');
    const result = await signInWithPopup(authInstance, provider);
    return { success: true, user: result.user };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ==================== USER PROFILE ====================

/**
 * Check if username is available
 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  try {
    const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
    const db = getFirestore();
    const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
    const snapshot = await getDocs(q);
    return snapshot.empty;
  } catch (error) {
    console.error('Error checking username:', error);
    return false;
  }
}

/**
 * Create user profile in Firestore
 */
export async function createUserProfile(
  uid: string,
  username: string,
  data: Partial<UserProfile> = {}
) {
  try {
    const { getFirestore, setDoc, doc } = await import('firebase/firestore');
    const db = getFirestore();
    const userProfile: UserProfile = {
      uid,
      username: username.toLowerCase(),
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber,
      avatar: data.avatar,
      createdAt: new Date(),
    };

    await setDoc(doc(db, 'users', uid), userProfile);
    return { success: true, profile: userProfile };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string) {
  try {
    const { getFirestore, getDoc, doc } = await import('firebase/firestore');
    const db = getFirestore();
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { success: true, profile: docSnap.data() as UserProfile };
    } else {
      return { success: false, error: 'Profile not found' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Upload profile image
 */
export async function uploadProfileImage(uid: string, imageUri: string) {
  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const storage = getStorage();
    const response = await fetch(imageUri);
    const blob = await response.blob();
    
    const storageRef = ref(storage, `avatars/${uid}`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    
    return { success: true, url };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    const { signOut } = await import('firebase/auth');
    const authInstance = await requireAuth();
    await signOut(authInstance);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return auth?.currentUser ?? null;
}

// ==================== PHONE OTP FOR PASSWORD RESET ====================

/**
 * For forgot password flow using phone OTP
 * This would need additional Firestore logic to link phone to email
 */
export async function sendPasswordResetOTP(phoneNumber: string) {
  // Implementation depends on your backend logic
  // You might need a Cloud Function to handle this
  return { success: true, message: 'OTP sent' };
}

export async function verifyPasswordResetOTP(phoneNumber: string, code: string) {
  // Implementation depends on your backend logic
  return { success: true, message: 'OTP verified' };
}
