/**
 * Keep-Alive Service
 * ------------------
 * Render free tier server 15 min baad "sleep" ho jata hai.
 * Ye service har 13 min mein backend ko ping karta hai
 * taake server active rahe aur cold start na ho.
 *
 * App band karne par automatically stop ho jata hai.
 */

import { AppState, AppStateStatus } from 'react-native';
import { getAPIBaseURL } from '../src/_services/apiService';

const PING_INTERVAL_MS = 13 * 60 * 1000; // 13 minutes
let pingTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: any = null;
let isRunning = false;

async function pingServer(): Promise<void> {
  try {
    const baseUrl = getAPIBaseURL();
    // Use a lightweight endpoint that doesn't hit DB
    const pingUrl = baseUrl.replace('/api', '') + '/api/ping-v2';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    await fetch(pingUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeoutId);
    if (__DEV__) console.log('[KeepAlive] ✅ Server pinged successfully');
  } catch (_) {
    // Silently ignore — server might already be up or ping failed
    if (__DEV__) console.log('[KeepAlive] ⚠️ Ping failed (server might be sleeping, will retry)');
  }
}

function schedulePing(): void {
  if (pingTimer) clearTimeout(pingTimer);
  pingTimer = setTimeout(async () => {
    await pingServer();
    if (isRunning) schedulePing(); // Reschedule next ping
  }, PING_INTERVAL_MS);
}

function stopPinging(): void {
  if (pingTimer) {
    clearTimeout(pingTimer);
    pingTimer = null;
  }
}

/**
 * Start the keep-alive service.
 * Call this once from your App root (e.g., app/_layout.tsx).
 *
 * Usage:
 *   import { startKeepAlive } from '@/services/keepAlive';
 *   useEffect(() => { startKeepAlive(); }, []);
 */
export function startKeepAlive(): () => void {
  if (isRunning) return () => {};
  isRunning = true;

  // Do an immediate ping on start (app open = user is waiting)
  pingServer();
  schedulePing();

  // Stop pinging when app goes to background, resume in foreground
  appStateSubscription = AppState.addEventListener(
    'change',
    (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // App came to foreground — ping immediately then reschedule
        if (__DEV__) console.log('[KeepAlive] App active — pinging server');
        pingServer();
        schedulePing();
      } else {
        // App went to background — stop wasting battery
        stopPinging();
      }
    }
  );

  // Return cleanup function
  return () => {
    isRunning = false;
    stopPinging();
    if (appStateSubscription?.remove) {
      appStateSubscription.remove();
    }
  };
}
