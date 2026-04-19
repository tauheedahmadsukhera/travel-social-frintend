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
                compressionMethod: 'auto',
                minimumFileSizeForCompress: 0,
            }
        );
        return compressedUri;
    } catch (error) {
        console.warn('[mediaUtils] Video compression failed or library not linked. Using original URI.', error);
        return uri;
    }
}


/**
 * Safely compresses an image file using Expo Image Manipulator.
 */
export async function compressImageSafe(uri: string, width: number = 1080, quality: number = 0.7): Promise<string> {
    try {
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
