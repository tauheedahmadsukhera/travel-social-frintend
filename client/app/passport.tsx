import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@/lib/storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hapticLight } from '../lib/haptics';
import { addPassportStamp, deletePassportStamp, getPassportData, Stamp } from '../lib/firebaseHelpers/passport';
import { BACKEND_URL } from '../lib/api';
import { reverseGeocode } from '../services/locationService';
import * as Location from 'expo-location';
import CountryFlag from '@/src/_components/CountryFlag';
import { mapService } from '../services';
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';

const { width } = Dimensions.get('window');
const STAMP_SIZE = Math.min(220, width - 72);

import { PassportStamp } from '@/src/_components/PassportStamp';
import { toDate, formatDisplayDate, getRelativeTime } from '../lib/utils/date';
import { StampDeleteModal } from '@/src/_components/passport/StampDeleteModal';
import { StampSearchModal } from '@/src/_components/passport/StampSearchModal';
import { LocationPickerModal } from '@/src/_components/passport/LocationPickerModal';

import {
  normalizeCountryName,
  getCountryFromAddress,
  PLUS_CODE_PATTERN,
  COORDINATE_PATTERN,
  isReadableLocationLabel,
  getSuggestionLocationLabel,
} from '@/src/utils/passportUtils';

const STAMP_W = width - 48;
const STAMP_H = STAMP_W * 0.76;
const CX = STAMP_W / 2;
const CY = STAMP_H / 2;
const RX = STAMP_W * 0.46;
const RY = STAMP_H * 0.44;

type FilterTab = 'All' | 'Countries' | 'Cities' | 'Places';

// ── Components ──────────────────────────────────────────────────────────────

