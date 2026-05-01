import { DEFAULT_AVATAR_URL } from '../lib/api';
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getOrCreateConversation, getRegions, searchUsers } from "../lib/firebaseHelpers/index";
import { followUser, sendFollowRequest, unfollowUser } from "../lib/firebaseHelpers/follow";
import { CITY_CARD_IMAGES, COUNTRY_CARD_IMAGES, DEFAULT_CARD_IMAGE, REGION_CARD_IMAGES } from "../src/assets/searchCardAssets.generated";
import { getCachedData, setCachedData, useNetworkStatus, useOfflineBanner } from '../hooks/useOffline';
import { OfflineBanner } from '@/src/_components/OfflineBanner';
import { safeRouterBack } from '@/lib/safeRouterBack';

// Type definitions
type Region = {
  id: string;
  name: string;
  image: string;
  /** Which row in Search: countries / regions / cities */
  section: 'country' | 'region' | 'city';
  order?: number;
  // Optional machine key for region aggregations (e.g. restcountries region: "europe", "americas")
  regionKey?: string;
};

type Suggestion = {
  id: string;
  title: string;
  subtitle: string;
  placeId: string;
};

type User = {
  uid: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  isPrivate?: boolean;
};


// Search card images are generated into `app/searchCardAssets.generated.ts` by `npm run gen:cards`.

/** Old `image` keys from earlier builds / cached data */
const LEGACY_IMAGE_ALIASES: Record<string, string> = {
  Unitedstates: 'United States',
  UnitedKingdom: 'United Kingdom',
  America: 'North America',
  Japan: 'East Asia',
  'New York': 'New York City',
};

function getCardImageSource(item: Region) {
  if (item.image && (item.image.startsWith('http') || item.image.startsWith('https'))) {
    return { uri: item.image };
  }
  const key = LEGACY_IMAGE_ALIASES[item.image] ?? item.image;
  if (item.section === 'country') {
    return COUNTRY_CARD_IMAGES[key] ?? DEFAULT_CARD_IMAGE;
  }
  if (item.section === 'region') {
    return REGION_CARD_IMAGES[key] ?? DEFAULT_CARD_IMAGE;
  }
  return CITY_CARD_IMAGES[key] ?? DEFAULT_CARD_IMAGE;
}

// Default regions (fallback if getRegions fails). Add more rows: set section + image key + optional regionKey for big regions.
const defaultRegions: Region[] = [
  // COUNTRIES
  { id: 'united-states', name: 'United States', image: 'United States', section: 'country' },
  { id: 'united-kingdom', name: 'United Kingdom', image: 'United Kingdom', section: 'country' },
  { id: 'united-arab-emirates', name: 'United Arab Emirates', image: 'United Arab Emirates', section: 'country' },
  { id: 'saudi-arabia', name: 'Saudi Arabia', image: 'Saudi Arabia', section: 'country' },
  { id: 'canada', name: 'Canada', image: 'Canada', section: 'country' },
  { id: 'mexico', name: 'Mexico', image: 'Mexico', section: 'country' },
  { id: 'china', name: 'China', image: 'China', section: 'country' },
  { id: 'thailand', name: 'Thailand', image: 'Thailand', section: 'country' },
  { id: 'turkey', name: 'Turkey', image: 'Turkey', section: 'country' },
  { id: 'france', name: 'France', image: 'France', section: 'country' },
  { id: 'italy', name: 'Italy', image: 'Italy', section: 'country' },
  { id: 'spain', name: 'Spain', image: 'Spain', section: 'country' },
  { id: 'portugal', name: 'Portugal', image: 'Portugal', section: 'country' },
  { id: 'greece', name: 'Greece', image: 'Greece', section: 'country' },
  { id: 'switzerland', name: 'Switzerland', image: 'Switzerland', section: 'country' },

  // REGIONS
  { id: 'europe', name: 'Europe', image: 'Europe', section: 'region', regionKey: 'europe' },
  { id: 'north-america', name: 'North America', image: 'North America', section: 'region', regionKey: 'americas' },
  { id: 'south-america', name: 'South America', image: 'South America', section: 'region', regionKey: 'americas' },
  { id: 'caribbean', name: 'Caribbean', image: 'Caribbean', section: 'region', regionKey: 'americas' },
  { id: 'asia', name: 'Asia', image: 'Asia', section: 'region', regionKey: 'asia' },
  { id: 'east-asia', name: 'East Asia', image: 'East Asia', section: 'region', regionKey: 'asia' },
  { id: 'southeast-asia', name: 'Southeast Asia', image: 'Southeast Asia', section: 'region', regionKey: 'asia' },
  { id: 'africa', name: 'Africa', image: 'Africa', section: 'region', regionKey: 'africa' },
  { id: 'oceania', name: 'Oceania', image: 'Oceania', section: 'region', regionKey: 'oceania' },

  // CITIES
  { id: 'london', name: 'London', image: 'London', section: 'city' },
  { id: 'paris', name: 'Paris', image: 'Paris', section: 'city' },
  { id: 'new-york-city', name: 'New York City', image: 'New York City', section: 'city' },
  { id: 'los-angeles', name: 'Los Angeles', image: 'Los Angeles', section: 'city' },
  { id: 'las-vegas', name: 'Las Vegas', image: 'Las Vegas', section: 'city' },
  { id: 'amsterdam', name: 'Amsterdam', image: 'Amsterdam', section: 'city' },
  { id: 'barcelona', name: 'Barcelona', image: 'Barcelona', section: 'city' },
  { id: 'rome', name: 'Rome', image: 'Rome', section: 'city' },
  { id: 'istanbul', name: 'Istanbul', image: 'Istanbul', section: 'city' },
  { id: 'dubai', name: 'Dubai', image: 'Dubai', section: 'city' },
  { id: 'hong-kong', name: 'Hong Kong', image: 'Hong Kong', section: 'city' },
  { id: 'bangkok', name: 'Bangkok', image: 'Bangkok', section: 'city' },
  { id: 'seoul', name: 'Seoul', image: 'Seoul', section: 'city' },
  { id: 'singapore', name: 'Singapore', image: 'Singapore', section: 'city' },
  { id: 'sydney', name: 'Sydney', image: 'Sydney', section: 'city' },
  { id: 'tokyo', name: 'Tokyo', image: 'Tokyo', section: 'city' },
];

