/**
 * Google Maps Service Implementation
 * Implements IMapService using Google Maps API
 */

import { LocationData, Region } from '../../types/models';
import { IMapService } from '../interfaces/IMapService';

// API key must be provided through environment configuration
let API_KEY = '';
const API_TIMEOUT = 30000;

// Try to load from environment
try {
  const { GOOGLE_MAPS_CONFIG } = require('../../config/environment');
  if (GOOGLE_MAPS_CONFIG?.apiKey && !GOOGLE_MAPS_CONFIG.apiKey.includes('SET_GOOGLE_MAPS')) {
    API_KEY = GOOGLE_MAPS_CONFIG.apiKey;
  } else {
    // Check direct process.env as fallback
    API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  }
} catch (err) {
  // Config module may be unavailable in isolated test contexts
  API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

export class GoogleMapsService implements IMapService {
  private apiKey: string;
  private autocompleteCache: Map<string, any[]> = new Map();
  private nearbyCache: Map<string, { data: LocationData[], timestamp: number }> = new Map();
  private reverseGeocodeCache: Map<string, { data: LocationData | null, timestamp: number }> = new Map();
  private detailsCache: Map<string, { data: LocationData | null, timestamp: number }> = new Map();
  private searchCache: Map<string, { data: LocationData[], timestamp: number }> = new Map();

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_TTL;
  }

  constructor() {
    this.apiKey = API_KEY;
  }

  private hasApiKey(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
  }

  async geocodeAddress(address: string): Promise<LocationData | null> {
    if (!this.hasApiKey()) return null;
    const cacheKey = address.toLowerCase();
    const cached = this.searchCache.get(cacheKey); // Reuse searchCache map
    if (cached && this.isCacheValid(cached.timestamp) && cached.data.length > 0) {
      return cached.data[0];
    }
    
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          address
        )}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const result = this.parseGoogleMapsResult(data.results[0]);
        this.searchCache.set(cacheKey, { data: [result], timestamp: Date.now() });
        return result;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<LocationData | null> {
    if (!this.hasApiKey()) return null;
    // Round to ~11 meters precision to increase cache hits for micro-movements
    const latKey = latitude.toFixed(4);
    const lonKey = longitude.toFixed(4);
    const cacheKey = `${latKey},${lonKey}`;
    
    const cached = this.reverseGeocodeCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const result = this.parseGoogleMapsResult(data.results[0]);
        this.reverseGeocodeCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }

      this.reverseGeocodeCache.set(cacheKey, { data: null, timestamp: Date.now() });
      return null;
    } catch (error) {
      return null;
    }
  }

  async searchPlaces(query: string, region?: Region): Promise<LocationData[]> {
    if (!this.hasApiKey()) return [];
    
    const cacheKey = `${query.toLowerCase()}_${region ? `${region.latitude.toFixed(4)},${region.longitude.toFixed(4)}` : 'none'}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
        query
      )}&key=${this.apiKey}`;

      if (region) {
        url += `&location=${region.latitude},${region.longitude}&radius=50000`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Place search failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const results = data.results.map((result: any) => this.parsePlaceResult(result));
        this.searchCache.set(cacheKey, { data: results, timestamp: Date.now() });
        return results;
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  async getPlaceDetails(placeId: string): Promise<LocationData | null> {
    if (!this.hasApiKey()) return null;
    
    const cached = this.detailsCache.get(placeId);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Place details failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.result) {
        const result = this.parsePlaceResult(data.result);
        this.detailsCache.set(placeId, { data: result, timestamp: Date.now() });
        return result;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async getAutocompleteSuggestions(
    input: string
  ): Promise<{ placeId: string; description: string; mainText?: string; secondaryText?: string }[]> {
    if (!this.hasApiKey()) return [];
    try {
      console.log(`[GoogleMapsService] Calling getAutocompleteSuggestions for: "${input}"`);
      // Check cache first
      const cacheKey = input.toLowerCase();
      if (this.autocompleteCache.has(cacheKey)) {
        return this.autocompleteCache.get(cacheKey)!;
      }

      // Using Google Places API Autocomplete endpoint
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&key=${this.apiKey}&language=en`;
      console.log('[GoogleMapsService] AutoComplete URL:', url.replace(this.apiKey, '[API_KEY_HIDDEN]'));


      const response = await fetch(url, {
        method: 'GET',
      });

      const data = await response.json();

      if (data.status === 'REQUEST_DENIED') {
        throw new Error(data.error_message || 'API request denied');
      }

      let results: any[] = [];
      if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
        results = data.predictions.map((prediction: any) => ({
          placeId: prediction.place_id,
          description: prediction.description,
          mainText: prediction.structured_formatting?.main_text || prediction.description,
          secondaryText: prediction.structured_formatting?.secondary_text || '',
        }));
      }

      // Cache the results
      this.autocompleteCache.set(cacheKey, results);

      // Clear cache after 5 minutes to prevent stale data
      setTimeout(() => {
        this.autocompleteCache.delete(cacheKey);
      }, 5 * 60 * 1000);

      return results;
    } catch (error) {
      console.error('[GoogleMapsService] AutoComplete Error:', error);
      return [];
    }
  }

  async getNearbyPlaces(latitude: number, longitude: number, radiusMeters: number, keyword?: string): Promise<LocationData[]> {
    if (!this.hasApiKey()) return [];
    
    // Round to 3 decimal places (~110 meters) to group nearby queries aggressively
    const latKey = latitude.toFixed(3);
    const lonKey = longitude.toFixed(3);
    const cacheKey = `${latKey},${lonKey}_${radiusMeters}_${keyword?.trim().toLowerCase() || 'none'}`;
    
    const cached = this.nearbyCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const radius = Math.max(1, Math.min(50000, Math.floor(radiusMeters || 0)));
      let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radius}&key=${this.apiKey}`;
      if (keyword && keyword.trim()) {
        url += `&keyword=${encodeURIComponent(keyword.trim())}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); 

      const response = await fetch(url, { 
        method: 'GET',
        signal: controller.signal as any, 
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Nearby search failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'OK' && Array.isArray(data.results)) {
        const results = data.results.map((r: any) => this.parsePlaceResult(r));
        this.nearbyCache.set(cacheKey, { data: results, timestamp: Date.now() });
        return results;
      }

      if (data.status === 'ZERO_RESULTS') {
        this.nearbyCache.set(cacheKey, { data: [], timestamp: Date.now() });
        return [];
      }

      throw new Error(data.error_message || `Nearby search failed with status: ${data.status}`);

    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.warn('[GoogleMapsService] Nearby Places request timed out (AbortError).');
      } else {
        console.error('[GoogleMapsService] Nearby Places Error:', error);
      }
      return [];
    }
  }

  async calculateDistance(from: LocationData, to: LocationData): Promise<number> {
    // Haversine formula for calculating distance
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(to.latitude - from.latitude);
    const dLon = this.toRadians(to.longitude - from.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(from.latitude)) *
      Math.cos(this.toRadians(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  async getDirections(
    from: LocationData,
    to: LocationData,
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<any> {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&mode=${mode}&key=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`Directions failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'OK' && data.routes.length > 0) {
        return data.routes[0];
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getProvider(): 'google' | 'mapbox' | 'apple' {
    return 'google';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  // ==================== HELPER METHODS ====================

  private parseGoogleMapsResult(result: any): LocationData {
    const location = result.geometry.location;
    const addressComponents = result.address_components || [];

    const city = this.findAddressComponent(addressComponents, 'locality');
    const country = this.findAddressComponent(addressComponents, 'country');
    const countryCode = this.findAddressComponent(addressComponents, 'country', 'short_name');

    return {
      latitude: location.lat,
      longitude: location.lng,
      address: result.formatted_address,
      city,
      country,
      countryCode,
      placeId: result.place_id,
      placeName: result.name,
    };
  }

  private parsePlaceResult(result: any): LocationData {
    const location = result.geometry.location;

    return {
      latitude: location.lat,
      longitude: location.lng,
      address: result.formatted_address || result.vicinity,
      placeName: result.name,
      placeId: result.place_id,
    };
  }

  private findAddressComponent(
    components: any[],
    type: string,
    field: 'long_name' | 'short_name' = 'long_name'
  ): string | undefined {
    const component = components.find((c) => c.types.includes(type));
    return component ? component[field] : undefined;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// Export singleton instance
export const mapService = new GoogleMapsService();
