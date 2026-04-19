/**
 * Centralized Logging Utility
 * Color-coded console output for debugging
 */

export const logger = {
  /**
   * 🔵 Info - General information
   */
  info: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    if (__DEV__) console.log(`🔵 [INFO] ${msg}`);
  },

  /**
   * 🟡 Warning - Non-critical issues
   */
  warn: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    console.warn(`🟡 [WARN] ${msg}`);
  },

  /**
   * 🔴 Error - Critical issues
   */
  error: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    console.error(`🔴 [ERROR] ${msg}`);
  },

  /**
   * 🚨 Critical - System-level failures
   */
  critical: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    console.error(`🚨 [CRITICAL] ${msg}`);
  },

  /**
   * 🟢 Success - Operation completed
   */
  success: (title: string, message?: string) => {
    const msg = message ? `${title}: ${message}` : title;
    if (__DEV__) console.log(`🟢 [SUCCESS] ${msg}`);
  },

  /**
   * 🔍 Debug - Detailed debugging info
   */
  debug: (title: string, data?: any) => {
    if (__DEV__) {
      console.log(`🔍 [DEBUG] ${title}`, data);
    }
  },
};

export default logger;
