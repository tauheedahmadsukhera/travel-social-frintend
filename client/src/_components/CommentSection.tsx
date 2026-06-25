import { DEFAULT_AVATAR_URL } from '../../lib/api';
import { Feather, Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { FlashList } from "@shopify/flash-list";
import {
  addComment,
  addCommentReply,
  deleteComment,
  deleteCommentReply,
  editComment,
  editCommentReply,
  getPostComments,
} from "../../lib/firebaseHelpers/comments";

import { apiService } from '@/src/_services/apiService';
import { feedEventEmitter } from "../../lib/feedEventEmitter";
import CommentAvatar from "./CommentAvatar";
import { useUser } from "./UserContext";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import EmojiPicker from 'rn-emoji-keyboard';

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
  likes?: string[];
  likesCount?: number;
  isReply?: boolean;
  parentId?: string;
};

export interface CommentSectionProps {
  postId: string;
  postOwnerId: string;
  currentAvatar: string;
  currentUser?: any;
  maxHeight?: number;
  showInput?: boolean;
  initialTab?: 'comment' | 'reactions';
  isStory?: boolean;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  postId,
  postOwnerId,
  currentAvatar,
  currentUser: userProp,
  showInput = true,
  initialTab = 'comment',
  isStory = false,
}) => {
  const [activeTab, setActiveTab] = useState<'comment' | 'reactions'>(isStory ? 'comment' : initialTab);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; userName: string } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const userFromContext = useUser();
  const currentUser = userProp || userFromContext;
  const currentUserId = currentUser?.uid || currentUser?._id;
  const resolvedCurrentAvatar = currentAvatar || DEFAULT_AVATAR_URL;

  const quickEmojis = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];
  const allEmojis = [...quickEmojis, '👍', '🙏', '💯', '✨', '🎉', '🤩', '🤔', '🥳', '😎', '💔', '😭', '😡', '💀', '👀', '🚀', '🌈'];

  const normalizeId = (val: any): string => {
    if (typeof val === "string") return val;
    if (val && typeof val === "object") return String(val._id || val.id || "");
    return String(val || "");
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let res;
      if (isStory) {
        res = await apiService.get(`/stories/${postId}/comments`);
      } else {
        res = await getPostComments(postId);
      }
      const raw = Array.isArray(res) ? res : (res?.data ?? []);
      
      const mapComment = (c: any): Comment => ({
        id: normalizeId(c._id || c.id),
        text: c.text || "",
        userAvatar: c.userAvatar || DEFAULT_AVATAR_URL,
        userName: c.userName || "User",
        userId: normalizeId(c.userId),
        createdAt: c.createdAt,
        editedAt: c.editedAt,
        replies: Array.isArray(c.replies) ? c.replies.map((r: any) => mapComment(r)) : [],
        reactions: c.reactions || {},
        likes: Array.isArray(c.likes) ? c.likes.map((id: any) => String(id)) : [],
        likesCount: c.likesCount || (Array.isArray(c.likes) ? c.likes.length : 0),
      });

      const mappedComments = raw.map(mapComment);
      setComments(mappedComments);

      const actualCount = mappedComments.reduce((acc: number, c: Comment) => acc + 1 + (c.replies?.length || 0), 0);
      feedEventEmitter.emit("commentCountUpdated", { postId, count: actualCount });

      if (!isStory) {
        try {
          const postRes: any = await apiService.get(`/posts/${postId}`);
          if (postRes?.success && postRes.data?.reactions) {
            setReactions(postRes.data.reactions);
          }
        } catch (postErr: any) {
          console.log("[CommentSection] Skipped loading post reactions (ID is likely a story or highlight):", postErr.message);
        }
      }
    } catch (err) {
      console.error("[CommentSection] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [postId, isStory]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddComment = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);

    const trimmedText = newComment.trim();
    const optimisticId = `optimistic-${Date.now()}`;

    try {
      if (isStory) {
        await apiService.post(`/stories/${postId}/comments`, {
          text: trimmedText,
          userName: currentUser?.displayName || 'User'
        });
        setNewComment('');
        setReplyTo(null);
        await loadData();
      } else if (replyTo) {
        // Optimistically insert reply immediately
        const optimisticReply: Comment = {
          id: optimisticId,
          text: trimmedText,
          userId: currentUserId,
          userName: currentUser?.displayName || 'User',
          userAvatar: resolvedCurrentAvatar,
          createdAt: new Date().toISOString(),
          likes: [],
          likesCount: 0,
          replies: [],
          reactions: {},
        };

        setComments(prev =>
          prev.map(c =>
            c.id === replyTo.id
              ? { ...c, replies: [...(c.replies || []), optimisticReply] }
              : c
          )
        );
        setNewComment('');
        setReplyTo(null);

        // Send to server and reconcile in background
        await addCommentReply(postId, replyTo.id, {
          userId: currentUserId,
          userName: currentUser?.displayName || 'User',
          userAvatar: resolvedCurrentAvatar,
          text: trimmedText,
        });
        // Sync real data silently
        loadData().catch(() => {});
      } else {
        // Optimistically insert top-level comment immediately
        const optimisticComment: Comment = {
          id: optimisticId,
          text: trimmedText,
          userId: currentUserId,
          userName: currentUser?.displayName || 'User',
          userAvatar: resolvedCurrentAvatar,
          createdAt: new Date().toISOString(),
          likes: [],
          likesCount: 0,
          replies: [],
          reactions: {},
        };
        setComments(prev => [optimisticComment, ...prev]);
        setNewComment('');
        setReplyTo(null);

        await addComment(postId, currentUserId, currentUser?.displayName || 'User', resolvedCurrentAvatar, trimmedText);
        feedEventEmitter.emit('commentAdded', { postId });
        // Sync real data silently
        loadData().catch(() => {});
      }
    } catch (e) {
      console.error(e);
      // Rollback optimistic update on error
      setComments(prev => prev.filter(c => {
        if (c.id === optimisticId) return false;
        return { ...c, replies: (c.replies || []).filter(r => r.id !== optimisticId) };
      }));
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleLikeComment = async (commentId: string, isReply: boolean, parentId?: string) => {
    const originalComments = [...comments];
    try {
      const endpoint = isReply && parentId
        ? `/posts/${postId}/comments/${parentId}/replies/${commentId}/like`
        : `/posts/${postId}/comments/${commentId}/like`;

      const targetList = isReply && parentId 
        ? comments.find(c => c.id === parentId)?.replies 
        : comments;
      
      const isCurrentlyLiked = targetList?.find(c => c.id === commentId)?.likes?.includes(currentUserId);

      if (isCurrentlyLiked) {
        await apiService.delete(endpoint, { userId: currentUserId });
      } else {
        await apiService.post(endpoint, { userId: currentUserId });
      }
      await loadData();
    } catch (e) {
      console.error("[Like] Error:", e);
      setComments(originalComments);
    }
  };

  const handleReaction = async (emoji: string) => {
    // OPTIMISTIC UPDATE: Add reaction instantly to UI
    const optimisticReaction = {
      userId: currentUserId,
      userName: currentUser?.displayName || 'You',
      userAvatar: resolvedCurrentAvatar,
      emoji: emoji,
      isOptimistic: true
    };
    
    setReactions(prev => {
      // Remove any existing reaction from this user first
      const filtered = prev.filter(r => String(r.userId) !== String(currentUserId));
      return [optimisticReaction, ...filtered];
    });

    try {
      await apiService.post(`/posts/${postId}/react`, {
        userId: currentUserId,
        userName: currentUser?.displayName || 'User',
        userAvatar: resolvedCurrentAvatar,
        emoji
      });
      // Silent refresh in background
      const postRes: any = await apiService.get(`/posts/${postId}`);
      if (postRes?.success && postRes.data?.reactions) {
        setReactions(postRes.data.reactions);
        try {
          feedEventEmitter.emitPostUpdated(postId, { reactions: postRes.data.reactions });
        } catch (err) {
          console.warn('[CommentSection] failed to emit reactions update:', err);
        }
      }
      setShowEmojiPicker(false);
    } catch (e) { 
      console.error(e);
      // Rollback on error
      loadData();
    }
  };

  const handleDelete = async (comment: Comment, isReply = false, parentId?: string) => {
    Alert.alert("Delete", "Are you sure?", [
      { text: "Cancel" },
      { text: "Delete", style: 'destructive', onPress: async () => {
        if (isReply && parentId) {
          await deleteCommentReply(postId, parentId, comment.id, currentUserId, postOwnerId);
        } else {
          await deleteComment(postId, comment.id, currentUserId, postOwnerId);
        }
        setShowOptions(false);
        setSelectedComment(null);
        await loadData();
        feedEventEmitter.emit("commentDeleted", { postId });
      }}
    ]);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim() || !selectedComment) return;
    try {
      if (selectedComment.isReply && selectedComment.parentId) {
        await editCommentReply(postId, selectedComment.parentId, selectedComment.id, currentUserId, editValue.trim());
      } else {
        await editComment(postId, selectedComment.id, currentUserId, editValue.trim());
      }
      setIsEditing(false);
      setSelectedComment(null);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReportComment = async (comment: Comment) => {
    setShowOptions(false);
    Alert.alert(
      "Report Comment",
      "Why are you reporting this comment?",
      [
        { text: "Spam", onPress: () => submitCommentReport(comment, 'spam') },
        { text: "Inappropriate", onPress: () => submitCommentReport(comment, 'inappropriate') },
        { text: "Harassment", onPress: () => submitCommentReport(comment, 'harassment') },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const submitCommentReport = async (comment: Comment, reason: string) => {
    try {
      await apiService.reportContent({
        targetId: comment.id,
        targetType: 'comment',
        reason: reason
      });
      Alert.alert("Report Submitted", "Thank you for helping us keep the community safe. We will review this comment shortly.");
    } catch (err) {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  const totalCommentCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <View style={styles.container}>
      {/* Options Modal */}
      <Modal visible={showOptions} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <View style={styles.floatingMenu}>
            {selectedComment?.userId === currentUserId ? (
              <>
                <TouchableOpacity style={styles.menuOption} onPress={() => { setEditValue(selectedComment?.text || ""); setIsEditing(true); setShowOptions(false); }}>
                  <Feather name="edit-2" size={22} color="#222" />
                  <Text style={styles.menuOptionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => handleDelete(selectedComment!, selectedComment?.isReply, selectedComment?.parentId)}>
                  <Feather name="trash-2" size={22} color="#FF3B30" />
                  <Text style={[styles.menuOptionText, { color: '#FF3B30' }]}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => handleReportComment(selectedComment!)}>
                <Feather name="flag" size={22} color="#FF4B4B" />
                <Text style={[styles.menuOptionText, { color: '#FF4B4B' }]}>Report Comment</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>


      {/* Edit Modal */}
      <Modal visible={isEditing} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editContainer}>
          <View style={styles.editBox}>
            <Text style={styles.editTitle}>Edit Comment</Text>
            <TextInput style={styles.editInput} multiline value={editValue} onChangeText={setEditValue} autoFocus />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setIsEditing(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {!isStory && (
        <View style={styles.tabHeader}>
          <View style={styles.tabContainer}>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'comment' && styles.tabButtonActive]} onPress={() => setActiveTab('comment')}>
              <Text style={[styles.tabText, activeTab === 'comment' && styles.tabTextActive]}>Comments {totalCommentCount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'reactions' && styles.tabButtonActive]} onPress={() => setActiveTab('reactions')}>
              <Text style={[styles.tabText, activeTab === 'reactions' && styles.tabTextActive]}>Reactions</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeTab === 'comment' ? (
        <View style={{ flex: 1, minHeight: 2 }}>
          <FlashList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CommentItem 
                comment={item} 
                currentUser={currentUser} 
                currentUserId={currentUserId} 
                onReply={(id, name) => { setReplyTo({ id, userName: name }); setNewComment(`@${name} `); }}
                onLike={handleLikeComment}
                onLongPress={(c, r, p) => { setSelectedComment({ ...c, isReply: r, parentId: p } as any); setShowOptions(true); }}
                isStory={isStory}
              />
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 20 }} color="#000" /> : <Text style={styles.emptyText}>No comments yet</Text>}
            estimatedItemSize={80}
          />
          {showInput && (
            <CommentInput 
              newComment={newComment} 
              setNewComment={setNewComment} 
              replyTo={replyTo} 
              resolvedCurrentAvatar={resolvedCurrentAvatar} 
              isSubmitting={isSubmitting} 
              onAddComment={handleAddComment} 
              quickEmojis={quickEmojis} 
            />
          )}
          <EmojiPicker 
            onEmojiSelected={(emoji) => setNewComment(prev => prev + emoji.emoji)}
            open={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
          />
        </View>
      ) : (
        <View style={{ flex: 1, minHeight: 2 }}>
          <FlashList
            data={reactions}
            keyExtractor={(item, index) => `${item.userId}-${index}`}
            renderItem={({ item }) => (
              <View style={styles.reactionItem}>
                <ExpoImage source={{ uri: item.userAvatar || DEFAULT_AVATAR_URL }} style={styles.reactionAvatar} />
                <Text style={styles.reactionName}>{item.userName}</Text>
                <Text style={styles.reactionEmojiText}>{item.emoji}</Text>
              </View>
            )}
            ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 20 }} color="#000" /> : <View style={styles.emptyReactionContainer}><Ionicons name="star" size={60} color="#FFD700" /><Text style={styles.emptyReactionTitle}>No reactions yet</Text><Text style={styles.emptyReactionSub}>Be the first to react!</Text></View>}
            estimatedItemSize={60}
          />
          <View style={styles.reactionEmojiBar}>
            {quickEmojis.map(emoji => (
              <TouchableOpacity key={emoji} onPress={() => handleReaction(emoji)}>
                <Text style={{ fontSize: 32 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={styles.reactionPlusBtn} 
              onPress={() => setShowEmojiPicker(true)}
            >
              <Ionicons name="add" size={28} color="#000" />
            </TouchableOpacity>
          </View>
          <EmojiPicker 
            onEmojiSelected={(emoji) => {
              handleReaction(emoji.emoji);
              setShowEmojiPicker(false);
            }}
            open={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  tabHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 25, padding: 4, gap: 8 },
  tabButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 22 },
  tabButtonActive: { backgroundColor: '#000' },
  tabText: { fontWeight: '600', color: '#888', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#999', fontSize: 16 },
  reactionItem: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  reactionAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  reactionName: { fontWeight: '600', flex: 1 },
  reactionEmojiText: { fontSize: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  floatingMenu: { backgroundColor: '#fff', borderRadius: 16, width: '70%', padding: 4 },
  menuOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuOptionText: { marginLeft: 16, fontSize: 16, fontWeight: '500' },
  editContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  editBox: { backgroundColor: '#fff', borderRadius: 15, padding: 20 },
  editTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15 },
  editInput: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, minHeight: 100, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 },
  cancelText: { color: '#666', fontWeight: '600', padding: 10 },
  saveBtn: { backgroundColor: '#000', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  reactionEmojiBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center',
    paddingVertical: 15, 
    paddingHorizontal: 10,
    borderTopWidth: 1, 
    borderTopColor: '#eee',
    backgroundColor: '#fff'
  },
  reactionPlusBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#f0f0f0', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  emptyReactionContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 80 },
  emptyReactionTitle: { fontSize: 18, fontWeight: '700', color: '#666', marginTop: 15 },
  emptyReactionSub: { fontSize: 14, color: '#999', marginTop: 5 },
});

export default CommentSection;
