import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: SaveFormat;
}

/**
 * Optimize image for upload/display
 * Reduces size while maintaining quality
 */
export async function optimizeImage(
  uri: string,
  options: OptimizeOptions = {}
): Promise<string> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.8,
    format = SaveFormat.JPEG,
  } = options;

  try {
    // Get original dimensions
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('Image file not found');
    }

    // Manipulate image
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: quality, format }
    );

    return result.uri;
  } catch (error) {
    console.error('Image optimization failed:', error);
    return uri; // Return original if optimization fails
  }
}

/**
 * Optimize image for thumbnail
 */
export async function createThumbnail(uri: string): Promise<string> {
  return optimizeImage(uri, {
    maxWidth: 300,
    maxHeight: 300,
    quality: 0.7,
  });
}

/**
 * Get optimized image size for different use cases
 */
export const ImageSizes = {
  THUMBNAIL: { maxWidth: 300, maxHeight: 300, quality: 0.7 },
  AVATAR: { maxWidth: 500, maxHeight: 500, quality: 0.8 },
  POST: { maxWidth: 1920, maxHeight: 1920, quality: 0.85 },
  STORY: { maxWidth: 1080, maxHeight: 1920, quality: 0.85 },
} as const;

/**
 * Calculate image file size
 */
export async function getImageSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Check if image needs optimization
 */
export async function needsOptimization(
  uri: string,
  maxSizeMB: number = 5
): Promise<boolean> {
  const size = await getImageSize(uri);
  return size > maxSizeMB * 1024 * 1024;
}
