import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export async function setCachedData<T>(key: string, data: T, options: { ttl?: number } = {}): Promise<void> {
  const cacheEntry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    ttl: options.ttl ?? 24 * 60 * 60 * 1000,
  };
  await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(cacheEntry));
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(`cache_${key}`);
    if (!cached) {
      return null;
    }
    const cacheEntry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();
    const age = now - cacheEntry.timestamp;
    if (age > cacheEntry.ttl) {
      await AsyncStorage.removeItem(`cache_${key}`);
      return null;
    }
    return cacheEntry.data;
  } catch (error) {
    console.error(`Error reading cache for ${key}:`, error);
    return null;
  }
}

export async function fetchWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: { ttl?: number } = {}
): Promise<T> {
  try {
    const freshData = await fetchFn();
    await setCachedData(key, freshData, options);
    return freshData;
  } catch (error) {
    const cachedData = await getCachedData<T>(key);
    if (cachedData) {
      return cachedData;
    }
    throw error;
  }
}

// (getCachedData is exported above)

/**
 * Hook to detect network connectivity
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const [connectionType, setConnectionType] = useState<string>('unknown');

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected);
      setIsInternetReachable(state.isInternetReachable);
      setConnectionType(state.type);
    });

    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setIsConnected(state.isConnected);
      setIsInternetReachable(state.isInternetReachable);
      setConnectionType(state.type);
    });

    return () => unsubscribe();
  }, []);

  return {
    isConnected,
    isInternetReachable,
    isOnline: isConnected && isInternetReachable,
    connectionType,
  };
}

/**
 * Hook for offline-first data fetching
 */
export function useOfflineFirst<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: { ttl?: number } = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        if (isOnline) {
          // Online: fetch fresh data
          const freshData = await fetchWithCache(key, fetchFn, options);
          setData(freshData);
        } else {
          // Offline: use cached data
          const cachedData = await getCachedData<T>(key);
          
          if (cachedData) {
            setData(cachedData);
          } else {
            throw new Error('No cached data available');
          }
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [key, isOnline]);

  const refresh = async () => {
    try {
      setLoading(true);
      const freshData = await fetchWithCache(key, fetchFn, { ...options, ttl: 0 });
      setData(freshData);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    refresh,
    isOnline,
  };
}

/**
 * Show offline banner
 */
export function useOfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isOnline === false) {
      setShowBanner(true);
    } else if (isOnline === true && showBanner) {
      // Delay hiding banner to show "Back online" message
      const timer = setTimeout(() => setShowBanner(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return {
    showBanner,
    isOnline,
  };
}
