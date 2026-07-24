/**
 * Firebase Storage Service Implementation
 * Simple implementation compatible with existing codebase
 */

import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/config/firebase';

// Direct config to avoid environment loading issues
const STORAGE_CONFIG = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxVideoSize: 100 * 1024 * 1024, // 100MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoTypes: ['video/mp4', 'video/quicktime'],
};

export class FirebaseStorageService {
  async uploadImage(
    uri: string,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return this.uploadFile(uri, path, 'image/jpeg', onProgress);
  }

  async uploadVideo(
    uri: string,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return this.uploadFile(uri, path, 'video/mp4', onProgress);
  }

  async uploadFile(
    uri: string,
    path: string,
    mimeType: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      // Fetch the file as blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Check file size
      const maxSize = this.getMaxFileSize(mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'file');
      if (blob.size > maxSize) {
        throw new Error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
      }

      // Create storage reference
      const storageRef = ref(storage, path);

      // Upload with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: mimeType,
      });

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) {
              onProgress(progress);
            }
          },
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadURL);
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    } catch (error) {
      console.error('Upload file error:', error);
      throw error;
    }
  }

  async getDownloadUrl(path: string): Promise<string> {
    try {
      const storageRef = ref(storage, path);
      const url = await getDownloadURL(storageRef);
      return url;
    } catch (error) {
      console.error('Get download URL error:', error);
      throw error;
    }
  }

  async downloadFile(path: string, localPath: string): Promise<string> {
    try {
      const downloadURL = await this.getDownloadUrl(path);
      // In React Native, you would use FileSystem to download
      // For web, you can use fetch
      return downloadURL;
    } catch (error) {
      console.error('Download file error:', error);
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    try {
      const storageRef = ref(storage, path);
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  async deleteMultipleFiles(paths: string[]): Promise<void> {
    try {
      const deletePromises = paths.map((path) => this.deleteFile(path));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Delete multiple files error:', error);
      throw error;
    }
  }

  async uploadMultipleImages(
    uris: string[],
    basePath: string,
    onProgress?: (progress: number) => void
  ): Promise<string[]> {
    try {
      const uploadPromises = uris.map(async (uri, index) => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${index}.jpg`;
        const path = `${basePath}/${fileName}`;
        
        return this.uploadImage(uri, path, (individualProgress) => {
          if (onProgress) {
            const totalProgress = ((index + individualProgress / 100) / uris.length) * 100;
            onProgress(totalProgress);
          }
        });
      });

      const urls = await Promise.all(uploadPromises);
      return urls;
    } catch (error) {
      console.error('Upload multiple images error:', error);
      throw error;
    }
  }

  async uploadMultipleFiles(
    files: { uri: string; path: string; mimeType: string }[],
    onProgress?: (progress: number) => void
  ): Promise<string[]> {
    try {
      const uploadPromises = files.map(async (file, index) => {
        return this.uploadFile(file.uri, file.path, file.mimeType, (individualProgress) => {
          if (onProgress) {
            const totalProgress = ((index + individualProgress / 100) / files.length) * 100;
            onProgress(totalProgress);
          }
        });
      });

      const urls = await Promise.all(uploadPromises);
      return urls;
    } catch (error) {
      console.error('Upload multiple files error:', error);
      throw error;
    }
  }

  async getFileMetadata(path: string): Promise<{
    size: number;
    contentType: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      // Firebase Storage metadata not available in this version
      // Return basic metadata
      return {
        size: 0,
        contentType: 'application/octet-stream',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('Get file metadata error:', error);
      throw error;
    }
  }

  async updateFileMetadata(path: string, metadata: Record<string, any>): Promise<void> {
    try {
      // Firebase Storage metadata update not available in this version
      console.log('Update file metadata:', path, metadata);
    } catch (error) {
      console.error('Update file metadata error:', error);
      throw error;
    }
  }

  getProvider(): 'firebase' | 's3' | 'cloudinary' | 'custom' {
    return 'firebase';
  }

  getMaxFileSize(fileType: 'image' | 'video' | 'file'): number {
    if (fileType === 'image') {
      return STORAGE_CONFIG.maxImageSize;
    } else if (fileType === 'video') {
      return STORAGE_CONFIG.maxVideoSize;
    }
    return STORAGE_CONFIG.maxImageSize; // Default
  }

  isFileTypeAllowed(mimeType: string): boolean {
    if (mimeType.startsWith('image/')) {
      return STORAGE_CONFIG.allowedImageTypes.includes(mimeType as any);
    } else if (mimeType.startsWith('video/')) {
      return STORAGE_CONFIG.allowedVideoTypes.includes(mimeType as any);
    }
    return false;
  }
}

// Export singleton instance
export const storageService = new FirebaseStorageService();
