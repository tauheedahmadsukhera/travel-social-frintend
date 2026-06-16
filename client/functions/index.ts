/**
 * Cloud Functions for Server-Side Aggregations
 * Deploy with: firebase deploy --only functions
 * 
 * These functions handle heavy operations on the server to reduce
 * client-side load and Firebase read/write costs
 */

const functions = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// =========================
// FEED GENERATION (Server-side)
// =========================

/**
 * Generate user feed server-side
 * Called when user opens home page
 * Returns cached feed or generates new one
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.generateUserFeed = functions.https.onCall(async (data: any, context: any) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  }

  const userId = context.auth.uid;
  const { limit = 20, lastPostId } = data;

  try {
    // Check if feed is cached and fresh (less than 5 minutes old)
    const feedCache = await db.collection('users').doc(userId).collection('cache').doc('feed').get();
    if (feedCache.exists) {
      const cached = feedCache.data();
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return {
          success: true,
          posts: cached.posts,
          fromCache: true,
        };
      }
    }

    // Get user's followings
    const followingRef = await db.collection('users').doc(userId).get();
    const followingData = followingRef.data();
    const followingIds = followingData?.following || [];
    followingIds.push(userId); // Include own posts

    // Fetch posts from followings
    let query = db.collection('posts')
      .where('authorId', 'in', followingIds)

    if (lastPostId) {
      const lastPost = await db.collection('posts').doc(lastPostId).get();
      if (lastPost.exists) {
        query = query.startAfter(lastPost);
      }
    }

    const postsSnapshot = await query.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = postsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Cache the feed
    await db.collection('users').doc(userId).collection('cache').doc('feed').set({
      posts,
      timestamp: Date.now(),
    });

    return {
      success: true,
      posts,
      fromCache: false,
    };
  } catch (error: any) {
    console.error('generateUserFeed error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =========================
// NOTIFICATION AGGREGATION
// =========================

/**
 * Aggregate notifications (batch multiple events into one)
 * Called when sending notifications
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.aggregateNotifications = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  }

  const { userId, type, limit = 20 } = data;

  try {
    const notificationsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .where('type', '==', type)
      .where('read', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notifications = notificationsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // If more than 5 notifications of same type, aggregate them
    if (notifications.length > 5) {
      const aggregated = {
        id: `agg-${type}-${Date.now()}`,
        type: `${type}_aggregated`,
        count: notifications.length,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      };

      // Delete old notifications
      const batch = db.batch();
      for (const notif of notifications) {
        batch.delete(db.collection('users').doc(userId).collection('notifications').doc(notif.id));
      }
      batch.set(
        db.collection('users').doc(userId).collection('notifications').doc(aggregated.id),
        aggregated
      );

      await batch.commit();
      return {
        success: true,
        aggregated: true,
        notificationCount: notifications.length,
      };
    }

    return {
      success: true,
      aggregated: false,
      notificationCount: notifications.length,
    };
  } catch (error: any) {
    console.error('aggregateNotifications error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =========================
// LIVE STREAM AGGREGATION
// =========================

/**
 * Aggregate live stream viewers
 * Reduces writes by batching viewer updates
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.updateLiveStreamViewers = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  }

  const { streamId, action } = data; // action: 'join' or 'leave'

  try {
    const streamRef = db.collection('liveStreams').doc(streamId);

    if (action === 'join') {
      await streamRef.update({
        viewerCount: admin.firestore.FieldValue.increment(1),
        lastViewerUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (action === 'leave') {
      await streamRef.update({
        viewerCount: admin.firestore.FieldValue.increment(-1),
        lastViewerUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('updateLiveStreamViewers error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =========================
// STATS CALCULATION
// =========================

/**
 * Calculate post statistics server-side
 * Called periodically to update post stats
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.calculatePostStats = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  }

  const { postId } = data;

  try {
    const postRef = db.collection('posts').doc(postId);

    // Count likes
    const likesSnapshot = await postRef.collection('likes').get();
    const likesCount = likesSnapshot.size;

    // Count comments
    const commentsSnapshot = await postRef.collection('comments').get();
    const commentsCount = commentsSnapshot.size;

    // Update post with stats
    await postRef.update({
      likesCount,
      commentsCount,
      statsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      stats: {
        likesCount,
        commentsCount,
      },
    };
  } catch (error: any) {
    console.error('calculatePostStats error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =========================
// BATCH CLEANUP
// =========================

/**
 * Clean up old/expired data periodically
 * Runs daily to maintain database efficiency
 */
