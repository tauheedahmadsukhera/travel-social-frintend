/**
 * Authentication Service Interface
 * Implement this interface to switch between Firebase Auth, Supabase, AWS Cognito, etc.
 */

export interface IAuthService {
  // Sign up
  signUpWithEmail(email: string, password: string): Promise<AuthResult>;
  signUpWithPhone(phone: string): Promise<AuthResult>;
  
  // Sign in
  signInWithEmail(email: string, password: string): Promise<AuthResult>;
  signInWithPhone(phone: string): Promise<AuthResult>;
  signInWithGoogle(): Promise<AuthResult>;
  signInWithApple(): Promise<AuthResult>;
  
  // Password management
  sendPasswordResetEmail(email: string): Promise<void>;
  resetPassword(code: string, newPassword: string): Promise<void>;
  
  // Session management
  getCurrentUser(): User | null;
  signOut(): Promise<void>;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  
  // Phone verification
  verifyPhoneNumber(phone: string): Promise<string>; // Returns verification ID
  confirmPhoneVerification(verificationId: string, code: string): Promise<AuthResult>;
}

export interface User {
  uid: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
  photoURL?: string;
}

export interface AuthResult {
  user: User;
  token?: string;
}

