import React from 'react';
import { View, Text, FlatList, Image, TextInput, TouchableOpacity, StyleSheet, Modal, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DEFAULT_AVATAR_URL } from '@/lib/api';

const { height } = Dimensions.get('window');

interface StoryComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: any;
}

interface StoryCommentSectionProps {
  visible: boolean;
  onClose: () => void;
  comments: StoryComment[];
  commentText: string;
  setCommentText: (text: string) => void;
  onSendComment: () => void;
  getTimeAgo: (ts: any) => string;
}

const StoryCommentSection: React.FC<StoryCommentSectionProps> = ({
  visible,
  onClose,
  comments,
  commentText,
  setCommentText,
  onSendComment,
  getTimeAgo
}) => {
  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 100 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
          <View style={styles.modalContent}>
            <View style={styles.handle} />
            <Text style={styles.title}>Comments</Text>
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Image source={{ uri: item.userAvatar || DEFAULT_AVATAR_URL }} style={styles.avatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>{item.userName}</Text>
                    <Text style={styles.text}>{item.text}</Text>
                    <Text style={styles.meta}>{getTimeAgo(item.createdAt)}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No comments yet</Text>}
              style={{ padding: 16 }}
            />
            <View style={styles.inputArea}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment..."
                placeholderTextColor="#999"
                style={styles.textInput}
              />
              <TouchableOpacity onPress={onSendComment} disabled={!commentText.trim()}>
                <Feather name="send" size={22} color={commentText.trim() ? "#007aff" : "#999"} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    height: height * 0.7,
    paddingTop: 10,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#eee', borderRadius: 2, alignSelf: 'center', marginBottom: 10,
  },
  title: {
    fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 15,
  },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 12 },
  userName: { fontWeight: '700', fontSize: 13, marginBottom: 2 },
  text: { fontSize: 14, color: '#333', lineHeight: 18 },
  meta: { fontSize: 11, color: '#999', marginTop: 4 },
  inputArea: {
    flexDirection: 'row', padding: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eee',
  },
  textInput: {
    flex: 1, height: 40, backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 15, marginRight: 12, fontSize: 14,
  },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 30 },
});

export default React.memo(StoryCommentSection);
