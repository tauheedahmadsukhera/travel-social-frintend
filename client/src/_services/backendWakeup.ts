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
  const envModule = require('../../config/environment');
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
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

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
  console.log('[BackendWakeup] Initializing backend...');
  
  // Try quick health check first
  const isHealthy = await checkBackendHealth();
  
  if (isHealthy) {
    console.log('[BackendWakeup] Backend already ready');
    return true;
  }
  
  // If not healthy, start wake-up process in background
  console.log('[BackendWakeup] Backend sleeping, starting wake-up...');
  wakeupBackend(); // Don't await - let it run in background
  
  return false;
}

