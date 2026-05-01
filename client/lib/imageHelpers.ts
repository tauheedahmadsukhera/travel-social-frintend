/**
 * Image optimization helpers for cost reduction + performance
 * Uses Cloudinary URL transformations for resizing + caching
 */

/**
 * Generate a thumbnail URL from a Cloudinary image URL
 * Inserts a transformation segment after /upload/ for resizing + format
 * @param imageUrl - Full image URL from Cloudinary
 * @param width - Desired width (e.g., 400, 600)
 * @param height - Desired height (optional; defaults to width for square)
 * @returns Optimized thumbnail URL or original if not Cloudinary URL
 */
export function getThumbnailUrl(imageUrl: string | null | undefined, width: number = 400, height?: number): string {
  if (!imageUrl || typeof imageUrl !== 'string') return '';

  // Only optimize Cloudinary URLs that contain the upload segment
  if (!imageUrl.includes('res.cloudinary.com') || !imageUrl.includes('/upload/')) {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);
    const [beforeUpload, afterUpload] = url.pathname.split('/upload/');
    if (!afterUpload) {
      return imageUrl;
    }
    const hPart = height ? `,h_${height}` : '';
    const transformation = `c_limit,w_${width}${hPart},q_auto,f_auto`;
    url.pathname = `${beforeUpload}/upload/${transformation}/${afterUpload}`;
    return url.toString();
  } catch (e) {
    console.warn('Failed to parse image URL for thumbnail:', imageUrl, e);
    return imageUrl;
  }
}

/**
 * Get optimized URL for different contexts
 * @param imageUrl - Original image URL
 * @param context - 'feed' (400px), 'map-marker' (200px), 'thumbnail' (150px), 'detail' (full)
 */
export function getOptimizedImageUrl(imageUrl: string | null | undefined, context: 'feed' | 'map-marker' | 'thumbnail' | 'detail' = 'feed'): string {
  if (!imageUrl || typeof imageUrl !== 'string') return '';

  // If Firebase Storage URL, return original (no transformation)
  if (imageUrl.includes('firebasestorage.googleapis.com')) {
    return imageUrl;
  }

  // Don't optimize for detail view; use original for best quality
  if (context === 'detail') {
    return imageUrl;
  }

  // Size recommendations per context (width in pixels)
  const sizes = {
    feed: 800,       // Feed/profile grid: 800px is enough for most devices
    'map-marker': 200, // Map markers: tiny, 200px is plenty
    thumbnail: 150,   // Thumbnail/avatar: 150px is max
  };

  return getThumbnailUrl(imageUrl, sizes[context]);
}

/**
 * Get a thumbnail for a video URL
 * If Cloudinary, converts to JPG. Otherwise returns original or provided poster.
 */
export function getVideoThumbnailUrl(videoUrl: string, posterUrl?: string): string {
  if (posterUrl && typeof posterUrl === 'string' && posterUrl.trim()) {
    return posterUrl;
  }
  
  if (!videoUrl || typeof videoUrl !== 'string') return '';

  // Cloudinary video thumbnail trick: change extension to .jpg and use transformations
  if (videoUrl.includes('res.cloudinary.com') && videoUrl.includes('/video/upload/')) {
    try {
      // Replace /video/upload/ with /video/upload/c_limit,w_800,q_auto,f_auto,so_0/
      // And change extension to .jpg
      let thumb = videoUrl
        .replace('/video/upload/', '/video/upload/c_limit,w_800,q_auto,f_auto,so_0/')
        .replace(/\.(mp4|mov|wmv|avi|mkv|webm)$/i, '.jpg');
      
      // If it doesn't have an extension we recognize, still try appending .jpg
      if (thumb === videoUrl) {
        thumb = thumb + '.jpg';
      }
      return thumb;
    } catch (e) {
      return videoUrl;
    }
  }

  return videoUrl;
}

/**
 * Preload image for performance
 * Useful for detail views where you want the full image ready
 */
export function preloadImage(imageUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * Cache directive for media URLs (use in headers if serving via Cloud Function)
 * Purpose: Enable CDN/browser caching to reduce egress
 */
export const MEDIA_CACHE_HEADERS = {
  // Immutable media (can cache forever if URL includes hash/version)
  immutable: 'public, max-age=31536000, immutable',
  // Long-term cache (1 year for versioned/hashed URLs)
  longterm: 'public, max-age=31536000',
  // Standard cache (1 month for most images)
  standard: 'public, max-age=2592000',
  // Short cache (1 week for user-generated content that might change)
  short: 'public, max-age=604800',
};
