import {
  normalizeCountryName,
  getCleanAddressParts,
  getCountryFromAddress,
  isReadableLocationLabel,
  getSuggestionLocationLabel,
} from '../passportUtils';

describe('passportUtils', () => {
  describe('normalizeCountryName', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizeCountryName(null)).toBe('');
      expect(normalizeCountryName(undefined)).toBe('');
    });

    it('should trim and lowercase', () => {
      expect(normalizeCountryName('  United States  ')).toBe('united states');
    });

    it('should remove accents', () => {
      expect(normalizeCountryName('México')).toBe('mexico');
      expect(normalizeCountryName('España')).toBe('espana');
    });
  });

  describe('getCleanAddressParts', () => {
    it('should handle null/undefined/non-strings', () => {
      expect(getCleanAddressParts(null)).toEqual([]);
      expect(getCleanAddressParts(undefined)).toEqual([]);
    });

    it('should clean and split typical Google Maps addresses, filtering numeric ZIP codes and street numbers', () => {
      expect(getCleanAddressParts('1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA')).toEqual([
        'Amphitheatre Pkwy',
        'Mountain View',
        'CA',
        'USA'
      ]);
      
      expect(getCleanAddressParts('Buckingham Palace, London SW1A 1AA, UK')).toEqual([
        'Buckingham Palace',
        'London',
        'UK'
      ]);

      expect(getCleanAddressParts('Eiffel Tower, Paris, 75007, France')).toEqual([
        'Eiffel Tower',
        'Paris',
        'France'
      ]);
    });
  });

  describe('getCountryFromAddress', () => {
    it('should return null for null/undefined', () => {
      expect(getCountryFromAddress(null)).toBeNull();
      expect(getCountryFromAddress(undefined)).toBeNull();
    });

    it('should extract the last part of a comma-separated address', () => {
      expect(getCountryFromAddress('123 Main St, New York, NY, USA')).toBe('USA');
      expect(getCountryFromAddress('London, UK')).toBe('UK');
    });

    it('should bypass zip codes and stand-alone numbers at the end', () => {
      expect(getCountryFromAddress('Eiffel Tower, Paris, 75007')).toBe('Paris');
      expect(getCountryFromAddress('Buckingham Palace, London SW1A 1AA')).toBe('London');
    });

    it('should return the whole string if no commas and no digits', () => {
      expect(getCountryFromAddress('Australia')).toBe('Australia');
    });
  });

  describe('isReadableLocationLabel', () => {
    it('should return false for invalid labels', () => {
      expect(isReadableLocationLabel(null)).toBe(false);
      expect(isReadableLocationLabel('')).toBe(false);
      expect(isReadableLocationLabel('Unknown')).toBe(false);
      expect(isReadableLocationLabel('N/A')).toBe(false);
    });

    it('should return false for plus codes', () => {
      expect(isReadableLocationLabel('9C3X+GV London')).toBe(false);
      expect(isReadableLocationLabel('8V7W+XM Paris')).toBe(false);
    });

    it('should return false for coordinates', () => {
      expect(isReadableLocationLabel('51.5074, -0.1278')).toBe(false);
    });

    it('should return true for valid labels', () => {
      expect(isReadableLocationLabel('Eiffel Tower')).toBe(true);
      expect(isReadableLocationLabel('London, United Kingdom')).toBe(true);
    });
  });

  describe('getSuggestionLocationLabel', () => {
    it('should return "this location" for null/undefined', () => {
      expect(getSuggestionLocationLabel(null)).toBe('this location');
    });

    it('should find the first readable label in candidates', () => {
      const suggestion = {
        mainSuggestion: {
          name: '9C3X+GV', // invalid
          place: 'Big Ben', // valid
        },
      };
      expect(getSuggestionLocationLabel(suggestion)).toBe('Big Ben');
    });

    it('should check nested suggestions', () => {
      const suggestion = {
        mainSuggestion: { name: 'Unknown' },
        suggestions: [
          { name: '51.5, -0.1' },
          { name: 'London Eye' },
        ],
      };
      expect(getSuggestionLocationLabel(suggestion)).toBe('London Eye');
    });

    it('should fallback to "this location" if no readable labels found', () => {
      const suggestion = {
        mainSuggestion: { name: 'Unknown' },
        suggestions: [
          { name: '8V7W+XM' },
        ],
      };
      expect(getSuggestionLocationLabel(suggestion)).toBe('this location');
    });
  });
});
