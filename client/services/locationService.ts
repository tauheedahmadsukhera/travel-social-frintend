import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import apiService from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeEventSubscription } from 'react-native';

const LOCATION_TASK_NAME = 'background-location-task';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timestamp: number;
}

// Dedupe "passport suggestion" notifications
let lastPassportNotifKey: string | null = null;
let lastPassportNotifAt = 0;

const PASSPORT_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const PASSPORT_NOTIF_STORAGE_KEY = 'passport_last_suggestion_notif_v1';
const FG_GEO_MIN_MS = 120_000; // throttle while app foreground (2 min)

let lastForegroundGeoAt = 0;
let appStateSubscription: NativeEventSubscription | null = null;
let foregroundTrackingUserId: string | null = null;

function buildPassportNotifKey(userId: string, suggestion: any, city: string, country: string): string {
  const t = String(suggestion?.type || 'unknown');
  const name = String(suggestion?.name || '').trim().toLowerCase();
  const parentCity = String(suggestion?.parentCity || city || '').trim().toLowerCase();
  const parentCountry = String(suggestion?.parentCountry || country || '').trim().toLowerCase();
  return `${userId}::${t}::${name}::${parentCity}::${parentCountry}`;
}

const PLUS_CODE_PATTERN = /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}$/i;
const COORDINATE_PATTERN = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

function isReadableLocationLabel(value?: string | null): boolean {
  if (!value) return false;
  const label = String(value).trim();
  if (!label) return false;
  if (PLUS_CODE_PATTERN.test(label)) return false;
  if (COORDINATE_PATTERN.test(label)) return false;
  const lower = label.toLowerCase();
  if (lower === 'unknown' || lower === 'unknown place' || lower === 'n/a') return false;
  return true;
}

function getBestLocationLabel(mainSuggestion?: any, city?: string, country?: string): string {
  const candidates = [
    mainSuggestion?.name,
    mainSuggestion?.place,
    mainSuggestion?.placeName,
    mainSuggestion?.parentCity,
    mainSuggestion?.parentCountry,
    city,
    country,
  ];

  for (const candidate of candidates) {
    if (isReadableLocationLabel(candidate)) {
      return String(candidate).trim();
    }
  }

  return 'this location';
}

