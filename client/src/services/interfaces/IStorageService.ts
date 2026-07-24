/**
 * Storage Service Interface
 * Implement this interface to switch between Firebase Storage, AWS S3, Cloudinary, etc.
 */

export interface IStorageService {
  // Upload
  uploadImage(uri: string, path: string): Promise<string>; // Returns download URL
  uploadVideo(uri: string, path: string): Promise<string>;
  uploadFile(uri: string, path: string, contentType?: string): Promise<string>;
  
  // Upload with progress
  uploadWithProgress(
    uri: string,
    path: string,
    onProgress: (progress: number) => void
  ): Promise<string>;
  
  // Delete
  deleteFile(url: string): Promise<void>;
  
  // Get metadata
  getMetadata(url: string): Promise<FileMetadata>;
  
  // Generate signed URL (for private files)
  getSignedUrl(path: string, expiresIn?: number): Promise<string>;
}

export interface FileMetadata {
  size: number;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

