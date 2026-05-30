export const normalizeCountryName = (value?: string | null): string => {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

export const getCleanAddressParts = (addressString?: string | null): string[] => {
  if (!addressString || typeof addressString !== 'string') return [];
  
  const parts = addressString.split(',').map(p => p.trim()).filter(Boolean);
  const cleanParts: string[] = [];
  
  for (const part of parts) {
    let p = part;
    
    // Remove UK-style postal codes (case-insensitive, e.g. SW1A 1AA)
    p = p.replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, '');
    
    // Remove US/Canadian/European zip codes and any stand-alone numbers
    p = p.replace(/\b\d{3,8}\b/g, '');
    p = p.replace(/\b\d+\b/g, '');
    
    // Clean up extra whitespace
    p = p.trim().replace(/\s+/g, ' ');
    
    // Only keep if it has at least 2 characters and contains letters
    if (p.length >= 2 && /[a-zA-Z]/.test(p)) {
      cleanParts.push(p);
    }
  }
  
  return cleanParts;
};

export const getCountryFromAddress = (address?: string | null): string | null => {
  if (!address) return null;
  const cleanParts = getCleanAddressParts(address);
  return cleanParts.length ? cleanParts[cleanParts.length - 1] : null;
};

export const PLUS_CODE_PATTERN = /[A-Z0-9]{4,}\+[A-Z0-9]{2,}/i;
export const COORDINATE_PATTERN = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/;

export const isReadableLocationLabel = (value?: string | null): boolean => {
  if (!value) return false;
  const label = String(value).trim();
  if (!label) return false;
  if (PLUS_CODE_PATTERN.test(label)) return false;
  if (COORDINATE_PATTERN.test(label)) return false;
  const lower = label.toLowerCase();
  if (lower === 'unknown' || lower === 'unknown place' || lower === 'n/a') return false;
  return true;
};

export const getSuggestionLocationLabel = (suggestion: any): string => {
  if (!suggestion) return 'this location';

  const main = suggestion?.mainSuggestion || {};
  const candidates: Array<string | undefined> = [
    main?.name,
    main?.place,
    main?.placeName,
    main?.parentCity,
    main?.parentCountry,
  ];

  if (Array.isArray(suggestion?.suggestions)) {
    for (const s of suggestion.suggestions) {
      candidates.push(s?.name, s?.place, s?.placeName, s?.parentCity, s?.parentCountry);
    }
  }

  for (const candidate of candidates) {
    if (isReadableLocationLabel(candidate)) {
      return String(candidate).trim();
    }
  }

  return 'this location';
};
