import { isReadableLocationLabel, getBestLocationLabel } from '../locationService';

// Mock the modules that locationService imports to avoid side effects
jest.mock('expo-location', () => ({}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));
jest.mock('@/src/services/apiService', () => ({}));
jest.mock('@/lib/storage', () => ({}));
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(),
  },
}));

describe('locationService utilities', () => {
  describe('isReadableLocationLabel', () => {
    it('should return false for empty or null values', () => {
      expect(isReadableLocationLabel('')).toBe(false);
      expect(isReadableLocationLabel(null as any)).toBe(false);
      expect(isReadableLocationLabel(undefined as any)).toBe(false);
    });

    it('should return false for Plus Codes', () => {
      expect(isReadableLocationLabel('H2WR+6M Lahore, Pakistan')).toBe(false);
      expect(isReadableLocationLabel('8F64PH89+H3')).toBe(false);
    });

    it('should return false for raw coordinates', () => {
      expect(isReadableLocationLabel('31.5204, 74.3587')).toBe(false);
      expect(isReadableLocationLabel('31.5204,74.3587')).toBe(false);
    });

    it('should return false for placeholder values', () => {
      expect(isReadableLocationLabel('unknown')).toBe(false);
      expect(isReadableLocationLabel('UNKNOWN PLACE')).toBe(false);
      expect(isReadableLocationLabel('N/A')).toBe(false);
    });

    it('should return true for valid names', () => {
      expect(isReadableLocationLabel('Lahore')).toBe(true);
      expect(isReadableLocationLabel('Liberty Market')).toBe(true);
      expect(isReadableLocationLabel('Pakistan')).toBe(true);
    });
  });

  describe('getBestLocationLabel', () => {
    it('should prioritize more specific names over generic ones', () => {
      const suggestion = {
        name: 'Badshahi Mosque',
        parentCity: 'Lahore',
        parentCountry: 'Pakistan'
      };
      expect(getBestLocationLabel(suggestion, 'Lahore', 'Pakistan')).toBe('Badshahi Mosque');
    });

    it('should fallback to city if name is missing or invalid', () => {
      const suggestion = {
        name: '8F64PH89+H3',
        parentCity: 'Lahore',
        parentCountry: 'Pakistan'
      };
      expect(getBestLocationLabel(suggestion, 'Lahore', 'Pakistan')).toBe('Lahore');
    });

    it('should return "this location" as a final fallback', () => {
      expect(getBestLocationLabel({}, 'unknown', 'N/A')).toBe('this location');
    });
  });
});
