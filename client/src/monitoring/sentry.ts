import * as Sentry from '@sentry/react-native';

export const initSentry = () => {
  // Only initialize in production to avoid noisy dev logs
  if (!__DEV__) {
    Sentry.init({
      dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '', 
      debug: false,
      tracesSampleRate: 1.0,
    });
  }
};

export const captureError = (error: any, context?: any) => {
  if (!__DEV__) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('[Sentry Placeholder]', error, context);
  }
};
