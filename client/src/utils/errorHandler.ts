/**
 * Centralized Error Handling & User-Friendly Messages
 * Maps Firebase/Agora errors to actionable user messages
 */

import { FirebaseError } from 'firebase/app';

// Simple inline logger to avoid circular dependencies
const logger = {
  error: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    console.error(`🔴 [ERROR] ${msg}`);
  },
};

export interface AppError {
  code: string;
  message: string;
  userMessage: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  action?: string;
  retryable: boolean;
}

// Firebase Error Code Mapping
const FIREBASE_ERROR_MAP: Record<string, AppError> = {
  'auth/invalid-email': {
    code: 'INVALID_EMAIL',
    message: 'Invalid email format',
    userMessage: 'Please enter a valid email address',
    severity: 'warning',
    retryable: false,
  },
  'auth/user-not-found': {
    code: 'USER_NOT_FOUND',
    message: 'User not found',
    userMessage: 'No account found with this email. Please sign up first.',
    severity: 'warning',
    retryable: false,
  },
  'auth/wrong-password': {
    code: 'WRONG_PASSWORD',
    message: 'Wrong password',
    userMessage: 'Incorrect password. Please try again.',
    severity: 'warning',
    retryable: false,
  },
  'auth/invalid-credential': {
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password',
    userMessage: 'Incorrect email or password. Please try again or sign up if you don\'t have an account.',
    severity: 'warning',
    retryable: false,
  },
  'auth/email-already-in-use': {
    code: 'EMAIL_TAKEN',
    message: 'Email already registered',
    userMessage: 'This email is already registered. Try signing in instead.',
    severity: 'warning',
    retryable: false,
  },
  'auth/too-many-requests': {
    code: 'RATE_LIMITED',
    message: 'Too many login attempts',
    userMessage: 'Too many failed attempts. Please try again in a few minutes.',
    severity: 'warning',
    retryable: true,
    action: 'wait',
  },
  'auth/network-request-failed': {
    code: 'NETWORK_ERROR',
    message: 'Network connection failed',
    userMessage: 'Unable to connect. Please check your internet and try again.',
    severity: 'error',
    retryable: true,
    action: 'retry',
  },
  'permission-denied': {
    code: 'PERMISSION_DENIED',
    message: 'Permission denied',
    userMessage: 'You don\'t have permission to perform this action.',
    severity: 'error',
    retryable: false,
  },
  'failed-precondition': {
    code: 'FAILED_PRECONDITION',
    message: 'Operation not allowed',
    userMessage: 'This action cannot be completed right now. Please try again.',
    severity: 'error',
    retryable: true,
  },
  'unavailable': {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporarily unavailable',
    userMessage: 'Our service is temporarily unavailable. Please try again in a moment.',
    severity: 'error',
    retryable: true,
    action: 'retry',
  },
  'internal': {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    userMessage: 'Something went wrong. Please try again.',
    severity: 'critical',
    retryable: true,
  },
};

// HTTP Status Code Mapping
const HTTP_ERROR_MAP: Record<number, AppError> = {
  400: {
    code: 'BAD_REQUEST',
    message: 'Invalid request data',
    userMessage: 'Something went wrong with your request. Please check and try again.',
    severity: 'warning',
    retryable: false,
  },
  401: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    userMessage: 'Your session has expired. Please log in again.',
    severity: 'error',
    retryable: false,
    action: 're-login',
  },
  403: {
    code: 'FORBIDDEN',
    message: 'Access denied',
    userMessage: 'You do not have permission to view this content.',
    severity: 'error',
    retryable: false,
  },
  404: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    userMessage: 'The content you are looking for does not exist.',
    severity: 'info',
    retryable: false,
  },
  429: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Rate limit exceeded',
    userMessage: 'You are doing that too fast! Please wait a moment.',
    severity: 'warning',
    retryable: true,
    action: 'wait',
  },
  500: {
    code: 'SERVER_ERROR',
    message: 'Internal server error',
    userMessage: 'Our server is having trouble. We are looking into it!',
    severity: 'critical',
    retryable: true,
    action: 'retry',
  },
};

