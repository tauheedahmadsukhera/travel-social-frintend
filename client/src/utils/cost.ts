type ExtraConfig = {
  costMode?: boolean;
  analyticsEnabled?: boolean;
  dailyCounterSampleRate?: number;
};

let extras: ExtraConfig = {};
try {
  const Constants = require('expo-constants').default;
  extras = (Constants?.expoConfig?.extra || {}) as ExtraConfig;
} catch {
  // In test or non-Expo environments, fall back to defaults
  extras = {};
}

export function isCostMode(): boolean {
  return extras.costMode === true;
}

export function isAnalyticsEnabled(): boolean {
  // In cost mode you might still want minimal analytics; this flag controls realtime logging
  const enabled = extras.analyticsEnabled;
  return enabled === undefined ? true : !!enabled;
}

export function getDailyCounterSampleRate(): number {
  const rate = Number(extras.dailyCounterSampleRate);
  if (Number.isFinite(rate)) {
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, rate));
  }
  // In tests, disable sampling for determinism
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') {
    return 1;
  }
  // Default to 10% if not configured
  return 0.1;
}

// Optional: gate for high-volume events when costMode is on
export function shouldLogRealtimeEvent(eventName: string): boolean {
  if (!isAnalyticsEnabled()) return false;
  if (!isCostMode()) return true;
  // Allow only essential events in costMode
  const allowed = new Set([
    'app_open',
    'login',
    'signup',
    'otp_verify_success',
    'otp_verify_error',
    'tab_press_home',
    'tab_press_search',
    'tab_press_post',
    'tab_press_map',
    'tab_press_profile',
  ]);
  return allowed.has(eventName);
}
