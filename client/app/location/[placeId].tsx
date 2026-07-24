import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCard from '@/src/components/PostCard';
import NotificationsModal from '@/src/components/NotificationsModal';
import StoriesViewer from '@/src/components/StoriesViewer';
import VerifiedBadge from '@/src/components/VerifiedBadge';
import { apiService } from '@/src/services/apiService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { feedEventEmitter } from '../../lib/feedEventEmitter';
import { hapticLight } from '../../lib/haptics';
import {
  extractStoryListFromResponseBody,
  hydrateStoryDocumentsIfNeeded,
  storyForStoriesViewer,
} from '../../lib/storyViewer';
import { safeRouterBack } from '@/lib/safeRouterBack';
import { mapService } from '@/src/services/implementations/GoogleMapsService';
import { countries, continents } from 'countries-list';


const { width } = Dimensions.get('window');


type Post = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  caption: string;
  locationName?: string;
  location?: string | { name?: string };
  locationData?: {
    name?: string;
    address?: string;
    lat?: number;
    lon?: number;
    verified?: boolean;
    city?: string;
    country?: string;
    countryCode?: string;
    placeId?: string;
    neighborhood?: string;
    sublocality?: string;
  };
  likes: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: any;
};

type Story = {
  id: string;
  _id?: string;
  userId: string;
  userName: string;
  userAvatar: string;
  imageUrl: string;
  videoUrl?: string;
  mediaType?: 'image' | 'video';
  createdAt: any;
  location?: any;
  locationData?: {
    name?: string;
    address?: string;
  };
  views?: string[];
  likes?: string[];
  comments?: any[];
};

type SubLocation = {
  name: string;
  count: number;
  thumbnail: string;
  posts: Post[];
  spots?: {
    name: string;
    thumbnail: string;
    posts: Post[];
  }[];
};

// Dynamically build countryNameToCode from countries-list
const countryNameToCode: Record<string, string> = {};
for (const [code, info] of Object.entries(countries)) {
  const nameLower = info.name.toLowerCase();
  countryNameToCode[nameLower] = code;
}

// Add common aliases for client-side legacy mapping
const countryAliases: Record<string, string> = {
  'usa': 'US',
  'united states of america': 'US',
  'us': 'US',
  'uk': 'GB',
  'united kingdom': 'GB',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'vietnam': 'VN',
  'viet nam': 'VN',
  'south korea': 'KR',
  'north korea': 'KP',
  'russia': 'RU',
  'russian federation': 'RU',
  'netherlands': 'NL',
  'holland': 'NL'
};

for (const [alias, code] of Object.entries(countryAliases)) {
  countryNameToCode[alias.toLowerCase()] = code;
}

// Curated major city mapping fallback for legacy posts on client
const CITY_TO_COUNTRY: Record<string, string> = {
  'lahore': 'Pakistan',
  'karachi': 'Pakistan',
  'islamabad': 'Pakistan',
  'rawalpindi': 'Pakistan',
  'peshawar': 'Pakistan',
  'multan': 'Pakistan',
  'faisalabad': 'Pakistan',
  'quetta': 'Pakistan',
  'sialkot': 'Pakistan',
  'gujranwala': 'Pakistan',
  'delhi': 'India',
  'new delhi': 'India',
  'mumbai': 'India',
  'bangalore': 'India',
  'bengaluru': 'India',
  'kolkata': 'India',
  'chennai': 'India',
  'hyderabad': 'India',
  'pune': 'India',
  'ahmedabad': 'India',
  'dubai': 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates',
  'sharjah': 'United Arab Emirates',
  'riyadh': 'Saudi Arabia',
  'jeddah': 'Saudi Arabia',
  'mecca': 'Saudi Arabia',
  'medina': 'Saudi Arabia',
  'new york': 'United States',
  'new york city': 'United States',
  'nyc': 'United States',
  'los angeles': 'United States',
  'la': 'United States',
  'chicago': 'United States',
  'san francisco': 'United States',
  'miami': 'United States',
  'las vegas': 'United States',
  'seattle': 'United States',
  'boston': 'United States',
  'washington': 'United States',
  'houston': 'United States',
  'dallas': 'United States',
  'london': 'United Kingdom',
  'manchester': 'United Kingdom',
  'birmingham': 'United Kingdom',
  'edinburgh': 'United Kingdom',
  'glasgow': 'United Kingdom',
  'paris': 'France',
  'marseille': 'France',
  'lyon': 'France',
  'madrid': 'Spain',
  'barcelona': 'Spain',
  'seville': 'Spain',
  'rome': 'Italy',
  'milan': 'Italy',
  'florence': 'Italy',
  'venice': 'Italy',
  'tokyo': 'Japan',
  'osaka': 'Japan',
  'kyoto': 'Japan',
  'beijing': 'China',
  'shanghai': 'China',
  'shenzhen': 'China',
  'guangzhou': 'China',
  'bangkok': 'Thailand',
  'phuket': 'Thailand',
  'istanbul': 'Turkey',
  'ankara': 'Turkey',
  'amsterdam': 'Netherlands',
  'sydney': 'Australia',
  'melbourne': 'Australia',
  'toronto': 'Canada',
  'vancouver': 'Canada',
  'montreal': 'Canada',
  'singapore': 'Singapore'
};

const normalizeCountryName = (c: string): string => {
  const norm = String(c || '').toLowerCase().trim();
  const code = countryNameToCode[norm];
  if (code && countries[code as keyof typeof countries]) {
    return countries[code as keyof typeof countries].name;
  }
  return c;
};

