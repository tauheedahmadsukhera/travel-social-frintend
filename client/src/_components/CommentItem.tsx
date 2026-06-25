import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from "@expo/vector-icons";
import CommentAvatar from "./CommentAvatar";
import { Comment } from "./CommentSection";

interface CommentItemProps {
  comment: Comment;
  isReply?: boolean;
  parentId?: string;
  currentUser: any;
  currentUserId: string;
  onReply: (id: string, userName: string) => void;
  onLike: (id: string, isReply: boolean, parentId?: string) => void;
  onLongPress: (comment: Comment, isReply: boolean, parentId?: string) => void;
  isStory?: boolean;
}

const getCommentTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2419200) return `${Math.floor(diff / 604800)}w`;
  if (diff < 31536000) return `${Math.floor(diff / 2419200)}mo`;
  return `${Math.floor(diff / 31536000)}y`;
};

const CommentItemComponent: React.FC<CommentItemProps> = ({
  comment,
  isReply = false,
  parentId,
  currentUser,
  currentUserId,
  onReply,
  onLike,
  onLongPress,
  isStory = false,
}) => {
  const timeText = useMemo(() => getCommentTime(comment.createdAt), [comment.createdAt]);
  const isLiked = comment.likes?.includes(currentUserId);
  const likeCount = comment.likesCount || comment.likes?.length || 0;

  return (
    <View style={[styles.commentRow, isReply && styles.replyRow]}>
      <CommentAvatar userId={comment.userId} userAvatar={comment.userAvatar} size={isReply ? 24 : 36} />
      <View style={styles.commentContent}>
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={() => onLongPress(comment, isReply, parentId)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.userName}>{comment.userName}</Text>
          </View>
          <Text style={styles.commentText}>{comment.text}</Text>
        </TouchableOpacity>

        <View style={styles.commentFooter}>
          <Text style={styles.footerAction}>{timeText}</Text>
          {!isStory && (
            <TouchableOpacity onPress={() => onReply(parentId || comment.id, comment.userName)}>
              <Text style={styles.footerAction}>Reply</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          {!isStory && (
            <TouchableOpacity
              style={styles.likeButton}
              onPress={() => onLike(comment.id, isReply, parentId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={14}
                color={isLiked ? '#FF3B30' : '#999'}
              />
              {likeCount > 0 && (
                <Text style={styles.likeCount}>{likeCount}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {comment.replies && comment.replies.length > 0 && (
          <View style={{ marginTop: 5 }}>
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                isReply={true}
                parentId={comment.id}
                currentUser={currentUser}
                currentUserId={currentUserId}
                onReply={onReply}
                onLike={onLike}
                onLongPress={onLongPress}
                isStory={isStory}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  commentRow: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12 },
  replyRow: { paddingLeft: 0, paddingRight: 0, paddingHorizontal: 0, paddingVertical: 8 },
  commentContent: { flex: 1, marginLeft: 12 },
  userName: { fontWeight: '700', fontSize: 13, color: '#333' },
  commentText: { fontSize: 14, color: '#333', marginTop: 4, lineHeight: 18 },
  commentFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  footerAction: { fontSize: 12, color: '#999', marginRight: 15, fontWeight: '600' },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeCount: { fontSize: 10, color: '#999' },
});

export const CommentItem = React.memo(CommentItemComponent);