export default function SearchModal() {
  const [tab, setTab] = useState<'place' | 'people'>('place');
  const [q, setQ] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState<boolean>(false);
  const [users, setUsers] = useState<User[]>([]);
  const [recommendations, setRecommendations] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [regions, setRegions] = useState<Region[]>(defaultRegions);
  const [loadingRegions, setLoadingRegions] = useState<boolean>(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followingMap, setFollowingMap] = useState<{ [key: string]: boolean }>({});
  const [requestedMap, setRequestedMap] = useState<{ [key: string]: boolean }>({});
  const [followLoadingMap, setFollowLoadingMap] = useState<{ [key: string]: boolean }>({});
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const { showBanner } = useOfflineBanner();

  const REGIONS_CACHE_KEY = useMemo(() => `search_regions_v1`, []);
  const PEOPLE_REC_CACHE_KEY = useMemo(() => `search_people_rec_v1_${String(currentUserId || 'anon')}`, [currentUserId]);

  // Cache-first bootstrap for regions
  useEffect(() => {
    (async () => {
      try {
        const cached = await getCachedData<Region[]>(REGIONS_CACHE_KEY);
        if (Array.isArray(cached) && cached.length > 0) {
          setRegions(cached);
          setLoadingRegions(false);
        }
      } catch { }
    })();
  }, [REGIONS_CACHE_KEY]);

  const inferRegionKey = React.useCallback((item: Region): string => {
    const rawId = String(item?.id || '').trim().toLowerCase();
    const rawName = String(item?.name || '').trim().toLowerCase();
    const rawKey = String(item?.regionKey || '').trim().toLowerCase();
    if (rawKey) return rawKey;

    // Minimal, generic mapping (not a countries list)
    if (rawId === 'americas' || rawName === 'americas') return 'americas';
    if (rawId === 'america' || rawName === 'america') return 'americas';
    if (rawId === 'europe' || rawName === 'europe') return 'europe';
    if (rawId === 'asia' || rawName === 'asia') return 'asia';
    if (rawId === 'africa' || rawName === 'africa') return 'africa';
    if (rawId === 'oceania' || rawName === 'oceania') return 'oceania';

    return '';
  }, []);

  const openRegionCard = React.useCallback((item: Region, kind: 'country' | 'region' | 'city') => {
    const placeId = String(item?.id || item?.name || '');
    const locationName = String(item?.name || '');
    if (!placeId || !locationName) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({
      pathname: '/location/[placeId]',
      params: {
        placeId,
        locationName,
        locationAddress: locationName,
        scope: kind === 'region' ? 'region' : 'place',
        regionId: kind === 'region' ? placeId : undefined,
        regionKey: kind === 'region' ? inferRegionKey(item) : undefined,
      },
    } as any);
  }, [inferRegionKey, router]);

  // Get current user ID and load following list on mount
  useEffect(() => {
    AsyncStorage.getItem('userId').then(async uid => {
      if (uid) {
        setCurrentUserId(uid);
        console.log('[SearchModal] Current user ID:', uid);

        // Load following list
        try {
          const { apiService } = await import('@/src/_services/apiService');
          const response = await apiService.get(`/follow/users/${uid}/following`);
          if (response.success && Array.isArray(response.data)) {
            const followingIds = response.data.map((f: any) => f.followingId);
            const map: { [key: string]: boolean } = {};
            followingIds.forEach((id: string) => {
              map[id] = true;
            });
            setFollowingMap(map);
            console.log('[SearchModal] Loaded following list:', followingIds.length, 'users');
          }
        } catch (error) {
          console.error('[SearchModal] Failed to load following list:', error);
        }
      }
    }).catch(err => console.error('[SearchModal] Failed to get userId:', err));
  }, []);

  // Fetch regions from Firebase on mount
  useEffect(() => {
    async function fetchRegions() {
      setLoadingRegions(true);
      try {
        // Offline: rely on cache/defaults (avoid blocking spinner loops)
        if (!isOnline) {
          setLoadingRegions(false);
          return;
        }
        const result = await getRegions();
        if (result.success && result.data && result.data.length > 0) {
          const raw = result.data as Region[];
          const normalized: Region[] = raw.map((r: any, i: number) => {
            if (r?.section === 'country' || r?.section === 'region' || r?.section === 'city') return r as Region;
            // Legacy flat list: first 3 countries, next 3 regions, rest cities
            if (i < 3) return { ...r, section: 'country' as const };
            if (i < 6) return { ...r, section: 'region' as const };
            return { ...r, section: 'city' as const };
          });
          setRegions(normalized);
          try { await setCachedData(REGIONS_CACHE_KEY, normalized, { ttl: 7 * 24 * 60 * 60 * 1000 }); } catch { }
        } else {
          // Use default regions if Firebase fetch fails
          setRegions(defaultRegions);
        }
      } catch (error) {
        console.error('Error loading regions:', error);
        setRegions(defaultRegions);
      }
      setLoadingRegions(false);
    }
    fetchRegions();
  }, [REGIONS_CACHE_KEY, isOnline]);

  // Reset data when tab changes
  useEffect(() => {
    setQ('');
    setSuggestions([]);
    setUsers([]); // Only reset to empty array, never set region objects
    setRecommendations([]); // Only reset to empty array, never set region objects
    setSelectedRegion(null);
  }, [tab]);

  // Place search (Google Maps Places API)
  useEffect(() => {
    if (tab !== 'place' || q.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggest(true);
    const timer = setTimeout(async () => {
      try {
        const { mapService } = await import('../services');
        const results = await mapService.getAutocompleteSuggestions(q);
        setSuggestions(results.map((r: any) => ({
          id: r.placeId || String(Math.random()),
          title: r.description || r.mainText || 'Location',
          subtitle: r.secondaryText || '',
          placeId: r.placeId,
        })));
      } catch (err) {
        setSuggestions([]);
      } finally {
        setLoadingSuggest(false);
      }
    }, 600); // Increased from 300ms to 600ms for better debouncing
    return () => clearTimeout(timer);
  }, [q, tab]);

  // People recommendations
  useEffect(() => {
    if (tab === 'people' && recommendations.length === 0) {
      setLoadingUsers(true);
      // Cache-first bootstrap for people recs
      (async () => {
        try {
          const cached = await getCachedData<User[]>(PEOPLE_REC_CACHE_KEY);
          if (Array.isArray(cached) && cached.length > 0) {
            setRecommendations(cached);
            setLoadingUsers(false);
            if (!isOnline) return;
          } else if (!isOnline) {
            setLoadingUsers(false);
            return;
          }
        } catch { }

        searchUsers('', 10).then(async (result) => {
          if (result.success && Array.isArray(result.data)) {
            const safeUsers = result.data.map((u: any) => ({
              uid: String(u?.uid || ''),
              displayName: u?.displayName || 'Unknown',
              photoURL: u?.photoURL || u?.avatar || DEFAULT_AVATAR_URL,
              bio: u?.bio || '',
              isPrivate: typeof u?.isPrivate === 'boolean' ? u.isPrivate : false,
            })).filter((u: any) => typeof u.uid === 'string' && u.uid.trim().length > 0);
            setRecommendations(safeUsers);
            try { await setCachedData(PEOPLE_REC_CACHE_KEY, safeUsers, { ttl: 24 * 60 * 60 * 1000 }); } catch { }
          } else {
            setRecommendations([]);
          }
          setLoadingUsers(false);
        });
      })();
    }
  }, [PEOPLE_REC_CACHE_KEY, isOnline, tab, recommendations.length]);

  // People search
  useEffect(() => {
    if (tab !== 'people' || q.length < 2) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchUsers(q, 20);
      if (cancelled) return;
      if (result.success && Array.isArray(result.data)) {
        const safeUsers = result.data.map((u: any) => ({
          uid: String(u?.uid || ''),
          displayName: u?.displayName || 'Unknown',
          photoURL: u?.photoURL || u?.avatar || DEFAULT_AVATAR_URL,
          bio: u?.bio || '',
          isPrivate: typeof u?.isPrivate === 'boolean' ? u.isPrivate : false,
        })).filter((u: any) => typeof u.uid === 'string' && u.uid.trim().length > 0);
        setUsers(safeUsers);
      } else {
        setUsers([]);
      }
      if (!cancelled) setLoadingUsers(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, tab]);

  // UI
  // Error boundary fallback UI
  if (hasError) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: 'red', fontSize: 16, marginBottom: 12 }}>Something went wrong. Please try again.</Text>
          <TouchableOpacity onPress={() => setHasError(false)} style={styles.searchBtnBar}>
            <Text style={styles.searchBtnBarText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={{ flex: 1, paddingTop: Math.max(insets.top + 2, 0) }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {showBanner && (
            <OfflineBanner text="You’re offline — showing saved search" />
          )}
          {/* Header Tabs */}
          <View style={styles.headerTabsRow}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                safeRouterBack();
              }}
              style={styles.closeBtn}
            >
              <Feather name="x" size={20} color="#333" />
            </TouchableOpacity>
            <View style={styles.tabsCenterWrap}>
              <View style={styles.tabsInline}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setTab('place');
                  }}
                  style={styles.tabBtnInline}
                >
                  <Text style={[styles.tabText, tab === 'place' && styles.tabTextActive]}>Place</Text>
                </TouchableOpacity>
                <Text style={styles.dotSep}>Â·</Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setTab('people');
                  }}
                  style={styles.tabBtnInline}
                >
                  <Text style={[styles.tabText, tab === 'people' && styles.tabTextActive]}>People</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.headerSideSpacer} />
          </View>
          {/* Search and Region Select */}
          <View style={styles.searchRegionBorderBox}>
            <View style={styles.searchBox}>
              <Feather name="search" size={20} color="#333" style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                placeholder={tab === 'people' ? 'Search for traveler' : 'Search a destination'}
                placeholderTextColor="#999"
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                autoCorrect={false}
                importantForAutofill="no"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setQ('')} style={styles.inputClear}>
                  <Feather name="x" size={16} color="#777" />
                </TouchableOpacity>
              )}
            </View>
            {/* Region Select Grid (background) */}
            {tab === 'place' && q.length < 2 && (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 15 }}
                showsVerticalScrollIndicator={false}
              >
                {loadingRegions ? (
                  <View style={{ alignItems: 'center', justifyContent: 'center', height: 150 }}>
                    <ActivityIndicator size="large" color="#0A3D62" />
                  </View>
                ) : (
                  <View style={styles.regionGridWrap}>
                    {/* COUNTRIES */}
                    <Text style={styles.sectionTitle}>COUNTRIES</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.filter((r) => r.section === 'country').map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]}
                            onPress={() => openRegionCard(item, 'country')}
                          >
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={getCardImageSource(item)}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={180}
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    {/* REGIONS */}
                    <Text style={[styles.sectionTitle, { marginTop: 8 }]}>REGIONS</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.filter((r) => r.section === 'region').map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]}
                            onPress={() => openRegionCard(item, 'region')}
                          >
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={getCardImageSource(item)}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={180}
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    {/* CITIES */}
                    <Text style={[styles.sectionTitle, { marginTop: 8 }]}>CITIES</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                      <View style={styles.regionGridRow}>
                        {regions.filter((r) => r.section === 'city').map((item, idx) => (
                          <TouchableOpacity
                            key={item.id + String(idx)}
                            style={[styles.regionCard, selectedRegion === item.id && styles.regionCardActive]}
                            onPress={() => openRegionCard(item, 'city')}
                          >
                            <View style={styles.regionImageWrap}>
                              <ExpoImage
                                source={getCardImageSource(item)}
                                style={styles.regionImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={180}
                              />
                            </View>
                            <Text style={styles.regionName}>{item.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}
            {/* Place Tab Results (Google Maps suggestions) - rendered inline */}
            {tab === 'place' && q.length >= 2 && (
              <View style={{ flex: 1, marginTop: 8 }}>
                {loadingSuggest && <Text style={{ textAlign: 'center', color: '#888', marginBottom: 8 }}>Loading suggestions...</Text>}
                <FlatList
                  data={suggestions}
                  keyExtractor={(item: Suggestion) => item.id}
                  renderItem={({ item }: { item: Suggestion }) => (
                    <TouchableOpacity
                      style={styles.suggestionCardList}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        router.push({ pathname: '/location/[placeId]', params: { placeId: item.placeId, locationName: item.title, locationAddress: item.subtitle } });
                      }}
                    >
                      <View style={styles.suggestionIconList}>
                        <Feather name="map-pin" size={20} color="#666" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestionTitleList}>{item.title}</Text>
                        {!!item.subtitle && <Text style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{item.subtitle}</Text>}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No results</Text>}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingVertical: 4, paddingBottom: 20 }}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={true}
                />
              </View>
            )}
            {/* People Tab Results (Firebase users) */}
            {tab === 'people' && (
              <FlatList
                data={q.length >= 2 ? users : recommendations}
                keyExtractor={(item: User) => item.uid}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: User }) => {
                  const isOwnProfile = currentUserId === item.uid;
                  console.log('[SearchModal] Rendering user:', item.displayName, 'uid:', item.uid, 'currentUserId:', currentUserId, 'isOwnProfile:', isOwnProfile);
                  return (
                    <View style={styles.userResultRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          // If own profile, navigate to Profile tab instead of user-profile
                          if (isOwnProfile) {
                            router.push('/(tabs)/profile');
                          } else {
                            router.push(`/user-profile?uid=${item.uid}`);
                          }
                        }}
                        accessibilityLabel={`Open profile for ${item.displayName || 'Traveler'}`}
                      >
                        <ExpoImage 
                          source={{ uri: item.photoURL || DEFAULT_AVATAR_URL }} 
                          style={styles.avatarImage}
                          contentFit="cover"
                          transition={200}
                          cachePolicy="memory-disk"
                        />
                        <View style={{ marginLeft: 16, flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '400', color: '#222' }}>
                            {item.displayName || 'Traveler'}{isOwnProfile ? ' (You)' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                ListEmptyComponent={<Text style={{ color: '#888', marginTop: 12, textAlign: 'center' }}>No travelers found</Text>}
                style={{ marginTop: 16, flex: 1 }}
                contentContainerStyle={{ paddingBottom: 12 }}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={7}
                removeClippedSubviews={true}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 0,
  },
  headerTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabsCenterWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: 2 }],
  },
  tabsInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotSep: { fontSize: 18, color: '#fff', marginHorizontal: 2, marginTop: 2 }, // hidden dot
  tabBtnInline: { paddingVertical: 2, paddingHorizontal: 0, marginHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  tabText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
    textAlign: 'center',
    paddingBottom: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabTextActive: {
    color: '#111',
    fontWeight: '700',
    borderBottomColor: '#111',
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#eee', zIndex: 2 },
  headerSideSpacer: { width: 40, height: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: '#888', marginBottom: 8, letterSpacing: 0.5, marginTop: 4 },
  regionGridWrap: {
    flexDirection: 'column',
    gap: 2,
  },
  regionGridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  regionCard: {
    width: 124,
    height: 154,
    backgroundColor: 'transparent',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  regionCardActive: {
    opacity: 0.8,
  },
  regionImageWrap: {
    width: 124,
    height: 124,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8DCE0',
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  regionImage: {
    width: '100%',
    height: '100%',
  },
  regionName: {
    fontSize: 13,
    color: '#000',
    textAlign: 'left',
    fontWeight: '400',
    marginTop: 8,
    lineHeight: 16,
    width: 124,
    paddingLeft: 0,
  },
  actionBtnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
    // Remove position absolute so it stays above keyboard and never gets cut off
    minHeight: 60,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  clearAllBtn: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  clearAllText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  searchBtnBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A3D62',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  searchBtnBarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  searchRegionBorderBox: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 0,
    paddingHorizontal: 8,
    textAlign: 'left',
  },
  inputClear: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  clearBtn: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchBtn: {
    backgroundColor: '#0A3D62',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  suggestionListWrap: {
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 0,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  suggestionListOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eee',
    marginHorizontal: 0,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
    maxHeight: 400,
  },
  suggestionCardList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  suggestionIconList: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f6f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  suggestionTitleList: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111',
  },
  userResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
  },
  userActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
});