// Agora Error Code Mapping
const AGORA_ERROR_MAP: Record<number, AppError> = {
  110: {
    code: 'CHANNEL_TIMEOUT',
    message: 'Channel join timeout (110)',
    userMessage: 'Unable to join stream. Broadcaster may be starting. Please try again.',
    severity: 'error',
    retryable: true,
    action: 'retry',
  },
  101: {
    code: 'NOT_IN_CHANNEL',
    message: 'Not in channel (101)',
    userMessage: 'You were disconnected from the stream.',
    severity: 'warning',
    retryable: true,
  },
  102: {
    code: 'INVALID_CHANNEL_NAME',
    message: 'Invalid channel name (102)',
    userMessage: 'Unable to find this stream.',
    severity: 'error',
    retryable: false,
  },
  103: {
    code: 'NOT_INITIALIZED',
    message: 'SDK not initialized (103)',
    userMessage: 'Live streaming is not available right now.',
    severity: 'critical',
    retryable: true,
  },
  4: {
    code: 'INVALID_APP_ID',
    message: 'Invalid App ID (4)',
    userMessage: 'Configuration error. Please contact support.',
    severity: 'critical',
    retryable: false,
  },
};

export class ErrorHandler {
  /**
   * Parse Firebase error and return user-friendly message
   */
  static handleFirebaseError(error: any): AppError {
    const fbError = error as FirebaseError;
    const code = fbError.code || 'unknown-error';
    
    const mapped = FIREBASE_ERROR_MAP[code];
    if (mapped) {
      logger.error(`🔴 Firebase Error [${code}]`, fbError.message);
      return mapped;
    }

    // Generic Firebase error fallback
    logger.error(`🔴 Firebase Error [${code}]`, fbError.message);
    return {
      code: 'FIREBASE_ERROR',
      message: fbError.message || 'Unknown Firebase error',
      userMessage: 'An error occurred. Please try again.',
      severity: 'error',
      retryable: true,
    };
  }

  /**
   * Parse Agora error and return user-friendly message
   */
  static handleAgoraError(errorCode: number, errorMsg?: string): AppError {
    const mapped = AGORA_ERROR_MAP[errorCode];
    if (mapped) {
      logger.error(`🔴 Agora Error [${errorCode}]`, errorMsg || mapped.message);
      return mapped;
    }

    logger.error(`🔴 Agora Error [${errorCode}]`, errorMsg || 'Unknown Agora error');
    return {
      code: 'AGORA_ERROR',
      message: `Agora error ${errorCode}: ${errorMsg}`,
      userMessage: 'Stream error. Please try again.',
      severity: 'error',
      retryable: true,
    };
  }

  /**
   * Parse generic error and return AppError
   */
  static handleError(error: any): AppError {
    if (error?.code && FIREBASE_ERROR_MAP[error.code]) {
      return this.handleFirebaseError(error);
    }

    if (typeof error === 'number') {
      return this.handleAgoraError(error);
    }

    // Axios / HTTP Status Mapping
    const status = error?.response?.status || error?.status;
    if (status && HTTP_ERROR_MAP[status]) {
      const mapped = HTTP_ERROR_MAP[status];
      logger.error(`🌐 API Error [${status}]`, error.message || mapped.message);
      return mapped;
    }

    const message = error?.message || String(error) || 'Unknown error';
    
    if (message.includes('offline') || message.includes('network')) {
      return {
        code: 'NETWORK_ERROR',
        message,
        userMessage: 'Network connection lost. Please check your internet.',
        severity: 'warning',
        retryable: true,
      };
    }

    if (message.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        message,
        userMessage: 'Request timed out. Please try again.',
        severity: 'error',
        retryable: true,
      };
    }

    logger.error('🔴 Unhandled Error', message);
    return {
      code: 'UNKNOWN_ERROR',
      message,
      userMessage: 'Something went wrong. Please try again.',
      severity: 'error',
      retryable: true,
    };
  }

  /**
   * Log error with color-coded severity
   */
  static log(error: AppError) {
    const icons: Record<string, string> = {
      info: '🔵',
      warning: '🟡',
      error: '🔴',
      critical: '🚨',
    };
    
    const icon = icons[error.severity];
    console.log(`${icon} [${error.code}] ${error.message}`);
    if (error.action) {
      console.log(`  → Action: ${error.action}`);
    }
  }
}

/**
 * Network error detector
 */
export function isNetworkError(error: any): boolean {
  const message = error?.message || String(error) || '';
  return /offline|network|connection|timeout|unreachable/i.test(message);
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: any): boolean {
  const appError = ErrorHandler.handleError(error);
  return appError.retryable;
}

/**
 * Get user-friendly error message (safe to show in UI)
 */
export function getUserErrorMessage(error: any): string {
  const appError = ErrorHandler.handleError(error);
  ErrorHandler.log(appError);
  return appError.userMessage;
}

export default ErrorHandler;
