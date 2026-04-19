import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAPIBaseURL as getBaseUrl } from '../../config/environment';

type AnyObject = Record<string, any>;

function normalizeApiBase(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

// ✅ SIMPLIFIED API URL RESOLUTION - Clean & Efficient
const getAPIBaseURL = () => {
  return normalizeApiBase(getBaseUrl());
};

// Lazy initialization - create axios instance on first use, not at module load
let axiosInstance: any = null;

// --- Reliability primitives (per-route circuit breaker + in-flight GET dedupe) ---
const inflightGetRequests = new Map<string, Promise<any>>();

type CircuitBucket = { consecutiveFailures: number; openUntil: number };
const circuitByKey = new Map<string, CircuitBucket>();

/** One breaker per method+path so /posts flaps don't block /conversations. */
function getCircuitKey(method: string, url: string): string {
  const m = String(method || 'get').toLowerCase();
  let p = String(url || '').split('?')[0];
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return `${m}:${p}`;
}

function getCircuitBucket(key: string): CircuitBucket {
  let b = circuitByKey.get(key);
  if (!b) {
    b = { consecutiveFailures: 0, openUntil: 0 };
    circuitByKey.set(key, b);
  }
  return b;
}

function isRetryableError(error: any): boolean {
  return (
    error?.code === 'ERR_NETWORK' ||
    error?.code === 'ECONNABORTED' ||
    error?.message === 'Network Error' ||
    (typeof error?.response?.status === 'number' && error.response.status >= 500 && error.response.status < 600)
  );
}

function recordSuccessForKey(key: string) {
  const b = getCircuitBucket(key);
  b.consecutiveFailures = 0;
  b.openUntil = 0;
}

/** Count one failed *logical* request (after retries), not each retry attempt. */
function recordFinalFailureForKey(key: string, error: any) {
  if (!isRetryableError(error)) return;
  const b = getCircuitBucket(key);
  const now = Date.now();
  b.consecutiveFailures += 1;
  // More tolerant than the old global breaker (was 3× per retry storm); shorter cool-down.
  if (b.consecutiveFailures >= 6) {
    b.openUntil = now + 12000;
  }
}

function isCircuitOpenForKey(key: string): boolean {
  return Date.now() < getCircuitBucket(key).openUntil;
}

function makeCircuitOpenError() {
  const err: any = new Error('Server unreachable (temporarily). Showing cached content.');
  err.code = 'CIRCUIT_OPEN';
  return err;
}

function stableStringify(input: any): string {
  try {
    if (input == null) return '';
    if (typeof input !== 'object') return String(input);
    const seen = new WeakSet();
    const stringify = (obj: any): any => {
      if (obj == null) return obj;
      if (typeof obj !== 'object') return obj;
      if (seen.has(obj)) return '[Circular]';
      seen.add(obj);
      if (Array.isArray(obj)) return obj.map(stringify);
      const keys = Object.keys(obj).sort();
      const out: AnyObject = {};
      for (const k of keys) out[k] = stringify(obj[k]);
      return out;
    };
    return JSON.stringify(stringify(input));
  } catch {
    return '';
  }
}

function getTimeoutMs(method: string, url: string): number {
  const u = String(url || '');
  const m = String(method || '').toLowerCase();

  // Auth can be slow on cold starts.
  if (u === '/auth/login-firebase' || u === '/auth/register-firebase') return 120000;

  // Media upload can take longer.
  if (/\/media\/upload/i.test(u)) return 120000;

  // Real-time endpoints: keep responsive (avoid long spinners).
  if (/\/(conversations|messages|notifications|inbox)/i.test(u)) return 22000;

  // Feeds can be heavier but should not stall forever.
  if (m === 'get' && /\/(posts|stories|highlights)/i.test(u)) return 28000;

  // Default.
  return 20000;
}

function getAxiosInstance() {
  if (!axiosInstance) {
    const API_BASE = getAPIBaseURL();

    axiosInstance = axios.create({
      baseURL: API_BASE,
      timeout: 20000,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json',
        // Prevent aggressive GET caching on iOS URLSession
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

    // ✅ Request Interceptor - Add auth token
    axiosInstance.interceptors.request.use(async (config: any) => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        if (__DEV__) console.warn('[API] Token fetch failed:', error);
      }
      return config;
    });

    // ✅ Response Interceptor - Handle auth & errors
    axiosInstance.interceptors.response.use(
      async (response: any) => {
        // Handle 401 Unauthorized - Clear auth (since validateStatus: () => true)
        if (response.status === 401) {
          try {
            await AsyncStorage.multiRemove(['token', 'userId']);
            if (__DEV__) console.log('⚠️ [API] Auth cleared - 401 response');
          } catch (e) {
            if (__DEV__) console.error('[API] Failed to clear storage:', e);
          }
        }

        if (__DEV__ && response.config.url !== '/api/posts') {
          console.log(`${response.status === 401 ? '⚠️' : '✅'} [API] ${response.config.method?.toUpperCase()} ${response.config.url}:`, {
            status: response.status,
            success: response.data?.success,
          });
        }
        return response;
      },
      async (error: any) => {
        // Handle network errors or other non-2xx/4xx if validateStatus was different
        return Promise.reject(error);
      }
    );
  }
  return axiosInstance;
}

// Add request interceptor to include Authorization header - moved inside getAxiosInstance()

// Add response interceptor to handle errors - moved inside getAxiosInstance()

// ✅ SIMPLIFIED & ROBUST API REQUEST HANDLER
async function apiRequestWithRetry(method: string, url: string, data?: any, config?: any, retries: number = 3): Promise<any> {
  const axiosInstance = getAxiosInstance();
  let lastError: any;

  const normalizedMethod = String(method || '').toLowerCase();
  const circuitKey = getCircuitKey(normalizedMethod, url);

  if (isCircuitOpenForKey(circuitKey)) {
    throw makeCircuitOpenError();
  }

  // In-flight GET dedupe (prevents double loads on focus, fast taps, multiple hooks).
  // We only dedupe GET because it should be idempotent.
  const dedupeKey =
    normalizedMethod === 'get'
      ? `get:${url}?p=${stableStringify(config?.params || config || undefined)}&d=${stableStringify(data)}`
      : '';

  if (dedupeKey && inflightGetRequests.has(dedupeKey)) {
    return inflightGetRequests.get(dedupeKey);
  }

  const runner = (async () => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (isCircuitOpenForKey(circuitKey)) {
        throw makeCircuitOpenError();
      }

      const requestConfig: any = { method, url };

      requestConfig.timeout = getTimeoutMs(method, url);

      const canTreatConfigAsParams = (obj: any) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        if ('params' in obj) return false;
        // Avoid treating axios config as params
        if ('headers' in obj) return false;
        if ('timeout' in obj) return false;
        if ('baseURL' in obj) return false;
        if ('signal' in obj) return false;
        return Object.keys(obj).length > 0;
      };

      // ✅ Clean data handling
      if (data) {
        if (method === 'get') {
          requestConfig.params = config?.params || data;
        } else {
          requestConfig.data = data;
        }
      }

      // Back-compat: allow passing query params directly as the config object
      if (method === 'get' && !requestConfig.params && canTreatConfigAsParams(config)) {
        requestConfig.params = config;
      }

      // ✅ Add additional params from config
      if (config?.params) {
        requestConfig.params = { ...requestConfig.params, ...config.params };
      }

      // ✅ Cache Buster — only for real-time endpoints that must never be stale
      if (method === 'get') {
        const needsFreshData = /\/(conversations|messages|notifications|inbox)/i.test(url);
        if (needsFreshData) {
          requestConfig.params = { ...requestConfig.params, _t: Date.now() };
        }
      }

      // Make the request
      const response = await axiosInstance(requestConfig);

      // ✅ Standardized response handling
      if (response.data) {
        // Any response counts as connectivity success for breaker purposes.
        // (Even success:false payloads still mean server is reachable.)
        recordSuccessForKey(circuitKey);
        return response.data;
      }

      recordSuccessForKey(circuitKey);
      return { success: true, data: response.data };

    } catch (error: any) {
      lastError = error;
      const isRetryable = isRetryableError(error);

      // Retry logic for network/server errors (do not increment circuit per attempt)
      if (isRetryable && attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        if (__DEV__) {
          console.log(`🔄 [API] Retry ${attempt}/${retries} for ${method.toUpperCase()} ${url} in ${delay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      recordFinalFailureForKey(circuitKey, error);

      if (isCircuitOpenForKey(circuitKey)) {
        throw makeCircuitOpenError();
      }

      // ✅ Clean error logging
      if (__DEV__) {
        console.error(`❌ [API] ${method.toUpperCase()} ${url} failed:`, {
          status: error.response?.status,
          message: error.message,
          code: error.code,
        });
      }

      throw error;
    }
  }

  throw lastError;
  })();

  if (dedupeKey) {
    inflightGetRequests.set(dedupeKey, runner);
    try {
      return await runner;
    } finally {
      inflightGetRequests.delete(dedupeKey);
    }
  }

  return runner;
}

// Use the retry version for all API calls
async function apiRequest(method: string, url: string, data?: any, config?: any) {
  return apiRequestWithRetry(method, url, data, config);
}

// ✅ COMPLETE API SERVICE - All endpoints available
export const apiService = {
  // Standard HTTP methods
  get: (url: string, config?: any) => apiRequest('get', url, undefined, config),
  post: (url: string, data?: any) => apiRequest('post', url, data),
  put: (url: string, data?: any) => apiRequest('put', url, data),
  patch: (url: string, data?: any) => apiRequest('patch', url, data),
  delete: (url: string, data?: any) => apiRequest('delete', url, data),

  // ✅ Social Media Features
  getPosts: (params?: any) => apiRequest('get', '/posts', undefined, params),
  getRecommendedPosts: (params?: any) => apiRequest('get', '/posts/recommended', undefined, params),
  createPost: (data: any) => apiRequest('post', '/posts', data),
  likePost: (postId: string, userId: string) => apiRequest('post', `/posts/${postId}/like`, { userId }),
  unlikePost: (postId: string, userId: string) => apiRequest('delete', `/posts/${postId}/like`, { userId }),

  // ✅ User Management
  getUser: (userId: string) => apiRequest('get', `/users/${userId}`),
  updateUser: (userId: string, data: any) => apiRequest('patch', `/users/${userId}`, data),
  getUserPosts: (userId: string, params?: any) => apiRequest('get', `/users/${userId}/posts`, undefined, params),

  // ✅ Auth
  loginFirebase: (data: any) => apiRequest('post', '/auth/login-firebase', data),
  registerFirebase: (data: any) => apiRequest('post', '/auth/register-firebase', data),

  // ✅ Media Upload
  uploadMedia: (data: any) => apiRequest('post', '/media/upload', data),

  // ✅ Live Streaming
  getLiveStreams: () => apiRequest('get', '/live-streams'),
  createLiveStream: (data: any) => apiRequest('post', '/live-streams', data),

  // ✅ Chat/Messaging
  getConversations: (params?: any) => apiRequest('get', '/conversations', undefined, params),
  getMessages: (conversationId: string, params?: any) => apiRequest('get', `/conversations/${conversationId}/messages`, undefined, params),
  sendMessage: (conversationId: string, data: any) => apiRequest('post', `/conversations/${conversationId}/messages`, data),

  // ✅ Categories & Locations
  getCategories: () => apiRequest('get', '/categories'),
  getLocationCount: () => apiRequest('get', '/posts/location-count'),
  getLocationSuggestions: (q: string, limit: number = 10) =>
    apiRequest('get', '/locations/suggest', undefined, { q, limit }),
  getLocationMeta: (location: string, viewerId?: string) =>
    apiRequest('get', '/locations/meta', undefined, { location, viewerId }),
  getPostsByLocation: (location: string, skip: number = 0, limit: number = 20, viewerId?: string) =>
    apiRequest('get', '/posts/by-location', undefined, { location, skip, limit, viewerId }),

  // ✅ Status Check
  checkStatus: () => apiRequest('get', '/status'),
  checkHealth: () => apiRequest('get', '/health'),
};

export default apiService;