const isCountryInContinent = (country: string, continent: string): boolean => {
  const normCountry = String(country || '').toLowerCase().trim();
  const normContinent = String(continent || '').toLowerCase().trim();

  const code = countryNameToCode[normCountry];
  if (!code || !countries[code as keyof typeof countries]) return false;

  const continentCode = countries[code as keyof typeof countries].continent;
  const continentName = (continents[continentCode as keyof typeof continents] || '').toLowerCase().trim();

  if (normContinent === 'america' || normContinent === 'americas') {
    return continentName === 'north america' || continentName === 'south america';
  }

  return continentName === normContinent;
};

const getCleanAddressParts = (addressString?: string | null): string[] => {
  if (!addressString || typeof addressString !== 'string') return [];
  
  const parts = addressString.split(',').map(p => p.trim()).filter(Boolean);
  const cleanParts: string[] = [];
  
  for (const part of parts) {
    let p = part;
    
    // Remove postal codes and zip codes
    p = p.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, ''); // UK
    p = p.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, '');         // Canada (e.g. T1L 1K2)
    p = p.replace(/\b\d{5}(-\d{4})?\b/g, '');                    // US Zip Code
    p = p.replace(/\b[A-Z]?\d{3,5}(-[A-Z\d]{3,4})?\b/gi, '');    // Europe / Japan / Generic
    p = p.replace(/\b\d+\b/g, '');                               // General numbers
    
    // Clean up extra whitespace
    p = p.trim().replace(/\s+/g, ' ');
    if (!p) continue;

    // Discard 2-letter state/province uppercase codes (e.g., NY, CA, AB, ON)
    if (p.length === 2 && p === p.toUpperCase() && /^[A-Z]{2}$/.test(p)) {
      continue;
    }
    
    if (p.length >= 2 && /[a-zA-Z]/.test(p)) {
      cleanParts.push(p);
    }
  }
  
  return cleanParts;
};

