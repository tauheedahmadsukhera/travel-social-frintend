import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import apiService from '@/src/_services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
const MAJOR_CITIES_THRESHOLD = 100000; // Population threshold for major cities

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  } as any),
});

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  timestamp: number;
}

interface PassportTicket {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  visitDate: number;
  imageUrl?: string;
  notes?: string;
}

// Store last known location to avoid duplicate notifications
let lastKnownCity: string | null = null;
let lastKnownCountry: string | null = null;

// Dedupe "passport suggestion" notifications (same place/city/country)
// across frequent location updates and task re-runs.
let lastPassportNotifKey: string | null = null;
let lastPassportNotifAt = 0;

const PASSPORT_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const PASSPORT_NOTIF_STORAGE_KEY = 'passport_last_suggestion_notif_v1';

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
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== 'granted') {
      console.log('❌ Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    if (backgroundStatus !== 'granted') {
      console.log('⚠️ Background location permission denied');
      return false;
    }

    console.log('✅ Location permissions granted');
    return true;
  } catch (error) {
    console.error('❌ Error requesting location permissions:', error);
    return false;
  }
}

/**
 * Request notification permissions
 */
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

/**
 * Reverse geocode coordinates to get city, country, and specific place (POI)
 */
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
      const location = results[0];
      const city = location.city || location.subregion || location.region || 'Unknown City';
      const country = location.country || 'Unknown Country';
      const countryCode = location.isoCountryCode || 'XX';
      const placeFromName = isReadableLocationLabel(location.name) ? String(location.name).trim() : undefined;
      const placeFromStreet = isReadableLocationLabel(location.street) ? String(location.street).trim() : undefined;
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

/**
 * Check if city is a major city (simplified - you can enhance this)
 */
function isMajorCity(city: string, country: string): boolean {
  // List of major cities (you can expand this)
  const majorCities = [
    'London', 'Paris', 'New York', 'Tokyo', 'Dubai', 'Singapore',
    'Hong Kong', 'Los Angeles', 'Chicago', 'San Francisco', 'Seattle',
    'Boston', 'Miami', 'Las Vegas', 'Sydney', 'Melbourne', 'Toronto',
    'Vancouver', 'Montreal', 'Berlin', 'Munich', 'Rome', 'Milan',
    'Barcelona', 'Madrid', 'Amsterdam', 'Brussels', 'Vienna', 'Prague',
    'Budapest', 'Warsaw', 'Moscow', 'Istanbul', 'Athens', 'Lisbon',
    'Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'Dublin', 'Edinburgh',
    'Manchester', 'Birmingham', 'Glasgow', 'Liverpool', 'Leeds',
    'Shanghai', 'Beijing', 'Shenzhen', 'Guangzhou', 'Seoul', 'Bangkok',
    'Kuala Lumpur', 'Jakarta', 'Manila', 'Ho Chi Minh City', 'Hanoi',
    'Delhi', 'Mumbai', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad',
    'Karachi', 'Lahore', 'Islamabad', 'Dhaka', 'Cairo', 'Johannesburg',
    'Cape Town', 'Nairobi', 'Lagos', 'Casablanca', 'Marrakech',
    'São Paulo', 'Rio de Janeiro', 'Buenos Aires', 'Lima', 'Bogotá',
    'Santiago', 'Mexico City', 'Guadalajara', 'Monterrey'
  ];

  return majorCities.some(majorCity =>
    city.toLowerCase().includes(majorCity.toLowerCase()) ||
    majorCity.toLowerCase().includes(city.toLowerCase())
  );
}

/**
 * Send notification for new location
 */
async function sendLocationNotification(city: string, country: string, type: 'city' | 'country'): Promise<void> {
  try {
    const title = type === 'city'
      ? `🌆 New City Visited!`
      : `🌍 New Country Explored!`;

    const body = type === 'city'
      ? `Welcome to ${city}, ${country}! 🎉`
      : `Welcome to ${country}! Your adventure begins! 🗺️`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'passport',
          city,
          country,
          screen: 'passport'
        },
        sound: true,
      },
      trigger: null, // Send immediately
    });

    console.log(`✅ Notification sent: ${title} - ${body}`);
  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}


/**
 * Process location update and prepare suggestions
 */
