import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Feather, Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addComment,
  addCommentReaction,
  addCommentReply,
  deleteComment,
  deleteCommentReply,
  editComment,
  editCommentReply,
  getPostComments,
} from "../../lib/firebaseHelpers/comments";
import { feedEventEmitter } from "../../lib/feedEventEmitter";
import CommentAvatar from "./CommentAvatar";
import { useUser } from "./UserContext";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export type Comment = {
  id: string;
  text: string;
  userAvatar: string;
  userName: string;
  userId: string;
  createdAt?: any;
  editedAt?: any;
  replies?: Comment[];
  reactions?: { [userId: string]: string };
};

export interface CommentSectionProps {
  postId: string;
  postOwnerId: string;
  currentAvatar: string;
  currentUser?: any;
  maxHeight?: number;
  showInput?: boolean;
  highlightedCommentId?: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  postOwnerId,
  currentAvatar,
  currentUser: userProp,
  maxHeight = 400,
  showInput = true,
  highlightedCommentId,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string; text: string } | null>(null);
  const [replyText, setReplyText] = useState("");

  const insets = useSafeAreaInsets();

  // Update state whenever the external prop changes
  const [editingComment, setEditingComment] = useState<{
    id: string;
    text: string;
    isReply: boolean;
    parentId?: string;
  } | null>(null);

  const listRef = useRef<FlatList<Comment>>(null);
  const inputRef = useRef<TextInput>(null);
  const newCommentRef = useRef("");
  const replyTextRef = useRef("");
  const submitGuardRef = useRef(false);
  const pendingSubmitTextRef = useRef('');
  const submitRetryTimerRef = useRef<any>(null);
  const submitRequestedRef = useRef(false);
  const userFromContext = useUser();
  const currentUser = userProp || userFromContext;
  
  const [inputAvatarFailed, setInputAvatarFailed] = useState(false);
  const [currentUserIdCandidates, setCurrentUserIdCandidates] = useState<string[]>([]);
  const [resolvedCurrentAvatar, setResolvedCurrentAvatar] = useState<string>(
    currentAvatar && currentAvatar.trim() ? currentAvatar.trim() : DEFAULT_AVATAR_URL
  );

  const normalizeAvatar = (value: any): string => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const lower = trimmed.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === 'na') return '';
    return trimmed;
  };

  const isGenericDefaultAvatar = (value: string): boolean => {
    const v = String(value || '').toLowerCase();
    if (!v) return true;
    return (
      v.includes('via.placeholder.com/200x200.png?text=profile') ||
      v.includes('/default%2fdefault-pic.jpg') ||
      v.includes('/default/default-pic.jpg')
    );
  };

  const listMaxHeightStyle = typeof maxHeight === "number" ? { maxHeight } : null;

  useEffect(() => {
    let cancelled = false;

    const resolveAvatar = async () => {
      const fromProp = normalizeAvatar(currentAvatar);
      const fromUserObj = currentUser && typeof currentUser === 'object'
        ? normalizeAvatar(
          currentUser.avatar ||
          currentUser.photoURL ||
          currentUser.profilePicture ||
          currentUser.userAvatar ||
          ''
        )
        : '';

      const fromCacheRaw = await AsyncStorage.getItem('userAvatar');
      const fromCache = normalizeAvatar(fromCacheRaw);

      const localChoice = fromProp || fromUserObj || fromCache;
      // If we already have a non-default avatar locally, use it immediately.
      if (localChoice && !isGenericDefaultAvatar(localChoice)) {
        if (!cancelled) setResolvedCurrentAvatar(localChoice);
        return;
      }

      const currentUserId = typeof currentUser === 'string'
        ? currentUser
        : String(
          currentUser?.uid ||
          currentUser?.id ||
          currentUser?.userId ||
          currentUser?.firebaseUid ||
          currentUser?._id ||
          ''
        );

      const storageUserId = await AsyncStorage.getItem('userId');
      const storageFirebaseUid = await AsyncStorage.getItem('firebaseUid');
      const storageUid = await AsyncStorage.getItem('uid');
      const candidates = Array.from(new Set([
        currentUserId,
        storageUserId || '',
        storageFirebaseUid || '',
        storageUid || ''
      ].filter(Boolean)));

      for (const candidateId of candidates) {
        try {
          const { getUserProfile } = await import('../../lib/firebaseHelpers/user');
          const profileRes: any = await getUserProfile(candidateId);
          if (profileRes?.success && profileRes?.data) {
            const fetched = normalizeAvatar(
              profileRes.data.avatar || profileRes.data.photoURL || profileRes.data.profilePicture
            );
            if (fetched && !isGenericDefaultAvatar(fetched)) {
              if (!cancelled) setResolvedCurrentAvatar(fetched);
              await AsyncStorage.setItem('userAvatar', fetched);
              return;
            }
          }
        } catch {
          // best-effort only
        }
      }

      if (!cancelled) {
        setResolvedCurrentAvatar(localChoice || DEFAULT_AVATAR_URL);
      }
    };

    resolveAvatar();
    return () => {
      cancelled = true;
    };
  }, [currentAvatar, currentUser]);

  useEffect(() => {
    setInputAvatarFailed(false);
  }, [resolvedCurrentAvatar]);

  useEffect(() => {
    if (!Array.isArray(comments) || comments.length === 0) return;
    if (!resolvedCurrentAvatar || isGenericDefaultAvatar(resolvedCurrentAvatar)) return;
    if (!Array.isArray(currentUserIdCandidates) || currentUserIdCandidates.length === 0) return;

    const patchCommentAvatar = (comment: Comment): Comment => {
      const isOwn = currentUserIdCandidates.includes(String(comment.userId || ''));
      const nextReplies = Array.isArray(comment.replies)
        ? comment.replies.map((r) => patchCommentAvatar(r as Comment))
        : comment.replies;
      return {
        ...comment,
        userAvatar: isOwn ? resolvedCurrentAvatar : comment.userAvatar,
        replies: nextReplies,
      };
    };

    setComments((prev) => prev.map((c) => patchCommentAvatar(c)));
  }, [currentUserIdCandidates, resolvedCurrentAvatar]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      const pending = String(pendingSubmitTextRef.current || '').trim();
      if (!pending || isSubmitting) return;
      const ok = runSubmit(pending);
      if (ok) pendingSubmitTextRef.current = '';
    });

    return () => {
      sub.remove();
      if (submitRetryTimerRef.current) {
        clearTimeout(submitRetryTimerRef.current);
        submitRetryTimerRef.current = null;
      }
    };
  }, [isSubmitting, replyTo, replyText, newComment]);

  useEffect(() => {
    if (!showInput) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [showInput, postId]);

  useEffect(() => {
    let cancelled = false;
    const loadUserIds = async () => {
      const fromUserObj = typeof currentUser === 'string'
        ? [currentUser]
        : [
          currentUser?.id,
          currentUser?.userId,
          currentUser?.uid,
          currentUser?.firebaseUid,
          currentUser?._id,
        ];
      const storageUserId = await AsyncStorage.getItem('userId');
      const storageUid = await AsyncStorage.getItem('uid');
      const storageFirebaseUid = await AsyncStorage.getItem('firebaseUid');

      const ids = Array.from(new Set([
        storageUserId || '',
        storageUid || '',
        storageFirebaseUid || '',
        ...fromUserObj,
      ].map((x) => String(x || '').trim()).filter(Boolean)));

      if (!cancelled) setCurrentUserIdCandidates(ids);
    };

    loadUserIds();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // ─── Load comments ───
  useEffect(() => { loadComments(); }, [postId]);

  const normalizeId = (val: any): string => {
    if (typeof val === "string") return val;
    if (val && typeof val === "object")
      return String(val._id || val.id || val.uid || val.userId || val.firebaseUid || "");
    return String(val || "");
  };

  const loadComments = async () => {
    try {
      setLoading(true);
      const res = await getPostComments(postId);
      // getPostComments returns { success, data } or array directly
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      const mapComment = (c: any): Comment => ({
        id: normalizeId(c._id || c.id),
        text: c.text || "",
        userAvatar: (() => {
          const incomingAvatar = typeof c.userAvatar === 'string' ? c.userAvatar : '';
          const commentUserId = normalizeId(c.userId);
          const isOwn = currentUserIdCandidates.includes(commentUserId);
          if (isOwn && !isGenericDefaultAvatar(resolvedCurrentAvatar)) {
            return resolvedCurrentAvatar;
          }
          return incomingAvatar;
        })(),
        userName: c.userName || "User",
        userId: normalizeId(c.userId),
        createdAt: c.createdAt,
        editedAt: c.editedAt,
        replies: Array.isArray(c.replies) ? c.replies.map(mapComment) : [],
        reactions: c.reactions || {},
      });
      setComments(Array.isArray(raw) ? raw.map(mapComment) : []);
    } catch (e) {
      console.error("[CommentSection] loadComments error:", e);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Current user helpers ───
  const getCurrentUserId = (): string => {
    if (currentUserIdCandidates.length > 0) return currentUserIdCandidates[0];
    if (typeof currentUser === "string") return currentUser;
    return currentUser?.id || currentUser?.userId || currentUser?.uid || currentUser?.firebaseUid || currentUser?._id || "";
  };

  const ensureCurrentUserId = async (): Promise<string> => {
    const direct = getCurrentUserId();
    if (direct) return direct;

    const [userId, uid, firebaseUid] = await Promise.all([
      AsyncStorage.getItem('userId'),
      AsyncStorage.getItem('uid'),
      AsyncStorage.getItem('firebaseUid'),
    ]);

    const ids = Array.from(new Set([
      userId || '',
      uid || '',
      firebaseUid || '',
    ].map((x) => String(x || '').trim()).filter(Boolean)));

    if (ids.length > 0) {
      setCurrentUserIdCandidates((prev) => {
        const merged = Array.from(new Set([...(prev || []), ...ids]));
        return merged;
      });
      return ids[0];
    }

    // Last-resort: derive id from auth token payload when AsyncStorage aliases are not set yet.
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const decodeBase64 = (input: string) => {
            if (typeof (global as any).atob === 'function') return (global as any).atob(input);
            if (typeof Buffer !== 'undefined') return Buffer.from(input, 'base64').toString('utf8');
            throw new Error('No base64 decoder available');
          };
          const payload = JSON.parse(decodeBase64(b64));
          const tokenUserId = String(payload?.userId || payload?.id || payload?.sub || '').trim();
          if (tokenUserId) {
            setCurrentUserIdCandidates((prev) => {
              const merged = Array.from(new Set([...(prev || []), tokenUserId]));
              return merged;
            });
            return tokenUserId;
          }
        }
      }
    } catch {
      // no-op
    }

    return '';
  };

  const isSameUser = (a: any, b: any): boolean => {
    const aa = String(a || '').trim();
    const bb = String(b || '').trim();
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return currentUserIdCandidates.includes(aa) && currentUserIdCandidates.includes(bb);
  };

  const getCurrentUserName = (): string => {
    if (typeof currentUser === "object")
      return currentUser?.displayName || currentUser?.name || currentUser?.userName || "User";
    return "User";
  };

  const resolveAvatarForSubmit = async (uid: string): Promise<string> => {
    const fromProp = normalizeAvatar(currentAvatar);
    const fromResolved = normalizeAvatar(resolvedCurrentAvatar);
    const fromUserObj = currentUser && typeof currentUser === 'object'
      ? normalizeAvatar(
        currentUser.avatar ||
        currentUser.photoURL ||
        currentUser.profilePicture ||
        currentUser.userAvatar ||
        ''
      )
      : '';
    const fromCache = normalizeAvatar(await AsyncStorage.getItem('userAvatar'));

    const localNonDefault = [fromResolved, fromUserObj, fromCache, fromProp].find(
      (a) => a && !isGenericDefaultAvatar(a)
    );
    if (localNonDefault) return localNonDefault;

    const storageUserId = await AsyncStorage.getItem('userId');
    const storageFirebaseUid = await AsyncStorage.getItem('firebaseUid');
    const storageUid = await AsyncStorage.getItem('uid');
    const candidates = Array.from(new Set([
      uid,
      storageUserId || '',
      storageFirebaseUid || '',
      storageUid || ''
    ].filter(Boolean)));

    for (const candidateId of candidates) {
      try {
        const { getUserProfile } = await import('../../lib/firebaseHelpers/user');
        const profileRes: any = await getUserProfile(candidateId);
        if (profileRes?.success && profileRes?.data) {
          const fetched = normalizeAvatar(
            profileRes.data.avatar || profileRes.data.photoURL || profileRes.data.profilePicture
          );
          if (fetched && !isGenericDefaultAvatar(fetched)) {
            await AsyncStorage.setItem('userAvatar', fetched);
            setResolvedCurrentAvatar(fetched);
            return fetched;
          }
        }
      } catch {
        // best-effort only
      }
    }

    return localNonDefault || fromResolved || fromUserObj || fromCache || fromProp || DEFAULT_AVATAR_URL;
  };

  // ─── Add comment ───
  // API: addComment(postId, userId, userName, userAvatar, text)
  const handleAddComment = async (overrideText?: string) => {
    const text = (overrideText ?? newComment ?? newCommentRef.current ?? '').trim();
    if (!text || isSubmitting) return;
    const uid = await ensureCurrentUserId();
    if (!uid) return;

    Keyboard.dismiss();

    setIsSubmitting(true);
    const avatarForSubmit = await resolveAvatarForSubmit(uid);
    const tempId = `temp_${Date.now()}`;
    const tempComment: Comment = {
      id: tempId,
      text,
      userAvatar: avatarForSubmit,
      userName: getCurrentUserName(),
      userId: uid,
      createdAt: new Date(),
      replies: [],
      reactions: {},
    };
    setComments((prev) => [tempComment, ...prev]);
    setNewComment("");
    newCommentRef.current = "";

    try {
      const res = await addComment(postId, uid, getCurrentUserName(), avatarForSubmit, text);
      if (res?.data?._id || res?.data?.id) {
        const realId = normalizeId(res.data._id || res.data.id);
        const returnedAvatar = normalizeAvatar(res?.data?.userAvatar || '');
        setComments((prev) => prev.map((c) => (
          c.id === tempId
            ? { ...c, id: realId, userAvatar: returnedAvatar || avatarForSubmit }
            : c
        )));
      }
      const nextCount = Number(res?.commentCount ?? res?.commentsCount);
      if (Number.isFinite(nextCount)) {
        feedEventEmitter.emitPostUpdated(postId, { commentCount: nextCount, commentsCount: nextCount });
      } else {
        feedEventEmitter.emitPostUpdated(postId, { commentAdded: true });
      }
      await loadComments();
      feedEventEmitter.emit("commentAdded", { postId });
    } catch (e) {
      console.error("[CommentSection] addComment error:", e);
      setComments((prev) => prev.filter((c) => c.id !== tempId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Add reply ───
  // API: addCommentReply(postId, parentCommentId, replyObj)
  const handleAddReply = async (overrideText?: string) => {
    if (!replyTo) return;
    const text = (overrideText ?? replyText ?? replyTextRef.current ?? '').trim();
    if (!text || isSubmitting) return;
    const uid = await ensureCurrentUserId();
    if (!uid) return;

    Keyboard.dismiss();

    setIsSubmitting(true);
    const avatarForSubmit = await resolveAvatarForSubmit(uid);
    const tempReply: Comment = {
      id: `temp_reply_${Date.now()}`,
      text,
      userAvatar: avatarForSubmit,
      userName: getCurrentUserName(),
      userId: uid,
      createdAt: new Date(),
    };
    const parentId = replyTo.id;
    setComments((prev) =>
      prev.map((c) => (c.id === parentId ? { ...c, replies: [...(c.replies || []), tempReply] } : c))
    );
    setReplyTo(null);
    setReplyText("");
    replyTextRef.current = "";

    try {
      await addCommentReply(postId, parentId, {
        userId: uid,
        userName: getCurrentUserName(),
        userAvatar: avatarForSubmit,
        text,
      });
    } catch (e) {
      console.error("[CommentSection] addReply error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Edit comment ───
  // API: editComment(postId, commentId, userId, newText)
  // API: editCommentReply(postId, commentId, replyId, userId, newText)
  const handleEditComment = async () => {
    if (!editingComment) return;
    const text = editingComment.text.trim();
    if (!text) return;
    const uid = getCurrentUserId();

    try {
      if (editingComment.isReply && editingComment.parentId) {
        const res: any = await editCommentReply(postId, editingComment.parentId, editingComment.id, uid, text);
        if (res?.success === false) {
          throw new Error(res?.error || 'Failed to edit reply');
        }
        setComments((prev) =>
          prev.map((c) =>
            c.id === editingComment.parentId
              ? {
                ...c,
                replies: (c.replies || []).map((r) =>
                  r.id === editingComment.id ? { ...r, text, editedAt: new Date() } : r
                ),
              }
              : c
          )
        );
      } else {
        const res: any = await editComment(postId, editingComment.id, uid, text);
        if (res?.success === false) {
          throw new Error(res?.error || 'Failed to edit comment');
        }
        setComments((prev) =>
          prev.map((c) => (c.id === editingComment.id ? { ...c, text, editedAt: new Date() } : c))
        );
      }
      await loadComments();
    } catch (e) {
      console.error("[CommentSection] editComment error:", e);
      Alert.alert('Edit failed', (e as any)?.message || 'Unable to edit comment');
    } finally {
      setEditingComment(null);
    }
  };

  // ─── Delete comment ───
  // API: deleteComment(postId, commentId, userId, postOwnerId)
  // API: deleteCommentReply(postId, commentId, replyId, userId, postOwnerId)
  const handleDeleteComment = (commentId: string, isReply: boolean, parentId?: string) => {
    Alert.alert("Delete Comment", "Delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const uid = getCurrentUserId();
            if (isReply && parentId) {
              const res: any = await deleteCommentReply(postId, parentId, commentId, uid, postOwnerId);
              if (res?.success === false) {
                throw new Error(res?.error || 'Failed to delete reply');
              }
              setComments((prev) =>
                prev.map((c) =>
                  c.id === parentId
                    ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
                    : c
                )
              );
            } else {
              const res: any = await deleteComment(postId, commentId, uid, postOwnerId);
              if (res?.success === false) {
                throw new Error(res?.error || 'Failed to delete comment');
              }
              setComments((prev) => prev.filter((c) => c.id !== commentId));
              const nextCount = Number(res?.commentCount ?? res?.commentsCount);
              if (Number.isFinite(nextCount)) {
                feedEventEmitter.emitPostUpdated(postId, { commentCount: nextCount, commentsCount: nextCount });
              } else {
                feedEventEmitter.emitPostUpdated(postId, { commentDeleted: true });
              }
              feedEventEmitter.emit("commentDeleted", { postId });
            }
            await loadComments();
          } catch (e) {
            console.error("[CommentSection] deleteComment error:", e);
            Alert.alert('Delete failed', (e as any)?.message || 'Unable to delete comment');
          }
        },
      },
    ]);
  };

  // ─── Heart reaction ───
  const handleHeart = async (commentId: string) => {
    const uid = getCurrentUserId();
    if (!uid) return;
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const reactions = { ...(c.reactions || {}) };
        if (reactions[uid]) {
          delete reactions[uid];
        } else {
          reactions[uid] = "heart";
        }
        return { ...c, reactions };
      })
    );
    try {
      await addCommentReaction(postId, commentId, uid, "heart");
    } catch (e) {
      console.error("[CommentSection] handleHeart error:", e);
    }
  };

  // ─── Time ago ───
  const getTimeAgo = (timestamp: any): string => {
    if (!timestamp) return "";
    const time = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - time.getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (d < 7) return `${d}d`;
    return `${Math.floor(d / 7)}w`;
  };

  const runSubmit = (overrideText?: string): boolean => {
    const text = replyTo
      ? (overrideText ?? replyText ?? replyTextRef.current ?? '')
      : (overrideText ?? newComment ?? newCommentRef.current ?? '');
    if (!text?.trim() || isSubmitting) return false;

    if (submitGuardRef.current) return false;
    submitGuardRef.current = true;
    setTimeout(() => {
      submitGuardRef.current = false;
    }, 800);

    // Submit immediately on tap.
    if (replyTo) handleAddReply(text);
    else handleAddComment(text);

    return true;
  };

  const handleSubmitCommentPress = () => {
    submitRequestedRef.current = true;
    const snapshotText = String(
      replyTo
        ? (replyText || replyTextRef.current || '')
        : (newComment || newCommentRef.current || '')
    );

    pendingSubmitTextRef.current = snapshotText;
    const submitted = runSubmit(snapshotText);
    if (submitted) {
      pendingSubmitTextRef.current = '';
      submitRequestedRef.current = false;
      return;
    }

    // One short retry for edge cases where focus handoff drops first tap.
    if (snapshotText.trim()) {
      if (submitRetryTimerRef.current) clearTimeout(submitRetryTimerRef.current);
      submitRetryTimerRef.current = setTimeout(() => {
        const ok = runSubmit(pendingSubmitTextRef.current);
        if (ok) {
          pendingSubmitTextRef.current = '';
          submitRequestedRef.current = false;
        }
      }, 120);
    }
  };

  // ─────────────────────────────────────────────
  // Render comment (Instagram style — NO bubble)
  // ─────────────────────────────────────────────
  const renderComment = (comment: Comment, isReply = false, parentId?: string) => {
    const uid = getCurrentUserId();
    const isOwner = uid === comment.userId;
    const canDelete = isOwner || uid === postOwnerId;
    const reactions = comment.reactions || {};
    const heartCount = Object.keys(reactions).length;
    const userLiked = uid ? !!reactions[uid] : false;
    const forcedOwnAvatar = (currentUserIdCandidates.includes(String(comment.userId || '')) || isSameUser(comment.userId, uid)) && !isGenericDefaultAvatar(resolvedCurrentAvatar)
      ? resolvedCurrentAvatar
      : comment.userAvatar;

    return (
      <View key={comment.id} style={[styles.commentRow, isReply && styles.replyRow]}>
        {/* Avatar */}
        <CommentAvatar
          userId={comment.userId}
          userAvatar={forcedOwnAvatar}
          size={isReply ? 30 : 40}
        />

        {/* Body */}
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={styles.commentUserName}>{comment.userName}</Text>
            <Text style={styles.commentTime}>{getTimeAgo(comment.createdAt)}</Text>
            {comment.editedAt && <Text style={styles.editedLabel}> · edited</Text>}
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
          <View style={styles.commentActions}>
            {!isReply && (
              <TouchableOpacity
                onPress={() => setReplyTo({ id: comment.id, userName: comment.userName, text: comment.text })}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Comment Options", "", [
                    { text: "Cancel", style: "cancel" },
                    ...(isOwner
                      ? [{ text: "Edit", onPress: () => setEditingComment({ id: comment.id, text: comment.text, isReply, parentId }) }]
                      : []),
                    { text: "Delete", style: "destructive", onPress: () => handleDeleteComment(comment.id, isReply, parentId) },
                  ])
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="more-horizontal" size={13} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>
          {!isReply && comment.replies && comment.replies.length > 0 && (
            <View style={styles.repliesContainer}>
              {comment.replies.map((r) => (
                <View key={r.id}>{renderComment(r, true, comment.id)}</View>
              ))}
            </View>
          )}
        </View>

        {/* Heart — far right */}
        <TouchableOpacity
          style={styles.heartCol}
          onPress={() => handleHeart(comment.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        >
          <Ionicons
            name={userLiked ? "heart" : "heart-outline"}
            size={isReply ? 14 : 16}
            color={userLiked ? "#e74c3c" : "#ccc"}
          />
          {heartCount > 0 && <Text style={styles.heartCount}>{heartCount}</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  // ─────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Scrollable area: flex:1 so footer is always at bottom */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.centeredBox}>
            <ActivityIndicator size="small" color="#999" />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.centeredBox}>
            <Feather name="message-circle" size={40} color="#ddd" />
            <Text style={styles.emptyText}>No comments yet</Text>
            <Text style={styles.emptySubtext}>Be the first to comment!</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.list}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: 8 }}
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => renderComment(item)}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      {/* ── Instagram-style sticky footer (emoji row + input) ── */}
      {showInput && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}> 
          {/* Replying-to banner */}
          {replyTo && (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>
                Replying to{' '}
                <Text style={styles.replyBannerName}>@{replyTo.userName}</Text>
              </Text>
              <TouchableOpacity onPress={() => { setReplyTo(null); setReplyText(''); }}>
                <Feather name="x" size={14} color="#888" />
              </TouchableOpacity>
            </View>
          )}

          {/* Emoji row: Integrated more cleanly */}
          <View style={styles.emojiRow}>
            {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'].map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiBtn}
                activeOpacity={0.6}
                onPress={() => {
                  if (replyTo) {
                    const next = (replyTextRef.current || "") + emoji;
                    replyTextRef.current = next;
                    setReplyText(next);
                  } else {
                    const next = (newCommentRef.current || "") + emoji;
                    newCommentRef.current = next;
                    setNewComment(next);
                  }
                }}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Input row: avatar + pill input + emoji/send */}
          <View style={styles.inputRow}>
            <ExpoImage
              source={{ uri: inputAvatarFailed ? DEFAULT_AVATAR_URL : (resolvedCurrentAvatar && resolvedCurrentAvatar.trim() !== '' ? resolvedCurrentAvatar : DEFAULT_AVATAR_URL) }}
              style={styles.inputAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
              onError={() => setInputAvatarFailed(true)}
            />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'}
              placeholderTextColor="#aaa"
              value={replyTo ? replyText : newComment}
              onChangeText={(t) => {
                if (replyTo) { replyTextRef.current = t; setReplyText(t); }
                else { newCommentRef.current = t; setNewComment(t); }
              }}
              onEndEditing={(e) => {
                const t = String(e?.nativeEvent?.text || '');
                if (replyTo) { replyTextRef.current = t; setReplyText(t); }
                else { newCommentRef.current = t; setNewComment(t); }
                if (submitRequestedRef.current) {
                  const ok = runSubmit(t);
                  if (ok) {
                    pendingSubmitTextRef.current = '';
                    submitRequestedRef.current = false;
                  }
                }
              }}
              onBlur={(e) => {
                const t = String(e?.nativeEvent?.text || '');
                if (replyTo) { replyTextRef.current = t; setReplyText(t); }
                else { newCommentRef.current = t; setNewComment(t); }
                if (submitRequestedRef.current) {
                  const ok = runSubmit(t);
                  if (ok) {
                    pendingSubmitTextRef.current = '';
                    submitRequestedRef.current = false;
                  }
                }
              }}
              multiline
              maxLength={500}
              blurOnSubmit={false}
              returnKeyType="default"
              onSubmitEditing={handleSubmitCommentPress}
              rejectResponderTermination={false}
              editable={!isSubmitting}
            />
            <Pressable
              style={styles.sendBtn}
              onTouchStart={() => {
                submitRequestedRef.current = true;
                pendingSubmitTextRef.current = String(
                  replyTo
                    ? (replyText || replyTextRef.current || '')
                    : (newComment || newCommentRef.current || '')
                );
              }}
              onPress={handleSubmitCommentPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#0095f6" />
              ) : (
                <Text
                  style={[
                    styles.sendText,
                    !((replyTo ? replyText : newComment) || '').trim() && styles.sendTextDisabled,
                  ]}
                >
                  Post
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}


      {/* Edit Modal */}
      {editingComment && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditingComment(null)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.editOverlay}>
              <View style={styles.editSheet}>
                <View style={styles.editHeader}>
                  <Text style={styles.editTitle}>Edit Comment</Text>
                  <TouchableOpacity onPress={() => setEditingComment(null)}>
                    <Feather name="x" size={22} color="#333" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editInput}
                  value={editingComment.text}
                  onChangeText={(t) => setEditingComment({ ...editingComment, text: t })}
                  multiline
                  autoFocus
                  maxLength={500}
                />
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.editCancel} onPress={() => setEditingComment(null)}>
                    <Text style={styles.editCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editSave} onPress={handleEditComment}>
                    <Text style={styles.editSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
};

export default CommentSection;

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  centeredBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  emptyText: { fontSize: 15, fontWeight: "600", color: "#888", marginTop: 12 },
  emptySubtext: { fontSize: 13, color: "#bbb" },

  // ── Comment row (Instagram — no bubble) ──
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  replyRow: {
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 0,
    marginLeft: 52,
    gap: 10,
  },
  commentBody: { flex: 1 },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  commentUserName: { fontSize: 13, fontWeight: "700", color: "#111" },
  commentTime: { fontSize: 12, color: "#aaa" },
  editedLabel: { fontSize: 11, color: "#bbb", fontStyle: "italic" },
  commentText: { fontSize: 14, color: "#111", lineHeight: 20 },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 6,
  },
  actionText: { fontSize: 12, color: "#888", fontWeight: "600" },
  repliesContainer: { marginTop: 4 },

  // Heart (far right)
  heartCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
    minWidth: 26,
    gap: 2,
  },
  heartCount: { fontSize: 11, color: "#aaa", textAlign: "center" },

  // ── Sticky footer: emoji row + input ──
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  emojiBtn: {
    padding: 4,
    borderRadius: 20,
  },
  emojiText: {
    fontSize: 22,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  replyBannerText: { fontSize: 13, color: "#666" },
  replyBannerName: { fontWeight: "700", color: "#222" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 10,
  },
  inputAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eee",
  },
  input: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: "#111",
    maxHeight: 100,
  },
  sendBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  sendText: { fontSize: 14, fontWeight: "700", color: "#0095f6" },
  sendTextDisabled: { color: "#b3d4f5" },

  // ── Edit Modal ──
  editOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  editSheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  editTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  editInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#111",
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  editActions: { flexDirection: "row", gap: 10 },
  editCancel: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  editCancelText: { fontWeight: "600", color: "#666", fontSize: 15 },
  editSave: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: "#0095f6",
    alignItems: "center",
  },
  editSaveText: { fontWeight: "700", color: "#fff", fontSize: 15 },
});
