import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Safely compresses a video file if the native library is available.
 * If the native module is missing or fails, returns the original URI.
 */
export async function compressVideoSafe(uri: string): Promise<string> {
    try {
        // Skip entirely in Expo Go as it doesn't support the native module
        if (Constants.appOwnership === 'expo') {
            console.log('[mediaUtils] Skipping video compression in Expo Go.');
            return uri;
        }

        // Deferred require to prevent top-level crash if module is not linked
        const { Video } = require('react-native-compressor');

        if (!Video) throw new Error('Video compressor not available');

        const compressedUri = await Video.compress(
            uri,
            {
                compressionMethod: 'manual',
                maxSize: 720,
                bitrate: 2_500_000,
                minimumFileSizeForCompress: 0,
            }
        );
        return compressedUri || uri;
    } catch (error) {
        console.warn('[mediaUtils] Video compression failed or library not linked. Using original URI.', error);
        return uri;
    }
}


export async function compressImageSafe(uri: string, width: number = 1080, quality: number = 0.7): Promise<string> {
    try {
        // Defensive check: if the URI is a video file, don't try to compress it as an image
        if (typeof uri === 'string' && /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(uri)) {
            console.warn('[mediaUtils] compressImageSafe received a video file, skipping image compression:', uri);
            return uri;
        }

        // Try react-native-compressor first (better memory safety on large images)
        try {
            const { Image } = require('react-native-compressor');
            if (Image) {
                console.log('[mediaUtils] Compressing image with react-native-compressor...');
                const compressedUri = await Image.compress(uri, {
                    maxWidth: width,
                    quality: quality,
                    input: 'uri',
                });
                if (compressedUri) return compressedUri;
            }
        } catch (err) {
            console.log('[mediaUtils] react-native-compressor failed or not available, falling back to Expo ImageManipulator...');
        }

        // Fallback to Expo ImageManipulator
        const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width } }],
            { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipResult.uri;
    } catch (error) {
        console.warn('[mediaUtils] Image compression failed. Using original URI.', error);
        return uri;
    }
}