export async function processLocationUpdate(userId: string, latitude: number, longitude: number): Promise<void> {
  try {
    console.log(`📍 Processing location: ${latitude}, ${longitude}`);

    const locationInfo = await reverseGeocode(latitude, longitude);
    if (!locationInfo) return;

    const { city, country, countryCode, place } = locationInfo;
    console.log(`📍 Location Detected: ${place || 'No Place'}, ${city}, ${country}`);

    // Update last known location in DB via API
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

    // Passport notification rule:
    // - Notify ONLY when the user enters a country they don't have yet.
    // - Do NOT notify for city/place discovery.
    const { getPassportData } = await import('../lib/firebaseHelpers/passport');
    const passportData = await getPassportData(userId);
    const existingStamps = passportData?.stamps || [];

    const hasCountry = existingStamps.some((s: any) => s.type === 'country' && s.name === country);
    if (!hasCountry) {
      const suggestions = [{ type: 'country', name: country, countryCode, lat: latitude, lon: longitude }];
      // Save suggestions locally for the Passport screen banner
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const main = suggestions[0];
      await AsyncStorage.setItem('passport_suggestion', JSON.stringify({
        userId,
        suggestions,
        mainSuggestion: main,
        timestamp: Date.now()
      }));

      // Send push notification
      const welcomeLabel = getBestLocationLabel(main, city, country);

      // Dedupe: do not spam the same notification multiple times
      const now = Date.now();
      const key = buildPassportNotifKey(userId, main, city, country);

      // First: fast in-memory dedupe (same JS runtime)
      if (lastPassportNotifKey === key && now - lastPassportNotifAt < PASSPORT_NOTIF_COOLDOWN_MS) {
        if (__DEV__) console.log('[locationService] Skipping duplicate passport notification (memory cooldown).');
        return;
      }

      // Second: persistent dedupe (across restarts/task relaunch)
      try {
        const storedRaw = await AsyncStorage.getItem(PASSPORT_NOTIF_STORAGE_KEY);
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
        // best-effort only
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🎫 New Country Detected!`,
          body: `Welcome to ${welcomeLabel}! Tap to add your country stamp.`,
          data: { type: 'passport_suggestion', screen: 'passport' }
        },
        trigger: null,
      });

      lastPassportNotifKey = key;
      lastPassportNotifAt = now;
      try {
        await AsyncStorage.setItem(PASSPORT_NOTIF_STORAGE_KEY, JSON.stringify({ key, at: now }));
      } catch {
        // best-effort only
      }
    }

  } catch (error) {
    console.error('❌ Error processing location update:', error);
  }
}

/**
 * Start background location tracking
 */
export async function startLocationTracking(userId: string): Promise<boolean> {
  try {
    // Check permissions
    const hasLocationPermission = await requestLocationPermissions();
    const hasNotificationPermission = await requestNotificationPermissions();

    if (!hasLocationPermission || !hasNotificationPermission) {
      console.log('❌ Missing permissions for location tracking');
      return false;
    }

    // Define background task
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
      if (error) {
        console.error('❌ Background location error:', error);
        return;
      }

      if (data) {
        const { locations } = data;
        const location = locations[0];

        if (location) {
          await processLocationUpdate(
            userId,
            location.coords.latitude,
            location.coords.longitude
          );
        }
      }
    });

    // Start location updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 300000, // 5 minutes
      distanceInterval: 1000, // 1 km
      foregroundService: {
        notificationTitle: 'Travel Tracker',
        notificationBody: 'Tracking your adventures 🌍',
        notificationColor: '#0A3D62',
      },
    });

    console.log('✅ Background location tracking started');
    return true;
  } catch (error) {
    console.error('❌ Error starting location tracking:', error);
    return false;
  }
}

/**
 * Stop background location tracking
 */
export async function stopLocationTracking(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      console.log('✅ Background location tracking stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping location tracking:', error);
  }
}

/**
 * Get current location
 */
export async function getCurrentLocation(): Promise<LocationData | null> {
  try {
    console.log('📍 Starting location detection...');

    // Check if we have permission first
    const { status } = await Location.getForegroundPermissionsAsync();
    console.log('📍 Current permission status:', status);

    if (status !== 'granted') {
      console.log('⚠️ Location permission not granted, requesting...');
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 New permission status:', newStatus);

      if (newStatus !== 'granted') {
        console.log('❌ Location permission denied by user');
        throw new Error('Location permission denied. Please go to Settings > Apps > Trips > Permissions and enable Location.');
      }
    }

    // Check if location services are enabled
    const isEnabled = await Location.hasServicesEnabledAsync();
    console.log('📍 Location services enabled:', isEnabled);

    if (!isEnabled) {
      console.log('❌ Location services are disabled');
      throw new Error('Location services are disabled. Please enable GPS in your device settings.');
    }

    // @ts-ignore
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    console.log('📍 Got coordinates:', location.coords.latitude, location.coords.longitude);

    console.log('📍 Reverse geocoding...');
    const locationInfo = await reverseGeocode(
      location.coords.latitude,
      location.coords.longitude
    );

    if (!locationInfo || !locationInfo.city) {
      console.log('⚠️ Could not determine city from coordinates');
      throw new Error('Could not determine your city. Please make sure you have a good GPS signal.');
    }

    console.log('✅ Location detected:', locationInfo.city, locationInfo.country);

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      city: locationInfo.city,
      country: locationInfo.country,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error('❌ Error getting current location:', error);

    // Provide user-friendly error messages
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

/**
 * Check if user has a passport stamp for this location
 */
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

/**
 * Send smart notification for new passport location
 */
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
