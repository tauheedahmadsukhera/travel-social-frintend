import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Video as VideoType } from 'expo-av';
import { ResizeMode, Video } from 'expo-av';
import EmojiPicker from 'rn-emoji-keyboard';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Alert, Animated, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { feedEventEmitter } from '@/lib/feedEventEmitter';
import { getLocationVisitCount, likePost, unlikePost } from "../../lib/firebaseHelpers";
import { getOptimizedImageUrl } from "../../lib/imageHelpers";
import { sharePost } from '../../lib/postShare';
import { notificationService } from '../../lib/notificationService';
import CommentSection from "./CommentSection";
import SaveButton from "./SaveButton";
import ShareModal from "./ShareModal";
import { useUser } from "./UserContext";
import VerifiedBadge from "./VerifiedBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppDialog } from '@/src/_components/AppDialogProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const IMAGE_PLACEHOLDER = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

const MIN_MEDIA_RATIO = 0.5; // allow portrait images up to 2:1 height:width
const MAX_MEDIA_RATIO = 2.5; // allow landscape images up to 2.5:1 width:height

// PERF: PostCard can appear 20-100x in lists. Avoid per-card AsyncStorage reads.
type AuthSnapshot = {
  userAvatar: string;
  firebaseUid: string;
  userId: string;
  uid: string;
};
let authSnapshotCache: AuthSnapshot | null = null;
let authSnapshotPromise: Promise<AuthSnapshot> | null = null;
async function loadAuthSnapshotOnce(): Promise<AuthSnapshot> {
  if (authSnapshotCache) return authSnapshotCache;
  if (authSnapshotPromise) return authSnapshotPromise;

  authSnapshotPromise = (async () => {
    try {
      const pairs = await AsyncStorage.multiGet(['userAvatar', 'firebaseUid', 'userId', 'uid']);
      const map = new Map<string, string>();
      for (const [k, v] of pairs) map.set(k, typeof v === 'string' ? v : '');
      const snap: AuthSnapshot = {
        userAvatar: (map.get('userAvatar') || '').trim(),
        firebaseUid: (map.get('firebaseUid') || '').trim(),
        userId: (map.get('userId') || '').trim(),
        uid: (map.get('uid') || '').trim(),
      };
      authSnapshotCache = snap;
      return snap;
    } catch {
      const snap: AuthSnapshot = { userAvatar: '', firebaseUid: '', userId: '', uid: '' };
      authSnapshotCache = snap;
      return snap;
    } finally {
      authSnapshotPromise = null;
    }
  })();

  return authSnapshotPromise;
}

// PERF: Persist media ratios so the carousel height doesn't "jump" (small → big) on scroll-back.
const MEDIA_RATIO_CACHE_KEY = 'media_ratio_cache_v1';
let mediaRatioCache: Map<string, number> | null = null;
let mediaRatioLoadPromise: Promise<Map<string, number>> | null = null;
let mediaRatioSaveTimer: ReturnType<typeof setTimeout> | null = null;
const mediaRatioInFlight = new Set<string>();

async function loadMediaRatioCacheOnce(): Promise<Map<string, number>> {
  if (mediaRatioCache) return mediaRatioCache;
  if (mediaRatioLoadPromise) return mediaRatioLoadPromise;
  mediaRatioLoadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(MEDIA_RATIO_CACHE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const m = new Map<string, number>();
      for (const [k, v] of Object.entries(parsed || {})) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) m.set(k, v);
      }
      mediaRatioCache = m;
      return m;
    } catch {
      const m = new Map<string, number>();
      mediaRatioCache = m;
      return m;
    } finally {
      mediaRatioLoadPromise = null;
    }
  })();
  return mediaRatioLoadPromise;
}

function scheduleSaveMediaRatioCache() {
  if (mediaRatioSaveTimer) return;
  mediaRatioSaveTimer = setTimeout(() => {
    mediaRatioSaveTimer = null;
    try {
      const m = mediaRatioCache;
      if (!m) return;
      const entries = Array.from(m.entries()).slice(-500);
      const obj: Record<string, number> = {};
      for (const [k, v] of entries) obj[k] = v;
      AsyncStorage.setItem(MEDIA_RATIO_CACHE_KEY, JSON.stringify(obj)).catch(() => {});
    } catch {}
  }, 700);
}

function setCachedRatio(url: string, ratio: number) {
  if (!url) return;
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const m = mediaRatioCache ?? new Map<string, number>();
  mediaRatioCache = m;
  m.set(url, ratio);
  scheduleSaveMediaRatioCache();
}

// Props type for PostCard
interface PostCardProps {
  post: any;
  currentUser: any;
  showMenu?: boolean;
  highlightedCommentId?: string;
  highlightedCommentText?: string;
  showCommentsModal?: boolean;
  onCloseCommentsModal?: () => void;
  mirror?: boolean;
  onCommentPress?: (postId: string, avatar: string) => void;
  /**
   * When rendered inside `PostViewerModal` (vertical list of many posts),
   * keep the image carousel lightweight to avoid jank.
   */
  inPostViewer?: boolean;
}

const APP_BLUE = '#0A3D62';

const styles = StyleSheet.create({

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#fff',
    gap: 10,
  },
  cardHeaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 22.5,
    backgroundColor: '#eee',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  cardHeaderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeaderName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    lineHeight: 17,
    marginBottom: 0,
  },
  cardHeaderSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 0,
  },
  cardHeaderLocation: {
    fontSize: 14,
    color: '#222',
    fontWeight: '400',
  },
  cardHeaderDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#aaa',
    marginHorizontal: 5,
  },
  cardHeaderDate: {
    fontSize: 14,
    color: '#222',
    fontWeight: '400',
  },
  // legacy
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 10,
    gap: 20,
    backgroundColor: '#fff',
  },
  topCenter: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  topRight: { alignItems: 'center', justifyContent: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  locationTextWrap: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', paddingVertical: 4 },
  verifiedBadgeBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F7F7F7', justifyContent: 'center', alignItems: 'center' },
  locationIconBox: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  locationInfo: { flexDirection: 'column', flex: 1, minWidth: 0 },
  locationName: { fontWeight: '600', fontSize: 14, lineHeight: 22, color: '#111', flexShrink: 1, letterSpacing: 0.14, textAlign: 'left', paddingBottom: 2 },
  visits: { fontSize: 13, lineHeight: 18, color: '#777', fontWeight: '500', letterSpacing: 0.1, textAlign: 'left' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eee', borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaTextWrap: {
    alignItems: 'flex-start',
  },
  metaName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.14,
    color: '#111',
  },
  metaTime: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#888',
  },
  captionWrap: {
    paddingHorizontal: 11,
    paddingTop: 2,
    paddingBottom: 0,
  },
  caption: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: 0.14,
    textAlign: 'left',
    color: '#111',
  },
  captionMore: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    letterSpacing: 0.14,
    color: '#777',
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'space-between',
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 0,
  },
  iconRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconRowRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  iconRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 3, // Tighter gap for premium feel
  },
  reactionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionStar: {
    fontSize: 16,
  },
  reactionCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 24,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },
  commentCtaRow: {
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 0,
  },
  commentCtaBox: {
    borderRadius: 5,
    backgroundColor: '#f1f2f6',
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  commentCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#626367',
    textAlign: 'left',
  },
  cardShadow: {
    width: '100%',
    alignSelf: 'center',
  },
  cardInner: {
    backgroundColor: '#fff',
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 4,
    overflow: 'hidden',
    // Scrolling perf: reduce expensive re-draws while list scrolls
    shouldRasterizeIOS: true,
    renderToHardwareTextureAndroid: true,
  },
  categoryImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignSelf: 'center',
  },
  imageWrap: {
    width: '100%',
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: 'center',
    marginTop: 0,
  },
  image: {
    width: '100%',
    height: '100%',
    alignSelf: 'center',
  },
  likes: {
    fontWeight: "700",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  hashtags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  hashtag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  hashtagText: {
    color: '#667eea',
    fontSize: 12,
    fontWeight: '600',
  },
  commentPreview: {
    paddingHorizontal: 12,
    paddingBottom: 2,
    fontSize: 14,
    color: "#007aff",
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  commentInput: {
    flex: 1,
    maxHeight: 100,
    fontSize: 15,
    color: "#222",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007aff",
  },
  commentIcon: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#007aff",
    alignItems: "center",
    justifyContent: "center",
  },
  time: {
    fontSize: 12,
    color: "#999",
    paddingHorizontal: 12,
    paddingBottom: 2,
    textAlign: "right",
  },
  mediaModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaModalClose: {
    position: 'absolute',
    top: 44,
    right: 18,
    zIndex: 60,
    elevation: 60,
    padding: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mediaModalMedia: {
    width: '100%',
    height: '100%',
  },
  modalBackground: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContainer: {
    width: "100%",
    maxWidth: 800, // Increased max width
    minHeight: 400, // Increased min height
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, // Larger radius
    borderTopRightRadius: 28,
    paddingTop: 32, // More padding
    paddingHorizontal: 32,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  modalCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  modalTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: "#222",
  },
  commentsList: {
    maxHeight: 400,
  },
  commentItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  commentUserAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  commentContent: {
    flex: 1,
  },
  commentUserName: {
    fontWeight: "700",
    color: "#222",
    fontSize: 14,
  },
  commentText: {
    color: "#222",
    fontSize: 14,
    marginTop: 2,
  },
  replyButton: {
    marginTop: 4,
  },
  replyButtonText: {
    color: "#007aff",
    fontSize: 13,
  },
  viewMoreRepliesText: {
    color: "#007aff",
    fontSize: 13,
    marginTop: 4,
  },
  hideRepliesText: {
    color: "#007aff",
    fontSize: 13,
    marginTop: 4,
  },
  addCommentContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  addCommentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  addCommentInput: {
    flex: 1,
    maxHeight: 100,
    fontSize: 15,
    color: "#222",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#007aff",
  },
  addCommentButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#007aff",
    alignItems: "center",
    justifyContent: "center",
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '80%',
    maxWidth: 300,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  menuText: {
    fontSize: 16,
    marginLeft: 12,
    color: '#222',
    fontWeight: '500',
  },
  // Video overlay styles
  muteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 5,
  },
  muteIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  muteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  muteButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  playButtonCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoControlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
  videoProgressBar: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  videoProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  videoControlButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTimeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '500',
    minWidth: 35,
  },
});