// PassportStamp component moved to separate file for optimization

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PassportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const userId = (params.user as string) || currentUserId;
  const isOwner = !!(currentUserId && userId && currentUserId === userId);
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [deleteStamp, setDeleteStamp] = useState<Stamp | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [suggestion, setSuggestion] = useState<any>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [stampSearchVisible, setStampSearchVisible] = useState(false);
  const [stampSearchQuery, setStampSearchQuery] = useState('');
  const [showTravelHint, setShowTravelHint] = useState(true);

  // Location modal state
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastLocationCoords, setLastLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  /** Current GPS area (for city stamp in manual modal). */
  const [areaGeo, setAreaGeo] = useState<{ city: string; country: string; countryCode: string } | null>(null);
  /** Manual modal: add city stamp from reverse-geocoded current location. */
  const [includeCityStamp, setIncludeCityStamp] = useState(false);
  /** Nearby venues radius (~200m). */
  const NEARBY_PLACES_MAX_KM = 0.2;

  // Cache key for nearby places
  const getLocationCacheKey = (lat: number, lng: number) => {
    const roundedLat = Math.round(lat * 10000) / 10000; // Round to 0.0001 precision
    const roundedLng = Math.round(lng * 10000) / 10000;
    return `nearby_places_v3_${roundedLat}_${roundedLng}`;
  };

  // When a country is selected, we filter by that country's children
  const handleBack = () => {
    hapticLight();
    if (selectedCountry) {
      setSelectedCountry(null);
      setActiveFilter('All');
    } else if (router.canGoBack()) {
      safeRouterBack();
    } else {
      router.replace('/(tabs)/profile' as any);
    }
  };

  useEffect(() => {
    const init = async () => {
      const storedUid = await AsyncStorage.getItem('userId');
      setCurrentUserId(storedUid);

      // Check for GPS suggestions
      const suggestionStr = await AsyncStorage.getItem('passport_suggestion');
      if (suggestionStr) {
        const sugg = JSON.parse(suggestionStr);
        // Only show if it's recent (last 30 mins)
        if (Date.now() - sugg.timestamp < 30 * 60 * 1000) {
          setSuggestion(sugg);
        }
      }
 
      // Check if location permission is already granted
      try {
        const { getForegroundPermissionsAsync } = await import('expo-location');
        const { status } = await getForegroundPermissionsAsync();
        if (status === 'granted') {
          setShowTravelHint(false);
        }
      } catch (e) {}
    };
    init();

    // Re-check permission when app comes back to foreground (e.g. after Settings)
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        try {
          const { getForegroundPermissionsAsync } = await import('expo-location');
          const { status } = await getForegroundPermissionsAsync();
          if (status === 'granted') {
            setShowTravelHint(false);
          }
        } catch (e) {}
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (userId) loadPassportData();
  }, [userId]);

  const PASSPORT_CACHE_KEY = useMemo(() => `passport_v2_${String(userId || 'unknown')}`, [userId]);

  // Cache-first bootstrap: show cached passport instantly (offline-friendly).
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const cached = await getCachedData<any>(PASSPORT_CACHE_KEY);
        const cachedStamps = Array.isArray(cached?.stamps) ? cached.stamps : null;
        if (cachedStamps && cachedStamps.length > 0) {
          setStamps(cachedStamps);
          setLoading(false);
        }
      } catch { }
    })();
  }, [PASSPORT_CACHE_KEY, userId]);

  const loadPassportData = async () => {
    try {
      setLoading(true);
      if (!userId) return;
      // Offline: don’t block UI if we already have content.
      if (!isOnline && stamps.length > 0) {
        setLoading(false);
        return;
      }
      const data = await getPassportData(userId);
      setStamps(data.stamps || []);
      try {
        await setCachedData(PASSPORT_CACHE_KEY, { stamps: data.stamps || [] }, { ttl: 24 * 60 * 60 * 1000 });
      } catch { }
    } catch (err) {
      console.error('Error loading passport:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFromBanner = async () => {
    if (!suggestion || isAdding || !userId) return;

    try {
      setIsAdding(true);
      // Notification / banner flow: only country stamp (not city + place).
      const countryItems = (suggestion.suggestions || []).filter((item: any) => item?.type === 'country');
      if (countryItems.length === 0) {
        Alert.alert(
          'Country already on passport',
          'Use “Add a stamp” below to add a city stamp, a place, or both.'
        );
        return;
      }
      for (const item of countryItems) {
        await addPassportStamp(userId, item);
      }

      setSuggestion(null);
      await AsyncStorage.removeItem('passport_suggestion');
      await loadPassportData();
    } catch (err) {
      Alert.alert('Error', 'Failed to add stamp.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleOpenLocationPicker = async () => {
    hapticLight();
    setShowLocationModal(true);
    setSearchQuery('');
    setSelectedLocation(null);
    setIncludeCityStamp(false);
    setAreaGeo(null);

    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need location access to show nearby places.');
        setShowLocationModal(false);
        return;
      }

      // Get current location
      setLocationLoading(true);
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = location.coords;

      setLastLocationCoords({ lat: latitude, lng: longitude });
      try {
        const g = await reverseGeocode(latitude, longitude);
        if (g?.city && g?.country) {
          setAreaGeo({ city: g.city, country: g.country, countryCode: g.countryCode || 'XX' });
        } else {
          setAreaGeo(null);
        }
      } catch {
        setAreaGeo(null);
      }

      const cacheKey = getLocationCacheKey(latitude, longitude);

      // Try to get cached data
      const cachedDataStr = await AsyncStorage.getItem(cacheKey);
      const cachedData = cachedDataStr ? JSON.parse(cachedDataStr) : null;
      const cacheTimestamp = cachedData?.timestamp || 0;
      const isCacheValid = Date.now() - cacheTimestamp < 10 * 60 * 1000; // Cache valid for 10 mins

      // Show cached data immediately if available
      if (cachedData && isCacheValid) {
        setNearbyPlaces(cachedData.places || []);
        setLocationLoading(false);
      } else {
        setNearbyPlaces([]); // Clear old data
        // Keep loading spinner visible while fetching
      }

      // Fetch fresh data in background or if no cache
      (async () => {
        try {
          const rawPlaces = await mapService.getNearbyPlaces(latitude, longitude, Math.round(NEARBY_PLACES_MAX_KM * 1100));

          const validPlaces = [];
          for (const place of rawPlaces || []) {
            if (place.placeName && !place.placeName.match(/^[A-Z0-9]{4}\+[A-Z0-9]{2,}$/)) {
              const dist = await mapService.calculateDistance({ latitude, longitude } as any, place);
              if (dist <= NEARBY_PLACES_MAX_KM) validPlaces.push(place);
            }
          }

          // Cache the results
          await AsyncStorage.setItem(cacheKey, JSON.stringify({
            places: validPlaces,
            timestamp: Date.now(),
          }));

          setNearbyPlaces(validPlaces);
          setLocationLoading(false);
        } catch (error) {
          console.error('Error fetching nearby places:', error);
          if (!cachedData) {
            Alert.alert('Error', 'Failed to fetch nearby locations.');
            setShowLocationModal(false);
          }
          setLocationLoading(false);
        }
      })();
    } catch (error) {
      console.error('Error opening location picker:', error);
      Alert.alert('Error', 'Failed to access location.');
      setShowLocationModal(false);
      setLocationLoading(false);
    }
  };

  const handleAddStamp = async () => {
    if (!userId) return;
    const wantCity =
      includeCityStamp &&
      areaGeo &&
      isReadableLocationLabel(areaGeo.city) &&
      normalizeCountryName(areaGeo.city) !== 'unknown city';
    const wantPlace = !!selectedLocation;

    if (!wantCity && !wantPlace) return;

    try {
      setIsAdding(true);

      if (wantCity && areaGeo && lastLocationCoords) {
        await addPassportStamp(userId, {
          type: 'city',
          name: areaGeo.city,
          countryCode: areaGeo.countryCode,
          parentCountry: areaGeo.country,
          lat: lastLocationCoords.lat,
          lon: lastLocationCoords.lng,
        });
      }

      if (wantPlace && selectedLocation) {
        let countryName = 'Unknown';
        let countryCode: string | undefined;
        let parentCity: string | undefined;
        try {
          const geoLocation = await reverseGeocode(selectedLocation.latitude, selectedLocation.longitude);
          countryName = geoLocation?.country || countryName;
          countryCode = geoLocation?.countryCode;
          parentCity = geoLocation?.city;
        } catch (e) {
          console.warn('Could not get country from geocoding:', e);
        }

        if (normalizeCountryName(countryName) === 'unknown') {
          const countryFromAddress = getCountryFromAddress(selectedLocation?.address);
          if (countryFromAddress) {
            countryName = countryFromAddress;
          }
        }

        if (!parentCity && areaGeo?.city) {
          parentCity = areaGeo.city;
        }

        const selectedName = selectedLocation.placeName || selectedLocation.name || '';
        const isCountrySelection = normalizeCountryName(selectedName) === normalizeCountryName(countryName);

        const stampData = {
          name: selectedName,
          type: (isCountrySelection ? 'country' : 'place') as 'country' | 'place',
          countryCode,
          lat: selectedLocation.latitude,
          lon: selectedLocation.longitude,
          parentCountry: isCountrySelection ? undefined : countryName,
          ...(isCountrySelection ? {} : { parentCity }),
        };

        await addPassportStamp(userId, stampData);
      }

      setShowLocationModal(false);
      setSelectedLocation(null);
      setIncludeCityStamp(false);
      setAreaGeo(null);
      setNearbyPlaces([]);
      await loadPassportData();
    } catch (error) {
      console.error('Error adding stamp:', error);
      Alert.alert('Error', 'Failed to add stamp.');
    } finally {
      setIsAdding(false);
    }
  };

  // Filter nearby places by search query (memoized to avoid work on every keystroke/render)
  const filteredPlaces = useMemo(() => {
    const q = String(searchQuery || '').toLowerCase().trim();
    const list = Array.isArray(nearbyPlaces) ? nearbyPlaces : [];
    if (!q) return list;
    return list.filter((place) => {
      const name = String(place?.placeName || '').toLowerCase();
      const addr = String(place?.address || '').toLowerCase();
      return name.includes(q) || addr.includes(q);
    });
  }, [nearbyPlaces, searchQuery]);

  const canSubmitManualStamps =
    !!userId &&
    ((includeCityStamp &&
      areaGeo &&
      isReadableLocationLabel(areaGeo.city) &&
      normalizeCountryName(areaGeo.city) !== 'unknown city') ||
      !!selectedLocation);

  const getFilteredStamps = () => {
    let list = stamps;
    if (selectedCountry) {
      const selectedCountryKey = normalizeCountryName(selectedCountry);
      const selectedCountryStamp = stamps.find(
        s => s.type === 'country' && normalizeCountryName(s.name) === selectedCountryKey
      );
      const selectedCountryCode = normalizeCountryName(selectedCountryStamp?.countryCode);

      list = list.filter(s => {
        const parentCountryKey = normalizeCountryName(s.parentCountry);
        const childCountryCode = normalizeCountryName(s.countryCode);

        if (parentCountryKey && parentCountryKey === selectedCountryKey) return true;
        if (selectedCountryCode && childCountryCode && childCountryCode === selectedCountryCode) return true;
        return false;
      });
      // Filter by type first
      if (activeFilter === 'Cities') {
        list = list.filter(s => s.type === 'city');
      } else if (activeFilter === 'Places') {
        list = list.filter(s => s.type === 'place');
      }
      
      // Group by name and add count for duplicates
      const grouped: { [key: string]: any } = {};
      list.forEach(stamp => {
        if (!grouped[stamp.name]) {
          grouped[stamp.name] = { ...stamp, count: 1 };
        } else {
          grouped[stamp.name].count += 1;
        }
      });
      return Object.values(grouped);
    }
    
    if (activeFilter === 'Countries') return list.filter(s => s.type === 'country');
    if (activeFilter === 'Cities') return list.filter(s => s.type === 'city');
    if (activeFilter === 'Places') return list.filter(s => s.type === 'place');
    return list;
  };

  const filtered = getFilteredStamps();
  const countryNameSet = new Set(
    stamps
      .filter(s => s.type === 'country')
      .map(s => normalizeCountryName(s.name))
      .filter(Boolean)
  );

  const getDisplayType = (stamp: Stamp): Stamp['type'] => {
    if (stamp.type === 'place') {
      const nameKey = normalizeCountryName(stamp.name);
      const parentKey = normalizeCountryName(stamp.parentCountry);
      if ((nameKey && countryNameSet.has(nameKey)) || (nameKey && parentKey && nameKey === parentKey)) {
        return 'country';
      }
    }
    return stamp.type;
  };

  const normalizeSearch = (value: any) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const stampMatchesQuery = (stamp: Stamp, q: string) => {
    if (!q) return true;
    const text = [
      stamp.name,
      stamp.type,
      stamp.parentCity,
      stamp.parentCountry,
      stamp.countryCode,
    ]
      .map((x) => normalizeSearch(x))
      .filter(Boolean)
      .join(' ');
    return text.includes(q);
  };

  const stampSearchResults = useMemo(() => {
    const q = normalizeSearch(stampSearchQuery);
    if (!q) return [];
    // Search across all stamps (ignores current filter tabs so user can find anything quickly).
    const list = Array.isArray(stamps) ? stamps : [];
    const hits = list.filter((s) => stampMatchesQuery(s, q));
    // Prefer newest first
    hits.sort((a, b) => Number(new Date(b.createdAt).getTime()) - Number(new Date(a.createdAt).getTime()));
    return hits.slice(0, 100);
  }, [stamps, stampSearchQuery]);

  const openStampSearch = () => {
    hapticLight();
    setStampSearchVisible(true);
  };

  const closeStampSearch = () => {
    setStampSearchVisible(false);
    Keyboard.dismiss();
  };

  const handlePickStampFromSearch = (stamp: Stamp) => {
    // Reset to main list context then take the most sensible action.
    setStampSearchVisible(false);
    setStampSearchQuery('');
    if (stamp.type === 'country') {
      setSelectedCountry(stamp.name);
      setActiveFilter('All');
      return;
    }
    // For city/place: clear country filter and show the relevant tab.
    setSelectedCountry(null);
    setActiveFilter(stamp.type === 'city' ? 'Cities' : stamp.type === 'place' ? 'Places' : 'All');
  };

  const openDeleteSheet = (stamp: Stamp) => {
    if (!isOwner) return;
    hapticLight();
    setDeleteStamp(stamp);
    setDeleteVisible(true);
  };

  const closeDeleteSheet = () => {
    if (deleting) return;
    setDeleteVisible(false);
    setDeleteStamp(null);
  };

  const handleConfirmDeleteStamp = async () => {
    if (!isOwner) return;
    if (!userId) return;
    const target = deleteStamp;
    if (!target?._id) return;

    try {
      setDeleting(true);
      const stampId = String(target._id);
      const res = await deletePassportStamp(String(userId), stampId) as any;
      const ok = res?.success !== false;
      if (!ok) {
        Alert.alert('Could not delete', res?.error || 'Failed to delete stamp. Please try again.');
        return;
      }

      setStamps((prev) => prev.filter((s) => String(s?._id) !== stampId));
      try {
        const cached = await getCachedData<any>(PASSPORT_CACHE_KEY);
        const cachedStamps = Array.isArray(cached?.stamps) ? cached.stamps : [];
        const next = cachedStamps.filter((s: any) => String(s?._id) !== stampId);
        await setCachedData(PASSPORT_CACHE_KEY, { stamps: next }, { ttl: 24 * 60 * 60 * 1000 });
      } catch {}

      closeDeleteSheet();
    } catch (e: any) {
      console.error('[Passport] delete stamp error:', e);
      Alert.alert('Error', 'Failed to delete stamp. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {showBanner && stamps.length > 0 && (
        <OfflineBanner text="You’re offline — showing cached passport" />
      )}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
          <Feather name="arrow-left" size={20} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerSubtitle}>{selectedCountry || ''}</Text>
          <Text style={styles.headerTitle}>{selectedCountry ? selectedCountry : (isOwner ? 'My stamps' : 'Stamps')}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>

          <TouchableOpacity style={styles.headerBtn} onPress={openStampSearch}>
            <Feather name="search" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Verification Info Banner */}
        <View style={styles.verifiedBanner}>
          <View style={styles.verifiedRow}>
            <View style={styles.checkCircle}>
              <Feather name="check" size={10} color="#fff" />
            </View>
            <Text style={styles.verifiedText}>All locations are 100% verified</Text>
          </View>
          <View style={[styles.verifiedRow, { marginTop: 6 }]}>
            <Feather name="shield" size={12} color="#000" style={{ marginRight: 6 }} />
            <Text style={styles.verifiedText}>Our system detects VPNs so no cheating</Text>
          </View>
        </View>

        {isOwner && !selectedCountry && showTravelHint && (
          <View style={styles.travelHintBox} accessibilityLabel="Background travel detection for passport stamps">
            <Feather name="navigation" size={14} color="#FF8D00" style={{ marginRight: 8, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.travelHintText}>
                Turn on location access while using Trips and optional notifications to unlock automatic travel stamps whenever you arrive in a new country while the app is open. After signing in, just open the Home screen once so we can refresh your location and keep your journey up to date.
              </Text>
              <TouchableOpacity 
                style={styles.enableLocBtn}
                onPress={async () => {
                  hapticLight();
                  const { requestLocationPermissions } = await import('../services/locationService');
                  const granted = await requestLocationPermissions();
                  if (granted) {
                    setShowTravelHint(false);
                  } else {
                    Linking.openSettings();
                  }
                }}
              >
                <Text style={styles.enableLocBtnText}>Enable location services</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              onPress={() => { hapticLight(); setShowTravelHint(false); }}
              style={{ marginLeft: 8, padding: 4 }}
            >
              <Ionicons name="close" size={18} color="#FF8D00" />
            </TouchableOpacity>
          </View>
        )}

        {/* Discovery / Suggestion Banner */}
        {isOwner && suggestion && !selectedCountry && (
          <TouchableOpacity
            style={styles.suggestionBox}
            onPress={handleAddFromBanner}
            activeOpacity={0.9}
          >
            <View style={styles.suggestionInner}>
              <View style={[styles.suggestionLeft, { flex: 1 }]}>
                <View style={styles.stampIconContainer}>
                  <Feather name="map" size={20} color="#000" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={2}>
                    Welcome to {getSuggestionLocationLabel(suggestion)}!
                  </Text>
                  <Text style={styles.suggestionSub}>
                    Adds your country stamp only — use “Add a stamp” for city or place.
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#CCC" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>
        )}

        {/* Tabs */}
        {!loading && (
          <View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.tabBar}
              contentContainerStyle={styles.tabBarContent}
            >
              {(['All', 'Countries', 'Cities', 'Places'] as FilterTab[])
                .filter(tab => !selectedCountry || tab !== 'Countries')
                .map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabItem, activeFilter === tab && styles.tabItemActive]}
                  onPress={() => setActiveFilter(tab)}
                >
                  <Text style={[styles.tabText, activeFilter === tab && styles.tabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Stamps Grid */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 50 }} color="#FF8D00" />
        ) : (
          <View style={styles.stampsGrid}>
            {filtered.map((stamp, i) => {
              const displayType = getDisplayType(stamp);
              const displayStamp: Stamp = { ...stamp, type: displayType };

              return (
              <TouchableOpacity 
                key={stamp._id || stamp.id || `stamp-${i}`} 
                style={styles.stampOuter}
                onPress={() => {
                  if (displayType === 'country') setSelectedCountry(stamp.name);
                }}
                onLongPress={() => openDeleteSheet(stamp)}
                delayLongPress={350}
              >
                <>
                  <PassportStamp 
                    stamp={displayStamp} 
                    type="circular"
                    size={STAMP_SIZE}
                  />
                  
                  {/* Metadata Pills */}
                  <View style={[styles.pillsRow, selectedCountry && { marginTop: 15 }]}>
                    <View style={styles.pill}>
                      <Feather name="map-pin" size={10} color="#666" />
                      <Text style={styles.pillText}>{stamp.parentCountry || stamp.name}</Text>
                    </View>
                    <View style={styles.pill}>
                      <Feather name="calendar" size={10} color="#000" />
                      <Text style={styles.pillText}>
                        {formatDisplayDate(stamp.createdAt, 'dd MMM yyyy')}
                      </Text>
                    </View>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{stamp.postCount || 0} posts</Text>
                    </View>
                  </View>
                </>
              </TouchableOpacity>
            )})}

            {filtered.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="map" size={40} color="#ddd" />
                <Text style={styles.emptyText}>No {(activeFilter || 'All').toLowerCase()} stamps yet</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Stamps search modal */}
      <StampSearchModal
        visible={stampSearchVisible}
        onClose={closeStampSearch}
        searchQuery={stampSearchQuery}
        setSearchQuery={setStampSearchQuery}
        searchResults={stampSearchResults as any}
        onPickStamp={handlePickStampFromSearch as any}
      />

      {/* Delete stamp sheet (owner only) */}
      <StampDeleteModal
        visible={deleteVisible}
        onClose={closeDeleteSheet}
        onDelete={handleConfirmDeleteStamp}
        deleting={deleting}
        stampName={deleteStamp?.name}
      />

      {/* Manual Add FAB - Redesigned to Pill Center */}
      {isOwner && (
        <View style={styles.fabContainer} pointerEvents="box-none">
          <TouchableOpacity 
            style={styles.fabPillShadow} 
            onPress={handleOpenLocationPicker}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FBBC04', '#FF8D00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fabPillGradient}
            >
              <Ionicons name="locate" size={18} color="#fff" />
              <Text style={styles.fabText}>Add a stamp</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Location Selection Modal - Bottom Sheet */}
      <LocationPickerModal
        visible={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        canSubmitManualStamps={canSubmitManualStamps}
        onAddStamp={handleAddStamp}
        isAdding={isAdding}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        locationLoading={locationLoading}
        nearbyPlaces={nearbyPlaces}
        areaGeo={areaGeo}
        includeCityStamp={includeCityStamp}
        setIncludeCityStamp={setIncludeCityStamp}
        filteredPlaces={filteredPlaces}
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center',
  },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerSubtitle: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },

  verifiedBanner: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'center' },
  checkCircle: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  verifiedText: { fontSize: 13, color: '#666', fontWeight: '500' },

  travelHintBox: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F0F6FA',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  travelHintText: {
    color: '#FF8D00',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  enableLocBtn: {
    marginTop: 8,
    backgroundColor: '#FF8D00',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  enableLocBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  suggestionBox: { marginHorizontal: 20, marginTop: 15, borderRadius: 16, overflow: 'hidden' },
  suggestionGradient: { padding: 16, backgroundColor: '#F8F9FA', borderRadius: 16 },
  suggestionContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionSub: { color: '#666', fontSize: 11, fontWeight: '500', lineHeight: 15, marginTop: 4 },
  suggestionTitle: { color: '#000', fontSize: 16, fontWeight: '700' },
  addCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    justifyContent: 'space-between',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 18, fontWeight: '800', color: '#111' },
  statLab: { fontSize: 12, color: '#888', marginTop: 2 },

  tabBar: {
    marginTop: 25,
    marginBottom: 15,
  },
  tabBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  tabItem: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#eee',
  },
  tabItemActive: { 
    backgroundColor: 'rgba(255, 141, 0, 0.08)', 
    borderColor: '#FF8D00',
    borderWidth: 1.5,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextActive: { color: '#FF8D00' },

  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  deleteSheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  deleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3b30',
  },
  deleteTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },
  deleteSub: {
    marginTop: 3,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  deleteBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  deleteCancelBtn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  deleteCancelText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 15,
  },

  stampsGrid: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  stampsList: {
    paddingHorizontal: 20,
  },
  stampOuter: {
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
  },
  stampListItem: {
    width: '100%',
    marginBottom: 40,
    alignItems: 'center',
  },
  stampCountryListItem: {
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listStampCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  listItemText: {
    flex: 1,
  },
  listItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  listItemType: {
    fontSize: 12,
    color: '#FF8D00',
    fontWeight: '600',
    marginBottom: 4,
  },
  listItemDate: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  countBadge: {
    backgroundColor: '#FF8D00',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  stampCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  stampOval: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: '#f9f9f9',
    borderRadius: 100,
  },
  counterBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    elevation: 3,
  },
  counterText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
    gap: 8,
    marginTop: 10,
    marginLeft: 0,
    alignSelf: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  pillText: { fontSize: 13, color: '#333', fontWeight: '500' },

  suggestionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stampIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  emptyState: { alignItems: 'center', width: '100%', marginTop: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 10 },

  fabContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPillShadow: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderRadius: 30,
  },
  fabPillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 10,
  },
  fabText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalCloseBtn: {
    paddingVertical: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: '#FF8D00',
    fontWeight: '600',
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  modalAddBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalAddText: {
    fontSize: 16,
    color: '#FF8D00',
    fontWeight: '600',
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f7fa',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    padding: 0,
  },
  modalLoadingContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLoadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  modalEmptyContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  modalEmptyInline: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLocationsList: {
    paddingHorizontal: 20,
    maxHeight: 400,
  },
  cityStampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  cityStampRowSelected: {
    backgroundColor: '#f0f4f8',
    borderColor: '#1E63D7',
  },
  cityStampRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cityStampRowTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E63D7',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cityStampRowName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginTop: 2,
  },
  cityStampRowHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  modallocationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 0,
    marginBottom: 0,
    flexShrink: 1,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#eee',
  },
  locationItemSelected: {
    backgroundColor: '#f0f4f8',
    borderColor: '#FF8D00',
  },
  locationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  locationItemText: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  locationAddress: {
    fontSize: 12,
    color: '#888',
  },
  selectionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  selectionRadioSelected: {
    borderColor: '#FF8D00',
    backgroundColor: '#FF8D00',
  },

  // Redesigned Search Modal Styles
  searchModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  searchModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  searchModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  searchModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.5,
  },
  searchModalSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  searchModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrapper: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  searchBarInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
    fontWeight: '500',
  },
  searchResultsList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F4F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  searchResultInfo: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    fontWeight: '500',
  },
  searchEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  searchEmptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginTop: 16,
  },
  searchEmptySub: {
    fontSize: 14,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  searchPlaceholderState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  searchHistoryIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F9F9F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  searchPlaceholderText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
  },
});
