/**
 * Backend Wake-up Service
 * 
 * Handles Render.com cold start issues by:
 * 1. Pinging backend on app start
 * 2. Showing loading state during wake-up
 * 3. Retrying failed requests
 */

let isWakingUp = false;
let isBackendReady = false;
let wakeupPromise: Promise<boolean> | null = null;

// In release builds we should never default to localhost.
let getAPIBaseURL: any = () => 'https://travel-social-backend.onrender.com/api';

// Safely load environment config
try {
  const envModule = require('@/config/environment');
  getAPIBaseURL = envModule.getAPIBaseURL || (() => 'https://travel-social-backend.onrender.com/api');
} catch (e) {
  console.warn('[BackendWakeup] Failed to load environment config, using default:', e);
}

/**
 * Check if backend is awake and responsive
 */
export async function checkBackendHealth(): Promise<boolean> {
  const API_BASE = getAPIBaseURL();
  console.log('[BackendWakeup] Checking health:', API_BASE);

  const endpoints = [`${API_BASE}/status`, `${API_BASE}/health`];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for cold starts

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });

      if (response.ok) {
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = { ok: true };
        }

        console.log('[BackendWakeup] Backend is healthy:', endpoint, data);
        isBackendReady = true;
        return true;
      }
    } catch (error: any) {
      // Try next endpoint before logging global failure
      const isAbort = error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted');
      if (!isAbort) {
        console.warn('[BackendWakeup] Health endpoint failed:', endpoint, error?.message || error);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  console.warn('[BackendWakeup] Health check failed for all endpoints');
  return false;
}

/**
 * Wake up backend if it's sleeping (Render.com cold start)
 * Returns true if backend is ready, false if still waking up
 */
export async function wakeupBackend(): Promise<boolean> {
  // If already ready, return immediately
  if (isBackendReady) {
    return true;
  }
  
  // If already waking up, wait for existing promise
  if (isWakingUp && wakeupPromise) {
    return wakeupPromise;
  }
  
  // Start wake-up process
  isWakingUp = true;
  console.log('[BackendWakeup] Starting backend wake-up...');
  
  wakeupPromise = (async () => {
    const maxAttempts = 6; // 6 attempts = ~60 seconds max
    const delayBetweenAttempts = 10000; // 10 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[BackendWakeup] Attempt ${attempt}/${maxAttempts}...`);
      
      const isHealthy = await checkBackendHealth();
      
      if (isHealthy) {
        console.log('[BackendWakeup] ✅ Backend is ready!');
        isWakingUp = false;
        isBackendReady = true;
        return true;
      }
      
      if (attempt < maxAttempts) {
        console.log(`[BackendWakeup] Backend not ready, waiting ${delayBetweenAttempts/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }
    
    console.warn('[BackendWakeup] ⚠️ Backend did not respond after', maxAttempts, 'attempts');
    isWakingUp = false;
    return false;
  })();
  
  return wakeupPromise;
}

/**
 * Get backend status
 */
export function getBackendStatus() {
  return {
    isReady: isBackendReady,
    isWakingUp: isWakingUp,
  };
}

/**
 * Reset backend status (for testing)
 */
export function resetBackendStatus() {
  isBackendReady = false;
  isWakingUp = false;
  wakeupPromise = null;
}

/**
 * Initialize backend on app start
 * Call this in _layout.tsx or app entry point
 */
export async function initializeBackend() {
  if (__DEV__) console.log('[BackendWakeup] Initializing backend...');
  
  // Try quick health check first
  const isHealthy = await checkBackendHealth();
  
  if (isHealthy) {
    if (__DEV__) console.log('[BackendWakeup] Backend already ready');
    // Start keep-alive to prevent future cold starts
    _startKeepAlive();
    return true;
  }
  
  // If not healthy, start wake-up process in background
  if (__DEV__) console.log('[BackendWakeup] Backend sleeping, starting wake-up...');
  wakeupBackend().then((ready) => {
    if (ready) _startKeepAlive();
  });
  
  return false;
}

// Internal keep-alive timer — runs silently in background
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

function _startKeepAlive() {
  if (_keepAliveTimer) return; // Already running

  _keepAliveTimer = setInterval(async () => {
    try {
      const API_BASE = getAPIBaseURL();
      const pingUrl = `${API_BASE.replace('/api', '')}/api/ping-v2`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      await fetch(pingUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(tid);
      if (__DEV__) console.log('[BackendWakeup] ♻️ Keep-alive ping sent');
    } catch (_) {
      // Silently ignore failed pings
    }
  }, 13 * 60 * 1000); // Ping every 13 minutes (Render sleeps at 15 min)
}

