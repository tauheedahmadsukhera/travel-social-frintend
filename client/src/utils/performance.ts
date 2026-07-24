/**
 * Performance Optimization Utilities
 * Helps reduce lag, buffering, and improve overall app performance
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Debounce function - prevents rapid firing of functions
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Throttle function - limits function calls to once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Hook: Debounced value - great for search inputs
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Hook: Run heavy operations after interactions complete
 */
export function useAfterInteraction(callback: () => void, deps: any[] = []) {
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      callback();
    });
    
    return () => task.cancel();
  }, deps);
}

/**
 * Hook: Lazy initialization for expensive computations
 */
export function useLazyInit<T>(init: () => T): T {
  const ref = useRef<T | null>(null);
  
  if (ref.current === null) {
    ref.current = init();
  }
  
  return ref.current;
}

/**
 * Hook: Previous value - useful for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

/**
 * Hook: Optimized callback that won't cause re-renders
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef<T>(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  return useCallback(
    ((...args) => callbackRef.current(...args)) as T,
    []
  );
}

/**
 * Memoize expensive function results
 */
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map();
  
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Batch state updates to reduce re-renders
 */
export function useBatchedState<T extends Record<string, any>>(
  initialState: T
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = useState<T>(initialState);
  
  const batchedUpdate = useCallback((updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);
  
  return [state, batchedUpdate];
}

/**
 * Optimized FlatList props for better performance
 */
export const optimizedListProps = {
  removeClippedSubviews: true,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriod: 50,
  windowSize: 10,
  initialNumToRender: 10,
  getItemLayout: undefined as any, // Override with actual layout if items have fixed height
  keyExtractor: (item: any, index: number) => item?.id?.toString() || index.toString(),
};

/**
 * Get optimized FlatList props with custom item height
 */
export function getOptimizedListProps(itemHeight?: number) {
  const props: any = { ...optimizedListProps };
  
  if (itemHeight) {
    props.getItemLayout = (_data: any, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    });
  }
  
  return props;
}

/**
 * Image optimization settings
 */
export const imageOptimization = {
  // Recommended cache policy
  cachePolicy: 'memory-disk' as const,
  
  // Quality settings for different use cases
  quality: {
    thumbnail: 0.3,
    preview: 0.5,
    full: 0.8,
  },
  
  // Recommended sizes
  sizes: {
    thumbnail: { width: 100, height: 100 },
    avatar: { width: 150, height: 150 },
    card: { width: 400, height: 400 },
    full: { width: 1080, height: 1080 },
  },
};

/**
 * Chunk array for batch processing
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process items in batches with delay
 */
export async function processBatched<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number = 5,
  delayMs: number = 100
): Promise<void> {
  const chunks = chunkArray(items, batchSize);
  
  for (const chunk of chunks) {
    await Promise.all(chunk.map(processor));
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

export default {
  debounce,
  throttle,
  memoize,
  optimizedListProps,
  getOptimizedListProps,
  imageOptimization,
  chunkArray,
  processBatched,
};
