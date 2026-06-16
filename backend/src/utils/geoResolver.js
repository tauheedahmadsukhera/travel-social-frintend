const { countries, continents } = require('countries-list');

// Build a map of lowercase country names (and native names) to country codes
const countryNameToCode = {};
for (const [code, info] of Object.entries(countries)) {
  const nameLower = info.name.toLowerCase();
  countryNameToCode[nameLower] = code;
  
  if (info.native && info.native.toLowerCase() !== nameLower) {
    countryNameToCode[info.native.toLowerCase()] = code;
  }
}

// Add common aliases for robust lookup
const aliases = {
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
  'holland': 'NL',
  'netherlands': 'NL',
  'the netherlands': 'NL'
};

for (const [alias, code] of Object.entries(aliases)) {
  countryNameToCode[alias.toLowerCase()] = code;
}

// List of all country names and aliases for parsing filters
const ALL_COUNTRY_NAMES = Object.values(countries).map(c => c.name.toLowerCase());
const ALL_ALIASES = Object.keys(aliases);
const COUNTRIES_LIST_NAMES = Array.from(new Set([...ALL_COUNTRY_NAMES, ...ALL_ALIASES]));

// Lightweight fallback for major travel hubs to resolve city-only text
const CITY_TO_COUNTRY_FALLBACK = {
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

function isKnownCountry(name) {
  if (!name) return false;
  const norm = name.trim().toLowerCase();
  return countryNameToCode[norm] !== undefined;
}

function getCountryForCity(city) {
  if (!city) return null;
  const norm = city.trim().toLowerCase();
  return CITY_TO_COUNTRY_FALLBACK[norm] || null;
}

function normalizeCountryName(name) {
  if (!name) return 'General';
  const norm = name.trim().toLowerCase();
  const code = countryNameToCode[norm];
  if (code && countries[code]) {
    return countries[code].name;
  }
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getCleanAddressParts(addressString) {
  if (!addressString || typeof addressString !== 'string') return [];
  const parts = addressString.split(',').map(p => p.trim()).filter(Boolean);
  const cleanParts = [];
  
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
}

function extractCityIntelligently(locationName, address) {
  const fields = [address, locationName];
  for (const f of fields) {
    if (f && typeof f === 'string') {
      const cleanParts = getCleanAddressParts(f);
      const streetIndicators = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|square|sq|way|parkway|pkwy)\b/i;
      const filteredParts = cleanParts.filter(p => {
        const norm = p.toLowerCase().trim();
        return !streetIndicators.test(norm) && !isKnownCountry(norm);
      });
      
      if (filteredParts.length > 0) {
        // City is typically the first segment that isn't a street or a country name
        return filteredParts[0].trim();
      }
    }
  }
  return 'General';
}

function extractCountryIntelligently(locationName, address, cityInput, countryInput) {
  if (countryInput && typeof countryInput === 'string' && countryInput.trim().length > 0) {
    const clean = countryInput.trim();
    if (isKnownCountry(clean)) {
      return normalizeCountryName(clean);
    }
    const mapped = getCountryForCity(clean);
    if (mapped) return mapped;
  }

  const city = cityInput || extractCityIntelligently(locationName, address);
  if (city && city !== 'General') {
    const mapped = getCountryForCity(city);
    if (mapped) return mapped;
  }

  const fields = [address, locationName];
  for (const f of fields) {
    if (f && typeof f === 'string') {
      const cleanParts = getCleanAddressParts(f);
      for (let i = cleanParts.length - 1; i >= 0; i--) {
        const part = cleanParts[i].trim();
        if (isKnownCountry(part)) {
          return normalizeCountryName(part);
        }
      }
    }
  }

  for (const f of fields) {
    if (f && typeof f === 'string') {
      const cleanParts = getCleanAddressParts(f);
      for (let i = cleanParts.length - 1; i >= 0; i--) {
        const part = cleanParts[i].trim();
        const mapped = getCountryForCity(part);
        if (mapped) return mapped;
      }
    }
  }

  for (const f of fields) {
    if (f && typeof f === 'string') {
      const cleanParts = getCleanAddressParts(f);
      if (cleanParts.length > 0) {
        const lastPart = cleanParts[cleanParts.length - 1].trim();
        if (lastPart && isNaN(Number(lastPart))) {
          return lastPart;
        }
      }
    }
  }
  return 'General';
}

function resolveContinentForCountry(country) {
  const normCountry = String(country || '').toLowerCase().trim();
  const code = countryNameToCode[normCountry];
  if (code && countries[code]) {
    const continentCode = countries[code].continent;
    const continentName = continents[continentCode];
    if (continentName) return continentName;
  }
  return 'General';
}

function resolveGeographicalData(locationName, currentData) {
  const data = currentData || {};
  const address = data.address || '';
  const inputCity = data.city || '';
  const inputCountry = data.country || '';
  const inputCountryCode = data.countryCode || '';

  let resolvedCountry = inputCountry;
  let resolvedContinent = 'General';
  
  if (inputCountryCode && typeof inputCountryCode === 'string' && inputCountryCode.trim().length > 0) {
    const code = inputCountryCode.trim().toUpperCase();
    if (countries[code]) {
      resolvedCountry = countries[code].name;
      const continentCode = countries[code].continent;
      resolvedContinent = continents[continentCode] || 'General';
    }
  }

  const city = inputCity || extractCityIntelligently(locationName, address) || 'General';

  let country = resolvedCountry;
  if (!country || country === 'General') {
    country = extractCountryIntelligently(locationName, address, city, inputCountry) || 'General';
  }

  let continent = resolvedContinent;
  if (!continent || continent === 'General') {
    continent = resolveContinentForCountry(country);
  }

  const finalCity = city !== 'General' ? city : undefined;
  const finalCountry = country !== 'General' ? normalizeCountryName(country) : undefined;
  const finalContinent = continent !== 'General' ? continent : undefined;

  return {
    ...data,
    name: data.name || locationName || 'General',
    city: finalCity,
    country: finalCountry,
    continent: finalContinent,
    countryCode: inputCountryCode || (finalCountry ? countryNameToCode[finalCountry.toLowerCase()] : undefined)
  };
}

module.exports = {
  resolveGeographicalData,
  resolveContinentForCountry,
  normalizeCountryName,
  isKnownCountry,
  countryNameToCode
};
