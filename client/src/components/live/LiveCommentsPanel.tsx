import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: any;
}

interface LiveCommentsPanelProps {
  comments: Comment[];
  newComment: string;
  setNewComment: (text: string) => void;
  onSendComment: () => void;
  onClose: () => void;
  insets: any;
  keyboardHeight: number;
  commentsListRef: any;
  shouldAutoScrollRef: any;
  clampNumber: (v: number, min: number, max: number) => number;
}

export const LiveCommentsPanel: React.FC<LiveCommentsPanelProps> = ({
  comments,
  newComment,
  setNewComment,
  onSendComment,
  onClose,
  insets,
  keyboardHeight,
  commentsListRef,
  shouldAutoScrollRef,
  clampNumber,
}) => {
  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <Image source={{ uri: item.userAvatar }} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <Text style={styles.commentUser}>{item.userName}</Text>
        <Text style={styles.commentText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.commentsOverlay} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={{ flex: 1 }}>
        <View style={[styles.commentsOverlayHeader, { paddingTop: 12 + (insets?.top || 0) }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose} style={styles.commentsOverlayClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={commentsListRef}
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          style={[
            styles.commentsOverlayList,
            {
              top: Math.round(height * 0.42),
              bottom: clampNumber(82 + (insets?.bottom || 0) + (keyboardHeight || 0), 82, height),
            },
          ]}
          contentContainerStyle={[styles.commentsOverlayListContent, { paddingBottom: 12 }]}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
            shouldAutoScrollRef.current = distanceFromBottom < 40;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (!shouldAutoScrollRef.current) return;
            try {
              commentsListRef.current?.scrollToEnd({ animated: true });
            } catch {}
          }}
        />

        <View
          style={[
            styles.commentsOverlayInputRow,
            {
              paddingBottom: 12 + (insets?.bottom || 0),
              bottom: keyboardHeight ? keyboardHeight : 70,
            },
          ]}
        >
          <TextInput
            style={styles.commentsOverlayTextInput}
            placeholder="Send a message"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={newComment}
            onChangeText={setNewComment}
          />
          <TouchableOpacity onPress={onSendComment} style={styles.commentsOverlaySendBtn}>
            <Ionicons
              name="paper-plane"
              size={18}
              color="#fff"
              style={{ transform: [{ rotate: '-25deg' }, { translateY: -1 }] }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  commentsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10, flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  commentsOverlayClose: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlayList: { position: 'absolute', left: 0, right: 0 },
  commentsOverlayListContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 90 },
  commentsOverlayInputRow: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  commentsOverlayTextInput: { flex: 1, height: 44, borderRadius: 22, paddingHorizontal: 14, paddingRight: 60, color: '#fff', backgroundColor: 'rgba(0,0,0,0.35)' },
  commentsOverlaySendBtn: { position: 'absolute', right: 16, top: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  commentItem: { flexDirection: 'row', paddingVertical: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 10 },
  commentContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)' },
  commentUser: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 2 },
  commentText: { fontSize: 13, color: 'rgba(255,255,255,0.92)' },
});
