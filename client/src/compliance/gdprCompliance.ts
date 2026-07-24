/**
 * GDPR Compliance - Data Export & Deletion
 * Allows users to export their data or request full deletion
 */

import * as FileSystem from 'expo-file-system';
import { apiService } from '@/src/services/apiService';

// Get document directory with fallback to cache directory
// @ts-ignore - directory paths are available at runtime
const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';

export interface UserDataExport {
  profile: any;
  posts: any[];
  comments: any[];
  messages: any[];
  followers: string[];
  following: string[];
  savedPosts: any[];
  notifications: any[];
  exportedAt: Date;
}

/**
 * Export user's complete data as JSON
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  try {
    console.log('📊 Exporting data for user:', userId);
    const exportData = await apiService.get(`/gdpr/users/${userId}/export`);
    const parsed: UserDataExport = {
      profile: exportData?.profile || null,
      posts: exportData?.posts || [],
      comments: exportData?.comments || [],
      messages: exportData?.messages || [],
      followers: exportData?.followers || [],
      following: exportData?.following || [],
      savedPosts: exportData?.savedPosts || [],
      notifications: exportData?.notifications || [],
      exportedAt: new Date(exportData?.exportedAt || Date.now()),
    };

    console.log('✅ Data exported successfully');
    return parsed;
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
}

/**
 * Save exported data to device file system
 */
export async function saveExportedData(
  userId: string,
  data: UserDataExport
): Promise<string> {
  try {
    const fileName = `trave_data_export_${userId}_${Date.now()}.json`;
    const fileUri = `${documentDir}${fileName}`;

    const jsonData = JSON.stringify(data, null, 2);

    await FileSystem.writeAsStringAsync(fileUri, jsonData);

    console.log('✅ Data saved to:', fileUri);
    return fileUri;
  } catch (error) {
    console.error('Save file error:', error);
    throw error;
  }
}

/**
 * Request account deletion (30-day grace period)
 * User can cancel within 30 days
 */
export async function requestAccountDeletion(userId: string): Promise<boolean> {
  try {
    await apiService.post(`/gdpr/users/${userId}/deletion-request`);
    console.log('🗑️ Account deletion requested for:', userId);
    return true;
  } catch (error) {
    console.error('Deletion request error:', error);
    return false;
  }
}

/**
 * Cancel deletion request (within 30 days)
 */
export async function cancelAccountDeletion(userId: string): Promise<boolean> {
  try {
    await apiService.post(`/gdpr/users/${userId}/deletion-cancel`);
    console.log('✅ Account deletion cancelled for:', userId);
    return true;
  } catch (error) {
    console.error('Cancel deletion error:', error);
    return false;
  }
}

/**
 * Permanently delete user account and all data
 * Called after 30-day grace period OR immediately if user chooses
 */
export async function permanentlyDeleteAccount(userId: string): Promise<boolean> {
  try {
    console.log('🗑️ Permanently deleting account:', userId);
    await apiService.delete(`/users/${userId}`);
    console.log('✅ Account permanently deleted');
    return true;
  } catch (error) {
    console.error('Permanent deletion error:', error);
    return false;
  }
}

/**
 * Get deletion status
 */
export async function getDeletionStatus(
  userId: string
): Promise<{
  requested: boolean;
  scheduledFor?: Date;
  daysRemaining?: number;
} | null> {
  try {
    const status = await apiService.get(`/gdpr/users/${userId}/deletion-status`);

    if (!status) {
      return null;
    }

    if (!status.requested) {
      return { requested: false };
    }

    const scheduledFor = status.scheduledFor
      ? new Date(status.scheduledFor)
      : new Date();
    const daysRemaining = Math.ceil(
      (scheduledFor.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    return {
      requested: true,
      scheduledFor,
      daysRemaining: Math.max(0, daysRemaining),
    };
  } catch (error) {
    console.error('Get deletion status error:', error);
    return null;
  }
}

/**
 * Download all user files (posts, messages, etc.)
 */
export async function downloadUserFiles(
  userId: string,
  data: UserDataExport
): Promise<string[]> {
  try {
    const downloadedFiles: string[] = [];

    // Download post images
    for (const post of data.posts) {
      if (post.images && Array.isArray(post.images)) {
        for (const image of post.images) {
          if (image.url) {
            const fileName = `post_${post.id}_${Date.now()}.jpg`;
            const fileUri = `${documentDir}${fileName}`;

            try {
              const fileInfo = await FileSystem.downloadAsync(
                image.url,
                fileUri
              );
              downloadedFiles.push(fileInfo.uri);
            } catch (err) {
              console.warn('Could not download image:', err);
            }
          }
        }
      }
    }

    console.log('✅ Downloaded', downloadedFiles.length, 'files');
    return downloadedFiles;
  } catch (error) {
    console.error('Download files error:', error);
    return [];
  }
}

export default {
  exportUserData,
  saveExportedData,
  requestAccountDeletion,
  cancelAccountDeletion,
  permanentlyDeleteAccount,
  getDeletionStatus,
  downloadUserFiles,
};
