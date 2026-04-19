/**
 * Image Optimization & Compression
 * Compress images before upload to reduce storage/bandwidth
 * Generates both original (compressed) and thumbnail versions
 */

import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  size: number; // bytes
  mimeType: string;
}

/**
 * Compress image for upload
 * @param imageUri - Original image URI
 * @param quality - Compression quality (0-1, default 0.8)
 * @param maxWidth - Max width in pixels (default 2048)
 * @returns Compressed image with metadata
 */
export async function compressImage(
  imageUri: string,
  quality: number = 0.75,
  maxWidth: number = 1080
): Promise<CompressedImage> {
  try {
    console.log(`[imageCompressor] Starting compression for: ${imageUri}`);
    
    // Get original dimensions first (without modifying)
    let originalImage: any = null;
    try {
      originalImage = await ImageManipulator.manipulateAsync(imageUri, [], { 
        compress: 1, 
        format: ImageManipulator.SaveFormat.JPEG 
      });
      console.log(`[imageCompressor] Original image: ${originalImage.width}x${originalImage.height}`);
    } catch (err) {
      console.warn(`[imageCompressor] Could not get original image info, continuing...`, err);
    }
    
    // Compress and resize with better error handling
    let compressedImage: any = null;
    try {
      console.log(`[imageCompressor] Compressing with quality: ${quality}, maxWidth: ${maxWidth}`);
      compressedImage = await ImageManipulator.manipulateAsync(
        imageUri, 
        [{ resize: { width: maxWidth } }], 
        {
          compress: Math.max(0, Math.min(1, quality)), // Ensure quality is between 0-1
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      console.log(`[imageCompressor] Compressed image: ${compressedImage.width}x${compressedImage.height}`);
    } catch (err) {
      console.error(`[imageCompressor] Compression failed:`, err);
      throw new Error(`Image compression failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Calculate size
    let sizeInBytes = 0;
    try {
      const response = await fetch(compressedImage.uri);
      const blob = await response.blob();
      sizeInBytes = blob.size;
      console.log(`✅ [imageCompressor] Image compressed: ${(sizeInBytes / 1024).toFixed(2)}KB (quality: ${(quality * 100).toFixed(0)}%)`);
    } catch (err) {
      console.warn(`[imageCompressor] Could not calculate size:`, err);
      sizeInBytes = 0;
    }

    return {
      uri: compressedImage.uri,
      width: compressedImage.width,
      height: compressedImage.height,
      size: sizeInBytes,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.error(`❌ [imageCompressor] Compression error:`, error);
    throw error;
  }
}

/**
 * Create thumbnail from image
 * @param imageUri - Original image URI
 * @param size - Square size in pixels (default 200)
 * @returns Thumbnail URI
 */
export async function createThumbnail(imageUri: string, size: number = 200): Promise<CompressedImage> {
  try {
    console.log(`[imageCompressor] Creating thumbnail with size: ${size}px`);
    
    let thumbnail: any = null;
    try {
      thumbnail = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: size, height: size } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log(`[imageCompressor] Thumbnail created: ${thumbnail.width}x${thumbnail.height}`);
    } catch (err) {
      console.error(`[imageCompressor] Thumbnail creation failed:`, err);
      throw new Error(`Thumbnail creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    let blobSize = 0;
    try {
      const response = await fetch(thumbnail.uri);
      const blob = await response.blob();
      blobSize = blob.size;
      console.log(`✅ 🔍 [imageCompressor] Thumbnail created: ${(blobSize / 1024).toFixed(2)}KB`);
    } catch (err) {
      console.warn(`[imageCompressor] Could not calculate thumbnail size:`, err);
      blobSize = 0;
    }

    return {
      uri: thumbnail.uri,
      width: size,
      height: size,
      size: blobSize,
      mimeType: 'image/jpeg',
    };
  } catch (error) {
    console.error('❌ [imageCompressor] Thumbnail creation error:', error);
    throw error;
  }
}

/**
 * Optimize multiple images for upload
 * Returns both compressed original and thumbnail
 */
export async function optimizeImagesForUpload(
  imageUris: string[]
): Promise<Array<{ compressed: CompressedImage; thumbnail: CompressedImage }>> {
  try {
    const results = await Promise.all(
      imageUris.map(async (uri) => ({
        compressed: await compressImage(uri, 0.75, 1080),
        thumbnail: await createThumbnail(uri, 200),
      }))
    );

    const totalOriginal = imageUris.length;
    const totalCompressed = results.reduce((sum, r) => sum + r.compressed.size, 0);
    const savings = ((1 - totalCompressed / totalOriginal) * 100).toFixed(1);
    console.log(`💾 Total savings: ${savings}% of original size`);

    return results;
  } catch (error) {
    console.error('❌ Error optimizing images:', error);
    throw error;
  }
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