import { ScheduledEvent } from 'firebase-functions/v2/scheduler';
exports.cleanupExpiredData = onSchedule('every 24 hours', async (event: ScheduledEvent): Promise<void> => {
    try {
      // Delete notifications older than 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const usersSnapshot = await db.collection('users').get();
      const batch = db.batch();
      let batchCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const oldNotifications = await userDoc.ref
          .collection('notifications')
          .where('createdAt', '<', thirtyDaysAgo)
          .get();

        for (const notif of oldNotifications.docs) {
          batch.delete(notif.ref);
          batchCount++;

          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      console.log('Cleanup completed');
      return;
    } catch (error) {
      console.error('Cleanup error:', error);
      return;
    }
  });

// =========================
// EXPORT FUNCTIONS
// =========================

/**
 * Export user data for GDPR compliance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.exportUserData = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
  }

  const userId = context.auth.uid;

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    const postsSnapshot = await db.collection('posts').where('authorId', '==', userId).get();
    const notificationsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('notifications')
      .get();

    const data = {
      user: userDoc.data(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      posts: postsSnapshot.docs.map((doc: any) => doc.data()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notifications: notificationsSnapshot.docs.map((doc: any) => doc.data()),
      exportedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error('exportUserData error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// =========================
// AGORA TOKEN GENERATION (Secure)
// =========================

/**
 * Generate Agora RTC token for live streaming
 * Uses agora-token package for secure token generation
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.generateAgoraToken = functions.https.onRequest(async (req: any, res: any) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { channelName, uid, role } = req.method === 'GET' ? req.query : req.body;

      console.log('🎫 Token request received:');
      console.log('  channelName:', channelName);
      console.log('  uid:', uid);
      console.log('  role:', role);

    if (!channelName) {
      res.status(400).json({ error: 'Missing channelName' });
      return;
    }
    if (!uid) {
      res.status(400).json({ error: 'Missing uid' });
      return;
    }

    // Agora credentials from runtime config or environment
    // Prefer Firebase Functions config: firebase functions:config:set agora.app_id="..." agora.app_certificate="..."
    const appId = functions.config().agora?.app_id || process.env.AGORA_APP_ID || '';
    const appCertificate = functions.config().agora?.app_certificate || process.env.AGORA_APP_CERTIFICATE || '';

    if (!appId) {
      res.status(500).json({ error: 'Agora App ID not configured' });
      return;
    }

    // Import agora-token package
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const agoraToken = require('agora-token');
    const { RtcTokenBuilder, RtcRole } = agoraToken;

    // Determine role
    let agoraRole;
    if (role === 'publisher' || role === 'broadcaster') {
      agoraRole = RtcRole.PUBLISHER;
    } else if (role === 'subscriber' || role === 'audience') {
      agoraRole = RtcRole.SUBSCRIBER;
    } else {
      // Default to subscriber
      agoraRole = RtcRole.SUBSCRIBER;
    }

    // Token expiration time (1 hour from now)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // In Testing Mode (no certificate), tokens are not required
    if (!appCertificate) {
      console.log('ℹ️ Agora in testing mode: returning null token');
      res.status(200).json({ success: true, token: null, testingMode: true, expiresIn: expirationTimeInSeconds });
      return;
    }

    // Generate token for production use (certificate required)
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      parseInt(uid),
      agoraRole,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

      console.log('✅ Token generated successfully');
    res.status(200).json({ success: true, token, expiresIn: expirationTimeInSeconds });

  } catch (error: any) {
    console.error('❌ Agora token generation error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// =========================
// TIKTOK OAUTH (Secure Token Exchange)
// =========================

/**
 * TikTok OAuth token exchange (server-side)
 * Securely exchanges authorization code for access token
 * Never exposes client secret to client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.tiktokAuth = functions.https.onRequest(async (req: any, res: any) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      res.status(400).json({ error: 'Missing code or redirectUri' });
      return;
    }

    // TikTok credentials from environment variables
    const clientKey = functions.config().tiktok?.client_key;
    const clientSecret = functions.config().tiktok?.client_secret;

    if (!clientKey || !clientSecret) {
      console.error('❌ TikTok credentials not configured');
      res.status(500).json({ error: 'TikTok credentials not configured' });
      return;
    }

    // Exchange code for access token
    const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error('❌ TikTok token exchange failed:', tokenData);
      res.status(400).json({ error: tokenData.error || 'Token exchange failed' });
      return;
    }

    // Get user info
    const userInfoUrl = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name';
    const userInfoResponse = await fetch(userInfoUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfoData = await userInfoResponse.json();

    if (!userInfoResponse.ok || userInfoData.error) {
      console.error('❌ TikTok user info failed:', userInfoData);
      res.status(400).json({ error: userInfoData.error || 'User info fetch failed' });
      return;
    }

    // Return user data (client will create Firebase account)
    res.status(200).json({
      success: true,
      accessToken: tokenData.access_token,
      openId: userInfoData.data.user.open_id,
      unionId: userInfoData.data.user.union_id,
      displayName: userInfoData.data.user.display_name,
      avatarUrl: userInfoData.data.user.avatar_url,
    });

  } catch (error: any) {
    console.error('❌ TikTok auth error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * Snapchat OAuth Code Exchange Cloud Function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
exports.snapchatAuth = functions.https.onRequest(async (req: any, res: any) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      res.status(400).json({ error: 'Missing code or redirectUri' });
      return;
    }

    const clientId = functions.config().snapchat?.client_id;
    const clientSecret = functions.config().snapchat?.client_secret;

    if (!clientId || !clientSecret) {
      console.error('❌ Snapchat credentials not configured');
      res.status(500).json({ error: 'Snapchat credentials not configured' });
      return;
    }

    // Exchange code for access token
    const tokenUrl = 'https://accounts.snapchat.com/accounts/oauth2/token';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error('❌ Snapchat token exchange failed:', tokenData);
      res.status(400).json({ error: tokenData.error || 'Token exchange failed' });
      return;
    }

    // Fetch user info via kit.snapchat.com/v1/me GraphQL
    const userInfoUrl = 'https://kit.snapchat.com/v1/me';
    const userInfoResponse = await fetch(userInfoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        query: '{me{displayName bitmoji{avatar} externalId}}',
      }),
    });

    const userInfoData = await userInfoResponse.json();

    if (!userInfoResponse.ok || userInfoData.errors?.length > 0) {
      console.error('❌ Snapchat user info failed:', userInfoData);
      res.status(400).json({ error: userInfoData.errors?.[0]?.message || 'User info fetch failed' });
      return;
    }

    const me = userInfoData.data?.me;
    if (!me) {
      res.status(400).json({ error: 'Failed to retrieve Snapchat user profile' });
      return;
    }

    // Return user data (client will sign in or create Firebase user using externalId)
    res.status(200).json({
      success: true,
      accessToken: tokenData.access_token,
      externalId: me.externalId,
      displayName: me.displayName || 'Snapchat User',
      avatarUrl: me.bitmoji?.avatar || null,
    });

  } catch (error: any) {
    console.error('❌ Snapchat auth error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});
