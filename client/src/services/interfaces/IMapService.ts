/**
 * Map Service Interface
 * Abstract interface for map and geocoding operations
 * Implement this to swap Google Maps with Mapbox, Apple Maps, etc.
 */

import { LocationData, Region } from '@/types/models';

export interface IMapService {
  // ==================== GEOCODING ====================
  /**
   * Convert address string to coordinates
   */
  geocodeAddress(address: string): Promise<LocationData | null>;

  /**
   * Convert coordinates to address
   */
  reverseGeocode(latitude: number, longitude: number): Promise<LocationData | null>;

  // ==================== PLACE SEARCH ====================
  /**
   * Search for places by query string
   */
  searchPlaces(query: string, region?: Region): Promise<LocationData[]>;

  /**
   * Get detailed information about a place
   */
  getPlaceDetails(placeId: string): Promise<LocationData | null>;

  /**
   * Get autocomplete suggestions for place search
   */
  getAutocompleteSuggestions(input: string): Promise<{ placeId: string; description: string }[]>;
  getNearbyPlaces(latitude: number, longitude: number, radiusMeters: number, keyword?: string): Promise<LocationData[]>;

  // ==================== DISTANCE & DIRECTIONS ====================
  /**
   * Calculate distance between two points (in kilometers)
   */
  calculateDistance(from: LocationData, to: LocationData): Promise<number>;

  /**
   * Get directions between two points
   */
  getDirections(from: LocationData, to: LocationData, mode?: 'driving' | 'walking' | 'transit'): Promise<any>;

  // ==================== CONFIGURATION ====================
  /**
   * Get the API key for the map service
   */
  getApiKey(): string;

  /**
   * Get the current map provider
   */
  getProvider(): 'google' | 'mapbox' | 'apple';

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean;
}