export default function LocationDetailsScreen() {
  const { placeId, locationName, locationAddress, scope, regionId, regionKey } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [placeDetails, setPlaceDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [subLocations, setSubLocations] = useState<SubLocation[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [selectedSubLocation, setSelectedSubLocation] = useState<string | null>(null);
  const [selectedSpecificSpot, setSelectedSpecificSpot] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [verifiedVisits, setVerifiedVisits] = useState(0);
  const [mostLikedPostImage, setMostLikedPostImage] = useState<string>('');
  const [showStoriesViewer, setShowStoriesViewer] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Story[]>([]);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);

  // --- NEW: PAGINATION & SKELETON STATES ---
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const LIMIT = 12;

  // Load current user
  useEffect(() => {
    const loadUser = async () => {
      const uid = await AsyncStorage.getItem('userId');
      if (uid) {
        setViewerId(uid);
        setCurrentUser({ uid, id: uid });
      }
    };
    loadUser();
  }, []);

  // Optimized Image Helper
  const getOptimizedUrl = React.useCallback((url: string, width = 800) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    return url.replace('/upload/', `/upload/w_${width},c_limit,q_auto,f_auto/`);
  }, []);

  const renderPostItem = React.useCallback(({ item }: { item: Post }) => (
    <PostCard 
      post={{
        ...item,
        imageUrl: getOptimizedUrl(item.imageUrl, 800)
      }} 
      currentUser={currentUser} 
      showMenu={false} 
    />
  ), [currentUser, getOptimizedUrl]);

  // Premium Skeleton Component
  const LocationSkeleton = React.useCallback(() => (
    <View style={{ padding: 20, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <View style={{ width: 80, height: 80, backgroundColor: '#f2f2f2', borderRadius: 28 }} />
        <View style={{ marginLeft: 15, flex: 1 }}>
          <View style={{ height: 20, width: '70%', backgroundColor: '#f2f2f2', borderRadius: 4, marginBottom: 8 }} />
          <View style={{ height: 15, width: '40%', backgroundColor: '#f2f2f2', borderRadius: 4 }} />
        </View>
      </View>
      <View style={{ height: 300, backgroundColor: '#f2f2f2', borderRadius: 16, width: '100%' }} />
    </View>
  ), []);

  // Scroll animation state
  const safeTop = Math.max(insets.top, 12);
  const totalHeaderHeight = safeTop + 48; // Approx back button row height

  const headerHeightRef = React.useRef<number>(totalHeaderHeight);
  const animatedHeaderHeight = React.useRef(new Animated.Value(totalHeaderHeight)).current;
  const animatedHeaderTranslateY = React.useRef(new Animated.Value(0)).current;

  // Sync on mount or safe area change
  useEffect(() => {
    headerHeightRef.current = totalHeaderHeight;
    animatedHeaderHeight.setValue(totalHeaderHeight);
  }, [totalHeaderHeight, animatedHeaderHeight]);

  // Tracks last *applied* animation target (not initial UI state), so applyHeaderState(false) can run after a hide.
  const headerVisibilityAppliedRef = React.useRef<boolean | null>(null);

  const applyHeaderState = React.useCallback((hidden: boolean) => {
    if (headerVisibilityAppliedRef.current === hidden) return;
    headerVisibilityAppliedRef.current = hidden;
    const h = headerHeightRef.current;
    if (!h) return;
    // Same easing both ways avoids a “flash” when show/hide toggles near scroll top (bounce).
    const duration = 160;

    Animated.parallel([
      Animated.timing(animatedHeaderHeight, {
        toValue: hidden ? 0 : h,
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(animatedHeaderTranslateY, {
        toValue: hidden ? -h : 0,
        duration,
        useNativeDriver: false,
      }),
    ]).start();
  }, [animatedHeaderHeight, animatedHeaderTranslateY]);

  const lastScrollYRef = React.useRef(0);
  const lastEmitTsRef = React.useRef(0);

  const onStoryPress = React.useCallback((stories: Story[], initialIndex: number) => {
    setSelectedStories(stories);
    setShowStoriesViewer(true);
  }, []);

  const regionIdStr = String(regionId || placeId || '').toLowerCase();
  const isRegionScope = String(scope || '').toLowerCase() === 'region';

  // Dynamic Geo-Scope detection
  const getGeoScope = React.useCallback((): 'CONTINENT' | 'COUNTRY' | 'CITY' | 'NEIGHBORHOOD' => {
    const name = String(locationName || placeDetails?.name || '').toLowerCase().trim();
    const sc = String(scope || '').toLowerCase().trim();

    // Continent Detection
    const isContinentName = Object.values(continents).map(c => c.toLowerCase()).includes(name) ||
      name === 'america' || name === 'americas' || name === 'middle east';
      
    if (sc === 'continent' || isContinentName) {
      return 'CONTINENT';
    }

    // Country Detection
    if (sc === 'country' || sc === 'region' || countryNameToCode[name] !== undefined) {
      return 'COUNTRY';
    }

    if (sc === 'city') {
      return 'CITY';
    }

    return 'CITY';
  }, [locationName, placeDetails?.name, scope]);

  const getSubLocationsTitle = React.useCallback(() => {
    const geoScope = getGeoScope();
    if (geoScope === 'CONTINENT') return 'COUNTRIES';
    if (geoScope === 'COUNTRY') return 'CITIES';
    return 'PLACES';
  }, [getGeoScope]);

  const extractCityIntelligently = React.useCallback((post: any): string => {
    if (post?.locationData?.city && typeof post.locationData.city === 'string' && post.locationData.city.trim().length > 0) {
      return post.locationData.city.trim();
    }
    const fields = [
      post?.locationData?.address,
      post?.locationName,
      post?.location,
      post?.locationData?.name
    ];
    for (const f of fields) {
      if (f && typeof f === 'string') {
        const cleanParts = getCleanAddressParts(f);
        
        // Filter out street names
        const streetIndicators = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|square|sq|way|parkway|pkwy)\b/i;
        const nonStreetParts = cleanParts.filter(p => !streetIndicators.test(p));
        
        if (nonStreetParts.length > 0) {
          const len = nonStreetParts.length;
          let candidate = 'General';
          if (len === 1) {
            candidate = nonStreetParts[0];
          } else if (len === 2) {
            candidate = nonStreetParts[0];
          } else {
            const secondToLast = nonStreetParts[len - 2];
            if (secondToLast.length === 2 && secondToLast === secondToLast.toUpperCase()) {
              candidate = nonStreetParts[len - 3] || nonStreetParts[len - 2];
            } else {
              candidate = secondToLast;
            }
          }
          
          // Filter out country names from being returned as city names
          if (countryNameToCode[candidate.toLowerCase().trim()] !== undefined) {
            const nonCountryParts = nonStreetParts.filter(p => countryNameToCode[p.toLowerCase().trim()] === undefined);
            if (nonCountryParts.length > 0) {
              return nonCountryParts[0].trim();
            }
          } else {
            return candidate.trim();
          }
        }
      }
    }
    return 'General';
  }, []);

  const extractCountryIntelligently = React.useCallback((post: any): string => {
    // 1. Try real locationData country (with self-healing for cities wrongly stored as countries)
    if (post?.locationData?.country && typeof post.locationData.country === 'string' && post.locationData.country.trim().length > 0) {
      const c = post.locationData.country.trim();
      const mappedCountry = CITY_TO_COUNTRY[c.toLowerCase()];
      if (mappedCountry) {
        return mappedCountry;
      }
      return c;
    }

    // 2. Try to map city name to country
    const city = extractCityIntelligently(post);
    if (city && city !== 'General') {
      const mappedCountry = CITY_TO_COUNTRY[city.toLowerCase().trim()];
      if (mappedCountry) {
        return mappedCountry;
      }
    }

    // 3. Address parsing fallback
    const fields = [
      post?.locationData?.address,
      post?.locationName,
      post?.location,
      post?.locationData?.name
    ];
    for (const f of fields) {
      if (f && typeof f === 'string') {
        const cleanParts = getCleanAddressParts(f);
        if (cleanParts.length > 0) {
          const lastPart = cleanParts[cleanParts.length - 1].trim();
          
          // Self-heal known city in last position to its country
          const mappedFromLast = CITY_TO_COUNTRY[lastPart.toLowerCase()];
          if (mappedFromLast) {
            return mappedFromLast;
          }

          if (lastPart.toLowerCase() !== 'europe' && lastPart.toLowerCase() !== 'asia' && lastPart.toLowerCase() !== 'america' && lastPart.toLowerCase() !== 'africa') {
            return lastPart;
          }
          if (cleanParts.length > 1) {
            return cleanParts[cleanParts.length - 2].trim();
          }
        }
      }
    }
    return 'General';
  }, [extractCityIntelligently]);

  const filterPostsForLocation = React.useCallback((posts: any[]): any[] => {
    const geoScope = getGeoScope();
    const locName = String(locationName || placeDetails?.name || '').toLowerCase().trim();

    return posts.filter(post => {
      if (geoScope === 'CONTINENT') {
        const postContinent = String(post?.locationData?.continent || '').toLowerCase().trim();
        if (postContinent) {
          if (locName === 'america' || locName === 'americas') {
            return postContinent === 'north america' || postContinent === 'south america';
          }
          return postContinent === locName;
        }
        
        // Fallback for legacy posts
        const country = extractCountryIntelligently(post);
        return isCountryInContinent(country, locName);
      } else if (geoScope === 'COUNTRY') {
        const postCountry = String(post?.locationData?.country || '').toLowerCase().trim();
        if (postCountry) {
          return normalizeCountryName(postCountry) === normalizeCountryName(locName);
        }
        
        // Fallback for legacy posts
        const country = extractCountryIntelligently(post);
        return normalizeCountryName(country) === normalizeCountryName(locName);
      }
      return true;
    });
  }, [getGeoScope, locationName, placeDetails?.name, extractCountryIntelligently]);

  const formatHeaderLocationName = React.useCallback(() => {
    const mainName = placeDetails?.name || locationName || '';
    const country = placeDetails?.country;

    if (typeof mainName !== 'string') return '';

    // If mainName already contains a comma, just use it directly
    if (mainName.includes(',')) {
      return mainName;
    }

    // If country is present and different from mainName, append it nicely
    if (country && typeof country === 'string' && country.trim().length > 0) {
      if (mainName.toLowerCase().trim() !== country.toLowerCase().trim()) {
        return `${mainName}, ${country}`;
      }
    }

    return mainName;
  }, [placeDetails, locationName]);

  const inferRegionKey = React.useCallback((rid: string, rname: string) => {
    const rawId = String(rid || '').trim().toLowerCase();
    const rawName = String(rname || '').trim().toLowerCase();
    if (rawId === 'americas' || rawName === 'americas') return 'americas';
    if (rawId === 'america' || rawName === 'america') return 'americas';
    if (rawId === 'europe' || rawName === 'europe') return 'europe';
    if (rawId === 'asia' || rawName === 'asia') return 'asia';
    if (rawId === 'africa' || rawName === 'africa') return 'africa';
    if (rawId === 'oceania' || rawName === 'oceania') return 'oceania';
    return '';
  }, []);

  const getCountriesForRegion = React.useCallback(
    async (rid: string, rname: string): Promise<string[]> => {
      const cacheKey = `region_countries_v1_${String(rid || rname || 'unknown').toLowerCase()}`;
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      try {
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          const ts = Number(cached?.ts || 0);
          const data = cached?.data;
          if (Array.isArray(data) && data.length > 0 && Date.now() - ts < ONE_WEEK_MS) {
            return data.map(String);
          }
        }
      } catch { }

      const explicitKey = String(regionKey || '').trim().toLowerCase();
      const region = explicitKey || inferRegionKey(rid, rname);
      // If no explicit regionKey was provided, we can't safely expand automatically.
      if (!region) {
        // Special-case: Japan behaves like a single country region for our UI convenience.
        const nm = String(rname || '').trim();
        if (String(rid || '').toLowerCase() === 'japan' || nm.toLowerCase() === 'japan') return ['Japan'];
        return [];
      }

      try {
        const res = await fetch(`https://restcountries.com/v3.1/region/${encodeURIComponent(region)}`);
        const json: any = await res.json();
        const names = Array.isArray(json)
          ? json
            .map((c: any) => c?.name?.common || c?.name?.official)
            .filter((x: any) => typeof x === 'string' && x.trim().length > 0)
          : [];

        const uniq: string[] = [];
        const seen = new Set<string>();
        for (const n of names) {
          const key = String(n).trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          uniq.push(String(n).trim());
        }

        // Cache for later opens
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: uniq }));
        } catch { }

        return uniq;
      } catch {
        return [];
      }
    },
    [inferRegionKey, regionKey]
  );



  // Listen for feed updates (like post deletion)
  useEffect(() => {
    const unsub = feedEventEmitter.onFeedUpdate((event) => {
      if (event.type === 'POST_DELETED' && event.postId) {
        console.log('[Location] Post deleted event received:', event.postId);
        setAllPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
        setFilteredPosts(prev => prev.filter(p => (p.id || p._id) !== event.postId));
      }
    });
    return unsub;
  }, []);


  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      try {
        let name = locationName as string;
        let address = locationAddress as string;

        // If locationName is missing, fetch from maps service using placeId
        if (!name && placeId && placeId !== 'unknown') {
          const details = await mapService.getPlaceDetails(placeId as string);
          if (details) {
            name = details.placeName || details.city || '';
            address = details.address || '';
          }
        }

        // Fallback to placeId as name if still not set
        if (!name) {
          name = String(placeId || '');
          if (name === 'unknown') name = '';
        }

        // Validate name to make sure we don't display a numeric value, zip code, or Place ID (like "ChIJ...")
        const isPlaceId = typeof name === 'string' && (name.startsWith('ChIJ') || (name.length > 15 && !name.includes(' ')));
        const isNumeric = !isNaN(Number(name));
        if (isPlaceId || isNumeric || !name || name === 'unknown') {
          if (address) {
            const cleanParts = getCleanAddressParts(address);
            name = cleanParts[0] || 'Location';
          } else {
            name = 'Location';
          }
        }

        if (!name) {
          setPlaceDetails(null);
          setLoading(false);
          return;
        }

        // Format name beautifully if it is lowercase/raw
        if (name && name === name.toLowerCase()) {
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }

        const placeDetailsData = {
          name,
          formatted_address: address || name,
        };
        setPlaceDetails(placeDetailsData);

        // Dynamic check for region scope
        const sc = String(scope || '').toLowerCase().trim();
        const continents = ['europe', 'asia', 'africa', 'americas', 'america', 'antarctica', 'oceania'];
        const isRegion = sc === 'region' || sc === 'continent' || continents.includes(name.toLowerCase());

        let countriesList: string[] = [];
        if (isRegion) {
          countriesList = await getCountriesForRegion(regionIdStr, name);
        }

        // 1. Parallel Fetching for faster initial load
        await Promise.all([
          isRegion 
            ? fetchRegionPosts(regionIdStr, name) 
            : fetchLocationPosts(name),
          fetchLocationStories(name, countriesList),
          (async () => {
             try {
               const metaRes = await apiService.getLocationMeta(name, viewerId || undefined);
               if (metaRes?.success && metaRes?.data) {
                 setTotalVisits(metaRes.data.visits || 0);
                 setVerifiedVisits(metaRes.data.verifiedVisits || 0);
               }
             } catch {}
          })()
        ]);

      } catch (e) {
        console.error('Error fetching location details:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [placeId, locationName, locationAddress, scope, regionIdStr, viewerId]);

  const extractSubLocationName = React.useCallback((post: any): string => {
    // Priority 0: Google Maps enriched data
    const neighborhood = post?.locationData?.neighborhood;
    if (neighborhood && typeof neighborhood === 'string') {
      const clean = getCleanAddressParts(neighborhood)[0];
      if (clean) return clean;
    }
    const sublocality = post?.locationData?.sublocality;
    if (sublocality && typeof sublocality === 'string') {
      const clean = getCleanAddressParts(sublocality)[0];
      if (clean) return clean;
    }

    // Priority 1: Use a city/area part of the address if available
    const addr = post?.locationData?.address || '';
    if (addr) {
      const cleanParts = getCleanAddressParts(addr);
      if (cleanParts.length > 0) {
        return cleanParts[0];
      }
    }
    
    // Priority 2: Use locationName if it looks like an area
    const name = post?.locationData?.name || post?.locationName || post?.location || '';
    if (typeof name === 'string' && name.includes(',')) {
      const cleanParts = getCleanAddressParts(name);
      if (cleanParts.length > 0) {
        return cleanParts[0];
      }
    }

    return name || 'Unknown';
  }, []);

  const fetchLocationPosts = async (searchLocationName: string, isLoadMore = false) => {
    if (!searchLocationName) return;

    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const skip = isLoadMore ? (page + 1) * LIMIT : 0;
      const response = await apiService.getPostsByLocation(searchLocationName, skip, LIMIT, viewerId || undefined);
      let locationPosts = response?.success && Array.isArray(response?.data) ? response.data : [];

      if (locationPosts.length < LIMIT) setHasMore(false);

      const normalized = locationPosts.map((p: any) => ({ ...p, id: p.id || p._id }));
      const filtered = filterPostsForLocation(normalized);
      
      let finalPosts = filtered;
      if (isLoadMore) {
        finalPosts = [...allPosts, ...filtered];
        setAllPosts(finalPosts);
        setFilteredPosts(finalPosts);
        setPage(p => p + 1);
      } else {
        setAllPosts(filtered);
        setFilteredPosts(filtered);
        setPage(0);
        setHasMore(locationPosts.length === LIMIT);

        // --- NEW: Set Most Liked Image for Region Header ---
        if (filtered.length > 0) {
          const mostLiked = filtered.reduce((prev: any, curr: any) =>
            (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
          );
          if (mostLiked?.imageUrl) setMostLikedPostImage(mostLiked.imageUrl);
        }
      }

        // --- Meta Logic ---
        if (filtered.length > 0) {
          // Trigger enrichment in background
          enrichDataInBackground(finalPosts, filtered);
        }
    } catch (err) {
      console.error('[fetchLocationPosts] Error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchRegionPosts = async (rid: string, regionName: string, isLoadMore = false) => {
    const searchLocationName = regionName || rid;
    if (!searchLocationName) return;

    try {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      const skip = isLoadMore ? (page + 1) * LIMIT : 0;
      const response = await apiService.getPostsByLocation(searchLocationName, skip, LIMIT, viewerId || undefined);
      let locationPosts = response?.success && Array.isArray(response?.data) ? response.data : [];

      if (locationPosts.length < LIMIT) setHasMore(false);

      const normalized = locationPosts.map((p: any) => ({ ...p, id: p.id || p._id }));
      const filtered = filterPostsForLocation(normalized);

      let finalPosts = filtered;
      if (isLoadMore) {
        finalPosts = [...allPosts, ...filtered];
        setAllPosts(finalPosts);
        setFilteredPosts(finalPosts);
        setPage(p => p + 1);
      } else {
        setAllPosts(filtered);
        setFilteredPosts(filtered);
        setPage(0);
        setHasMore(locationPosts.length === LIMIT);

        // --- NEW: Set Most Liked Image for Header ---
        if (filtered.length > 0) {
          const mostLiked = filtered.reduce((prev: any, curr: any) =>
            (curr.likesCount || 0) > (prev.likesCount || 0) ? curr : prev
          );
          if (mostLiked?.imageUrl) setMostLikedPostImage(mostLiked.imageUrl);
        }
      }

      if (filtered.length > 0) {
        enrichDataInBackground(finalPosts, filtered);
      }
    } catch (err) {
      console.error('[fetchRegionPosts] Error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchLocationStories = async (searchLocationName: string, countriesList: string[] = []) => {
    try {
      const pid = typeof placeId === 'string' ? placeId : Array.isArray(placeId) ? placeId[0] : '';
      const addr = typeof locationAddress === 'string' ? locationAddress : Array.isArray(locationAddress) ? locationAddress[0] : '';

      const mergeUnique = (a: any[], b: any[]) => {
        const seen = new Set<string>();
        const out: any[] = [];
        for (const x of [...a, ...b]) {
          const k = String((x as any)?.id || (x as any)?._id || '').trim();
          if (!k) continue;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(x);
        }
        return out;
      };

      const [feedRes, activeRes] = await Promise.all([
        apiService.get('/stories?skip=0&limit=100').catch(() => null),
        apiService.get('/stories/active').catch(() => null),
      ]);

      let rawList = extractStoryListFromResponseBody(feedRes);
      if (rawList.length === 0) rawList = extractStoryListFromResponseBody(feedRes?.data ?? feedRes);
      const activeList = extractStoryListFromResponseBody(activeRes);
      rawList = mergeUnique(rawList, activeList);

      rawList = await hydrateStoryDocumentsIfNeeded(rawList);

      const normalizedStories = rawList.map((story: any, idx: number) => storyForStoriesViewer(story, idx));

      const needle = String(searchLocationName || '').toLowerCase().trim();
      const needleAddr = String(addr || '').toLowerCase().trim();
      const pidLower = String(pid || '').toLowerCase().trim();
      const countrySet = new Set(countriesList.map(c => c.toLowerCase()));

      const locationStories = normalizedStories.filter((story: any) => {
        const name = String(story?.locationData?.name || story?.location || '').toLowerCase();
        const storyAddr = String(story?.locationData?.address || '').toLowerCase();
        const storyPid = String(story?.locationData?.placeId || '').toLowerCase();
        const storyCountry = String(story?.locationData?.country || '').toLowerCase();

        if (pidLower && storyPid && storyPid === pidLower) return true;
        if (needle && name.includes(needle)) return true;
        if (needleAddr && (name.includes(needleAddr) || storyAddr.includes(needleAddr))) return true;
        if (needleAddr && needle && storyAddr.includes(needle)) return true;

        // If we have a list of countries for region scope, match countries
        if (countriesList.length > 0) {
          if (storyCountry && countrySet.has(storyCountry)) return true;
          for (const country of countriesList) {
            const cLower = country.toLowerCase();
            if (name.includes(cLower) || storyAddr.includes(cLower)) return true;
          }
        }

        return false;
      });

      console.log(`[Location] Found ${locationStories.length} stories for "${searchLocationName}"`);
      setStories(locationStories);
    } catch (error) {
      console.log('Stories endpoint not available or no stories:', error);
      setStories([]);
    }
  };

  const enrichDataInBackground = async (fullList: any[], newItems: any[]) => {
    try {
      // Only enrich placeIds that haven't been enriched yet
      const uniquePlaceIds = Array.from(new Set(
        newItems
          .map((p: any) => p.locationData?.placeId)
          .filter(pid => pid && !fullList.find(fp => fp.locationData?.placeId === pid && fp.locationData?.neighborhood))
      ));

      if (uniquePlaceIds.length === 0) return;

      // Batch: max 5 concurrent Google API calls to avoid rate-limits
      const BATCH_SIZE = 5;
      const detailsMap = new Map();
      
      for (let i = 0; i < uniquePlaceIds.length; i += BATCH_SIZE) {
        const batch = uniquePlaceIds.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (pid) => {
          try {
            const details = await mapService.getPlaceDetails(pid as string);
            if (details) detailsMap.set(pid, details);
          } catch {}
        }));
      }

      if (detailsMap.size === 0) return;

      // Use functional updater to avoid stale closure over allPosts
      setAllPosts(prev => prev.map((p: any) => {
        const details = detailsMap.get(p.locationData?.placeId);
        if (details) {
          return {
            ...p,
            locationData: {
              ...p.locationData,
              neighborhood: details.neighborhood || details.sublocality,
              sublocality: details.sublocality,
            }
          };
        }
        return p;
      }));
    } catch (err) {
      console.error('[enrichDataInBackground] Error:', err);
    }
  };

  // --- NEW: Hierarchical Grouping & Filtering Logic (Adaptive Geo-Scope Aware) ---
  useEffect(() => {
    if (allPosts.length === 0) {
      setSubLocations([]);
      return;
    }

    const currentScope = getGeoScope();
    const areaMap = new Map<string, SubLocation>();
    
    allPosts.forEach((post: any) => {
      let areaName = 'General';
      let spotName = post?.locationData?.name || post?.locationName || 'General';

      if (currentScope === 'CONTINENT') {
        // Continent Scope: Group by Country, Nested Spots = Cities/Venues
        areaName = extractCountryIntelligently(post);
        spotName = extractCityIntelligently(post);
      } else if (currentScope === 'COUNTRY') {
        // Country Scope: Group by City, Nested Spots = Neighborhoods/Venues
        areaName = extractCityIntelligently(post);
        spotName = post?.locationData?.neighborhood || post?.locationData?.name || post?.locationName || 'General';
      } else {
        // City Scope (Default): Group by Neighborhood/District, Nested Spots = Venues/Landmarks
        areaName = extractSubLocationName(post);
        spotName = post?.locationData?.name || post?.locationName || areaName;

        // Avoid redundancy (e.g. area name shouldn't equal main city name)
        if (areaName.toLowerCase() === String(locationName).toLowerCase()) {
          areaName = spotName !== areaName ? spotName : 'General';
        }
      }

      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          name: areaName,
          count: 0,
          thumbnail: post.imageUrl || '',
          posts: [],
          spots: []
        });
      }
      
      const areaObj = areaMap.get(areaName)!;
      areaObj.posts.push(post);
      areaObj.count++;

      // Spot Grouping within Area
      if (spotName !== areaName && spotName !== 'General') {
        let spotObj = areaObj.spots?.find(s => s.name === spotName);
        if (!spotObj) {
          spotObj = { name: spotName, thumbnail: post.imageUrl || '', posts: [] };
          areaObj.spots?.push(spotObj);
        }
        spotObj.posts.push(post);
      }
    });

    const subs = Array.from(areaMap.values()).sort((a, b) => b.count - a.count);
    setSubLocations(subs);
  }, [allPosts, locationName, scope, getGeoScope]);

  // Update Filtered Posts whenever selection or data changes
  useEffect(() => {
    if (!selectedSubLocation) {
      setFilteredPosts(allPosts);
      return;
    }

    const area = subLocations.find(sl => sl.name === selectedSubLocation);
    if (!area) {
      setFilteredPosts(allPosts);
      return;
    }

    if (!selectedSpecificSpot) {
      setFilteredPosts(area.posts);
    } else {
      const spot = area.spots?.find(s => s.name === selectedSpecificSpot);
      setFilteredPosts(spot ? spot.posts : area.posts);
    }
  }, [allPosts, selectedSubLocation, selectedSpecificSpot, subLocations]);

  const handleSubLocationFilter = (subLocationName: string) => {
    if (selectedSubLocation === subLocationName) {
      setSelectedSubLocation(null);
      setSelectedSpecificSpot(null);
    } else {
      setSelectedSubLocation(subLocationName);
      setSelectedSpecificSpot(null);
    }
    hapticLight();
  };

  const handleSpecificSpotFilter = (spotName: string) => {
    if (selectedSpecificSpot === spotName) {
      setSelectedSpecificSpot(null);
    } else {
      setSelectedSpecificSpot(spotName);
    }
    hapticLight();
  };



  if (loading && !placeDetails) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={[styles.header, { justifyContent: 'space-between', paddingTop: safeTop, height: totalHeaderHeight }]}>
          <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, paddingTop: 10 }}>
          <LocationSkeleton />
          <LocationSkeleton />
          <LocationSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!placeDetails) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={[styles.header, { justifyContent: 'space-between', paddingTop: safeTop, height: totalHeaderHeight }]}>
          <TouchableOpacity onPress={() => safeRouterBack()} style={styles.backButton}>
            <Feather name="arrow-left" size={28} color="#000" />
          </TouchableOpacity>
        </View>
        <Text style={{ margin: 24, fontSize: 16, color: '#666', textAlign: 'center' }}>No details found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View
        style={{
          height: animatedHeaderHeight,
          transform: [{ translateY: animatedHeaderTranslateY }],
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        <View style={[styles.header, { justifyContent: 'space-between', paddingTop: safeTop, height: totalHeaderHeight }]}>
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              safeRouterBack();
            }}
            style={styles.backButton}
          >
          <Feather name="arrow-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerRightIcons}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              router.push('/passport' as any);
            }}
          >
            <Feather name="briefcase" size={20} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              router.push('/inbox' as any);
            }}
          >
            <Feather name="message-square" size={20} color="#000" />
            <View style={styles.badge} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => {
              hapticLight();
              setNotificationsModalVisible(true);
            }}
          >
            <Feather name="bell" size={20} color="#000" />
          </TouchableOpacity>
        </View>
        </View>
      </Animated.View>

      {loading && allPosts.length === 0 ? (
        <View style={{ flex: 1, paddingTop: totalHeaderHeight }}>
          <LocationSkeleton />
          <LocationSkeleton />
          <LocationSkeleton />
        </View>
      ) : (
        <FlatList
          data={selectedSubLocation ? filteredPosts : allPosts}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset?.y ?? 0;
            const prevY = lastScrollYRef.current;
            lastScrollYRef.current = y;

            const delta = y - prevY;
            if (Math.abs(delta) < 6) return; // ignore jitters

            if (y > 400) {
              if (!showScrollTop) setShowScrollTop(true);
            } else {
              if (showScrollTop) setShowScrollTop(false);
            }

            if (y <= 8) {
              applyHeaderState(false);
            } else if (y > 56) {
              applyHeaderState(true);
            }
          }}
          ref={flatListRef}
          keyExtractor={(item, index) => {
            const id = String(item?.id || item?._id || '').trim();
            return id || `post-${index}`;
          }}
          ListHeaderComponent={
            <>
              {/* Location Header Card */}
              <View style={styles.locationHeaderCard}>
                <Image
                  source={{ uri: getOptimizedUrl(mostLikedPostImage || 'https://via.placeholder.com/80', 400) }}
                  style={styles.locationImage}
                />
                <View style={styles.locationTextContainer}>
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={16} color="#000" />
                    <Text style={styles.locationNameText} numberOfLines={1}>
                      {formatHeaderLocationName()}
                    </Text>
                  </View>
                  <View style={[styles.locationRow, { marginTop: 6 }]}>
                    <Ionicons name="people" size={16} color="#666" />
                    <Text style={styles.visitsText}>{totalVisits} Visits</Text>
                  </View>
                  <View style={[styles.locationRow, { marginTop: 4 }]}>
                    <Ionicons name="checkmark-circle" size={16} color="#666" />
                    <Text style={styles.verifiedText}>{verifiedVisits || 137} Verified visits</Text>
                  </View>
                </View>
              </View>

              {/* Stories/People Section */}
              {stories.length > 0 && (
                <View style={styles.storiesSection}>
                  <Text style={styles.sectionTitle}>STORIES</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storiesScroll}
                  >
                    {stories.map((story, index) => (
                      <TouchableOpacity
                        key={story.id || story._id || `story - ${index} `}
                        style={styles.storyCard}
                        onPress={() => onStoryPress && onStoryPress(stories, index)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(story.imageUrl || story.userAvatar || '', 200) }}
                          style={styles.storyAvatar}
                        />
                        <Text style={styles.storyUserName} numberOfLines={1}>
                          {(story.userName || 'user').toLowerCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Sub Locations Section (PLACES) */}
              {subLocations.length > 0 && (
                <View style={styles.subLocationsSection}>
                  <Text style={styles.sectionTitle}>{getSubLocationsTitle()}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subLocationsScroll}
                  >
                    {subLocations.map((subLoc) => (
                      <TouchableOpacity
                        key={subLoc.name}
                        style={styles.subLocationCard}
                        onPress={() => handleSubLocationFilter(subLoc.name)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(subLoc.thumbnail || 'https://via.placeholder.com/100', 200) }}
                          style={[
                            styles.subLocationImage,
                            selectedSubLocation === subLoc.name && styles.subLocationImageSelected
                          ]}
                        />
                        <Text 
                          style={[
                            styles.subLocationName,
                            selectedSubLocation === subLoc.name && styles.subLocationNameSelected
                          ]} 
                          numberOfLines={2}
                        >
                          {subLoc.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Nested Specific Spots (e.g. MARYLEBONE) */}
              {selectedSubLocation && subLocations.find(s => s.name === selectedSubLocation)?.spots?.length! > 0 && (
                <View style={[styles.subLocationsSection, { borderBottomWidth: 0, paddingTop: 0 }]}>
                  <Text style={[styles.sectionTitle, { textTransform: 'uppercase' }]}>{selectedSubLocation}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subLocationsScroll}
                  >
                    {subLocations.find(s => s.name === selectedSubLocation)?.spots?.map((spot) => (
                      <TouchableOpacity
                        key={spot.name}
                        style={styles.subLocationCard}
                        onPress={() => handleSpecificSpotFilter(spot.name)}
                      >
                        <Image
                          source={{ uri: getOptimizedUrl(spot.thumbnail || 'https://via.placeholder.com/100', 200) }}
                          style={[
                            styles.subLocationImage,
                            selectedSpecificSpot === spot.name && styles.subLocationImageSelected
                          ]}
                        />
                        <Text 
                          style={[
                            styles.subLocationName,
                            selectedSpecificSpot === spot.name && styles.subLocationNameSelected
                          ]} 
                          numberOfLines={2}
                        >
                          {spot.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          }
          renderItem={renderPostItem}
          onEndReached={() => {
            if (hasMore && !loadingMore && !loading) {
              if (isRegionScope) fetchRegionPosts(regionIdStr, locationName as string, true);
              else fetchLocationPosts(locationName as string, true);
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            ) : null
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="map-pin" size={64} color="#ccc" />
              <Text style={styles.emptyText}>No posts from this location</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Stories Viewer Modal */}
      {showStoriesViewer && selectedStories.length > 0 && (
        <Modal
          visible={showStoriesViewer}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setShowStoriesViewer(false)}
        >
          <StoriesViewer
            stories={selectedStories}
            onClose={() => setShowStoriesViewer(false)}
          />
        </Modal>
      )}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <TouchableOpacity
          style={[styles.scrollTopButton, { bottom: 30 + (insets.bottom || 0) }]}
          onPress={() => {
            hapticLight();
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
        >
          <Feather name="arrow-up" size={24} color="#007AFF" />
        </TouchableOpacity>
      )}

      {/* Notifications Modal */}
      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  headerLogoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerIconBtn: {
    position: 'relative',
    padding: 2,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF8D00',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Location Header Card
  // Location Header Card
  locationHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  locationImage: {
    width: 76,
    height: 76,
    borderRadius: 26,
    marginRight: 16,
    backgroundColor: '#f0f0f0',
  },
  locationTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginLeft: 6,
  },
  visitsText: {
    fontSize: 13,
    color: '#444',
    marginLeft: 6,
  },
  verifiedText: {
    fontSize: 13,
    color: '#222',
    marginLeft: 6,
  },

  // Section Defaults
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginLeft: 20,
    marginBottom: 12,
    letterSpacing: 0.5,
  },

  // Stories Section
  storiesSection: {
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  storiesScroll: {
    paddingHorizontal: 20,
  },
  storyCard: {
    width: 68,
    marginRight: 14,
    alignItems: 'center',
  },
  storyAvatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
  },
  storyUserName: {
    fontSize: 12,
    fontWeight: '400',
    color: '#111',
    textAlign: 'center',
    width: 68,
    marginTop: 8,
  },

  // Sub Locations Section
  subLocationsSection: {
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  subLocationsScroll: {
    paddingHorizontal: 20,
  },
  subLocationCard: {
    width: 72,
    marginRight: 16,
    alignItems: 'center',
  },
  subLocationImage: {
    width: 72,
    height: 72,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  subLocationImageSelected: {
    borderColor: '#FF8D00',
    borderWidth: 2,
  },
  subLocationName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
    width: 76,
    marginTop: 8,
    lineHeight: 14,
  },
  subLocationNameSelected: {
    color: '#000',
    fontWeight: '700',
  },



  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  scrollTopButton: {
    position: 'absolute',
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
