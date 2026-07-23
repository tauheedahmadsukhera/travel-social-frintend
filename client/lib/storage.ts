import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEYS = new Set(['token', 'refreshToken', 'adminToken']);

let mmkv: any = null;
let useMMKV = false;
let SecureStore: any = null;

try {
  const { MMKV } = require('react-native-mmkv');
  mmkv = new MMKV();
  useMMKV = true;
  console.log('[Storage] MMKV loaded successfully');
} catch (e) {
  console.log('[Storage] Falling back to AsyncStorage (MMKV not available or Expo Go shim)');
}

try {
  SecureStore = require('expo-secure-store');
} catch (e) {
  SecureStore = null;
}

async function secureGet(key: string): Promise<string | null> {
  if (SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (_) {}
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(key, value);
      // Migrate off insecure stores
      try { await AsyncStorage.removeItem(key); } catch (_) {}
      if (useMMKV && mmkv) {
        try { mmkv.delete(key); } catch (_) {}
      }
      return;
    } catch (_) {}
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch (_) {}
}

async function secureRemove(key: string): Promise<void> {
  if (SecureStore) {
    try { await SecureStore.deleteItemAsync(key); } catch (_) {}
  }
  try { await AsyncStorage.removeItem(key); } catch (_) {}
  if (useMMKV && mmkv) {
    try { mmkv.delete(key); } catch (_) {}
  }
}

// ─── Sync helpers (Using MMKV if loaded, returning null/noop if falling back) ────

/** Get a string value synchronously */
export function getItemSync(key: string): string | null {
  if (SECURE_KEYS.has(key)) return null; // secure keys are async-only
  if (useMMKV && mmkv) {
    try {
      return mmkv.getString(key) ?? null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/** Set a string value synchronously */
export function setItemSync(key: string, value: string): void {
  if (SECURE_KEYS.has(key)) return;
  if (useMMKV && mmkv) {
    try {
      mmkv.set(key, value);
    } catch (e) {}
  }
}

/** Remove a key synchronously */
export function removeItemSync(key: string): void {
  if (useMMKV && mmkv) {
    try {
      mmkv.delete(key);
    } catch (e) {}
  }
}

/** Get all keys synchronously */
export function getAllKeysSync(): string[] {
  if (useMMKV && mmkv) {
    try {
      return mmkv.getAllKeys();
    } catch (e) {
      return [];
    }
  }
  return [];
}

// ─── Async API (AsyncStorage drop-in replacement with SecureStore for tokens) ─

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (SECURE_KEYS.has(key)) {
      // Prefer SecureStore; fall back to legacy AsyncStorage/MMKV and migrate
      const secure = await secureGet(key);
      if (secure) return secure;
      let legacy: string | null = null;
      if (useMMKV && mmkv) {
        try { legacy = mmkv.getString(key) ?? null; } catch (_) {}
      }
      if (!legacy) {
        try { legacy = await AsyncStorage.getItem(key); } catch (_) {}
      }
      if (legacy) {
        await secureSet(key, legacy);
        return legacy;
      }
      return null;
    }

    if (useMMKV && mmkv) {
      try {
        return mmkv.getString(key) ?? null;
      } catch (e) {}
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] getItem error:', key, e);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (SECURE_KEYS.has(key)) {
      await secureSet(key, value);
      return;
    }
    if (useMMKV && mmkv) {
      try {
        mmkv.set(key, value);
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] setItem error:', key, e);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (SECURE_KEYS.has(key)) {
      await secureRemove(key);
      return;
    }
    if (useMMKV && mmkv) {
      try {
        mmkv.delete(key);
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] removeItem error:', key, e);
    }
  },

  mergeItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.mergeItem(key, value);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] mergeItem error:', key, e);
    }
  },

  clear: async (): Promise<void> => {
    for (const key of SECURE_KEYS) {
      await secureRemove(key);
    }
    if (useMMKV && mmkv) {
      try {
        mmkv.clearAll();
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.clear();
    } catch (e) {
      if (__DEV__) console.warn('[Storage] clear error:', e);
    }
  },

  getAllKeys: async (): Promise<string[]> => {
    if (useMMKV && mmkv) {
      try {
        return mmkv.getAllKeys();
      } catch (e) {}
    }
    try {
      return (await AsyncStorage.getAllKeys()) as string[];
    } catch (e) {
      if (__DEV__) console.warn('[Storage] getAllKeys error:', e);
      return [];
    }
  },

  multiSet: async (keyValuePairs: Array<[string, string]>): Promise<void> => {
    const securePairs = keyValuePairs.filter(([k]) => SECURE_KEYS.has(k));
    const normalPairs = keyValuePairs.filter(([k]) => !SECURE_KEYS.has(k));
    await Promise.all(securePairs.map(([k, v]) => secureSet(k, v)));
    if (normalPairs.length === 0) return;
    if (useMMKV && mmkv) {
      try {
        normalPairs.forEach(([k, v]) => mmkv.set(k, v));
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.multiSet(normalPairs);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiSet error:', e);
    }
  },

  multiGet: async (keys: string[]): Promise<Array<[string, string | null]>> => {
    const results: Array<[string, string | null]> = [];
    for (const key of keys) {
      results.push([key, await storage.getItem(key)]);
    }
    return results;
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    await Promise.all(keys.map((k) => storage.removeItem(k)));
  },

  multiMerge: async (keyValuePairs: Array<[string, string]>): Promise<void> => {
    try {
      await AsyncStorage.multiMerge(keyValuePairs);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiMerge error:', e);
    }
  },
};

export default storage;
export { mmkv };
