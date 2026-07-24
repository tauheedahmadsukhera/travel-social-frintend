import { Platform } from 'react-native';

export type Trace = {
  end: (metrics?: Record<string, number | string>) => void;
};

/**
 * Lightweight perf trace helper.
 * On web: attempts to use Firebase Performance if available.
 * On native: falls back to console timing (no crash risk).
 */
export async function startTrace(name: string): Promise<Trace | null> {
  const start = Date.now();

  // Web: try firebase/performance, but guard to avoid bundle errors on native.
  if (Platform.OS === 'web') {
    try {
      const { getPerformance, trace } = await import('firebase/performance');
      const { default: firebaseApp } = await import('../../config/firebase');
      const perf = getPerformance(firebaseApp);
      const t = trace(perf, name);
      t.start();
      return {
        end: (metrics) => {
          if (metrics) {
            Object.entries(metrics).forEach(([k, v]) => t.putAttribute(k, String(v)));
          }
          t.stop();
        },
      };
    } catch (err) {
      if (__DEV__) console.log('Perf (web) unavailable, fallback:', err);
    }
  }

  // Native fallback: simple duration logging
  return {
    end: (metrics) => {
      if (__DEV__) {
        const duration = Date.now() - start;
        console.log(`[perf] ${name} ${duration}ms`, metrics || '');
      }
    },
  };
}