/**
 * When-in-use / foreground-only location (no Always / no background plist).
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== 'granted') {
      console.log('❌ Foreground location permission denied');
      return false;
    }

    console.log('✅ Location permission granted (while using app)');
    return true;
  } catch (error) {
    console.error('❌ Error requesting location permissions:', error);
    return false;
  }
}

// Legacy background task keeps TaskManager wiring safe on older installs; not started anymore.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('❌ Background location error:', error);
    return;
  }

  if (data) {
    const locations = Array.isArray((data as any)?.locations) ? (data as any).locations : [];
    const location = locations[0];

    if (location && location.coords) {
      try {
        const AsyncStorageSync = require('@react-native-async-storage/async-storage').default;
        const userId = await AsyncStorageSync.getItem('userId');
        if (userId) {
          await processLocationUpdate(
            userId,
            location.coords.latitude,
            location.coords.longitude
          );
        }
      } catch (err) {
        console.error('❌ Background task processing error:', err);
      }
    }
  }
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      console.log('❌ Notification permission denied');
      return false;
    }

    console.log('✅ Notification permissions granted');
    return true;
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    return false;
  }
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<{
  city: string;
  country: string;
  countryCode: string;
  place?: string;
  street?: string;
} | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });

    if (results && results.length > 0) {
      const loc = results[0];
      const city = loc.city || loc.subregion || loc.region || 'Unknown City';
      const country = loc.country || 'Unknown Country';
      const countryCode = loc.isoCountryCode || 'XX';
      const placeFromName = isReadableLocationLabel(loc.name) ? String(loc.name).trim() : undefined;
      const placeFromStreet = isReadableLocationLabel(loc.street) ? String(loc.street).trim() : undefined;
      const place = placeFromName || placeFromStreet || undefined;
      const street = placeFromStreet;

      return { city, country, countryCode, place, street };
    }

    return null;
  } catch (error) {
    console.error('❌ Error reverse geocoding:', error);
    return null;
  }
}

export async function processLocationUpdate(userId: string, latitude: number, longitude: number): Promise<void> {
  try {
    console.log(`📍 Processing location: ${latitude}, ${longitude}`);

    const locationInfo = await reverseGeocode(latitude, longitude);
    if (!locationInfo) return;

    const { city, country, countryCode, place } = locationInfo;

    await apiService.updateUser(userId, {
      lastKnownLocation: {
        city,
        country,
        countryCode,
        latitude,
        longitude,
        place,
        timestamp: Date.now()
      }
    });

    const { getPassportData } = await import('../lib/firebaseHelpers/passport');
    const passportData = await getPassportData(userId);
    const existingStamps = passportData?.stamps || [];

    const hasCountry = existingStamps.some((s: any) => s.type === 'country' && s.name === country);
    if (!hasCountry) {
      const suggestions = [{ type: 'country', name: country, countryCode, lat: latitude, lon: longitude }];
      const AsyncStorageMod = (await import('@react-native-async-storage/async-storage')).default;
      const main = suggestions[0];
      await AsyncStorageMod.setItem('passport_suggestion', JSON.stringify({
        userId,
        suggestions,
        mainSuggestion: main,
        timestamp: Date.now()
      }));

      const welcomeLabel = getBestLocationLabel(main, city, country);
      const now = Date.now();
      const key = buildPassportNotifKey(userId, main, city, country);

      if (lastPassportNotifKey === key && now - lastPassportNotifAt < PASSPORT_NOTIF_COOLDOWN_MS) {
        if (__DEV__) console.log('[locationService] Skipping duplicate passport notification (memory cooldown).');
        return;
      }

      try {
        const storedRaw = await AsyncStorageMod.getItem(PASSPORT_NOTIF_STORAGE_KEY);
        if (storedRaw) {
          const stored = JSON.parse(storedRaw);
          const storedKey = String(stored?.key || '');
          const storedAt = Number(stored?.at || 0);
          if (storedKey === key && Number.isFinite(storedAt) && now - storedAt < PASSPORT_NOTIF_COOLDOWN_MS) {
            if (__DEV__) console.log('[locationService] Skipping duplicate passport notification (storage cooldown).');
            lastPassportNotifKey = key;
            lastPassportNotifAt = now;
            return;
          }
        }
      } catch {
        // best-effort
      }

      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      if (notifStatus === 'granted') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🎫 New Country Detected!`,
            body: `Welcome to ${welcomeLabel}! Tap to add your country stamp.`,
            data: { type: 'passport_suggestion', screen: 'passport' }
          },
          trigger: null,
        });
      }

      lastPassportNotifKey = key;
      lastPassportNotifAt = now;
      try {
        await AsyncStorageMod.setItem(PASSPORT_NOTIF_STORAGE_KEY, JSON.stringify({ key, at: now }));
      } catch {
        // best-effort
      }
    }

  } catch (error) {
    console.error('❌ Error processing location update:', error);
  }
}

async function maybeRunForegroundPassportCheck(activeUserId: string): Promise<void> {
  try {
    if (AppState.currentState !== 'active') return;
    const now = Date.now();
    if (now - lastForegroundGeoAt < FG_GEO_MIN_MS) return;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    lastForegroundGeoAt = now;

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await processLocationUpdate(activeUserId, pos.coords.latitude, pos.coords.longitude);
  } catch {
    /* timeout / gps skip */
  }
}

