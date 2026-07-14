import React, { useRef } from 'react';
import { View, TextInput, Text, StyleSheet, Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

interface CommentInputProps {
  newComment: string;
  setNewComment: (val: string | ((prev: string) => string)) => void;
  replyTo: { id: string; userName: string } | null;
  resolvedCurrentAvatar: string;
  isSubmitting: boolean;
  onAddComment: () => void;
  quickEmojis: string[];
}

export const CommentInput: React.FC<CommentInputProps> = ({
  newComment,
  setNewComment,
  replyTo,
  resolvedCurrentAvatar,
  isSubmitting,
  onAddComment,
  quickEmojis,
}) => {
  // Ref to prevent double-fire when both onResponderGrant and onPress fire
  const firedRef = useRef(false);

  const handleSubmit = () => {
    if (!newComment.trim() || isSubmitting || firedRef.current) return;
    firedRef.current = true;
    onAddComment();
    // Reset after short delay so button can be used again
    setTimeout(() => { firedRef.current = false; }, 800);
  };

  return (
    <View style={{ width: '100%' }}>
      <View style={styles.quickEmojiBar}>
        {quickEmojis.map(emoji => (
          <View
            key={emoji}
            onStartShouldSetResponder={() => true}
            onResponderGrant={() => setNewComment(prev => prev + emoji)}
          >
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
          </View>
        ))}
      </View>

      <View style={styles.inputArea}>
        <ExpoImage source={{ uri: resolvedCurrentAvatar }} style={styles.inputAvatar} />
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={replyTo ? `Reply to ${replyTo.userName}...` : 'Add a comment...'}
            value={newComment}
            onChangeText={setNewComment}
            multiline={false}
            blurOnSubmit={false}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (!newComment.trim() || isSubmitting) return;
              onAddComment();
            }}
          />

          {/*
            Using raw responder system instead of TouchableOpacity/Pressable.
            onResponderGrant fires on touch-DOWN at the lowest native level —
            BEFORE iOS processes keyboard dismissal. This guarantees the comment
            posts on the very first tap even when keyboard is open.
          */}
          <View
            onStartShouldSetResponder={() => !isSubmitting && newComment.trim().length > 0}
            onResponderGrant={handleSubmit}
            style={styles.postBtnWrapper}
          >
            <Text
              style={[
                styles.postBtn,
                (!newComment.trim() || isSubmitting) && { opacity: 0.4 },
              ]}
            >
              Post
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  quickEmojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 30 : 12,
  },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#f0f2f5',
    borderRadius: 25,
    paddingHorizontal: 15,
    alignItems: 'center',
    minHeight: 45,
  },
  input: { flex: 1, fontSize: 14, color: '#333', paddingVertical: 8 },
  postBtnWrapper: {
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  postBtn: { color: '#0095f6', fontWeight: '700' },
});
