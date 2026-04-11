/**
 * Service Provider
 * Central export point for all services
 * Change implementations here to swap providers
 */

// Import implementations
import ZeegocloudStreamingService from './implementations/ZeegocloudStreamingService';
import { FirebaseStorageService } from './implementations/FirebaseStorageService';
import { GoogleMapsService } from './implementations/GoogleMapsService';

// Import interfaces
import { IMapService } from './interfaces/IMapService';
import { IStreamingService } from './interfaces/IStreamingService';

// ==================== SERVICE INSTANCES ====================

// Lazy initialization to avoid blocking app startup
let _mapService: IMapService | null = null;
let _streamingService: IStreamingService | null = null;
let _storageService: FirebaseStorageService | null = null;

/**
 * Map Service
 * Current: Google Maps
 * To swap: Replace with new MapboxService(), AppleMapsService(), etc.
 */
export const mapService: IMapService = {
  geocodeAddress: async (address: string) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.geocodeAddress(address);
  },
  reverseGeocode: async (latitude: number, longitude: number) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.reverseGeocode(latitude, longitude);
  },
  searchPlaces: async (query: string, region?: { latitudeDelta: number; longitudeDelta: number; latitude: number; longitude: number }) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.searchPlaces(query, region);
  },
  getPlaceDetails: async (placeId: string) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getPlaceDetails(placeId);
  },
  getAutocompleteSuggestions: async (input: string) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getAutocompleteSuggestions(input);
  },
  getNearbyPlaces: async (latitude: number, longitude: number, radiusMeters: number, keyword?: string) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getNearbyPlaces(latitude, longitude, radiusMeters, keyword);
  },
  calculateDistance: async (origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.calculateDistance(origin, destination);
  },
  getDirections: async (origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }, mode?: 'driving' | 'walking' | 'transit') => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getDirections(origin, destination, mode);
  },
  getApiKey: () => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getApiKey();
  },
  getProvider: () => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.getProvider();
  },
  isConfigured: () => {
    if (!_mapService) _mapService = new GoogleMapsService();
    return _mapService.isConfigured();
  },
};

/**
 * Streaming Service
 * Current: Zeegocloud
 * To swap: Replace with new TwilioService(), AWSIVSService(), etc.
 */
export const getStreamingService = (): IStreamingService => {
  if (!_streamingService) {
    _streamingService = ZeegocloudStreamingService.getInstance();
  }
  return _streamingService as IStreamingService;
};

/**
 * Storage Service
 * Current: Firebase Storage
 * To swap: Replace with new S3StorageService(), CloudinaryService(), etc.
 */
export const getStorageService = () => {
  if (!_storageService) {
    _storageService = new FirebaseStorageService();
  }
  return _storageService;
};

// For backwards compatibility
export const streamingService = {
  initialize: async () => getStreamingService().initialize(),
  destroy: async () => getStreamingService().destroy(),
  isInitialized: () => _streamingService?.isInitialized() || false,
  joinChannel: async (channelName: string, userId: string, isHost: boolean = false) => getStreamingService().joinChannel(channelName, userId, isHost),
  leaveChannel: async () => getStreamingService().leaveChannel(),
  muteAudio: async () => getStreamingService().muteAudio(),
  unmuteAudio: async () => getStreamingService().unmuteAudio(),
  enableVideo: async () => getStreamingService().enableVideo(),
  disableVideo: async () => getStreamingService().disableVideo(),
  switchCamera: async () => getStreamingService().switchCamera(),
  onUserJoined: (callback: (userId: string) => void) => getStreamingService().onUserJoined(callback),
  onUserLeft: (callback: (userId: string) => void) => getStreamingService().onUserLeft(callback),
  onConnectionStateChanged: (callback: (state: string) => void) => getStreamingService().onConnectionStateChanged(callback),
  onError: (callback: (error: Error) => void) => getStreamingService().onError(callback),
};

export const storageService = {
  uploadImage: async (uri: string, path: string) => getStorageService().uploadImage(uri, path),
  uploadVideo: async (uri: string, path: string) => getStorageService().uploadVideo(uri, path),
  uploadFile: async (uri: string, path: string, contentType: string = 'application/octet-stream') => getStorageService().uploadFile(uri, path, contentType),
  deleteFile: async (path: string) => getStorageService().deleteFile(path),
  uploadMultipleImages: async (uris: string[], basePath: string) => getStorageService().uploadMultipleImages(uris, basePath),
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Initialize all services
 */
export async function initializeServices(): Promise<void> {
  try {
    console.log('Initializing services...');
    
    // Services will initialize lazily when first used
    
    console.log('All services ready for lazy initialization');
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Cleanup all services
 */
export async function cleanupServices(): Promise<void> {
  try {
    console.log('Cleaning up services...');
    
    // Cleanup streaming service if initialized
    if (_streamingService?.isInitialized()) {
      await _streamingService.destroy();
    }
    
    // Reset instances
    _mapService = null;
    _streamingService = null;
    _storageService = null;
    
    console.log('All services cleaned up successfully');
  } catch (error) {
    console.error('Failed to cleanup services:', error);
    throw error;
  }
}

// ==================== EXPORTS ====================

export { IMapService, IStreamingService };
