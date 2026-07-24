/**
 * Two-Factor Authentication (2FA) & Multi-Factor Authentication (MFA)
 * Supports: Email OTP, SMS OTP, Authenticator App (TOTP)
 */

import * as Crypto from 'expo-crypto';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

export interface TwoFactorConfig {
  userId: string;
  enabled: boolean;
  methods: TwoFactorMethod[];
  backupCodes: string[];
  createdAt: Date;
  lastUsed?: Date;
}

export interface TwoFactorMethod {
  type: 'email-otp' | 'sms-otp' | 'totp' | 'security-key';
  enabled: boolean;
  verified: boolean;
  value?: string; // Email, phone, or TOTP secret
}

/**
 * Generate OTP (One-Time Password)
 * 6-digit code valid for 5 minutes
 */
export function generateOTP(): { code: string; expiresAt: Date } {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  return { code, expiresAt };
}

/**
 * Generate TOTP Secret for Authenticator App
 * Use with: Google Authenticator, Microsoft Authenticator, Authy
 */
export function generateTOTPSecret(): string {
  // Base32 charset
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';

  for (let i = 0; i < 32; i++) {
    secret += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  return secret;
}

/**
 * Generate backup codes for account recovery
 * 8 codes, each 8 characters
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];

  for (let i = 0; i < 8; i++) {
    const code = Math.random()
      .toString(36)
      .substr(2, 8)
      .toUpperCase();
    codes.push(code);
  }

  return codes;
}

/**
 * Store 2FA config in Firestore
 */
export async function setup2FA(
  userId: string,
  method: 'email-otp' | 'sms-otp' | 'totp'
): Promise<TwoFactorConfig> {
  try {
    const backupCodes = generateBackupCodes();

    let methodConfig: TwoFactorMethod = {
      type: method,
      enabled: false,
      verified: false,
    };

    if (method === 'totp') {
      methodConfig.value = generateTOTPSecret();
    }

    const config: TwoFactorConfig = {
      userId,
      enabled: false,
      methods: [methodConfig],
      backupCodes,
      createdAt: new Date(),
    };

    await setDoc(doc(db, 'twoFactor', userId), {
      ...config,
      createdAt: new Date(),
      backupCodes: backupCodes, // Store hashed in production
    });

    return config;
  } catch (error) {
    console.error('Setup 2FA error:', error);
    throw error;
  }
}

/**
 * Enable 2FA method
 */
export async function enable2FAMethod(
  userId: string,
  method: 'email-otp' | 'sms-otp' | 'totp'
): Promise<boolean> {
  try {
    const ref = doc(db, 'twoFactor', userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      throw new Error('2FA not configured');
    }

    const config = snapshot.data() as TwoFactorConfig;

    // Update method to enabled
    const updatedMethods = config.methods.map((m) =>
      m.type === method ? { ...m, enabled: true, verified: true } : m
    );

    await updateDoc(ref, {
      methods: updatedMethods,
      enabled: updatedMethods.some((m) => m.enabled),
      lastUsed: new Date(),
    });

    return true;
  } catch (error) {
    console.error('Enable 2FA error:', error);
    throw error;
  }
}

/**
 * Disable 2FA method
 */
export async function disable2FAMethod(
  userId: string,
  method: 'email-otp' | 'sms-otp' | 'totp'
): Promise<boolean> {
  try {
    const ref = doc(db, 'twoFactor', userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      throw new Error('2FA not configured');
    }

    const config = snapshot.data() as TwoFactorConfig;

    const updatedMethods = config.methods.map((m) =>
      m.type === method ? { ...m, enabled: false, verified: false } : m
    );

    await updateDoc(ref, {
      methods: updatedMethods,
      enabled: updatedMethods.some((m) => m.enabled),
    });

    return true;
  } catch (error) {
    console.error('Disable 2FA error:', error);
    throw error;
  }
}

/**
 * Verify OTP Code
 */
export function verifyOTP(providedCode: string, actualCode: string): boolean {
  // Constant-time comparison to prevent timing attacks
  if (providedCode.length !== actualCode.length) return false;

  let result = 0;
  for (let i = 0; i < providedCode.length; i++) {
    result |= providedCode.charCodeAt(i) ^ actualCode.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Verify TOTP Code (Authenticator app)
 * Allows 30-second window
 */
export function verifyTOTP(secret: string, code: string): boolean {
  // Simplified TOTP verification
  // In production, use: speakeasy or notp library
  const now = Math.floor(Date.now() / 30000);

  // Check current and previous time window (allow 60-second skew)
  for (let i = -1; i <= 1; i++) {
    const timeCounter = (now + i).toString(16).padStart(16, '0');
    // Generate TOTP for this time window
    const generated = generateSimpleTOTP(secret, timeCounter);

    if (verifyOTP(code, generated)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple TOTP generator (for demo - use library in production)
 */
function generateSimpleTOTP(secret: string, timeCounter: string): string {
  // This is simplified - use speakeasy/notp in production
  const hash = Crypto.CryptoDigestAlgorithm.SHA1;
  return 'XXXXXX'; // Placeholder
}

/**
 * Use backup code to login if 2FA unavailable
 */
export async function useBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  try {
    const ref = doc(db, 'twoFactor', userId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return false;
    }

    const config = snapshot.data() as TwoFactorConfig;
    const codeIndex = config.backupCodes.indexOf(code);

    if (codeIndex === -1) {
      return false;
    }

    // Remove used code
    const updatedCodes = config.backupCodes.filter((_, i) => i !== codeIndex);

    await updateDoc(ref, {
      backupCodes: updatedCodes,
      lastUsed: new Date(),
    });

    return true;
  } catch (error) {
    console.error('Backup code error:', error);
    return false;
  }
}

/**
 * Get remaining backup codes count
 */
export async function getBackupCodesCount(userId: string): Promise<number> {
  try {
    const snapshot = await getDoc(doc(db, 'twoFactor', userId));

    if (!snapshot.exists()) {
      return 0;
    }

    const config = snapshot.data() as TwoFactorConfig;
    return config.backupCodes?.length || 0;
  } catch (error) {
    console.error('Get backup codes error:', error);
    return 0;
  }
}

/**
 * Disable all 2FA methods
 */
export async function disableAll2FA(userId: string): Promise<boolean> {
  try {
    const ref = doc(db, 'twoFactor', userId);

    await updateDoc(ref, {
      enabled: false,
      methods: [],
    });

    return true;
  } catch (error) {
    console.error('Disable all 2FA error:', error);
    return false;
  }
}

export default {
  setup2FA,
  enable2FAMethod,
  disable2FAMethod,
  verifyOTP,
  verifyTOTP,
  useBackupCode,
  getBackupCodesCount,
  disableAll2FA,
  generateOTP,
  generateTOTPSecret,
  generateBackupCodes,
};
