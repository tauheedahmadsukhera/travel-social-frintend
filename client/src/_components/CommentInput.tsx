import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  return (
    <View style={{ width: '100%' }}>
      <View style={styles.quickEmojiBar}>
        {quickEmojis.map(emoji => (
          <TouchableOpacity 
            key={emoji} 
            onPress={() => setNewComment(prev => prev + emoji)}
          >
            <Text style={{ fontSize: 24 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.inputArea}>
        <ExpoImage source={{ uri: resolvedCurrentAvatar }} style={styles.inputAvatar} />
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={replyTo ? `Reply to ${replyTo.userName}...` : "Add a comment..."}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity 
            onPress={() => {
              console.log('💬 [CommentInput] onPress triggered! text:', newComment);
              onAddComment();
            }}
            onPressIn={() => {
              console.log('💬 [CommentInput] onPressIn triggered!');
            }}
            disabled={isSubmitting}
          >
            <Text style={[styles.postBtn, (!newComment.trim() || isSubmitting) && { opacity: 0.5 }]}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  quickEmojiBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  inputArea: { flexDirection: 'row', padding: 12, alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 30 : 12 },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  inputWrapper: { flex: 1, flexDirection: 'row', backgroundColor: '#f0f2f5', borderRadius: 25, paddingHorizontal: 15, alignItems: 'center', minHeight: 45 },
  input: { flex: 1, fontSize: 14, color: '#333', paddingVertical: 8 },
  postBtn: { color: '#0095f6', fontWeight: '700', marginLeft: 10 },
  plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
});
