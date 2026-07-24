import type { ImageSourcePropType } from 'react-native';

type CategoryImageSource = ImageSourcePropType;

function normalizeCategoryName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isProbablyRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  return s.startsWith('http://') || s.startsWith('https://');
}

function isPlaceholderUrl(url: string): boolean {
  const s = url.toLowerCase();
  return s.includes('via.placeholder.com') || s.includes('placehold.co');
}

const CATEGORY_REMOTE_IMAGES: Record<string, string> = {
  "adventure": "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop",
  "mountain": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=150&h=150&fit=crop",
  "surfing": "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=150&h=150&fit=crop",
  "camping": "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=150&h=150&fit=crop",
  "ski": "https://images.unsplash.com/photo-1551698618-1ffdfe196404?w=150&h=150&fit=crop",
  "road trips": "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=150&h=150&fit=crop",
  "waterfalls": "https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?w=150&h=150&fit=crop",
  "cruise": "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=150&h=150&fit=crop",
  "trekking": "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop",
  "island": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop",
  "diving": "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=150&h=150&fit=crop",
  "city break": "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=150&h=150&fit=crop",
  "urban": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=150&h=150&fit=crop",
  "tropical": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop",
  "national parks": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=150&h=150&fit=crop",
  "hiking": "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop",
  "desert": "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=150&h=150&fit=crop",
  "jungle": "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=150&h=150&fit=crop",
  "extreme sports": "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop",
  "glamping": "https://images.unsplash.com/photo-1533240332313-0db49b439ad3?w=150&h=150&fit=crop",
  "safari": "https://images.unsplash.com/photo-1516426122078-c23e76319801?w=150&h=150&fit=crop",
  "nature": "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=150&h=150&fit=crop",
  "lakes": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=150&h=150&fit=crop",
  "beach": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop",
  "food and dining": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=150&h=150&fit=crop",
  "luxury": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=150&h=150&fit=crop",
  "historical": "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=150&h=150&fit=crop",
  "cultural": "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=150&h=150&fit=crop",
  "digital nomad": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&h=150&fit=crop",
  "solo travel": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=150&h=150&fit=crop",
  "backpacking": "https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=150&h=150&fit=crop",
  "architecture": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=150&h=150&fit=crop",
  "museums": "https://images.unsplash.com/photo-1566121318599-7ab0e2b1736e?w=150&h=150&fit=crop",
  "wellness": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=150&h=150&fit=crop",
  "art": "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=150&h=150&fit=crop",
  "wine regions": "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=150&h=150&fit=crop",
  "yoga": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=150&h=150&fit=crop",
  "honeymoon": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150&h=150&fit=crop",
  "family friendly": "https://images.unsplash.com/photo-1511895426328-dc8714191300?w=150&h=150&fit=crop",
  "travel": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=150&h=150&fit=crop",
  "food": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=150&h=150&fit=crop",
  "festivals": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&h=150&fit=crop",
  "budget": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=150&h=150&fit=crop",
  "romantic": "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=150&h=150&fit=crop",
  "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=150&h=150&fit=crop",
  "city life": "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=150&h=150&fit=crop"
};

export function getCategoryImageSource(
  name: string,
  remoteImageUrl?: string | null
): CategoryImageSource {
  const n = normalizeCategoryName(name);

  if (n.includes('beach')) return require('../../assets/images/beach.jpg');
  if (n.includes('city') || n.includes('london')) return require('../../assets/images/city.jpeg');
  if (n.includes('culture')) return require('../../assets/images/culture.jpeg');
  if (n.includes('food')) return require('../../assets/images/food.jpeg');
  if (n.includes('mountain') || n.includes('mount')) return require('../../assets/images/mountain.jpeg');
  if (n.includes('nature')) return require('../../assets/images/nature.jpeg');
  if (n.includes('nightlife') || n.includes('night life') || n.includes('night')) return require('../../assets/images/nightlife.jpeg');
  if (n.includes('adventure')) return require('../../assets/images/adventure.jpg');
  if (n.includes('travel')) return require('../../assets/images/travel.jpeg');
  if (n.includes('winter') || n.includes('christmas') || n.includes('holiday')) return require('../../assets/images/mountain.jpeg');

  if (isProbablyRemoteUrl(remoteImageUrl) && !isPlaceholderUrl(remoteImageUrl)) {
    return { uri: remoteImageUrl };
  }

  const mappedUrl = CATEGORY_REMOTE_IMAGES[n];
  if (mappedUrl) {
    return { uri: mappedUrl };
  }

  return require('../../assets/images/travel.jpeg');
}