// Simple module-level cache for user profiles to avoid redundant fetches across different PostCards
const profileCache: Record<string, { avatar: string, name: string }> = {};

function PostCard({ post, currentUser, showMenu = true, highlightedCommentId, highlightedCommentText, mirror = false, onCommentPress, inPostViewer = false }: PostCardProps) {
  const { showSuccess } = useAppDialog();
  // Visits logic
  const [visitCount, setVisitCount] = useState<number>(typeof post?.visits === 'number' ? post.visits : 0);
  useEffect(() => {
    async function fetchVisits() {
      if (post?.location) {
        const count = await getLocationVisitCount(post.location);
        setVisitCount(count);
      }
    }
    fetchVisits();
  }, [post?.location]);

  // App color scheme
  const appColors = {
    background: '#fff',
    text: '#222',
    accent: APP_BLUE,
    muted: '#888',
    border: '#eee',
    input: '#f5f5f5',
    like: '#e74c3c',
    icon: '#222',
  };
  const showFullDesc = false;
  const normalizeLikeIds = useCallback((input: any): string[] => {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map((id) => String(id)).filter(Boolean)));
  }, []);

  const effectivePostId = String(post?._id || post?.id || '');
  // OPTIMIZATION: Use post data directly instead of real-time listeners
  const [likes, setLikes] = useState<string[]>(normalizeLikeIds(post?.likes));
  const [likesCount, setLikesCount] = useState<number>(typeof post?.likesCount === 'number' ? post.likesCount : normalizeLikeIds(post?.likes).length);
  const [savedBy, setSavedBy] = useState<string[]>(post?.savedBy || []);
  const user = useUser();
  const [cachedCurrentUserAvatar, setCachedCurrentUserAvatar] = useState<string>('');
  const [cachedFirebaseUid, setCachedFirebaseUid] = useState<string>('');
  const [cachedUserId, setCachedUserId] = useState<string>('');
  const [cachedUid, setCachedUid] = useState<string>('');
  const userIdForLike = String(user?.uid || user?.id || (user as any)?._id || currentUser?.uid || currentUser?.firebaseUid || currentUser?.id || (currentUser as any)?._id || (typeof currentUser === 'string' ? currentUser : '') || '');
  const resolvedCurrentUserAvatar = String(
    cachedCurrentUserAvatar ||
    user?.photoURL ||
    user?.avatar ||
    (user as any)?.profilePicture ||
    currentUser?.photoURL ||
    currentUser?.avatar ||
    (currentUser as any)?.profilePicture ||
    (currentUser as any)?.userAvatar ||
    ''
  );
  const liked = !!userIdForLike && likes.includes(userIdForLike);

  useEffect(() => {
    let cancelled = false;
    loadAuthSnapshotOnce().then((snap) => {
      if (cancelled) return;
      if (snap.userAvatar) setCachedCurrentUserAvatar(snap.userAvatar);
      if (snap.firebaseUid) setCachedFirebaseUid(snap.firebaseUid);
      if (snap.userId) setCachedUserId(snap.userId);
      if (snap.uid) setCachedUid(snap.uid);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (__DEV__) {
    console.log('[PostCard] userIdForLike:', userIdForLike, 'user:', user, 'currentUser:', currentUser, 'likes:', likes.length);
  }

  // OPTIMIZATION: Update local state when post prop changes (no real-time listener)
  useEffect(() => {
    const normalized = normalizeLikeIds(post?.likes);
    setLikes(normalized);
    setLikesCount(typeof post?.likesCount === 'number' ? post.likesCount : normalized.length);
    setSavedBy(Array.isArray(post?.savedBy) ? post.savedBy : []);
  }, [post?.likes, post?.likesCount, post?.savedBy, normalizeLikeIds]);

  // OPTIMIZATION: Use commentCount and reactions from post data initially
  // Event listener will update when comments/reactions are added
  const getResolvedCommentCount = useCallback((payload: any): number => {
    const direct = payload?.commentCount ?? payload?.commentsCount;
    if (typeof direct === 'number' && Number.isFinite(direct)) return Math.max(0, direct);
    if (Array.isArray(payload?.comments)) return payload.comments.length;
    return 0;
  }, []);

  const [commentCount, setCommentCount] = useState(getResolvedCommentCount(post));
  const [reactions, setReactions] = useState<any[]>(Array.isArray(post?.reactions) ? post.reactions : []);
  const [reactionsFilter, setReactionsFilter] = useState<string>('all');

  // Sync state if post prop changes significantly
  useEffect(() => {
    if (post?.reactions) {
      setReactions(Array.isArray(post.reactions) ? post.reactions : []);
    }
    setCommentCount(getResolvedCommentCount(post));
  }, [post?.id, post?.reactions?.length, post?.commentCount, post?.commentsCount, post?.comments, getResolvedCommentCount]);

  // Listen for post updates (comments, reactions, etc.) via event emitter
  useEffect(() => {
    const handlePostUpdated = (postId: string, data: any) => {
      if (postId === effectivePostId) {
        if (__DEV__) console.log('[PostCard] Received update for post:', postId, data);

        // Handle full post data update
        if (data?.reactions) {
          setReactions(Array.isArray(data.reactions) ? data.reactions : []);
        }

        if (data?.likes) {
          setLikes(normalizeLikeIds(data.likes));
        }

        if (data?.likesCount !== undefined) {
          setLikesCount(data.likesCount);
        }

        // Use actual commentCount from backend if provided, otherwise increment
        if ((data?.commentCount !== undefined && typeof data.commentCount === 'number') || (data?.commentsCount !== undefined && typeof data.commentsCount === 'number')) {
          setCommentCount(getResolvedCommentCount(data));
        } else if (data?.newCommentCount || data?.commentAdded) {
          setCommentCount((prev: number) => prev + 1);
        } else if (data?.commentDeleted) {
          setCommentCount((prev: number) => Math.max(0, prev - 1));
        }
      }
    };

    const subscription = feedEventEmitter.onPostUpdated(effectivePostId, handlePostUpdated);

    return () => {
      feedEventEmitter.offPostUpdated(effectivePostId, subscription);
    };
  }, [effectivePostId, getResolvedCommentCount, normalizeLikeIds]);

  const [currentAvatar, setCurrentAvatar] = useState<string>(() => {
    const authorId = typeof post?.userId === 'string' ? post.userId : (post?.userId?._id || post?.userId?.id || '');
    if (authorId && profileCache[authorId]) return profileCache[authorId].avatar;
    return post?.userAvatar || post?.avatar || post?.userId?.avatar || DEFAULT_AVATAR_URL;
  });
  const [currentUserName, setCurrentUserName] = useState<string>('User');
  useEffect(() => {
    const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;
    const normalizeAvatar = (value: any): string => {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();
      if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
      if (lower.includes('via.placeholder.com/200x200.png?text=profile')) return '';
      if (lower.includes('/default%2fdefault-pic.jpg') || lower.includes('/default/default-pic.jpg')) return '';
      return trimmed;
    };

    const authorId =
      typeof post?.userId === 'string'
        ? String(post.userId)
        : String(post?.userId?._id || post?.userId?.uid || post?.userId?.firebaseUid || '');

    // 1. Try to get from post object first (fastest)
    const populatedAvatar = (post?.userId && typeof post.userId === 'object')
      ? normalizeAvatar(post.userId?.avatar || post.userId?.photoURL || post.userId?.profilePicture)
      : '';

    const directAvatar = populatedAvatar || normalizeAvatar(post?.userAvatar) || normalizeAvatar((post as any)?.avatar) || '';
    const directName = (post?.userId && typeof post.userId === 'object' ? (post.userId?.name || post.userId?.username) : '') || post?.userName || post?.username || '';

    if (directAvatar) {
      setCurrentAvatar(directAvatar);
      if (authorId) profileCache[authorId] = { avatar: directAvatar, name: String(directName || currentUserName) };
    }
    if (directName) setCurrentUserName(String(directName));

    if (!authorId || (directAvatar && directName)) return;

    // 2. Try cache (next fastest)
    if (profileCache[authorId]) {
      if (!directAvatar) setCurrentAvatar(profileCache[authorId].avatar);
      if (!directName) setCurrentUserName(profileCache[authorId].name);
      return;
    }

    // 3. Last resort: Fetch from API
    let cancelled = false;
    async function fetchAvatar() {
      try {
        const { getUserProfile } = await import('../../lib/firebaseHelpers/user');
        const res = await getUserProfile(authorId);
        if (!cancelled && res?.success && res.data) {
          const d = res.data as any;
          const av = normalizeAvatar(d.avatar || d.photoURL || d.profilePicture) || DEFAULT_AVATAR;
          const nm = String(d.name || d.username || d.displayName || 'User');
          profileCache[authorId] = { avatar: av, name: nm };
          setCurrentAvatar(av);
          setCurrentUserName(nm);
        }
      } catch (err) {
        if (!cancelled) setCurrentAvatar(DEFAULT_AVATAR);
      }
    }
    fetchAvatar();
    return () => { cancelled = true; };
  }, [post?.userId, post?.userAvatar, post?.userName]);

  // Helper function to check if URL is a video
  const isVideoUrl = (url: string) => {
    if (!url) return false;
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext));
  };

  const rawMedia: string[] = Array.isArray((post as any)?.mediaUrls) && (post as any).mediaUrls.length > 0
    ? (post as any).mediaUrls.filter(Boolean)
    : (post?.imageUrls && post.imageUrls.length > 0
      ? post.imageUrls.filter(Boolean)
      : (post?.imageUrl ? [post.imageUrl] : []));

  const images: string[] = rawMedia.filter((url: string) => !isVideoUrl(url));
  const mediaVideos: string[] = rawMedia.filter((url: string) => isVideoUrl(url));

  const rawVideos: string[] = post?.videoUrls && post.videoUrls.length > 0
    ? post.videoUrls.filter(Boolean)
    : (post?.videoUrl ? [post.videoUrl] : []);

  const videos: string[] = [...mediaVideos, ...rawVideos].filter(Boolean);

  // If images exist, show only image carousel. If no images, show only first video. If neither, show placeholder.
  let showImages = images.length > 0;
  let showVideo = !showImages && videos.length > 0;
  const [mediaIndex, setMediaIndex] = useState(0);
  const [modalMediaIndex, setModalMediaIndex] = useState(0);
  const currentImageUrl = showImages ? images[mediaIndex] : undefined;
  const currentVideoUrl = showVideo ? videos[0] : undefined;
  const currentMediaUrl = currentImageUrl || currentVideoUrl;
  const isCurrentMediaVideo = typeof currentVideoUrl === 'string' && !!currentVideoUrl;
  const [selectedLocation, setSelectedLocation] = useState<any>(null);

  const insets = useSafeAreaInsets();

  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false); // Videos don't auto-play
  const [isVideoMuted, setIsVideoMuted] = useState(true); // Muted by default
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [showMuteOverlay, setShowMuteOverlay] = useState(true); // Show tap to unmute overlay
  const [videoDuration, setVideoDuration] = useState(0); // Total duration in seconds
  const [videoCurrentTime, setVideoCurrentTime] = useState(0); // Current position in seconds
  const [showControls, setShowControls] = useState(true); // Show video controls
  const videoRef = useRef<VideoType>(null);
  const imageCarouselRef = useRef<FlatList>(null);
  const mediaModalListRef = useRef<FlatList>(null);

  const [showMediaModal, setShowMediaModal] = useState(false);
  const modalTapLockRef = useRef(false);
  const modalMediaIndexRef = useRef(0);
  const carouselIsDraggingRef = useRef(false);
  const lastCarouselTouchStartRef = useRef(0);
  /** True if finger moved beyond slop (e.g. vertical feed scroll) — do not open media on touch end. */
  const carouselFingerMovedRef = useRef(false);
  const carouselTouchOriginRef = useRef({ x: 0, y: 0 });
  const CAROUSEL_TAP_SLOP = 14;

  const closeMediaModal = useCallback(() => {
    setShowMediaModal(false);
    requestAnimationFrame(() => {
      setMediaIndex(modalMediaIndex);
    });
  }, [modalMediaIndex]);

  const prefetchDetailAround = useCallback((centerIdx: number) => {
    try {
      if (!showImages || images.length === 0) return;
      const window = 2;
      const candidates: (string | null)[] = [];
      for (let d = -window; d <= window; d++) {
        const idx = Math.max(0, Math.min(images.length - 1, centerIdx + d));
        const raw = images[idx];
        if (typeof raw !== 'string' || !raw) continue;
        candidates.push(getOptimizedImageUrl(raw, 'detail'));
      }
      const uris = candidates.filter(Boolean) as string[];
      if (uris.length > 0) {
        ExpoImage.prefetch(uris);
      }
    } catch {}
  }, [showImages, images]);

  const openMediaModal = useCallback(() => {
    // Warm up detail-sized images before opening the viewer to reduce perceived lag.
    prefetchDetailAround(mediaIndex);
    setModalMediaIndex(mediaIndex);
    setShowMediaModal(true);
  }, [mediaIndex, prefetchDetailAround]);

  const imageTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastImageTapRef = useRef(0);
  const doubleTapHeartOpacity = useRef(new Animated.Value(0)).current;
  const doubleTapHeartScale = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    return () => {
      if (imageTapTimeoutRef.current) clearTimeout(imageTapTimeoutRef.current);
    };
  }, []);

  const flashDoubleTapHeart = useCallback(() => {
    doubleTapHeartOpacity.setValue(0);
    doubleTapHeartScale.setValue(0.45);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(doubleTapHeartOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(doubleTapHeartOpacity, { toValue: 0, duration: 420, delay: 120, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.spring(doubleTapHeartScale, { toValue: 1.12, friction: 7, useNativeDriver: true }),
        Animated.timing(doubleTapHeartScale, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
    ]).start();
  }, [doubleTapHeartOpacity, doubleTapHeartScale]);

  const performDoubleTapLike = useCallback(async () => {
    const userId = userIdForLike;
    if (!effectivePostId || !userId) return;
    const wasLiked = likes.includes(userId);
    if (wasLiked) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      flashDoubleTapHeart();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    flashDoubleTapHeart();
    setLikes((prev) => [...prev, userId]);
    setLikesCount((prev: number) => prev + 1);
    feedEventEmitter.emitPostUpdated(effectivePostId, {
      liked: true,
      likesCount: (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) + 1,
    });
    try {
      const res = await likePost(effectivePostId, userId) as { success?: boolean; error?: string; data?: any };
      const ok = res?.success !== false;
      const endpointMissing = /endpoint not found/i.test(String(res?.error || ''));
      if (endpointMissing) {
        if (__DEV__) console.warn('[PostCard] double-tap like: endpoint missing, keeping optimistic UI');
        return;
      }
      if (!ok) {
        setLikes((prev) => prev.filter((id) => id !== userId));
        setLikesCount((prev: number) => Math.max(0, prev - 1));
        feedEventEmitter.emitPostUpdated(effectivePostId, {
          liked: false,
          likesCount: Math.max(0, (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) - 1),
        });
      } else if (res?.data) {
        const backendLikes = normalizeLikeIds(res.data.likes);
        setLikes(backendLikes);
        setLikesCount(typeof res.data.likesCount === 'number' ? res.data.likesCount : backendLikes.length);
        if (post.userId !== userId) {
          await notificationService.notifyLike(post.userId, userId, effectivePostId);
        }
      }
    } catch (err: any) {
      console.error('[PostCard] double-tap like error:', err);
      setLikes((prev) => prev.filter((id) => id !== userId));
      setLikesCount((prev: number) => Math.max(0, prev - 1));
    }
  }, [
    userIdForLike,
    effectivePostId,
    likes,
    likesCount,
    post?.userId,
    flashDoubleTapHeart,
    normalizeLikeIds,
  ]);

  const handleImageCarouselTap = useCallback(() => {
    const now = Date.now();
    if (now - lastImageTapRef.current < 300) {
      if (imageTapTimeoutRef.current) {
        clearTimeout(imageTapTimeoutRef.current);
        imageTapTimeoutRef.current = null;
      }
      lastImageTapRef.current = 0;
      void performDoubleTapLike();
      return;
    }
    lastImageTapRef.current = now;
    if (imageTapTimeoutRef.current) clearTimeout(imageTapTimeoutRef.current);
    imageTapTimeoutRef.current = setTimeout(() => {
      imageTapTimeoutRef.current = null;
      lastImageTapRef.current = 0;
      openMediaModal();
    }, 280);
  }, [performDoubleTapLike, openMediaModal]);

  const onCarouselTouchStart = useCallback((e: any) => {
    lastCarouselTouchStartRef.current = Date.now();
    carouselFingerMovedRef.current = false;
    const t = e?.nativeEvent?.touches?.[0];
    if (t) {
      carouselTouchOriginRef.current = { x: t.pageX, y: t.pageY };
    }
  }, []);

  const onCarouselTouchMove = useCallback((e: any) => {
    const t = e?.nativeEvent?.touches?.[0];
    if (!t) return;
    const dx = Math.abs(t.pageX - carouselTouchOriginRef.current.x);
    const dy = Math.abs(t.pageY - carouselTouchOriginRef.current.y);
    if (dx > CAROUSEL_TAP_SLOP || dy > CAROUSEL_TAP_SLOP) {
      carouselFingerMovedRef.current = true;
      if (imageTapTimeoutRef.current) {
        clearTimeout(imageTapTimeoutRef.current);
        imageTapTimeoutRef.current = null;
      }
      lastImageTapRef.current = 0;
    }
  }, []);

  const onCarouselTouchCancel = useCallback(() => {
    if (imageTapTimeoutRef.current) {
      clearTimeout(imageTapTimeoutRef.current);
      imageTapTimeoutRef.current = null;
    }
    lastImageTapRef.current = 0;
    carouselFingerMovedRef.current = true;
  }, []);

  const onCarouselTouchEnd = useCallback(() => {
    // If the user was swiping/dragging, do not treat it as a tap.
    if (carouselIsDraggingRef.current) return;
    if (carouselFingerMovedRef.current) {
      carouselFingerMovedRef.current = false;
      return;
    }
    // Guard against "tap" fired after a tiny accidental drag.
    const elapsed = Date.now() - lastCarouselTouchStartRef.current;
    if (elapsed > 800) return;
    handleImageCarouselTap();
  }, [handleImageCarouselTap]);

  useEffect(() => {
    if (!showMediaModal) return;
    if (!showImages || images.length === 0) return;

    const getUri = (idx: number) => {
      const raw = images[idx];
      if (typeof raw !== 'string' || !raw) return null;
      return getOptimizedImageUrl(raw, 'detail');
    };

    const all = images.length <= 12;
    const window = 3;
    const candidates: (string | null)[] = [];
    if (all) {
      for (let i = 0; i < images.length; i++) candidates.push(getUri(i));
    } else {
      for (let d = -window; d <= window; d++) candidates.push(getUri(modalMediaIndex + d));
    }

    const uris = candidates.filter(Boolean) as string[];

    if (uris.length > 0) {
      ExpoImage.prefetch(uris);
    }
  }, [showMediaModal, showImages, images, modalMediaIndex]);

  useEffect(() => {
    modalMediaIndexRef.current = modalMediaIndex;
  }, [modalMediaIndex]);

  // Align the modal swipe carousel to the current index.
  useEffect(() => {
    if (!showMediaModal) return;
    if (!showImages || images.length <= 1) return;
    const idx = Math.max(0, Math.min(images.length - 1, modalMediaIndex));
    requestAnimationFrame(() => {
      try {
        mediaModalListRef.current?.scrollToIndex({ index: idx, animated: false });
      } catch { }
    });
  }, [showMediaModal, showImages, images.length, modalMediaIndex]);

  const mediaRatioCacheRef = useRef<Map<string, number>>(new Map());
  const [mediaHeight, setMediaHeight] = useState<number>(SCREEN_WIDTH);

  const clampMediaRatio = (ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return 1;
    return Math.min(MAX_MEDIA_RATIO, Math.max(MIN_MEDIA_RATIO, ratio));
  };

  const setHeightFromRatio = (ratio: number) => {
    const clamped = clampMediaRatio(ratio);
    const nextHeight = SCREEN_WIDTH / clamped;
    setMediaHeight(nextHeight);
  };


  useEffect(() => {
    if (showImages && images.length > 0 && mediaIndex >= images.length) {
      setMediaIndex(0);
    }
  }, [showImages, images.length, mediaIndex]);

  useEffect(() => {
    const firstMediaUrl = (showImages && images.length > 0) ? images[0] : (videos.length > 0 ? videos[0] : undefined);
    if (typeof firstMediaUrl !== 'string' || !firstMediaUrl) {
      setHeightFromRatio(1);
      return;
    }

    // 1) Fast in-memory cache (per-card)
    const localCached = mediaRatioCacheRef.current.get(firstMediaUrl);
    if (typeof localCached === 'number') {
      setHeightFromRatio(localCached);
      return;
    }

    let cancelled = false;

    // 2) Persistent cache (loaded once)
    loadMediaRatioCacheOnce()
      .then((m) => {
        if (cancelled) return;
        const persisted = m.get(firstMediaUrl);
        if (typeof persisted === 'number') {
          mediaRatioCacheRef.current.set(firstMediaUrl, persisted);
          // Only adjust height if we haven't already locked it via onLoad.
          if (!heightLockedRef.current) setHeightFromRatio(persisted);
        }
      })
      .catch(() => {});

    // 3) Pre-measure ratio before image finishes loading (reduces "small→big" jump).
    if (showImages && images.length > 0 && !heightLockedRef.current) {
      if (!mediaRatioInFlight.has(firstMediaUrl)) {
        mediaRatioInFlight.add(firstMediaUrl);
        const uri = getOptimizedImageUrl(firstMediaUrl, 'feed');
        Image.getSize(
          uri,
          (w, h) => {
            mediaRatioInFlight.delete(firstMediaUrl);
            if (cancelled) return;
            if (typeof w === 'number' && typeof h === 'number' && h > 0) {
              const ratio = w / h;
              mediaRatioCacheRef.current.set(firstMediaUrl, ratio);
              setCachedRatio(firstMediaUrl, ratio);
              setHeightFromRatio(ratio);
              heightLockedRef.current = true;
            }
          },
          () => {
            mediaRatioInFlight.delete(firstMediaUrl);
          }
        );
      }
    }

    return () => {
      cancelled = true;
    };
  }, [showImages, images[0], videos[0]]); // Only lock to the FIRST media item


  const modalPanResponder = React.useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gestureState) => {
        const currentIndex = modalMediaIndexRef.current;
        const totalImages = images.length;

        if (gestureState.dx > 35 && currentIndex > 0) {
          setModalMediaIndex(() => {
            const next = Math.max(0, currentIndex - 1);
            modalMediaIndexRef.current = next;
            return next;
          });
        } else if (gestureState.dx < -35 && currentIndex < totalImages - 1) {
          setModalMediaIndex(() => {
            const next = Math.min(totalImages - 1, currentIndex + 1);
            modalMediaIndexRef.current = next;
            return next;
          });
        }
      },
    }), [images.length]);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [localShowCommentsModal, setLocalShowCommentsModal] = useState(false);
  const showCommentsModal = localShowCommentsModal;
  const setShowCommentsModal = setLocalShowCommentsModal;
  const [modalTab, setModalTab] = useState<'comments' | 'reactions'>('comments');
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);


  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Add PanResponder for swipe down to close comments modal
  const [modalTranslateY, setModalTranslateY] = useState(0);
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward vertical swipes from top area
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward movement
        if (gestureState.dy > 0) {
          setModalTranslateY(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If swiped down more than 100px, close modal
        if (gestureState.dy > 100) {
          setShowCommentsModal(false);
          setModalTranslateY(0);
        } else {
          // Otherwise, snap back to position
          setModalTranslateY(0);
        }
      },
    })
  ).current;

  const [showShareModal, setShowShareModal] = useState(false);

  const onReplay = () => {
    setVideoCompleted(false);
    setIsVideoPlaying(true);
    setVideoProgress(0);
    if (videoRef.current) {
      videoRef.current.setPositionAsync(0);
    }
  };

  const showPostOptions = () => {
    setShowOptionsModal(true);
  };

  const handleEditPost = async () => {
    const pId = post?.id || post?._id;
    if (!pId) return;
    setShowOptionsModal(false);
    try {
      router.push({ pathname: '/edit-post', params: { postId: String(pId) } } as any);
    } catch { }
  };


  const handleDeletePost = async () => {
    const pId = post?.id || post?._id;
    if (!pId || !userIdForLike) {
      if (__DEV__) console.warn('[PostCard] Cannot delete: missing ID', { pId, userIdForLike });
      return;
    }
    try {
      const { deletePost } = await import('../../lib/firebaseHelpers');
      const result = await deletePost(pId, userIdForLike);
      if (result.success) {
        setShowDeleteConfirm(false);
        setShowOptionsModal(false);
        // Sync with other screens
        feedEventEmitter.emitPostDeleted(pId);
        // @ts-ignore - used by profile/saved for refetch
        feedEventEmitter.emit('feedUpdated');
        // Instagram-like: no blocking success dialog
      } else {

        Alert.alert('Error', result.error || 'Failed to delete post');
      }
    } catch (err: any) {
      console.error('[PostCard] Delete error:', err);
      Alert.alert('Error', 'Error deleting post');
    }
  };




  const router = useRouter();

  const postUserName = currentUserName;

  const postTimeText = getTimeAgo(post?.createdAt);

  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);

  const captionText = (() => {
    const fromCaption = (() => {
      let caption = '';
      if (typeof post?.caption === 'string' || typeof post?.caption === 'number') {
        caption = String(post?.caption);
      } else if (Array.isArray(post?.caption) || typeof post?.caption === 'object') {
        caption = JSON.stringify(post?.caption);
      }
      return caption;
    })();

    // Back-compat: some endpoints still use `content` or `text` as the caption.
    const fromContent =
      typeof (post as any)?.content === 'string' || typeof (post as any)?.content === 'number'
        ? String((post as any)?.content)
        : '';
    const fromText =
      typeof (post as any)?.text === 'string' || typeof (post as any)?.text === 'number'
        ? String((post as any)?.text)
        : '';

    return String(fromCaption || fromContent || fromText || '');
  })();

  const handleReactToPost = useCallback(async (emoji: string) => {
    // Determine the actual unique identifier and user details
    const uid = user?.uid || currentUser?.uid || currentUser?.firebaseUid || (currentUser as any)?.id;
    if (!uid) return;
    const name = user?.displayName || user?.name || currentUser?.displayName || currentUser?.name || currentUserName || 'User';
    const avatar = user?.photoURL || user?.avatar || currentUser?.photoURL || currentUser?.avatar || currentAvatar || '';

    try {
      const { reactToPost } = await import('../../lib/firebaseHelpers/post');
      const res = await reactToPost(post.id, uid, name, avatar, emoji);
      if (res.success && res.data) {
        // Emit an event to instantly reflect the new reactions locally
        feedEventEmitter.emitPostUpdated(post.id, res.data);
      } else {
        if (__DEV__) console.warn('Post reaction returned unsuccessful response:', res);
      }
    } catch (err) {
      console.error('Failed to react to post:', err);
    }
  }, [user, currentUser, currentUserName, currentAvatar, post?.id]);

  const shouldShowMore = !isCaptionExpanded && captionText.trim().length > 110;

  // Derived data
  const locationName = post?.locationData?.name || post?.locationName ||
    (typeof post?.location === 'string' ? post.location : post?.location?.name) || '';

  // Perf: the viewer modal renders many PostCards; keep carousels lightweight there.
  // Feed can use a large bounded "infinite" window.
  const enableInfiniteCarousel = !inPostViewer;
  const CAROUSEL_LOOPS = enableInfiniteCarousel ? 31 : 1;
  const carouselImages = React.useMemo(() => {
    if (!enableInfiniteCarousel) return images;
    if (images.length <= 1) return images;
    return Array(CAROUSEL_LOOPS).fill(images).flat();
  }, [images, enableInfiniteCarousel]);

  // PERF: avoid re-setting height from ratio repeatedly (looped carousel has many "index 0"s).
  const heightLockedRef = useRef(false);
  useEffect(() => {
    heightLockedRef.current = false;
  }, [post?.id, post?._id, images?.length]);

  // Using a custom index to compute the actual original index
  const getActualIndex = (idx: number) => {
    if (!enableInfiniteCarousel) return idx;
    return images.length > 1 ? idx % images.length : idx;
  };

  const initialScrollIndex =
    enableInfiniteCarousel && images.length > 1
      ? images.length * Math.floor(CAROUSEL_LOOPS / 2)
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: appColors.background }}>
      <View style={styles.cardShadow}>
        <View style={[styles.cardInner, { backgroundColor: appColors.background }]}>
          {/* ── Instagram-style card header (above image) ── */}
          <TouchableOpacity
            style={styles.cardHeader}
            activeOpacity={0.8}
            onPress={() => {
              if (post?.userId) {
                const uid = typeof post.userId === 'string' ? post.userId : post.userId?._id || post.userId?.uid;
                if (uid) {
                  if (currentUser?.uid && String(uid) === String(currentUser.uid)) {
                    router.push('/(tabs)/profile' as any);
                  } else {
                    router.push({ pathname: '/user-profile', params: { id: uid } } as any);
                  }
                }
              }
            }}
          >
            <ExpoImage
              source={{ uri: currentAvatar }}
              style={styles.cardHeaderAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={160}
            />
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardHeaderName} numberOfLines={1}>{postUserName}</Text>
              <View style={styles.cardHeaderSubRow}>
                {!!locationName && (
                  <>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        const locId = post?.locationData?.placeId || 'unknown';
                        const locAcc = post?.locationData?.address || '';
                        router.push({
                          pathname: '/location/[placeId]',
                          params: {
                            placeId: locId,
                            locationName: locationName,
                            locationAddress: locAcc
                          }
                        } as any);
                      }}
                    >
                      <Text style={styles.cardHeaderLocation} numberOfLines={1}>{locationName}</Text>
                    </TouchableOpacity>
                    <View style={styles.cardHeaderDot} />
                  </>
                )}
                <Text style={styles.cardHeaderDate}>{postTimeText}</Text>
              </View>
            </View>
            {showMenu && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  showPostOptions();
                }}
                style={{ padding: 4 }}
              >
                <MaterialCommunityIcons name="dots-horizontal" size={24} color="#333" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Media content: Image/Video */}
          {/* Image carousel if images exist */}
          {showImages && (
            <View style={[styles.imageWrap, { height: mediaHeight }]}>
              <FlatList
                ref={imageCarouselRef}
                data={carouselImages}
                keyExtractor={(item, idx) => `image-${String(item || '')}-${idx}`}
                horizontal
                // Reels-like: free scrolling with momentum (no paging / snapping)
                pagingEnabled={false}
                decelerationRate="fast"
                initialScrollIndex={initialScrollIndex}
                getItemLayout={(data, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                // PERF: keep the carousel lightweight even with looped data.
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                updateCellsBatchingPeriod={40}
                removeClippedSubviews={true}
                scrollsToTop={false}
                showsHorizontalScrollIndicator={false}
                bounces={false}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => {
                  carouselIsDraggingRef.current = true;
                }}
                onMomentumScrollEnd={(e: any) => {
                  carouselIsDraggingRef.current = false;
                  const contentOffset = e.nativeEvent.contentOffset.x;
                  const approxIndex = Math.round(contentOffset / SCREEN_WIDTH);
                  const distToNearest = Math.abs(contentOffset - approxIndex * SCREEN_WIDTH);
                  const isNearPage = distToNearest <= SCREEN_WIDTH * 0.22; // avoid "jump" if user stops mid-image

                  const newIndex = approxIndex;
                  if (images.length > 1) {
                    const actualIndex = ((newIndex % images.length) + images.length) % images.length;
                    if (actualIndex !== mediaIndex) setMediaIndex(actualIndex);
                  } else {
                    if (newIndex !== mediaIndex && newIndex >= 0 && newIndex < images.length) setMediaIndex(newIndex);
                  }

                  // Recentre ONLY when near the edges of our loop window.
                  // This preserves the "infinite" illusion without causing a jump on every swipe.
                  if (enableInfiniteCarousel && images.length > 1 && isNearPage) {
                    const actualIndex = ((newIndex % images.length) + images.length) % images.length;
                    const centerLoopIndex = images.length * Math.floor(CAROUSEL_LOOPS / 2) + actualIndex; // middle loop
                    // Keep 2 full loops buffer on each side.
                    const leftEdge = images.length * 2;
                    const rightEdge = images.length * (CAROUSEL_LOOPS - 3);

                    if (newIndex <= leftEdge || newIndex >= rightEdge) {
                      try {
                        imageCarouselRef.current?.scrollToIndex({ index: centerLoopIndex, animated: false });
                      } catch { }
                    }
                  }
                }}
                onScrollEndDrag={() => {
                  // If user lets go without momentum, release after a short beat
                  setTimeout(() => {
                    carouselIsDraggingRef.current = false;
                  }, 80);
                }}
                renderItem={({ item, index }: { item: string, index: number }) => {
                  const actualIndex = getActualIndex(index);
                  return (
                    <View
                      style={{ width: SCREEN_WIDTH, height: mediaHeight }}
                      onTouchStart={onCarouselTouchStart}
                      onTouchMove={onCarouselTouchMove}
                      onTouchEnd={onCarouselTouchEnd}
                      onTouchCancel={onCarouselTouchCancel}
                    >
                      <ExpoImage
                        source={{ uri: getOptimizedImageUrl(item || 'https://via.placeholder.com/600x600.png?text=No+Image', 'feed') }}
                        recyclingKey={String(item || index)}
                        style={styles.image}
                        contentFit="contain"
                        // Perf: blurhash placeholder + high priority on every cell can stutter while scrolling
                        placeholder={null as any}
                        cachePolicy="memory-disk"
                        priority="normal"
                        transition={0}
                        onLoad={(e: any) => {
                          // ONLY calculate ratio for the first image to lock the carousel height!
                          if (actualIndex === 0 && !heightLockedRef.current) {
                            const src = e?.source || e?.nativeEvent?.source || e;
                            const w = src?.width || src?.naturalWidth;
                            const h = src?.height || src?.naturalHeight;
                            if (typeof w === 'number' && typeof h === 'number' && h > 0) {
                              const rawUrl = item;
                              if (typeof rawUrl === 'string' && rawUrl) {
                                const ratio = w / h;
                                mediaRatioCacheRef.current.set(rawUrl, ratio);
                                setHeightFromRatio(ratio);
                                heightLockedRef.current = true;
                              }
                            }
                          }
                        }}
                        onError={() => {
                          if (__DEV__) console.warn('[PostCard] Image failed to load:', item);
                        }}
                      />
                    </View>
                  );
                }}
              />

              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 7,
                  opacity: doubleTapHeartOpacity,
                  transform: [{ scale: doubleTapHeartScale }],
                }}
              >
                <MaterialCommunityIcons name="heart" size={88} color="#ED4956" />
              </Animated.View>

              {images.length > 1 && (
                <View
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    zIndex: 999,
                    elevation: 30,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                  pointerEvents="none"
                >
                  <Text
                    style={{
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: '600',
                      letterSpacing: 0.3,
                    }}
                  >
                    {mediaIndex + 1}/{images.length}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* Video if no images and video exists */}
          {showVideo && (
            <TouchableOpacity
              style={[styles.imageWrap, { height: mediaHeight }]}
              activeOpacity={1}
              onPress={() => {
                // Toggle play/pause on tap (center area)
                if (isVideoPlaying) {
                  setIsVideoPlaying(false);
                } else {
                  setIsVideoPlaying(true);
                  setVideoCompleted(false);
                }
              }}
            >
              {videoLoading && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 10 }}>
                  <ActivityIndicator size="large" color={APP_BLUE} />
                </View>
              )}
              {videos[0] ? (
                <>
                  <Video
                    ref={videoRef}
                    source={{ uri: videos[0] }}
                    style={[styles.image, { width: '100%', height: '100%' }]}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={isVideoPlaying}
                    useNativeControls={false}
                    isLooping={false}
                    isMuted={isVideoMuted}
                    posterSource={{ uri: videos[0] }}
                    posterStyle={{ width: '100%', height: '100%' }}
                    onLoadStart={() => { setVideoLoading(true); setVideoError(null); }}
                    onLoad={(status: any) => {
                      setVideoLoading(false);
                      if (status.durationMillis) {
                        setVideoDuration(Math.floor(status.durationMillis / 1000));
                      }
                      const w = status?.naturalSize?.width;
                      const h = status?.naturalSize?.height;
                      if (typeof w === 'number' && typeof h === 'number' && h > 0) {
                        const ratio = w / h;
                        const rawUrl = videos[0];
                        if (typeof rawUrl === 'string' && rawUrl) {
                          mediaRatioCacheRef.current.set(rawUrl, ratio);
                          setHeightFromRatio(ratio);
                        }
                      }
                    }}
                    onError={(e: any) => { setVideoError(e?.nativeEvent?.error || 'Video failed to load'); setVideoLoading(false); }}
                    onPlaybackStatusUpdate={status => {
                      const isStatusObject = status !== null && typeof status === 'object';

                      if (isStatusObject && 'didJustFinish' in status && status.didJustFinish) {
                        setVideoCompleted(true);
                        setIsVideoPlaying(false);
                      }
                      if (
                        isStatusObject &&
                        status.isLoaded &&
                        'positionMillis' in status &&
                        'durationMillis' in status &&
                        typeof status.positionMillis === 'number' &&
                        typeof status.durationMillis === 'number' &&
                        status.durationMillis > 0
                      ) {
                        setVideoProgress(status.positionMillis / status.durationMillis);
                        setVideoCurrentTime(Math.floor(status.positionMillis / 1000));
                        setVideoDuration(Math.floor(status.durationMillis / 1000));
                      }
                    }}
                  />

                  {/* Tap to Unmute Overlay - only on first load when muted */}
                  {showMuteOverlay && isVideoMuted && !videoCompleted && (
                    <TouchableOpacity
                      style={styles.muteOverlay}
                      onPress={() => {
                        setIsVideoMuted(false);
                        setShowMuteOverlay(false);
                        setIsVideoPlaying(true);
                      }}
                    >
                      <View style={styles.muteIconContainer}>
                        <Feather name="volume-x" size={24} color="#fff" />
                      </View>
                      <Text style={styles.muteText}>Tap to unmute</Text>
                    </TouchableOpacity>
                  )}

                  {/* Replay Overlay - when video completed */}
                  {videoCompleted && (
                    <TouchableOpacity
                      style={styles.muteOverlay}
                      onPress={async () => {
                        // Replay from beginning
                        if (videoRef.current) {
                          await videoRef.current.setPositionAsync(0);
                        }
                        setVideoCompleted(false);
                        setIsVideoPlaying(true);
                        setVideoProgress(0);
                        setVideoCurrentTime(0);
                      }}
                    >
                      <View style={styles.muteIconContainer}>
                        <Feather name="rotate-ccw" size={28} color="#fff" />
                      </View>
                      <Text style={styles.muteText}>Tap to replay</Text>
                    </TouchableOpacity>
                  )}

                  {/* Play/Pause Button (center) - only show when paused and not loading and not completed */}
                  {!isVideoPlaying && !videoLoading && !videoCompleted && !showMuteOverlay && (
                    <TouchableOpacity
                      style={styles.playButtonOverlay}
                      onPress={() => {
                        setIsVideoPlaying(true);
                        setVideoCompleted(false);
                      }}
                    >
                      <View style={styles.playButtonCircle}>
                        <Feather name="play" size={32} color="#fff" style={{ marginLeft: 4 }} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Video Controls Bar (bottom) */}
                  <View style={styles.videoControlsBar}>
                    {/* Play/Pause Button */}
                    <TouchableOpacity
                      style={styles.videoControlButton}
                      onPress={() => {
                        if (videoCompleted) {
                          // Replay
                          if (videoRef.current) {
                            videoRef.current.setPositionAsync(0);
                          }
                          setVideoCompleted(false);
                          setIsVideoPlaying(true);
                          setVideoProgress(0);
                        } else {
                          setIsVideoPlaying(!isVideoPlaying);
                        }
                      }}
                    >
                      <Feather
                        name={videoCompleted ? "rotate-ccw" : (isVideoPlaying ? "pause" : "play")}
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>

                    {/* Current Time */}
                    <Text style={styles.videoTimeText}>
                      {Math.floor(videoCurrentTime / 60)}:{(videoCurrentTime % 60).toString().padStart(2, '0')}
                    </Text>

                    {/* Progress Bar */}
                    <View style={styles.videoProgressBar}>
                      <View style={[styles.videoProgressFill, { width: `${videoProgress * 100}%` }]} />
                    </View>

                    {/* Duration */}
                    <Text style={styles.videoTimeText}>
                      {Math.floor(videoDuration / 60)}:{(videoDuration % 60).toString().padStart(2, '0')}
                    </Text>

                    {/* Mute/Unmute Button */}
                    <TouchableOpacity
                      style={styles.videoControlButton}
                      onPress={() => {
                        setIsVideoMuted(!isVideoMuted);
                        setShowMuteOverlay(false);
                      }}
                    >
                      <Feather name={isVideoMuted ? "volume-x" : "volume-2"} size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' }}>
                  <Text style={{ color: '#fff', fontSize: 16 }}>No video found</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          {/* Placeholder if no images or videos */}
          {!showImages && !showVideo && (
            <View style={styles.imageWrap}>
              <ExpoImage
                source={{ uri: 'https://via.placeholder.com/600x600.png?text=No+Media' }}
                style={styles.image}
                contentFit="contain"
              />
            </View>
          )}
          {/* Removed old carousel navigation and page counter - now using Instagram-style dots at bottom */}
          {/* All content inside card box */}
          <View style={{ paddingHorizontal: 0 }}>
            <View style={styles.iconRow}>
              {/* Left side: Like / Comment / Share / Save */}
              <View style={styles.iconRowLeft}>
                {/* Like */}
                <TouchableOpacity
                  onPress={async () => {
                    const userId = userIdForLike;
                    if (!effectivePostId) { if (__DEV__) console.warn('Post ID missing'); return; }
                    if (!userId) { if (__DEV__) console.warn('User not logged in'); return; }
                    try {
                      const wasLiked = likes.includes(userId);
                      Haptics.impactAsync(
                        wasLiked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
                      ).catch(() => {});
                      if (wasLiked) {
                        setLikes(prev => prev.filter(id => id !== userId));
                        setLikesCount((prev: number) => Math.max(0, prev - 1));
                        feedEventEmitter.emitPostUpdated(effectivePostId, { liked: false, likesCount: Math.max(0, (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) - 1) });
                        const res = await unlikePost(effectivePostId, userId) as { success?: boolean; error?: string; data?: any };
                        const ok = res?.success !== false;
                        const endpointMissing = /endpoint not found/i.test(String(res?.error || ''));
                        if (endpointMissing) {
                          if (__DEV__) console.warn('[PostCard] unlike fallback: endpoint missing on backend, keeping optimistic UI state');
                          return;
                        }
                        if (!ok) {
                          setLikes(prev => [...prev, userId]);
                          setLikesCount((prev: number) => prev + 1);
                          feedEventEmitter.emitPostUpdated(effectivePostId, { liked: true, likesCount: (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) + 1 });
                          Alert.alert('Unlike Failed', res?.error || 'Unknown error');
                        } else if (res?.data) {
                          const backendLikes = normalizeLikeIds(res.data.likes);
                          setLikes(backendLikes);
                          setLikesCount(typeof res.data.likesCount === 'number' ? res.data.likesCount : backendLikes.length);
                        }
                      } else {
                        setLikes(prev => [...prev, userId]);
                        setLikesCount((prev: number) => prev + 1);
                        feedEventEmitter.emitPostUpdated(effectivePostId, { liked: true, likesCount: (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) + 1 });
                        const res = await likePost(effectivePostId, userId) as { success?: boolean; error?: string; data?: any };
                        const ok = res?.success !== false;
                        const endpointMissing = /endpoint not found/i.test(String(res?.error || ''));
                        if (endpointMissing) {
                          if (__DEV__) console.warn('[PostCard] like fallback: endpoint missing on backend, keeping optimistic UI state');
                          return;
                        }
                        if (!ok) {
                          setLikes(prev => prev.filter(id => id !== userId));
                          setLikesCount((prev: number) => Math.max(0, prev - 1));
                          feedEventEmitter.emitPostUpdated(effectivePostId, { liked: false, likesCount: Math.max(0, (typeof likesCount === 'number' ? likesCount : Number(likesCount) || 0) - 1) });
                          Alert.alert('Like Failed', res?.error || 'Unknown error');
                        } else if (post.userId !== userId) {
                          if (res?.data) {
                            const backendLikes = normalizeLikeIds(res.data.likes);
                            setLikes(backendLikes);
                            setLikesCount(typeof res.data.likesCount === 'number' ? res.data.likesCount : backendLikes.length);
                          }
                          await notificationService.notifyLike(post.userId, userId, effectivePostId);
                        }
                      }
                    } catch (err: any) {
                      console.error('Like/unlike exception:', err);
                      Alert.alert('Exception API', err?.message || 'Error occurred');
                    }
                  }}
                  style={styles.actionItem}
                >
                  {liked ? (
                    <MaterialCommunityIcons name="heart" size={24} color={appColors.like} />
                  ) : (
                    <MaterialCommunityIcons name="heart-outline" size={24} color={appColors.icon} />
                  )}
                  <Text style={styles.actionCount}>{typeof likesCount === 'number' ? String(likesCount) : String(likesCount || '')}</Text>
                </TouchableOpacity>

                {/* Comment */}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Open comments"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    if (onCommentPress) {
                      onCommentPress(effectivePostId, resolvedCurrentUserAvatar);
                    } else {
                      setModalTab('comments');
                      setShowCommentsModal(true);
                    }
                  }}
                  style={styles.actionItem}
                >
                  <Feather name="message-circle" size={24} color={appColors.icon} />
                  <Text style={styles.actionCount}>{String(commentCount || 0)}</Text>
                </TouchableOpacity>

                {/* Save */}
                <View style={styles.actionItem}>
                  <SaveButton post={{ ...post, savedBy }} currentUser={currentUser} />
                  {savedBy.length > 0 && <Text style={styles.actionCount}>{savedBy.length}</Text>}
                </View>
              </View>

              {/* Right side: Premium Reaction Pill (Star + optional Emoji & Count) */}
              {(() => {
                const totalReactions = reactions.length || 0;
                const shareCount = typeof post?.shareCount === 'number' ? post.shareCount : (Array.isArray(post?.sharedBy) ? post.sharedBy.length : 0);
                // Get the most frequent emoji if any
                let topEmoji = '';
                if (totalReactions > 0) {
                  const emojiMap: Record<string, number> = {};
                  reactions.forEach((r: any) => { 
                    const e = r?.emoji || r?.type || ''; 
                    if (e) emojiMap[e] = (emojiMap[e] || 0) + 1; 
                  });
                  const topResult = Object.entries(emojiMap).sort((a, b) => b[1] - a[1])[0];
                  topEmoji = topResult ? topResult[0] : '';
                }

                return (
                  <View style={styles.iconRowRightGroup}>
                    <TouchableOpacity
                      style={styles.iconRowRight}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setModalTab('reactions');
                        setReactionsFilter('all');
                        setShowCommentsModal(true);
                      }}
                      activeOpacity={0.7}
                    >
                      {totalReactions > 0 ? (
                        <>
                          {!!topEmoji && <Text style={styles.reactionEmoji}>{topEmoji}</Text>}
                          <Text style={styles.reactionStar}>⭐</Text>
                          <Text style={styles.reactionCount}>{totalReactions}</Text>
                        </>
                      ) : (
                        <Text style={styles.reactionStar}>⭐</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setShowShareModal(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Share post"
                      style={styles.actionItem}
                    >
                      <Feather name="send" size={24} color={appColors.icon} />
                      {shareCount > 0 ? <Text style={styles.actionCount}>{shareCount}</Text> : null}
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </View>

            {!!captionText?.trim() && (
              <View style={styles.captionWrap}>
                <Text style={[styles.caption, { color: appColors.text }]} numberOfLines={isCaptionExpanded ? undefined : 2}>
                  {captionText}
                </Text>
                {shouldShowMore && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setIsCaptionExpanded(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Expand caption"
                  >
                    <Text style={styles.captionMore}>...more</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Hashtags */}
            {Array.isArray(post?.hashtags) && post.hashtags.length > 0 && (
              <View style={styles.hashtags}>
                {post.hashtags.map((tag: any, idx: number) => (
                  (() => {
                    const tagString = String(tag || '').replace(/^#/, '');
                    return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      router.push(`/hashtag-detail?tag=${tagString}` as any);
                    }}
                    style={styles.hashtag}
                  >
                    <Text style={styles.hashtagText}>{tagString}</Text>
                  </TouchableOpacity>
                    );
                  })()
                ))}
              </View>
            )}

            <View style={styles.commentCtaRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  if (onCommentPress) {
                    onCommentPress(effectivePostId, resolvedCurrentUserAvatar);
                  } else {
                    setShowCommentsModal(true);
                  }
                }}
                style={{ width: '100%' }}
              >
                <View style={styles.commentCtaBox}>
                  <Text style={styles.commentCtaText}>Write a comment</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Comments + Reactions Modal (tabbed) */}
      <Modal
        visible={showCommentsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCommentsModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            {/* backdrop tap to close */}
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setShowCommentsModal(false)}
            />

            <Animated.View style={[pcStyles.sheet, { transform: [{ translateY: modalTranslateY }] }]} {...panResponder.panHandlers}>
              {/* drag handle */}
              <View style={pcStyles.handle}>
                <View style={pcStyles.handleBar} />
              </View>

              {/* header: back arrow + tabs */}
              <View style={pcStyles.headerRow}>
                <TouchableOpacity onPress={() => setShowCommentsModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Feather name="chevron-down" size={24} color="#333" />
                </TouchableOpacity>
                <View style={[pcStyles.tabs, { paddingRight: 24 }]}>
                  <TouchableOpacity
                    style={[pcStyles.tab, modalTab === 'comments' && pcStyles.tabActive]}
                    onPress={() => setModalTab('comments')}
                  >
                    <Text style={[pcStyles.tabText, modalTab === 'comments' && pcStyles.tabTextActive]}>Comment {commentCount > 0 ? commentCount : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[pcStyles.tab, modalTab === 'reactions' && pcStyles.tabActive]}
                    onPress={() => setModalTab('reactions')}
                  >
                    <Text style={[pcStyles.tabText, modalTab === 'reactions' && pcStyles.tabTextActive]}>Reactions {reactions.length > 0 ? reactions.length : ''}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── COMMENTS TAB ── */}
              {modalTab === 'comments' && (
                <View style={{ flex: 1 }}>
                  <CommentSection
                    postId={post.id}
                    postOwnerId={post.userId}
                    currentAvatar={resolvedCurrentUserAvatar || DEFAULT_AVATAR_URL}
                    currentUser={currentUser}
                    maxHeight={undefined}
                    showInput={true}
                    highlightedCommentId={highlightedCommentId}
                  />
                </View>
              )}

              {/* ── REACTIONS TAB ── */}
              {modalTab === 'reactions' && (() => {
                const totalReactions = reactions.length;
                // Build emoji filter counts
                const emojiCounts: Record<string, number> = {};
                reactions.forEach((r: any) => { const e = r?.emoji || r?.type || ''; if (e) emojiCounts[e] = (emojiCounts[e] || 0) + 1; });
                const filterEmojis = Object.entries(emojiCounts).sort((a, b) => b[1] - a[1]);
                const filtered = reactionsFilter === 'all' ? reactions : reactions.filter((r: any) => (r?.emoji || r?.type) === reactionsFilter);
                return (
                  <View style={{ flex: 1 }}>
                    {/* filter chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[pcStyles.filterRow, { borderBottomWidth: 0 }]} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
                      <TouchableOpacity
                        style={[pcStyles.filterChip, reactionsFilter === 'all' && pcStyles.filterChipActive]}
                        onPress={() => setReactionsFilter('all')}
                      >
                        <Text style={[pcStyles.filterChipText, reactionsFilter === 'all' && pcStyles.filterChipTextActive]}>All {totalReactions}</Text>
                      </TouchableOpacity>
                      {filterEmojis.map(([emoji, count]) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[pcStyles.filterChip, reactionsFilter === emoji && pcStyles.filterChipActive]}
                          onPress={() => setReactionsFilter(emoji)}
                        >
                          <Text style={pcStyles.filterChipEmoji}>{emoji}</Text>
                          <Text style={[pcStyles.filterChipText, reactionsFilter === emoji && pcStyles.filterChipTextActive]}> {count}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* reactions list */}
                    {totalReactions === 0 ? (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
                        <Text style={{ fontSize: 40, marginBottom: 10 }}>⭐</Text>
                        <Text style={{ color: '#888', fontSize: 15, fontWeight: '600' }}>No reactions yet</Text>
                        <Text style={{ color: '#bbb', fontSize: 13, marginTop: 4 }}>Be the first to react!</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={filtered}
                        keyExtractor={(item: any, idx) => item?.userId || String(idx)}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 }}
                        renderItem={({ item }: { item: any }) => (
                          <View style={pcStyles.reactionUserRow}>
                            <View style={pcStyles.reactionAvatarWrap}>
                              <ExpoImage
                                source={{ uri: item?.userAvatar || DEFAULT_AVATAR_URL }}
                                style={pcStyles.reactionAvatar}
                                contentFit="cover"
                              />
                              <Text style={pcStyles.reactionSmallEmoji}>{item?.emoji || item?.type || '⭐'}</Text>
                            </View>
                            <Text style={pcStyles.reactionUserName}>{item?.userName || 'User'}</Text>
                          </View>
                        )}
                      />
                    )}

                    {/* Instagram-style emoji bar at bottom */}
                    <View style={[pcStyles.emojiBarContainer, { marginBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 12) : Math.max(insets.bottom, 12) }]}>
                      {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮'].map((emoji) => (
                        <TouchableOpacity key={emoji} style={pcStyles.emojiBarBtn} onPress={() => { handleReactToPost(emoji); }}>
                          <Text style={pcStyles.emojiBarText}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={pcStyles.emojiBarBtn} onPress={() => setShowEmojiPicker(true)}>
                        <View style={pcStyles.addEmojiBtn}>
                          <Feather name="plus" size={18} color="#000" />
                        </View>
                      </TouchableOpacity>
                    </View>
                    <EmojiPicker
                      open={showEmojiPicker}
                      onClose={() => setShowEmojiPicker(false)}
                      onEmojiSelected={(emojiObject: any) => {
                        const selectedEmoji = emojiObject?.emoji;
                        if (selectedEmoji) {
                          handleReactToPost(selectedEmoji);
                        }
                        setShowEmojiPicker(false);
                      }}
                      enableRecentlyUsed
                      categoryPosition="bottom"
                    />
                  </View>
                );
              })()}
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showMediaModal}
        animationType="none"
        transparent={true}
        presentationStyle="overFullScreen"
        hardwareAccelerated={true}
        statusBarTranslucent={true}
        onRequestClose={closeMediaModal}
      >
        <View style={styles.mediaModalBackdrop}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={closeMediaModal}
          />

          {showImages && images.length > 0 ? (
            <View style={styles.mediaModalMedia} {...modalPanResponder.panHandlers}>
              {images.length === 1 ? (
                <ExpoImage
                  source={{ uri: getOptimizedImageUrl(images[0] || currentMediaUrl || 'https://via.placeholder.com/600x600.png?text=No+Image', 'detail') }}
                  recyclingKey={String(images[0] || 'single')}
                  style={styles.mediaModalMedia}
                  contentFit="contain"
                  placeholder={IMAGE_PLACEHOLDER}
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={0}
                />
              ) : (
                <FlatList
                  ref={mediaModalListRef}
                  data={images}
                  keyExtractor={(uri, idx) => `mm_${String(uri || '')}_${idx}`}
                  horizontal
                  pagingEnabled
                  decelerationRate="fast"
                  snapToInterval={SCREEN_WIDTH}
                  snapToAlignment="start"
                  showsHorizontalScrollIndicator={false}
                  initialScrollIndex={Math.max(0, Math.min(images.length - 1, modalMediaIndex))}
                  getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                  removeClippedSubviews
                  onScrollToIndexFailed={(info) => {
                    try {
                      mediaModalListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
                    } catch { }
                    setTimeout(() => {
                      try {
                        mediaModalListRef.current?.scrollToIndex({ index: info.index, animated: false });
                      } catch { }
                    }, 80);
                  }}
                  onMomentumScrollEnd={(e: any) => {
                    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
                    const idx = Math.max(0, Math.min(images.length - 1, Math.round(x / SCREEN_WIDTH)));
                    if (idx !== modalMediaIndexRef.current) {
                      modalMediaIndexRef.current = idx;
                      setModalMediaIndex(idx);
                    }
                  }}
                  renderItem={({ item }) => (
                    <View style={{ width: SCREEN_WIDTH, height: '100%' }}>
                      <ExpoImage
                        source={{ uri: getOptimizedImageUrl(item || 'https://via.placeholder.com/600x600.png?text=No+Image', 'detail') }}
                        recyclingKey={String(item || '')}
                        style={styles.mediaModalMedia}
                        contentFit="contain"
                        placeholder={IMAGE_PLACEHOLDER}
                        cachePolicy="memory-disk"
                        priority="high"
                        transition={0}
                      />
                    </View>
                  )}
                />
              )}
            </View>
          ) : currentMediaUrl ? (
            isCurrentMediaVideo ? (
              <Video
                source={{ uri: currentMediaUrl }}
                style={styles.mediaModalMedia}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={true}
                useNativeControls={true}
                isLooping={true}
              />
            ) : (
              <ExpoImage
                source={{ uri: getOptimizedImageUrl(currentMediaUrl, 'detail') }}
                style={styles.mediaModalMedia}
                contentFit="contain"
                placeholder={IMAGE_PLACEHOLDER}
                transition={0}
              />
            )
          ) : null}

          {showImages && images.length > 1 && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: 52,
                right: 12,
                zIndex: 999,
                elevation: 40,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 }}>
                {modalMediaIndex + 1}/{images.length}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.mediaModalClose}
            onPress={closeMediaModal}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Close media"
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Post Options Modal (Bottom Sheet Style) */}
      <Modal visible={showOptionsModal} transparent animationType="slide" onRequestClose={() => setShowOptionsModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowOptionsModal(false)}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', paddingBottom: 30, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#dbdbdb', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20 }} />
            {(() => {
              const uniq = (values: any[]) => {
                const out: string[] = [];
                const seen = new Set<string>();
                for (const v of values) {
                  const s = typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : '');
                  if (!s || seen.has(s)) continue;
                  seen.add(s);
                  out.push(s);
                }
                return out;
              };

              const postUserObj = (post?.userId && typeof post.userId === 'object') ? post.userId : null;
              const viewerIds = uniq([
                userIdForLike,
                cachedFirebaseUid,
                cachedUserId,
                cachedUid,
                (user as any)?.uid,
                (user as any)?.firebaseUid,
                (user as any)?._id,
                (user as any)?.id,
                (currentUser as any)?.uid,
                (currentUser as any)?.firebaseUid,
                (currentUser as any)?._id,
                (currentUser as any)?.id,
              ]);

              const ownerIds = uniq([
                typeof post?.userId === 'string' ? post.userId : null,
                postUserObj?._id,
                postUserObj?.id,
                postUserObj?.uid,
                postUserObj?.firebaseUid,
                (post as any)?.uid,
                (post as any)?.userUid,
                (post as any)?.firebaseUid,
              ]);

              const viewerSet = new Set(viewerIds);
              const isOwner = ownerIds.some((id) => viewerSet.has(id));
              return (
                <View>
                  {isOwner && (
                    <TouchableOpacity
                      style={{ paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef', flexDirection: 'row', alignItems: 'center' }}
                      onPress={handleEditPost}
                    >
                      <Feather name="edit-3" size={20} color="#262626" style={{ marginRight: 15 }} />
                      <Text style={{ color: '#262626', fontSize: 16, fontWeight: '600' }}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {isOwner && (
                    <TouchableOpacity
                      style={{ paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef', flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => setShowDeleteConfirm(true)}
                    >
                      <Feather name="trash-2" size={20} color="#ed4956" style={{ marginRight: 15 }} />
                      <Text style={{ color: '#ed4956', fontSize: 16, fontWeight: '600' }}>Delete</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#efefef', flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => { setShowOptionsModal(false); sharePost(post); }}
                  >
                    <Feather name="share" size={20} color="#262626" style={{ marginRight: 15 }} />
                    <Text style={{ color: '#262626', fontSize: 16 }}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}
                    onPress={() => setShowOptionsModal(false)}
                  >
                    <Text style={{ color: '#0095f6', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Confirmation Modal (Centered Premium Dialog) */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 54 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', overflow: 'hidden', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24, elevation: 20 }}>
            <View style={{ paddingVertical: 24, paddingHorizontal: 30, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#262626', marginBottom: 8, textAlign: 'center' }}>Delete post?</Text>
              <Text style={{ fontSize: 14, color: '#8e8e8e', textAlign: 'center', lineHeight: 18 }}>Are you sure you want to delete this post? This action cannot be undone.</Text>
            </View>

            <View style={{ width: '100%' }}>
              <TouchableOpacity
                style={{ width: '100%', paddingVertical: 15, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbdbdb' }}
                onPress={handleDeletePost}
              >
                <Text style={{ color: '#ed4956', fontSize: 16, fontWeight: '700' }}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ width: '100%', paddingVertical: 15, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbdbdb' }}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={{ color: '#262626', fontSize: 16, fontWeight: '400' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ShareModal
        visible={showShareModal}
        currentUserId={userIdForLike}
        modalVariant="home"
        sharePayload={{
          shareType: 'post',
          data: {
            id: effectivePostId,
            imageUrl: post.imageUrl || (post.images?.[1]),
            text: post.text || post.caption || '',
            caption: post.caption || post.text || '',
            userName: post.userName || post.username || post.user?.username || 'User',
            userAvatar: post.userAvatar || post.user?.avatar || '',
            userThumbnailUrl: post.userThumbnailUrl || post.user?.avatar || '',
            mediaUrls: Array.isArray(post?.mediaUrls) ? post.mediaUrls : (Array.isArray(post?.images) ? post.images : []),
            mediaCount: Array.isArray(post?.mediaUrls) ? post.mediaUrls.length : (Array.isArray(post?.images) ? post.images.length : 0),
          }
        }}
        onAddToStory={() => {
          const mediaCandidate =
            post?.videoUrl ||
            post?.mediaUrl ||
            post?.imageUrl ||
            (Array.isArray(post?.images) ? post.images[0] : '') ||
            (Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : '');

          const mediaUri = String(mediaCandidate || '').trim();
          if (!mediaUri) return;

          const lower = mediaUri.toLowerCase();
          const mediaType = /\.(mp4|mov|webm)(\?|$)/i.test(lower) || lower.includes('video') ? 'video' : 'photo';
          router.push({
            pathname: '/story-upload',
            params: {
              storyMediaUri: mediaUri,
              storyMediaType: mediaType,
              storyTextOverlays: '',
              isPostShare: 'true',
              postData: JSON.stringify({
                postId: effectivePostId,
                userName: currentUserName,
                userAvatar: currentAvatar,
                caption: post.caption || post.text || '',
                imageUrl: mediaUri,
              })
            },
          } as any);
        }}
        onClose={() => setShowShareModal(false)}
        onSend={async (userIds) => {
          if (!userIdForLike || userIds.length === 0) return;
          setShowShareModal(false);
          const { sendPostMessage } = await import('../../lib/firebaseHelpers/messages');
          const { getOrCreateConversation } = await import('../../lib/firebaseHelpers/conversation');
          let successCount = 0;
          
          const richPost = {
            id: effectivePostId,
            imageUrl: post.imageUrl || (post.images?.[1]),
            text: post.text || post.caption || '',
            userName: post.userName || post.username || post.user?.username || 'User',
            userAvatar: post.userAvatar || post.user?.avatar || '',
            userThumbnailUrl: post.userThumbnailUrl || post.user?.avatar || ''
          };

          for (const targetUid of userIds) {
            try {
              const convRes = await getOrCreateConversation(userIdForLike, targetUid);
              if (convRes?.success && convRes.conversationId) {
                 const res = await sendPostMessage(convRes.conversationId, userIdForLike, richPost, { recipientId: targetUid });
                 if (res?.success) successCount += 1;
              }
            } catch (err) {
               console.error('Failed to share post to user:', targetUid, err);
            }
          }
          if (successCount > 0) {
            showSuccess(`Post shared to ${successCount} user${successCount > 1 ? 's' : ''}`);
          } else {
            Alert.alert('Failed', 'Post share failed. Please try again.');
          }
        }}
        title="Share Post"
      />
    </View>
  );
}

function getTimeAgo(date: any) {
  if (!date) return "";
  let d;
  if (date && date.toDate) {
    d = date.toDate();
  } else if (typeof date === 'string' || typeof date === 'number') {
    d = new Date(date);
  } else {
    d = date;
  }
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

// ── PostCard modal-specific styles ──
const pcStyles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  handle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  tabActive: {
    backgroundColor: '#0A3D62',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  tabTextActive: {
    color: '#fff',
  },
  filterRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    maxHeight: 56,
    paddingVertical: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: '#0A3D62',
  },
  filterChipEmoji: {
    fontSize: 16,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  reactionUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  reactionAvatarWrap: {
    position: 'relative',
    width: 46,
    height: 46,
  },
  reactionAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#eee',
  },
  reactionSmallEmoji: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    fontSize: 16,
    lineHeight: 20,
  },
  reactionUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  emojiBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  emojiBarBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
  },
  emojiBarText: {
    fontSize: 24,
  },
  addEmojiBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(PostCard, (prevProps, nextProps) => {
  // Enhanced memoization comparison
  return (
    prevProps.post?.id === nextProps.post?.id &&
    prevProps.post?._id === nextProps.post?._id &&
    prevProps.post?.likesCount === nextProps.post?.likesCount &&
    prevProps.post?.commentCount === nextProps.post?.commentCount &&
    prevProps.post?.commentsCount === nextProps.post?.commentsCount &&
    prevProps.post?.reactions?.length === nextProps.post?.reactions?.length &&
    prevProps.post?.savedBy?.length === nextProps.post?.savedBy?.length &&
    prevProps.currentUser?.uid === nextProps.currentUser?.uid &&
    prevProps.currentUser?.id === nextProps.currentUser?.id &&
    prevProps.mirror === nextProps.mirror
  );
});

