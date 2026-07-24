import { Platform } from 'react-native';
import { db } from '../../config/firebase';
import { doc, setDoc, increment } from 'firebase/firestore';

// Lightweight analytics aggregator: per-day event counters with trimmed payload sample
export async function logAnalyticsEvent(eventName: string, payload?: Record<string, any>): Promise<void> {
  try {
    const now = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    // Create a compact sample payload string (max 1000 chars)
    let samplePayload = '';
    if (payload) {
      try {
        samplePayload = JSON.stringify(payload);
      } catch {}
      if (samplePayload.length > 1000) samplePayload = samplePayload.slice(0, 1000);
    }

    const ref = doc(db as any, 'analytics', 'daily', date, eventName);
    await setDoc(ref, {
      eventName,
      date,
      os: Platform?.OS,
      count: increment(1),
      samplePayload: samplePayload || undefined,
    }, { merge: true });
  } catch (e) {
    // Swallow errors to avoid impacting app flow
    // Optionally, add debug logging in development
  }
}

export async function setAnalyticsUserId(userId: string): Promise<void> {
  // Placeholder: user-id association can be added if needed later
}

export async function setAnalyticsUserProperties(properties: Record<string, any>): Promise<void> {
  // Placeholder: user properties aggregation not required for tests
}
