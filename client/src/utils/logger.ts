/**
 * Production-Safe Logger
 * Automatically disables logs in production builds
 */

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (isDev) {
      console.error(...args);
    }
    // In production, you can send to error tracking service
    // Example: Sentry.captureException(args[0]);
  },
  
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },
  
  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args);
    }
  },
};

// Helper for tracking errors in production
export const trackError = (error: Error, context?: Record<string, any>) => {
  if (isDev) {
    console.error('Error:', error, 'Context:', context);
  } else {
    // TODO: Send to error tracking service (Sentry, Crashlytics, etc.)
    // Example: Sentry.captureException(error, { extra: context });
  }
};

// Helper for analytics events
export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (isDev) {
    console.log(`📊 Event: ${eventName}`, properties);
  } else {
    // TODO: Send to analytics service (Mixpanel, Firebase Analytics, etc.)
    // Example: analytics.track(eventName, properties);
  }
};