function ensureForegroundPassportHooks(userId: string): void {
  if (foregroundTrackingUserId === userId && appStateSubscription) return;

  teardownForegroundPassportHooks();
  foregroundTrackingUserId = userId;

  appStateSubscription = AppState.addEventListener('change', (next) => {
    if (next === 'active' && foregroundTrackingUserId) {
      void maybeRunForegroundPassportCheck(foregroundTrackingUserId);
    }
  });

  void maybeRunForegroundPassportCheck(userId);
}

function teardownForegroundPassportHooks(): void {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  foregroundTrackingUserId = null;
}

/**
 * Foreground passport checks only (opens Home while app visible). No background tracking.
 */
export async function startLocationTracking(userId: string): Promise<boolean> {
  try {
    const hasLoc = await requestLocationPermissions();
    if (!hasLoc) {
      if (__DEV__) console.log('❌ [Location] Foreground permission denied');
      return false;
    }

    // Best-effort notifications (passport alerts when granted)
    void requestNotificationPermissions();

    ensureForegroundPassportHooks(userId);
    console.log('✅ Foreground passport location checks enabled');
    return true;
  } catch (error: any) {
    console.error('❌ Error starting location tracking:', error);
    return false;
  }
}

export async function stopLocationTracking(): Promise<void> {
  teardownForegroundPassportHooks();

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // ignore
  }
}

export async function getCurrentLocation(): Promise<LocationData | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();

    if (status !== 'granted') {
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();

      if (newStatus !== 'granted') {
        throw new Error('Location permission denied. Please go to Settings > Apps > Trips > Permissions and enable Location.');
      }
    }

    const isEnabled = await Location.hasServicesEnabledAsync();
    if (!isEnabled) {
      throw new Error('Location services are disabled. Please enable GPS in your device settings.');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const locationInfo = await reverseGeocode(
      location.coords.latitude,
      location.coords.longitude
    );

    if (!locationInfo || !locationInfo.city) {
      throw new Error('Could not determine your city. Please make sure you have a good GPS signal.');
    }

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      city: locationInfo.city,
      country: locationInfo.country,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('❌ Error getting current location:', error);

    if (error.message?.includes('permission') || error.code === 'E_LOCATION_UNAUTHORIZED') {
      throw new Error('Location permission denied. Please go to Settings > Apps > Trips > Permissions and enable Location.');
    } else if (error.message?.includes('disabled') || error.code === 'E_LOCATION_SERVICES_DISABLED') {
      throw new Error('Location services are disabled. Please enable GPS in your device settings.');
    } else if (error.message?.includes('timeout') || error.code === 'E_LOCATION_TIMEOUT') {
      throw new Error('Location request timed out. Please make sure you are outdoors or near a window for better GPS signal.');
    } else if (error.message?.includes('unavailable')) {
      throw new Error('Location is temporarily unavailable. Please try again in a moment.');
    } else {
      throw new Error(error.message || 'Could not get your location. Please check your GPS settings and try again.');
    }
  }
}

export async function hasPassportStamp(userId: string, name: string, type: 'country' | 'city' | 'place'): Promise<boolean> {
  try {
    const { getPassportData } = await import('../lib/firebaseHelpers/passport');
    const passportData = await getPassportData(userId);
    const stamps = passportData?.stamps || [];

    return stamps.some((s: any) =>
      s.type === type &&
      s.name.toLowerCase() === name.toLowerCase()
    );
  } catch (error) {
    console.error('❌ Error checking passport stamps:', error);
    return false;
  }
}

export async function sendPassportNotification(userId: string, mainSuggestion: any): Promise<void> {
  try {
    const welcomeLabel = getBestLocationLabel(mainSuggestion);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎫 New ${mainSuggestion.type === 'place' ? 'Place' : mainSuggestion.type === 'city' ? 'City' : 'Country'} Detected!`,
        body: `Welcome to ${welcomeLabel}! Click to add this to your stamps.`,
        data: { type: 'passport_suggestion', screen: 'passport' }
      },
      trigger: null,
    });
  } catch (error) {
    console.error('❌ Error sending passport notification:', error);
  }
}
