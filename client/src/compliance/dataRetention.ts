/**
 * Firestore Data Retention & Cleanup
 * Automatically expires old documents to reduce storage costs
 * Uses Firestore TTL (Time-to-Live) feature
 */

import { collection, deleteDoc, doc, query as firestoreQuery, getDocs, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

/**
 * Data Retention Policies (adjust per collection)
 * TTL in milliseconds
 */
export const RETENTION_POLICIES = {
  notifications: 30 * 24 * 60 * 60 * 1000, // 30 days
  stories: 24 * 60 * 60 * 1000, // 24 hours (auto-delete after)
  tempMedia: 7 * 24 * 60 * 60 * 1000, // 7 days
  comments: 365 * 24 * 60 * 60 * 1000, // 1 year (keep long for posterity)
  messages: 90 * 24 * 60 * 60 * 1000, // 90 days
  liveStreamRecordings: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Add TTL field to document for auto-deletion
 * Firestore will auto-delete when ttl expires
 * Only works with Firestore TTL policy enabled on the field
 */
export function getExpiryTimestamp(ttlMs: number): number {
  return Math.floor((Date.now() + ttlMs) / 1000); // Firestore expects seconds
}

/**
 * Mark notification for deletion (30 days from now)
 */
export async function markNotificationForDeletion(notificationId: string): Promise<void> {
  try {
    const ref = doc(db, 'notifications', notificationId);
    await updateDoc(ref, {
      expiresAt: getExpiryTimestamp(RETENTION_POLICIES.notifications),
    });
  } catch (error) {
    console.error('❌ Error marking notification for deletion:', error);
  }
}

/**
 * Delete old temp media (drafts, unposted images)
 * Run this periodically (e.g., daily via Cloud Function)
 */
export async function cleanupExpiredTempMedia(): Promise<number> {
  try {
    const cutoffTime = Date.now() - RETENTION_POLICIES.tempMedia;
    const coll = collection(db, 'tempMedia');
    const q = firestoreQuery(coll, where('createdAt', '<', Timestamp.fromMillis(cutoffTime)));
    const snapshot = await getDocs(q);

    let deleted = 0;
    for (const document of snapshot.docs) {
      await deleteDoc(document.ref);
      deleted++;
    }

    console.log(`🗑️ Cleaned up ${deleted} expired temp media files`);
    return deleted;
  } catch (error) {
    console.error('❌ Error cleaning up temp media:', error);
    return 0;
  }
}

/**
 * Archive old stories (auto-delete after 24h)
 * Mark with TTL field for auto-deletion
 */
export async function archiveExpiredStories(): Promise<number> {
  try {
    const cutoffTime = Date.now() - RETENTION_POLICIES.stories;
    const coll = collection(db, 'stories');
    const q = firestoreQuery(coll, where('createdAt', '<', Timestamp.fromMillis(cutoffTime)));
    const snapshot = await getDocs(q);

    let archived = 0;
    for (const document of snapshot.docs) {
      await updateDoc(document.ref, {
        expiresAt: getExpiryTimestamp(0), // Expire immediately
        archivedAt: serverTimestamp(),
      });
      archived++;
    }

    console.log(`📼 Archived ${archived} expired stories`);
    return archived;
  } catch (error) {
    console.error('❌ Error archiving stories:', error);
    return 0;
  }
}

/**
 * Delete very old messages (90+ days)
 * Only remove deleted=true messages to preserve conversation history
 */
export async function cleanupOldMessages(): Promise<number> {
  try {
    const cutoffTime = Date.now() - RETENTION_POLICIES.messages;
    const coll = collection(db, 'messages');
    const q = firestoreQuery(
      coll,
      where('createdAt', '<', Timestamp.fromMillis(cutoffTime)),
      where('deleted', '==', true)
    );
    const snapshot = await getDocs(q);

    let deleted = 0;
    for (const document of snapshot.docs) {
      await deleteDoc(document.ref);
      deleted++;
    }

    console.log(`💬 Cleaned up ${deleted} old deleted messages`);
    return deleted;
  } catch (error) {
    console.error('❌ Error cleaning up messages:', error);
    return 0;
  }
}

/**
 * Recommended Firestore TTL fields to enable (in Firebase console):
 * - notifications.expiresAt (30 days)
 * - stories.expiresAt (24 hours)
 * - tempMedia.expiresAt (7 days)
 * - messages.expiresAt (90 days)
 * - liveStreamRecordings.expiresAt (30 days)
 * 
 * To enable:
 * 1. Go to Firestore Database → TTL policy
 * 2. Create TTL policy for each collection
 * 3. Set the field (expiresAt) and it will auto-delete
 */
export const TTL_SETUP_INSTRUCTIONS = `
TTL (Time-to-Live) Setup:

1. In Firebase Console, go to Firestore Database
2. Click "TTL policies" tab
3. Create policy for each collection:
   - Collection: notifications, Field: expiresAt, Description: Auto-delete old notifications
   - Collection: stories, Field: expiresAt, Description: Auto-delete expired stories
   - Collection: tempMedia, Field: expiresAt, Description: Auto-delete unposted media
   - Collection: messages, Field: expiresAt, Description: Auto-delete old deleted messages
   
4. Once enabled, set expiresAt = Math.floor((Date.now() + ttlMs) / 1000) when creating docs
5. Firestore will automatically delete documents when expiresAt timestamp passes

Benefits:
- Automatic cleanup (no manual jobs needed)
- Reduced storage costs
- Better data privacy
- Automatic hard deletes (no soft-delete clutter)
`;

/**
 * Schedule cleanup (call from a Cloud Function or Scheduled Task)
 * Run daily via: export.cleanupAllExpired = functions.pubsub.schedule('every day 00:00').onRun(cleanupAllExpired)
 */
export async function cleanupAllExpired(): Promise<{ notifications?: number; tempMedia?: number; stories?: number; messages?: number }> {
  console.log('🧹 Starting daily cleanup...');

  const results = {
    tempMedia: await cleanupExpiredTempMedia(),
    stories: await archiveExpiredStories(),
    messages: await cleanupOldMessages(),
  };

  console.log('✅ Cleanup complete:', results);
  return results;
}
