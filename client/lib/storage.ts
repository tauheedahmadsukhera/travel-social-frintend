import AsyncStorage from '@react-native-async-storage/async-storage';

let mmkv: any = null;
let useMMKV = false;

try {
  const { MMKV } = require('react-native-mmkv');
  mmkv = new MMKV();
  useMMKV = true;
  console.log('[Storage] MMKV loaded successfully');
} catch (e) {
  console.log('[Storage] Falling back to AsyncStorage (MMKV not available or Expo Go shim)');
}

// ─── Sync helpers (Using MMKV if loaded, returning null/noop if falling back) ────

/** Get a string value synchronously */
export function getItemSync(key: string): string | null {
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

// ─── Async API (AsyncStorage drop-in replacement with MMKV acceleration) ──────────────────────────────

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (useMMKV && mmkv) {
      try {
        return mmkv.getString(key) ?? null;
      } catch (e) {
        // Fallback to AsyncStorage
      }
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] getItem error:', key, e);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
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
    // MMKV doesn't support mergeItem directly; fall back to AsyncStorage or handle as get/set
    try {
      await AsyncStorage.mergeItem(key, value);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] mergeItem error:', key, e);
    }
  },

  clear: async (): Promise<void> => {
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
    if (useMMKV && mmkv) {
      try {
        keyValuePairs.forEach(([k, v]) => mmkv.set(k, v));
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.multiSet(keyValuePairs);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiSet error:', e);
    }
  },

  multiGet: async (keys: string[]): Promise<Array<[string, string | null]>> => {
    if (useMMKV && mmkv) {
      try {
        return keys.map(k => [k, mmkv.getString(k) ?? null]);
      } catch (e) {}
    }
    try {
      return (await AsyncStorage.multiGet(keys)) as Array<[string, string | null]>;
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiGet error:', e);
      return keys.map(key => [key, null]);
    }
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    if (useMMKV && mmkv) {
      try {
        keys.forEach(k => mmkv.delete(k));
        return;
      } catch (e) {}
    }
    try {
      await AsyncStorage.multiRemove(keys);
    } catch (e) {
      if (__DEV__) console.warn('[Storage] multiRemove error:', e);
    }
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
