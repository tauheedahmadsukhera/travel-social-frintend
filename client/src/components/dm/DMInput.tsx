import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text, Animated, ScrollView } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type DMInputProps = {
  input: string;
  setInput: (text: string) => void;
  onSend: () => void;
  onMediaPress: () => void;
  onCameraPress: () => void;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  recording: boolean;
  recordingDuration: number;
  micPulseAnim: Animated.Value;
  replyingTo: any;
  onCancelReply: () => void;
  sending: boolean;
};

const DMInput: React.FC<DMInputProps> = ({
  input,
  setInput,
  onSend,
  onMediaPress,
  onCameraPress,
  onMicPressIn,
  onMicPressOut,
  recording,
  recordingDuration,
  micPulseAnim,
  replyingTo,
  onCancelReply,
  sending,
}) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <ScrollView 
      keyboardShouldPersistTaps="handled" 
      scrollEnabled={false} 
      style={{ backgroundColor: '#fff', flexGrow: 0 }}
      contentContainerStyle={styles.container}
    >
      {replyingTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>Replying to {replyingTo.senderId === 'self' ? 'yourself' : 'them'}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyingTo.text}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply}>
            <Feather name="x" size={16} color="#8e8e8e" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {!input.trim() && !recording && (
          <TouchableOpacity style={styles.iconBtn} onPress={onCameraPress}>
            <LinearGradient
              colors={['#FBBC04', '#FF8D00']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cameraCircle}
            >
              <Feather name="camera" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={styles.inputContainer}>
          {recording ? (
            <View style={styles.recordingRow}>
              <Animated.View style={[styles.recordingDot, { opacity: micPulseAnim }]} />
              <Text style={styles.recordingText}>{formatDuration(recordingDuration)}</Text>
              <Text style={styles.recordingHint}>Recording...</Text>
            </View>
          ) : (
            <TextInput
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor="#8e8e8e"
              value={input}
              onChangeText={setInput}
              multiline
            />
          )}

          {!input.trim() && !recording && (
            <View style={styles.rightIcons}>
              <TouchableOpacity style={styles.innerIcon} onPress={onMicPressIn}>
                <Feather name="mic" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.innerIcon} onPress={onMediaPress}>
                <Feather name="image" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {(input.trim() || recording) && (
          <TouchableOpacity 
            style={styles.sendBtn} 
            onPress={recording ? onMicPressOut : onSend}
          >
            <Text style={styles.sendBtnText}>
              {recording ? 'Release to send' : (sending ? '...' : 'Send')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#efefef',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FF8D00',
  },
  replyContent: {
    flex: 1,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF8D00',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  replyText: {
    fontSize: 13,
    color: '#666',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginRight: 10,
  },
  cameraCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    borderRadius: 24,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    paddingVertical: 10,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  innerIcon: {
    marginLeft: 14,
  },
  sendBtn: {
    marginLeft: 12,
    paddingHorizontal: 4,
  },
  sendBtnText: {
    color: '#FF8D00',
    fontWeight: '700',
    fontSize: 16,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginRight: 10,
  },
  recordingHint: {
    fontSize: 14,
    color: '#8e8e8e',
  },
});

export default React.memo(DMInput);
